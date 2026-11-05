import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pool } from '../db';
import { instanceConfigPath } from '../paths';
import { getSessionById } from '../session/store';
import type { BotConfigFile } from '../types/config';
import { defaultConfigFor, getConfig } from './bot-config';
import { defaultBotConfig } from './defaults';

// generateConfig tidak menerima plan user, jadi diambil lewat join sessions -> users.
async function planOfSession(sessionId: string): Promise<string> {
  const { rows } = await pool.query<{ plan: string }>(
    `SELECT u.plan
     FROM users u
     JOIN sessions s ON s.user_id = u.id
     WHERE s.id = $1::uuid`,
    [sessionId],
  );
  return rows[0]?.plan ?? 'free';
}

export async function generateConfig(sessionId: string): Promise<BotConfigFile> {
  // Row config belum ada saat connect pertama: pakai default in-memory, bukan insert, karena
  // createDefaultConfig dipanggil spawnSession setelah proses PM2 hidup.
  const config = (await getConfig(sessionId)) ?? defaultConfigFor(sessionId);
  const session = await getSessionById(sessionId);

  if (!session) {
    throw new Error(`session ${sessionId} tidak ditemukan`);
  }

  const plan = await planOfSession(sessionId);

  const base = defaultBotConfig();
  const cs = config.customSettings;
  // Pakai nomor dari form tambah session, bukan phone_number hasil Baileys: config.json
  // ditulis sebelum bot sempat connect, jadi phone_number masih null.
  const phone = session.phone_number_input ?? '';

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
  };

  const target = instanceConfigPath(sessionId);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(file, null, 2)}\n`, 'utf8');

  return file;
}

/** Tulis ulang config.json hanya kalau folder instance sudah ada (bot pernah di-connect). */
export async function syncInstanceConfig(sessionId: string): Promise<void> {
  if (!existsSync(dirname(instanceConfigPath(sessionId)))) return;
  await generateConfig(sessionId);
}