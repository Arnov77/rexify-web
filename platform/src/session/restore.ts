import { pool } from '../db';
import { spawnSession } from './pm2-manager';

export async function restoreActiveSessions(): Promise<void> {
  const { rows } = await pool.query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM sessions WHERE status = 'active'`,
  );

  for (const row of rows) {
    try {
      await spawnSession(row.user_id, row.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[restore] gagal spawn session ${row.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}