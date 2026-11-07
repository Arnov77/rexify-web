import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { CommandCatalog, CommandEntry } from '../types/config';

// Katalog di-generate dari core: `cd core && npm run catalog`
// (menulis ke platform/src/config/commands.catalog.json). Disimpan sebagai file supaya
// platform tidak perlu meng-import 197 plugin core saat runtime.
// tsc tidak menyalin file .json ke dist, jadi cari juga di folder src saat production.
const CATALOG_CANDIDATES = [
  path.join(__dirname, 'commands.catalog.json'),
  path.join(__dirname, '..', '..', 'src', 'config', 'commands.catalog.json'),
  path.join(process.cwd(), 'src', 'config', 'commands.catalog.json'),
];

let cached: CommandCatalog | null = null;

function readCatalogFile(): CommandCatalog | null {
  for (const candidate of CATALOG_CANDIDATES) {
    try {
      const raw = readFileSync(candidate, 'utf8');
      const parsed = JSON.parse(raw) as CommandCatalog;
      return {
        generatedAt: parsed.generatedAt,
        source: parsed.source,
        total: parsed.total,
        commands: Array.isArray(parsed.commands) ? parsed.commands : [],
      };
    } catch {
      // Coba kandidat berikutnya.
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
  const counts = new Map<string, number>();
  for (const entry of getCommandCatalog().commands) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([id, total]) => ({ id, label: CATEGORY_LABELS[id] ?? labelize(id), total }))
    .sort((a, b) => a.label.localeCompare(b.label, 'id'));
}

export function findCommandEntry(file: string): CommandEntry | undefined {
  return getCommandCatalog().commands.find((entry) => entry.file === file);
}
