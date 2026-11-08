import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { CommandCatalog, CommandEntry } from '../types/config';

// Katalog di-generate dari core (`cd core && npm run catalog`) dan disimpan sebagai file
// supaya platform tidak perlu meng-import 197 plugin core saat runtime (tsc tidak menyalin .json).
const CATALOG_CANDIDATES = [
  path.join(__dirname, 'commands.catalog.json'),
  path.join(__dirname, '..', '..', 'src', 'config', 'commands.catalog.json'),
  path.join(process.cwd(), 'src', 'config', 'commands.catalog.json'),
];

let cached: CommandCatalog | null = null;
let entryIndex: Map<string, CommandEntry> | null = null;
let categoryCache: CategorySummary[] | null = null;

// Salinan di `src/` bisa lebih baru dari `dist/` (build lama), jadi yang dipakai file
// dengan mtime terbaru. Hanya file terpilih yang dibaca, bukan semua kandidat.
function readCatalogFile(): CommandCatalog | null {
  const candidates: Array<{ mtimeMs: number; file: string }> = [];

  for (const candidate of CATALOG_CANDIDATES) {
    try {
      candidates.push({ mtimeMs: statSync(candidate).mtimeMs, file: candidate });
    } catch {
      // Kandidat tidak ada: lewati.
    }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const { file } of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as CommandCatalog;
      return {
        generatedAt: parsed.generatedAt,
        source: parsed.source,
        total: parsed.total,
        commands: Array.isArray(parsed.commands) ? parsed.commands : [],
      };
    } catch {
      // File rusak: pakai kandidat berikutnya.
    }
  }

  return null;
}

function loadCatalog(): CommandCatalog {
  if (cached) return cached;

  // File belum di-generate (deploy lama): tab Command tampil kosong, bukan error 500.
  cached = readCatalogFile() ?? { generatedAt: '', source: 'core/plugins', total: 0, commands: [] };
  return cached;
}

export function getCommandCatalog(): CommandCatalog {
  return loadCatalog();
}

/** Setelah `commands.catalog.json` ditulis ulang, cache harus dibuang. */
export function invalidateCatalogCache(): void {
  cached = null;
  entryIndex = null;
  categoryCache = null;
}

export interface CategorySummary {
  id: string;
  label: string;
  total: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  ai: 'AI',
  downloader: 'Downloader',
  fun: 'Fun',
  game: 'Game',
  games: 'Minigames',
  generator: 'Generator',
  group: 'Grup & moderasi',
  info: 'Info',
  manga: 'Manga',
  'mini-app': 'Mini app',
  owner: 'Owner',
  premium: 'Premium',
  rpg: 'RPG',
  search: 'Pencarian',
  sticker: 'Sticker',
  tools: 'Tools',
  events: 'Event',
  lainnya: 'Lainnya',
};

function labelize(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getCategories(): CategorySummary[] {
  if (categoryCache) return categoryCache;

  const counts = new Map<string, number>();
  for (const entry of getCommandCatalog().commands) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  }

  categoryCache = [...counts.entries()]
    .map(([id, total]) => ({ id, label: CATEGORY_LABELS[id] ?? labelize(id), total }))
    .sort((a, b) => a.label.localeCompare(b.label, 'id'));

  return categoryCache;
}

export function findCommandEntry(file: string): CommandEntry | undefined {
  if (!entryIndex) {
    entryIndex = new Map(getCommandCatalog().commands.map((entry) => [entry.file, entry]));
  }
  return entryIndex.get(file);
}
