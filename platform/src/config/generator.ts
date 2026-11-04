import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { instanceConfigPath } from '../paths';
import { getSessionById } from '../session/store';
import type { BotConfigFile } from '../types/config';
import { defaultConfigFor, getConfig } from './bot-config';
import { defaultBotConfig } from './defaults';

export async function generateConfig(sessionId: string): Promise<BotConfigFile> {
  // Row config belum ada saat connect pertama: pakai default in-memory, bukan insert, karena
  // createDefaultConfig dipanggil spawnSession setelah proses PM2 hidup.
  const config = (await getConfig(sessionId)) ?? defaultConfigFor(sessionId);
  const session = await getSessionById(sessionId);

  if (!session) {
    throw new Error(`session ${sessionId} tidak ditemukan`);
  }

  const base = defaultBotConfig();
  const botPhone = session.phone_number ?? '';

  const file: BotConfigFile = {
    ...base,
    botname: config.customSettings.botname,
    // Nomor user tidak disimpan platform, jadi nomor bot dipakai sebagai owner.
    owner: botPhone ? [botPhone] : [],
    nomor: botPhone,
    antilink: { ...base.antilink, whitelist_domain: config.customSettings.antilink_whitelist },
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