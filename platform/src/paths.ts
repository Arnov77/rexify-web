import path from 'node:path';

export const REXIFY_ROOT = process.env.REXIFY_ROOT ?? '/home/rexify';
export const CORE_DIR = path.join(REXIFY_ROOT, 'core');
export const INSTANCES_DIR = path.join(REXIFY_ROOT, 'instances');

export function instanceDir(sessionId: string): string {
  return path.join(INSTANCES_DIR, sessionId);
}

export function instanceSessionsDir(sessionId: string): string {
  return path.join(instanceDir(sessionId), 'sessions');
}

export function instanceDataDir(sessionId: string): string {
  return path.join(instanceDir(sessionId), 'data');
}

export function instanceConfigPath(sessionId: string): string {
  return path.join(instanceDir(sessionId), 'config.json');
}

export function instanceQrPath(sessionId: string): string {
  return path.join(instanceDir(sessionId), 'qr.txt');
}

// Bot menulis connected.txt saat connection === 'open' (lihat core/main.js).
export function instanceConnectedPath(sessionId: string): string {
  return path.join(instanceDir(sessionId), 'connected.txt');
}

// Nomor WhatsApp yang benar-benar terhubung, ditulis bot saat connection === 'open'.
export function instancePhonePath(sessionId: string): string {
  return path.join(instanceDir(sessionId), 'phone.txt');
}

// PM2 menyimpan log proses di $PM2_HOME/logs (default ~/.pm2/logs).
// Nama proses bot = rexify-<sessionId> (lihat pm2-manager.ts).
function pm2LogsDir(): string {
  const home = process.env.PM2_HOME ?? path.join(process.env.HOME ?? '/root', '.pm2');
  return path.join(home, 'logs');
}

export function instanceLogPath(sessionId: string): string {
  return path.join(pm2LogsDir(), `rexify-${sessionId}-out.log`);
}

export function instanceErrorLogPath(sessionId: string): string {
  return path.join(pm2LogsDir(), `rexify-${sessionId}-error.log`);
}

export function instanceCredsPath(sessionId: string): string {
  return path.join(instanceSessionsDir(sessionId), 'creds.json');
}