import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { closePool, pool } from './db';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();

  const entries = await readdir(MIGRATIONS_DIR);
  const files = entries.filter((f) => f.endsWith('.sql')).sort();

  if (files.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[migrate] tidak ada file .sql di', MIGRATIONS_DIR);
    return;
  }

  for (const file of files) {
    const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (applied.rowCount && applied.rowCount > 0) {
      // eslint-disable-next-line no-console
      console.log(`[migrate] skip (sudah jalan): ${file}`);
      continue;
    }

    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      // eslint-disable-next-line no-console
      console.log(`[migrate] applied: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // eslint-disable-next-line no-console
  console.log('[migrate] selesai');
}

runMigrations()
  .then(() => closePool())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('[migrate] gagal:', err instanceof Error ? err.message : err);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
