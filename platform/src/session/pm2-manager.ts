import { existsSync } from 'node:fs';
import { cp, copyFile, mkdir, readdir, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
// Type-only: hilang saat compile, jadi tidak ada require('pm2') di runtime cloud.
import type { StartOptions } from 'pm2';
import { createDefaultConfig } from '../config/bot-config';
import { generateConfig } from '../config/generator';
import { sessionQuotaFor } from '../config/plans';
import { pool } from '../db';
import {
  CORE_DIR,
  instanceDataDir,
  instanceDir,
  instanceQrPath,
  instanceSessionsDir,
} from '../paths';
import {
  destroySessionRemote,
  getSessionStatusRemote,
  spawnSessionRemote,
  stopSessionRemote,
} from './bot-runner-client';
import { countRunningSessions, getSessionById, syncStatus } from './store';

type LinkedEntry = { name: string; kind: 'file' | 'dir' };

const LINKED_ENTRIES: LinkedEntry[] = [
  { name: 'index.js', kind: 'file' },
  { name: 'main.js', kind: 'file' },
  { name: 'handler.js', kind: 'file' },
  { name: 'package.json', kind: 'file' },
  { name: 'plugins', kind: 'dir' },
  { name: 'lib', kind: 'dir' },
  { name: 'node_modules', kind: 'dir' },
];

export class SessionQuotaExceededError extends Error {
  readonly code = 'SESSION_QUOTA_EXCEEDED';

  constructor(message = 'Kuota session untuk plan ini sudah penuh') {
    super(message);
    this.name = 'SessionQuotaExceededError';
  }
}

// Mode 'other' = bot dijalankan Bot Runner Agent (mesin terpisah, lewat HTTP).
// Default 'same' = PM2 langsung di mesin platform.
export function isRemoteMode(): boolean {
  return process.env.BOT_RUNNER_MODE === 'other';
}

let connectPromise: Promise<void> | null = null;

type Pm2Api = typeof import('pm2');

// pm2 di-load lazy: di mode 'other' (cloud tanpa PM2 binary) module ini tidak pernah di-import.
let _pm2: Pm2Api | null = null;

async function getPm2(): Promise<Pm2Api> {
  if (!_pm2) {
    const mod = await import('pm2');
    // pm2 adalah CJS; interop `default` bisa beda antar loader.
    _pm2 = ((mod as unknown as { default?: Pm2Api }).default ?? mod) as Pm2Api;
  }
  return _pm2;
}

async function connectPm2(): Promise<void> {
  if (!connectPromise) {
    const pm2 = await getPm2();
    connectPromise = new Promise<void>((resolve, reject) => {
      pm2.connect((err) => {
        if (err) {
          connectPromise = null;
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
  return connectPromise;
}

async function pm2Start(options: StartOptions): Promise<void> {
  const pm2 = await getPm2();
  return new Promise((resolve, reject) => {
    pm2.start(options, (err) => (err ? reject(err) : resolve()));
  });
}

async function pm2Delete(name: string): Promise<void> {
  const pm2 = await getPm2();
  return new Promise((resolve, reject) => {
    pm2.delete(name, (err) => (err ? reject(err) : resolve()));
  });
}

async function pm2Stop(name: string): Promise<void> {
  const pm2 = await getPm2();
  return new Promise((resolve, reject) => {
    pm2.stop(name, (err) => (err ? reject(err) : resolve()));
  });
}

async function pm2Describe(name: string): Promise<{ status: string } | null> {
  const pm2 = await getPm2();
  return new Promise((resolve, reject) => {
    pm2.describe(name, (err, list) => {
      if (err) {
        reject(err);
        return;
      }
      const proc = list && list[0];
      resolve(proc ? { status: String(proc.pm2_env?.status ?? 'unknown') } : null);
    });
  });
}

export function pm2Name(sessionId: string): string {
  return `rexify-${sessionId}`;
}

async function linkCoreEntries(dir: string): Promise<void> {
  for (const entry of LINKED_ENTRIES) {
    const source = path.join(CORE_DIR, entry.name);
    const target = path.join(dir, entry.name);
    if (existsSync(target)) continue;

    try {
      await symlink(
        source,
        target,
        process.platform === 'win32' ? (entry.kind === 'dir' ? 'junction' : 'file') : entry.kind,
      );
    } catch (err) {
      // Windows tanpa hak symlink: salin supaya dev tetap bisa jalan.
      if (process.platform !== 'win32') throw err;
      if (entry.kind === 'dir') {
        await cp(source, target, { recursive: true });
      } else {
        await copyFile(source, target);
      }
    }
  }
}

async function getUserPlan(userId: string): Promise<string> {
  const { rows } = await pool.query<{ plan: string }>(
    'SELECT plan FROM users WHERE id = $1::uuid',
    [userId],
  );
  const plan = rows[0]?.plan;
  if (!plan) throw new Error(`user ${userId} tidak ditemukan`);
  return plan;
}

export async function spawnSession(userId: string, sessionId: string): Promise<void> {
  // Mode 'other' tidak butuh core/ di mesin platform: Bot Runner yang menyiapkan instance.
  if (!isRemoteMode() && !existsSync(CORE_DIR)) {
    throw new Error(`codebase bot tidak ditemukan di ${CORE_DIR}`);
  }

  const plan = await getUserPlan(userId);
  const running = await countRunningSessions(userId, sessionId);

  if (running >= sessionQuotaFor(plan)) {
    throw new SessionQuotaExceededError();
  }

  // Nomor input dan mode connect dibaca dari DB, bukan dari body request, supaya nilai yang
  // di-inject ke proses bot selalu sama dengan yang tersimpan.
  const session = await getSessionById(sessionId);
  if (!session) {
    throw new Error(`session ${sessionId} tidak ditemukan`);
  }

  // QR_OUTPUT_PATH tidak ikut di mode 'other': bot menulis qr/pairing/connected.txt di cwd
  // instance milik Bot Runner, karena path filesystem mesin platform tidak berlaku di sana.
  const botEnv: Record<string, string> = {
    PHONE_NUMBER: session.phone_number_input ?? '',
    CONNECT_MODE: session.connect_mode ?? 'qr',
    // Watermark aktif untuk plan free, tidak ada untuk pro/enterprise
    REXIFY_WATERMARK:
      plan === 'free' ? 'Bot ini dibuat dengan Rexify. Kunjungi rexify.rexapi.my.id' : '',
  };

  if (isRemoteMode()) {
    // Folder instance + symlink core dikerjakan Bot Runner; platform tetap pemilik config.json.
    const configFile = await generateConfig(sessionId);
    await spawnSessionRemote(userId, sessionId, botEnv, JSON.stringify(configFile));

    await createDefaultConfig(sessionId);
    await syncStatus(sessionId, 'connecting');
    return;
  }

  const dir = instanceDir(sessionId);
  await mkdir(dir, { recursive: true });
  await linkCoreEntries(dir);
  await mkdir(instanceSessionsDir(sessionId), { recursive: true });
  await mkdir(instanceDataDir(sessionId), { recursive: true });

  await generateConfig(sessionId);

  const name = pm2Name(sessionId);
  await connectPm2();

  if (await pm2Describe(name)) {
    await pm2Delete(name);
  }

  await pm2Start({
    name,
    script: path.join(dir, 'index.js'),
    cwd: dir,
    interpreter: 'node',
    env: {
      SESSION_ID: sessionId,
      USER_ID: userId,
      QR_OUTPUT_PATH: instanceQrPath(sessionId),
      ...botEnv,
    },
  });

  // Row config default dibuat setelah proses PM2 hidup; di atas generateConfig memakai
  // default in-memory kalau row-nya belum ada.
  await createDefaultConfig(sessionId);
  await syncStatus(sessionId, 'connecting');
}

export async function stopSession(sessionId: string): Promise<void> {
  if (isRemoteMode()) {
    await stopSessionRemote(sessionId);
    await syncStatus(sessionId, 'disconnected');
    return;
  }

  const name = pm2Name(sessionId);
  await connectPm2();

  if (await pm2Describe(name)) {
    await pm2Stop(name);
  }

  await syncStatus(sessionId, 'disconnected');
}

export async function destroySession(sessionId: string): Promise<void> {
  if (isRemoteMode()) {
    // Bot Runner yang menghapus folder instance (kecuali sessions/).
    await destroySessionRemote(sessionId);
    await syncStatus(sessionId, 'disconnected');
    return;
  }

  const name = pm2Name(sessionId);
  await connectPm2();

  if (await pm2Describe(name)) {
    await pm2Delete(name);
  }

  const dir = instanceDir(sessionId);
  if (existsSync(dir)) {
    for (const entry of await readdir(dir)) {
      // sessions/ disimpan supaya bot bisa reconnect tanpa scan QR ulang.
      if (entry === 'sessions') continue;
      await rm(path.join(dir, entry), { recursive: true, force: true });
    }
  }

  await syncStatus(sessionId, 'disconnected');
}

export async function getSessionStatus(sessionId: string): Promise<string | null> {
  if (isRemoteMode()) {
    return getSessionStatusRemote(sessionId);
  }

  await connectPm2();
  const proc = await pm2Describe(pm2Name(sessionId));
  return proc ? proc.status : null;
}