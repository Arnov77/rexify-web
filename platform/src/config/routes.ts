import type { FastifyInstance } from 'fastify';
import {
  addAutoReplyRule,
  defaultConfigFor,
  getConfig,
  removeAutoReplyRule,
  updateConfig,
} from '../config/bot-config';
import { allowedFileSetForPlan, isEntryAvailableForPlan } from '../config/access';
import { listConfigAudit, logConfigChange } from '../config/audit';
import { findCommandEntry, getCategories, getCommandCatalog } from '../config/catalog';
import {
  canRefreshCatalog,
  CatalogRefreshUnavailableError,
  refreshCatalog,
} from '../config/catalog-refresh';
import { applyConfigToBot } from '../config/generator';
import { findPreset, getPresets, resolvePresetFiles } from '../config/presets';
import { getSession } from '../session/store';
import type { BotConfig } from '../types/config';

interface SessionParams {
  sessionId: string;
}

interface RuleParams extends SessionParams {
  ruleId: string;
}

interface PresetParams extends SessionParams {
  presetId: string;
}

// Identitas bot hanya untuk plan berbayar; plan free tetap memakai nilai default.
const LOCKED_FREE_FIELDS = ['botname', 'thumbnailUrl', 'audioUrl', 'web'] as const;

async function loadConfig(sessionId: string): Promise<BotConfig> {
  return (await getConfig(sessionId)) ?? defaultConfigFor(sessionId);
}

// Detail audit dibatasi supaya satu preset (bisa 100+ plugin) tidak membengkakkan JSONB.
const AUDIT_SAMPLE_LIMIT = 20;

function diffDisabled(before: string[], after: string[]): { added: string[]; removed: string[] } {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((file) => !beforeSet.has(file)),
    removed: before.filter((file) => !afterSet.has(file)),
  };
}

function auditSample(files: string[]): string[] {
  return files.slice(0, AUDIT_SAMPLE_LIMIT);
}

export default async function configRoutes(app: FastifyInstance): Promise<void> {
  // Semua endpoint di bawah memakai session milik user yang login; session orang lain dianggap tidak ada.
  app.addHook('preHandler', async (request, reply) => {
    const { sessionId } = (request.params ?? {}) as SessionParams;
    if (!sessionId) return;

    const session = await getSession(request.user.id, sessionId);
    if (!session) {
      return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: 'Session tidak ditemukan' });
    }
  });

  // Katalog sama untuk semua session (dari core/plugins), tapi tiap entry ditandai
  // `available` sesuai plan user: frontend mengunci baris di luar plan tanpa request tambahan.
  function catalogPayload(plan: string): {
    generatedAt: string;
    total: number;
    canRefresh: boolean;
    categories: ReturnType<typeof getCategories>;
    presets: ReturnType<typeof getPresets>;
    commands: Array<ReturnType<typeof getCommandCatalog>['commands'][number] & { available: boolean }>;
  } {
    const catalog = getCommandCatalog();
    return {
      generatedAt: catalog.generatedAt,
      total: catalog.total,
      canRefresh: canRefreshCatalog(),
      categories: getCategories(),
      presets: getPresets(),
      commands: catalog.commands.map((entry) => ({
        ...entry,
        available: isEntryAvailableForPlan(plan, entry),
      })),
    };
  }

  app.get('/api/commands', async (request) => catalogPayload(request.user.plan));

  // Generate ulang katalog dari source plugin core (plugin baru/dihapus).
  app.post('/api/commands/refresh', async (request, reply) => {
    try {
      await refreshCatalog();
    } catch (err) {
      if (err instanceof CatalogRefreshUnavailableError) {
        return reply.code(503).send({ error: err.code, message: err.message });
      }
      throw err;
    }

    return catalogPayload(request.user.plan);
  });

  app.get('/api/sessions/:sessionId/config', async (request) => {
    const { sessionId } = request.params as SessionParams;
    return { config: await loadConfig(sessionId) };
  });

  app.patch('/api/sessions/:sessionId/config', async (request) => {
    const { sessionId } = request.params as SessionParams;
    const body = (request.body ?? {}) as Record<string, unknown>;

    if (request.user.plan === 'free' && body.customSettings) {
      const cs = body.customSettings as Record<string, unknown>;
      for (const field of LOCKED_FREE_FIELDS) delete cs[field];
    }

    // Saring di server: command owner tidak boleh dimatikan, dan plan hanya boleh menyentuh
    // katalog yang tersedia untuknya (anti-bypass lewat request manual). Path lama di luar
    // katalog dibiarkan apa adanya supaya toggle lain tidak menghapusnya diam-diam.
    if (Array.isArray(body.commandsDisabled)) {
      const allowed = allowedFileSetForPlan(request.user.plan);
      body.commandsDisabled = body.commandsDisabled.filter((file) => {
        const normalized = String(file).replace(/\\/g, '/');
        const entry = findCommandEntry(normalized);
        if (!entry) return true;
        return !entry.locked && allowed.has(entry.file);
      });
    }

    const before = await loadConfig(sessionId);

    const config = await updateConfig(sessionId, {
      autoReply: body.autoReply,
      welcomeMsg: body.welcomeMsg,
      pluginsEnabled: body.pluginsEnabled,
      commandsDisabled: body.commandsDisabled,
      customSettings: body.customSettings,
    });

    // Audit hanya mencatat yang benar-benar berubah, bukan setiap PATCH.
    const commandDiff = diffDisabled(before.commandsDisabled, config.commandsDisabled);
    if (commandDiff.added.length > 0 || commandDiff.removed.length > 0) {
      await logConfigChange(request.user.id, sessionId, 'commands_updated', {
        disabledTotal: config.commandsDisabled.length,
        addedCount: commandDiff.added.length,
        removedCount: commandDiff.removed.length,
        added: auditSample(commandDiff.added),
        removed: auditSample(commandDiff.removed),
      });
    }

    for (const field of ['limit_free', 'limit_premium'] as const) {
      const previous = before.customSettings[field];
      const next = config.customSettings[field];
      if (previous !== next) {
        await logConfigChange(request.user.id, sessionId, 'limit_updated', {
          field,
          before: previous,
          after: next,
        });
      }
    }

    await applyConfigToBot(sessionId);
    return { config };
  });

  // Riwayat perubahan setelan bot (command/limit) untuk tab Command.
  app.get('/api/sessions/:sessionId/audit', async (request) => {
    const { sessionId } = request.params as SessionParams;
    const query = (request.query ?? {}) as { limit?: string; offset?: string };
    const limit = Number.parseInt(query.limit ?? '', 10);
    const offset = Number.parseInt(query.offset ?? '', 10);

    return listConfigAudit(
      sessionId,
      Number.isFinite(limit) ? limit : undefined,
      Number.isFinite(offset) ? offset : undefined,
    );
  });

  // Preset mengisi `commands_disabled` sekaligus berdasarkan kategori katalog; toggle
  // per file tetap bisa diubah lagi sesudahnya. Plugin owner tetap tidak bisa dimatikan.
  app.post('/api/sessions/:sessionId/config/presets/:presetId', async (request, reply) => {

    const { sessionId, presetId } = request.params as PresetParams;
    const preset = findPreset(presetId);

    if (!preset) {
      return reply
        .code(404)
        .send({ error: 'PRESET_NOT_FOUND', message: 'Preset command tidak dikenal' });
    }

    const before = await loadConfig(sessionId);
    // Preset hanya menyentuh plugin yang boleh dipakai plan ini; kategori terkunci tidak
    // ikut dihitung karena memang tidak bisa diaktifkan.
    const allowed = allowedFileSetForPlan(request.user.plan);
    const presetFiles = resolvePresetFiles(preset).filter((file) => allowed.has(file));
    const config = await updateConfig(sessionId, { commandsDisabled: presetFiles });
    const commandDiff = diffDisabled(before.commandsDisabled, config.commandsDisabled);

    await logConfigChange(request.user.id, sessionId, 'preset_applied', {
      presetId: preset.id,
      label: preset.label,
      disabledTotal: config.commandsDisabled.length,
      addedCount: commandDiff.added.length,
      removedCount: commandDiff.removed.length,
    });

    await applyConfigToBot(sessionId);

    return {
      preset: { id: preset.id, label: preset.label },
      disabledTotal: config.commandsDisabled.length,
      config,
    };
  });

  app.post('/api/sessions/:sessionId/config/auto-reply', async (request, reply) => {
    const { sessionId } = request.params as SessionParams;
    const { rule, config } = await addAutoReplyRule(sessionId, request.body ?? {});

    await applyConfigToBot(sessionId);
    return reply.code(201).send({ rule, config });
  });

  app.delete('/api/sessions/:sessionId/config/auto-reply/:ruleId', async (request, reply) => {
    const { sessionId, ruleId } = request.params as RuleParams;
    const { removed, config } = await removeAutoReplyRule(sessionId, ruleId);

    if (!removed) {
      return reply.code(404).send({ error: 'AUTO_REPLY_NOT_FOUND', message: 'Rule tidak ditemukan' });
    }

    await applyConfigToBot(sessionId);
    return reply.code(200).send({ config });
  });
}
