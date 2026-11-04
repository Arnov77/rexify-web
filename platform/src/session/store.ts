import { pool } from '../db';
import type { PluginLogRow, SessionRow, SessionStatus } from '../types/session';

const COLUMNS = 'id, user_id, phone_number, status, label, connected_at, created_at, updated_at';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function createSession(userId: string, label: string | null): Promise<SessionRow> {
  // Session baru belum punya proses bot, jadi statusnya disconnected, bukan default kolom `connecting`.
  const { rows } = await pool.query<SessionRow>(
    `INSERT INTO sessions (user_id, label, status)
     VALUES ($1::uuid, $2, 'disconnected')
     RETURNING ${COLUMNS}`,
    [userId, label],
  );
  return rows[0] as SessionRow;
}

export async function listSessions(userId: string): Promise<SessionRow[]> {
  const { rows } = await pool.query<SessionRow>(
    `SELECT ${COLUMNS} FROM sessions WHERE user_id = $1::uuid ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

export async function getSession(userId: string, sessionId: string): Promise<SessionRow | null> {
  if (!isUuid(sessionId)) return null;
  const { rows } = await pool.query<SessionRow>(
    `SELECT ${COLUMNS} FROM sessions WHERE id = $1::uuid AND user_id = $2::uuid`,
    [sessionId, userId],
  );
  return rows[0] ?? null;
}

export async function getSessionById(sessionId: string): Promise<SessionRow | null> {
  if (!isUuid(sessionId)) return null;
  const { rows } = await pool.query<SessionRow>(
    `SELECT ${COLUMNS} FROM sessions WHERE id = $1::uuid`,
    [sessionId],
  );
  return rows[0] ?? null;
}

export async function deleteSession(userId: string, sessionId: string): Promise<boolean> {
  if (!isUuid(sessionId)) return false;
  const result = await pool.query(
    'DELETE FROM sessions WHERE id = $1::uuid AND user_id = $2::uuid',
    [sessionId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

// Session yang sedang di-spawn ikut terhitung "running" saat restore, jadi dia dikecualikan.
export async function countRunningSessions(
  userId: string,
  excludeSessionId?: string,
): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM sessions
     WHERE user_id = $1::uuid
       AND status IN ('connecting', 'qr_pending', 'active')
       AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [userId, excludeSessionId ?? null],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function listPluginLogs(
  sessionId: string,
  limit: number,
  offset: number,
): Promise<PluginLogRow[]> {
  const { rows } = await pool.query<PluginLogRow>(
    `SELECT id, session_id, plugin_name, trigger, status, created_at
     FROM plugin_logs
     WHERE session_id = $1::uuid
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [sessionId, limit, offset],
  );
  return rows;
}

export async function syncStatus(
  sessionId: string,
  status: SessionStatus,
  phone?: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE sessions
     SET status = $2,
         phone_number = COALESCE($3, phone_number),
         connected_at = CASE WHEN $2 = 'active' THEN now() ELSE connected_at END,
         updated_at = now()
     WHERE id = $1::uuid`,
    [sessionId, status, phone ?? null],
  );
}
