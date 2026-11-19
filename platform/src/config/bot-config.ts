import { randomUUID } from 'node:crypto';
import { pool } from '../db';
import type {
  AiSettings,
  AutoReplyRule,
  BotConfig,
  BotConfigRow,
  CustomSettings,
  PluginsEnabled,
  WelcomeMsg,
} from '../types/config';
import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_AUTO_REPLY,
  DEFAULT_COMMANDS_DISABLED,
  DEFAULT_CUSTOM_SETTINGS,
  DEFAULT_PLUGINS_ENABLED,
  DEFAULT_WELCOME_MSG,
  defaultCustomization,
} from './defaults';
import {
  ValidationError,
  validateAiSettings,
  validateAutoReply,
  validateCommandsDisabled,
  validateCustomSettings,
  validatePluginsEnabled,
  validateWelcomeMsg,
} from './validator';

const COLUMNS =
  'id, session_id, auto_reply, welcome_msg, plugins_enabled, commands_disabled, custom_settings, ai_settings, updated_at';

const cache = new Map<string, BotConfig>();

export interface ConfigPatch {
  autoReply?: unknown;
  welcomeMsg?: unknown;
  pluginsEnabled?: unknown;
  commandsDisabled?: unknown;
  customSettings?: unknown;
  aiSettings?: unknown;
}

function mapRow(row: BotConfigRow): BotConfig {
  // Row lama (custom_settings '{}') tetap aman: semua key jatuh ke default.
  const settings = { ...DEFAULT_CUSTOM_SETTINGS, ...(row.custom_settings ?? {}) };
  return {
    sessionId: row.session_id,
    autoReply: row.auto_reply ?? DEFAULT_AUTO_REPLY,
    welcomeMsg: { ...DEFAULT_WELCOME_MSG, ...(row.welcome_msg ?? {}) },
    pluginsEnabled: { ...DEFAULT_PLUGINS_ENABLED, ...(row.plugins_enabled ?? {}) },
    commandsDisabled: [...(row.commands_disabled ?? DEFAULT_COMMANDS_DISABLED)],
    customSettings: {
      ...settings,
      antilink_whitelist_domain: settings.antilink_whitelist_domain ?? [],
      antilink_whitelist_number: settings.antilink_whitelist_number ?? [],
      premium_packages: settings.premium_packages ?? [],
      // Row lama (sebelum fitur ini) belum punya blok customization: isi dari default
      // supaya frontend tidak membaca undefined.
      customization: {
        group_texts: {
          ...defaultCustomization().group_texts,
          ...(settings.customization?.group_texts ?? {}),
        },
        menu: {
          header: settings.customization?.menu?.header ?? '',
          footer: settings.customization?.menu?.footer ?? '',
          tags: settings.customization?.menu?.tags ?? {},
        },
      },
    },
    // Row lama (ai_settings '{}') tetap aman: semua field jatuh ke preset default.
    aiSettings: { ...DEFAULT_AI_SETTINGS, ...(row.ai_settings ?? {}) },
    updatedAt: row.updated_at,
  };
}

async function selectConfig(sessionId: string): Promise<BotConfig | null> {
  const { rows } = await pool.query<BotConfigRow>(
    `SELECT ${COLUMNS} FROM bot_configs WHERE session_id = $1::uuid`,
    [sessionId],
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
}

export async function getConfig(sessionId: string): Promise<BotConfig | null> {
  const cached = cache.get(sessionId);
  if (cached) return cached;

  const config = await selectConfig(sessionId);
  if (config) cache.set(sessionId, config);
  return config;
}

// Dipakai GET config sebelum row ada: SPEC menulis row default saat session pertama connect,
// jadi baca config tidak boleh menulis ke DB.
export function defaultConfigFor(sessionId: string): BotConfig {
  return {
    sessionId,
    autoReply: [],
    welcomeMsg: { ...DEFAULT_WELCOME_MSG },
    pluginsEnabled: { ...DEFAULT_PLUGINS_ENABLED },
    commandsDisabled: [...DEFAULT_COMMANDS_DISABLED],
    customSettings: { ...DEFAULT_CUSTOM_SETTINGS },
    aiSettings: { ...DEFAULT_AI_SETTINGS },
    updatedAt: new Date(),
  };
}

export async function createDefaultConfig(
  sessionId: string,
  botname?: string,
): Promise<BotConfig> {
  // Nama bot dari form tambah session jadi botname awal, bukan default generik.
  const customSettings: CustomSettings = botname
    ? { ...DEFAULT_CUSTOM_SETTINGS, botname }
    : { ...DEFAULT_CUSTOM_SETTINGS };

  const { rows } = await pool.query<BotConfigRow>(
    `INSERT INTO bot_configs (session_id, auto_reply, welcome_msg, plugins_enabled, commands_disabled, custom_settings)
     VALUES ($1::uuid, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb)
     ON CONFLICT (session_id) DO NOTHING
     RETURNING ${COLUMNS}`,
    [
      sessionId,
      JSON.stringify(DEFAULT_AUTO_REPLY),
      JSON.stringify(DEFAULT_WELCOME_MSG),
      JSON.stringify(DEFAULT_PLUGINS_ENABLED),
      JSON.stringify(DEFAULT_COMMANDS_DISABLED),
      JSON.stringify(customSettings),
    ],
  );

  const config = rows[0] ? mapRow(rows[0]) : await selectConfig(sessionId);
  if (!config) {
    throw new Error(`bot_configs row tidak bisa dibuat untuk session ${sessionId}`);
  }

  cache.set(sessionId, config);
  return config;
}

export async function updateConfig(sessionId: string, patch: ConfigPatch): Promise<BotConfig> {
  const current = (await getConfig(sessionId)) ?? (await createDefaultConfig(sessionId));

  const autoReply: AutoReplyRule[] =
    patch.autoReply === undefined
      ? current.autoReply
      : validateAutoReply(patch.autoReply).map((rule) => ({
          ...rule,
          id: rule.id || randomUUID(),
        }));

  const welcomeMsg: WelcomeMsg =
    patch.welcomeMsg === undefined
      ? current.welcomeMsg
      : { ...current.welcomeMsg, ...validateWelcomeMsg(patch.welcomeMsg) };

  const pluginsEnabled: PluginsEnabled =
    patch.pluginsEnabled === undefined
      ? current.pluginsEnabled
      : { ...current.pluginsEnabled, ...validatePluginsEnabled(patch.pluginsEnabled) };

  const commandsDisabled: string[] =
    patch.commandsDisabled === undefined
      ? current.commandsDisabled
      : validateCommandsDisabled(patch.commandsDisabled);

  const customSettings: CustomSettings =
    patch.customSettings === undefined
      ? current.customSettings
      : { ...current.customSettings, ...validateCustomSettings(patch.customSettings) };

  const aiSettings: AiSettings =
    patch.aiSettings === undefined
      ? current.aiSettings
      : { ...current.aiSettings, ...validateAiSettings(patch.aiSettings) };

  const { rows } = await pool.query<BotConfigRow>(
    `UPDATE bot_configs
     SET auto_reply = $2::jsonb,
         welcome_msg = $3::jsonb,
         plugins_enabled = $4::jsonb,
         commands_disabled = $5::jsonb,
         custom_settings = $6::jsonb,
         ai_settings = $7::jsonb,
         updated_at = now()
     WHERE session_id = $1::uuid
     RETURNING ${COLUMNS}`,
    [
      sessionId,
      JSON.stringify(autoReply),
      JSON.stringify(welcomeMsg),
      JSON.stringify(pluginsEnabled),
      JSON.stringify(commandsDisabled),
      JSON.stringify(customSettings),
      JSON.stringify(aiSettings),
    ],
  );

  const row = rows[0];
  if (!row) {
    throw new Error(`bot_configs row hilang saat update session ${sessionId}`);
  }

  const updated = mapRow(row);
  cache.set(sessionId, updated);
  return updated;
}

export function invalidateCache(sessionId: string): void {
  cache.delete(sessionId);
}

export async function addAutoReplyRule(
  sessionId: string,
  rule: unknown,
): Promise<{ rule: AutoReplyRule; config: BotConfig }> {
  const current = (await getConfig(sessionId)) ?? (await createDefaultConfig(sessionId));
  const [validated] = validateAutoReply([rule]);

  if (!validated) {
    throw new ValidationError('auto reply tidak valid');
  }

  const created: AutoReplyRule = { ...validated, id: validated.id || randomUUID() };
  const config = await updateConfig(sessionId, { autoReply: [...current.autoReply, created] });

  return { rule: created, config };
}

export async function removeAutoReplyRule(
  sessionId: string,
  ruleId: string,
): Promise<{ removed: boolean; config: BotConfig }> {
  const current = (await getConfig(sessionId)) ?? (await createDefaultConfig(sessionId));
  const next = current.autoReply.filter((rule) => rule.id !== ruleId);

  if (next.length === current.autoReply.length) {
    return { removed: false, config: current };
  }

  const config = await updateConfig(sessionId, { autoReply: next });
  return { removed: true, config };
}