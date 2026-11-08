import { pool } from '../db';

export type ConfigAuditAction = 'commands_updated' | 'preset_applied' | 'limit_updated';

export interface ConfigAuditEntry {
  id: string;
  action: ConfigAuditAction;
  detail: Record<string, unknown>;
  createdAt: Date;
  userEmail: string | null;
}

interface ConfigAuditRow {
  id: string;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: Date;
  user_email: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Catat perubahan setelan bot. Gagal audit tidak boleh menggagalkan penyimpanan config
// (audit hanya jejak, bukan sumber kebenaran).
export async function logConfigChange(
  userId: string,
  sessionId: string,
  action: ConfigAuditAction,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO config_audit_log (user_id, session_id, action, detail)
       VALUES ($1::uuid, $2::uuid, $3, $4::jsonb)`,
      [userId, sessionId, action, JSON.stringify(detail)],
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[audit] gagal mencatat ${action} untuk session ${sessionId}: ${
        err instanceof Error ? err.message : err
      }`,
    );
  }
}

export async function listConfigAudit(
  sessionId: string,
  limit = DEFAULT_LIMIT,
  offset = 0,
): Promise<{ logs: ConfigAuditEntry[]; limit: number; offset: number }> {
  const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
  const safeOffset = Math.max(0, offset);

  const { rows } = await pool.query<ConfigAuditRow>(
    `SELECT a.id, a.action, a.detail, a.created_at, u.email AS user_email
     FROM config_audit_log a
     JOIN users u ON u.id = a.user_id
     WHERE a.session_id = $1::uuid
     ORDER BY a.created_at DESC
     LIMIT $2 OFFSET $3`,
    [sessionId, safeLimit, safeOffset],
  );

  return {
    logs: rows.map((row) => ({
      id: row.id,
      action: row.action as ConfigAuditAction,
      detail: row.detail ?? {},
      createdAt: row.created_at,
      userEmail: row.user_email,
    })),
    limit: safeLimit,
    offset: safeOffset,
  };
}
