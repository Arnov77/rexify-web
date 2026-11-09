import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { forcedDisabledFilesForPlan } from './access';
import { pool } from '../db';
import { instanceConfigPath } from '../paths';
import type { BotConfigFile } from '../types/config';
import { pushConfigRemote } from '../session/bot-runner-client';
import { defaultConfigFor, getConfig } from './bot-config';
import { defaultBotConfig } from './defaults';

// generateConfig tidak menerima plan user, jadi plan + nomor input diambil lewat join.
async function sessionContext(sessionId: string): Promise<{ plan: string; phone: string }> {
  const { rows } = await pool.query<{ plan: string; phone_number_input: string | null }>(
    `SELECT u.plan, s.phone_number_input
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1::uuid`,
    [sessionId],
  );

  const row = rows[0];
  if (!row) {
    throw new Error(`session ${sessionId} tidak ditemukan`);
  }

  return { plan: row.plan, phone: row.phone_number_input ?? '' };
}

export async function generateConfig(sessionId: string): Promise<BotConfigFile> {
  // Row config belum ada saat connect pertama: pakai default in-memory, bukan insert, karena
  // createDefaultConfig dipanggil spawnSession setelah proses PM2 hidup.
  const config = (await getConfig(sessionId)) ?? defaultConfigFor(sessionId);
  // Nomor dari form tambah session, bukan phone_number hasil Baileys: config.json ditulis
  // sebelum bot sempat connect, jadi phone_number masih null.
  const { plan, phone } = await sessionContext(sessionId);

  const base = defaultBotConfig();
  const cs = config.customSettings;

  const file: BotConfigFile = {
    ...base,
    botname: cs.botname || base.botname,
    ownername: cs.ownername || base.ownername,
    thumbnailUrl: cs.thumbnailUrl || base.thumbnailUrl,
    audioUrl: cs.audioUrl || base.audioUrl,
    web: cs.web || base.web,
    owner: [phone].filter(Boolean),
    nomor: phone,
    link: {
      group: cs.link_group || '',
      saluran: cs.link_saluran || '',
    },
    id: {
      saluran: cs.id_saluran || '',
      group: cs.id_group || '',
      ownerGroup: cs.id_ownerGroup || '',
    },
    limit: {
      free: cs.limit_free ?? 25,
      premium: cs.limit_premium ?? 200,
    },
    antilink: {
      // Whitelist user hanya menimpa default kalau benar-benar diisi.
      whitelist_domain: cs.antilink_whitelist_domain.length
        ? cs.antilink_whitelist_domain
        : base.antilink.whitelist_domain,
      whitelist_number: cs.antilink_whitelist_number.length
        ? cs.antilink_whitelist_number
        : [''],
    },
    premium: {
      packages: cs.premium_packages.length ? cs.premium_packages : base.premium.packages,
    },
    tz: cs.tz || 'Asia/Jakarta',
    // token.rex: pakai key user kalau diisi, fallback ke env platform.
    // token.jerexd: hanya di-inject untuk plan pro/enterprise, plan free dapat string kosong.
    token: {
      rex: cs.token_rex || process.env.REX_API_KEY || '',
      jerexd:
        plan === 'pro' || plan === 'enterprise' ? process.env.JEREXD_API_KEY || '' : '',
    },
    git: {
      name: cs.git_name ? [cs.git_name] : [''],
      token: cs.git_token ? [cs.git_token] : [''],
    },
    auto_reply: config.autoReply,
    welcome_msg: config.welcomeMsg,
    // Dibaca core sebagai global.ai; auto-ai.js mengirimnya ke API tiap balasan.
    ai: { ...base.ai, ...config.aiSettings },
    // Dibaca core/handler.js: plugin dengan path ini dilewati (termasuk plugin.before).
    // Fitur di luar plan (mis. AI untuk free) selalu ikut dimatikan di sini, bukan hanya
    // dikunci di dashboard, supaya bot benar-benar tidak menjalankannya.
    commands_disabled: [
      ...new Set([...config.commandsDisabled, ...forcedDisabledFilesForPlan(plan)]),
    ],
  };

  const target = instanceConfigPath(sessionId);
  await mkdir(dirname(target), { recursive: true });
  // Tulis ke file sementara lalu rename: bot memantau config.json (hot reload), jadi file
  // tidak boleh sempat terbaca dalam keadaan setengah tertulis.
  const tmp = `${target}.tmp`;
  await writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  await rename(tmp, target);

  return file;
}

/** Tulis ulang config.json hanya kalau folder instance sudah ada (bot pernah di-connect). */
export async function syncInstanceConfig(sessionId: string): Promise<void> {
  if (!existsSync(dirname(instanceConfigPath(sessionId)))) return;
  await generateConfig(sessionId);
}

function isRemoteRunnerMode(): boolean {
  return process.env.BOT_RUNNER_MODE === 'other';
}

// Terapkan config terbaru ke instance bot tanpa restart: mode 'same' tulis file lokal,
// mode 'other' kirim lewat HTTP. Push gagal tidak menggagalkan PATCH (dikirim lagi saat spawn).
export async function applyConfigToBot(sessionId: string): Promise<void> {
  if (!isRemoteRunnerMode()) {
    await syncInstanceConfig(sessionId);
    return;
  }

  const file = await generateConfig(sessionId);
  try {
    await pushConfigRemote(sessionId, JSON.stringify(file));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[config] gagal kirim config ke Bot Runner (${sessionId}): ${err instanceof Error ? err.message : err}`,
    );
  }
}