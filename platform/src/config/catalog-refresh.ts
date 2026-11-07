import { execFile } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { CORE_DIR } from '../paths';
import { getCatalogRemote } from '../session/bot-runner-client';
import type { CommandCatalog } from '../types/config';
import { getCommandCatalog, invalidateCatalogCache } from './catalog';

const execFileAsync = promisify(execFile);

const SCRIPT_REL = path.join('scripts', 'list-commands.mjs');
const PLUGINS_DIR = path.join(CORE_DIR, 'plugins');
const REFRESH_TIMEOUT_MS = 60_000;

// Mode 'other' (Bot Runner terpisah) tidak punya core/ di mesin platform, jadi refresh
// hanya tersedia kalau script dan folder plugin benar-benar ada.
export class CatalogRefreshUnavailableError extends Error {
  readonly code = 'CATALOG_REFRESH_UNAVAILABLE';

  constructor(message = 'Folder core tidak tersedia di mesin platform, katalog tidak bisa dibuat ulang') {
    super(message);
    this.name = 'CatalogRefreshUnavailableError';
  }
}

// Mode 'other' = core ada di mesin Bot Runner. Katalog di-generate manual oleh ops di mesin
// runner (lihat README bot-runner: `node scripts/list-commands.mjs` / endpoint POST /catalog),
// lalu file katalog di platform diperbarui saat deploy. UI user hanya membaca hasilnya.
export function isRemoteCatalogMode(): boolean {
  return process.env.BOT_RUNNER_MODE === 'other';
}

// Tombol "Muat ulang katalog" hanya untuk mode 'same' (core ada di mesin platform).
export function canRefreshCatalog(): boolean {
  if (isRemoteCatalogMode()) return false;
  return existsSync(path.join(CORE_DIR, SCRIPT_REL)) && existsSync(PLUGINS_DIR);
}

// Script menulis ke source tree supaya ikut ke-commit; di production yang hanya punya dist,
// tulis ke samping catalog.js hasil build.
function catalogOutputPath(): string {
  const srcDir = path.resolve(process.cwd(), 'src', 'config');
  return existsSync(srcDir)
    ? path.join(srcDir, 'commands.catalog.json')
    : path.join(__dirname, 'commands.catalog.json');
}

function newestPluginMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestPluginMtime(full));
    } else if (/\.(c|m)?js$/.test(entry.name)) {
      newest = Math.max(newest, statSync(full).mtimeMs);
    }
  }
  return newest;
}

export function isCatalogStale(): boolean {
  // Mode 'other': folder plugin tidak ada di mesin ini, jadi tidak bisa dibandingkan mtime.
  // Tombol "Muat ulang katalog" tetap tersedia dan meminta katalog baru ke Bot Runner.
  if (isRemoteCatalogMode()) return false;
  if (!canRefreshCatalog()) return false;

  const generated = Date.parse(getCommandCatalog().generatedAt);
  if (Number.isNaN(generated)) return true;
  return newestPluginMtime(PLUGINS_DIR) > generated;
}

export async function refreshCatalog(): Promise<CommandCatalog> {
  // Mode 'other' sengaja tidak didukung dari sini: katalog dibuat manual di mesin runner.
  if (!canRefreshCatalog()) throw new CatalogRefreshUnavailableError();

  await execFileAsync(process.execPath, [SCRIPT_REL, '--out', catalogOutputPath()], {
    cwd: CORE_DIR,
    timeout: REFRESH_TIMEOUT_MS,
    windowsHide: true,
  });

  invalidateCatalogCache();
  return getCommandCatalog();
}

// Tulis katalog ke semua lokasi yang dibaca runtime: source tree dan dist (production).
// Folder dist hanya ditulis kalau memang ada, supaya dev murni tidak membuat dist palsu.
async function persistCatalog(catalog: CommandCatalog): Promise<void> {
  const payload = `${JSON.stringify(catalog, null, 2)}\n`;
  const targets = new Set<string>([
    path.resolve(process.cwd(), 'src', 'config', 'commands.catalog.json'),
    path.join(__dirname, 'commands.catalog.json'),
  ]);

  const distDir = path.resolve(process.cwd(), 'dist', 'config');
  if (existsSync(distDir)) targets.add(path.join(distDir, 'commands.catalog.json'));

  for (const target of targets) {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, payload, 'utf8');
  }
}

// Mode 'other': generate di mesin Bot Runner, lalu simpan hasilnya di disk platform.
// Tidak perlu scp manual dan tidak perlu restart karena cache ikut dibuang.
export async function refreshCatalogFromRunner(): Promise<CommandCatalog> {
  let remote: CommandCatalog;
  try {
    remote = await getCatalogRemote();
  } catch (err) {
    throw new CatalogRefreshUnavailableError(
      `Gagal mengambil katalog dari Bot Runner: ${err instanceof Error ? err.message : err}`,
    );
  }

  await persistCatalog(remote);
  invalidateCatalogCache();
  return getCommandCatalog();
}

// Dipakai endpoint ops (header x-catalog-token): mode 'same' jalankan generator lokal,
// mode 'other' minta katalog ke Bot Runner. Berlaku tanpa restart platform.
export async function refreshCatalogForOps(): Promise<CommandCatalog> {
  if (isRemoteCatalogMode()) return refreshCatalogFromRunner();
  return refreshCatalog();
}

/** Dipanggil saat boot: plugin berubah tapi katalog belum di-generate ulang. */
export async function refreshCatalogIfStale(): Promise<void> {
  if (!isCatalogStale()) return;

  try {
    const catalog = await refreshCatalog();
    // eslint-disable-next-line no-console
    console.log(`[catalog] katalog usang, di-generate ulang: ${catalog.total} plugin`);
  } catch (err) {
    // Katalog lama tetap dipakai; error di sini tidak boleh menggagalkan boot.
    // eslint-disable-next-line no-console
    console.warn(`[catalog] gagal generate ulang: ${err instanceof Error ? err.message : err}`);
  }
}
