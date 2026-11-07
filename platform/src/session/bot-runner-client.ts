// HTTP client ke Bot Runner Agent (mode 'other').
// Semua fungsi mirror pm2-manager.ts tapi lewat HTTP.

function botRunnerUrl(): string {
  const url = process.env.BOT_RUNNER_URL?.replace(/\/$/, '');
  if (!url) throw new Error('BOT_RUNNER_URL wajib di-set kalau BOT_RUNNER_MODE=other');
  return url;
}

function botRunnerSecret(): string {
  return process.env.BOT_RUNNER_SECRET ?? '';
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${botRunnerSecret()}`,
  };
  // Content-Type hanya dikirim kalau memang ada body: Fastify menolak request ber-
  // Content-Type application/json dengan body kosong (FST_ERR_CTP_EMPTY_JSON_BODY),
  // dan itu yang bikin /stop dan /destroy gagal.
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${botRunnerUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bot Runner ${method} ${path} → ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

// Kirim config.json terbaru ke instance yang sudah jalan (hot reload command/limit).
// 404 = instance belum di-spawn di runner; config tetap dikirim saat /spawn berikutnya.
export async function pushConfigRemote(sessionId: string, configJson: string): Promise<void> {
  await call('POST', `/config/${sessionId}`, { configJson });
}

export async function spawnSessionRemote(
  userId: string,
  sessionId: string,
  env: Record<string, string>,
  configJson: string,
): Promise<void> {
  await call('POST', `/spawn/${sessionId}`, { userId, env, configJson });
}

export async function stopSessionRemote(sessionId: string): Promise<void> {
  await call('POST', `/stop/${sessionId}`);
}

export async function destroySessionRemote(sessionId: string): Promise<void> {
  await call('DELETE', `/destroy/${sessionId}`);
}

export interface RemoteSessionRuntime {
  status: string | null;
  // true kalau proses bot online DAN connected.txt ada (WhatsApp benar-benar terhubung).
  connected: boolean;
  // Nomor WhatsApp asli dari bot (null kalau belum pernah terhubung).
  phone: string | null;
}

export async function getSessionStatusRemote(sessionId: string): Promise<string | null> {
  const data = await call<{ status: string | null }>('GET', `/status/${sessionId}`);
  return data.status;
}

export async function getSessionRuntimeRemote(sessionId: string): Promise<RemoteSessionRuntime> {
  const data = await call<{ status: string | null; connected?: boolean; phone?: string | null }>(
    'GET',
    `/status/${sessionId}`,
  );
  return {
    status: data.status,
    connected: Boolean(data.connected),
    phone: data.phone ?? null,
  };
}

// URL WebSocket stream QR/pairing di Bot Runner (dipakai ws/qr-server.ts saat mode 'other').
export function botRunnerStreamUrl(sessionId: string): string {
  const base = botRunnerUrl().replace(/^http/, 'ws');
  const secret = encodeURIComponent(botRunnerSecret());
  return `${base}/stream/${sessionId}?secret=${secret}`;
}

// URL WebSocket streaming log PM2 (dipakai ws/log-server.ts saat mode 'other').
export function botRunnerLogsUrl(sessionId: string): string {
  const base = botRunnerUrl().replace(/^http/, 'ws');
  const secret = encodeURIComponent(botRunnerSecret());
  return `${base}/logs/${sessionId}?secret=${secret}`;
}
