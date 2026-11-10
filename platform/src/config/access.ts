import type { CommandCatalog, CommandEntry } from '../types/config';
import { getCommandCatalog } from './catalog';
import { commandAccessFor, forcedDisabledFileListFor } from './plans';

// Entry katalog boleh dipakai plan ini? Plugin `locked` (owner/rowner) dikunci flag sendiri.
// File yang masuk force-disable plan (fitur premium) juga dianggap tidak tersedia, supaya
// dashboard tidak menampilkan toggle yang sebenarnya tidak akan dijalankan bot.
export function isEntryAvailableForPlan(plan: string, entry: CommandEntry): boolean {
  if (forcedDisabledFileListFor(plan).includes(entry.file)) return false;
  const keep = commandAccessFor(plan).keepCategories;
  return keep === null || keep.includes(entry.category);
}

// Set file per plan dihitung sekali per katalog; katalog baru = cache baru.
const fileSetCache = new WeakMap<CommandCatalog, Map<string, Set<string>>>();

// Dipakai saat menyaring `commands_disabled` dari client (anti-bypass request manual).
export function allowedFileSetForPlan(plan: string): Set<string> {
  const catalog = getCommandCatalog();
  let perPlan = fileSetCache.get(catalog);
  if (!perPlan) {
    perPlan = new Map();
    fileSetCache.set(catalog, perPlan);
  }

  const cached = perPlan.get(plan);
  if (cached) return cached;

  const files = new Set(
    catalog.commands
      .filter((entry) => isEntryAvailableForPlan(plan, entry))
      .map((entry) => entry.file),
  );
  perPlan.set(plan, files);
  return files;
}

// File yang wajib dimatikan untuk plan ini walau user tidak mematikannya. Sumbernya
// keepCategories (kategori di luar plan) + daftar file eksplisit (fitur premium jerexd).
// `locked` dikecualikan: mematikan plugin owner akan mengunci pemilik bot dari command-nya
// sendiri, dan core sudah menggating-nya lewat plugin.owner.
export function forcedDisabledFilesForPlan(plan: string): string[] {
  const keep = commandAccessFor(plan).keepCategories;
  const byCategory =
    keep === null
      ? []
      : getCommandCatalog()
          .commands.filter((entry) => !keep.includes(entry.category) && !entry.locked)
          .map((entry) => entry.file);

  return [...byCategory, ...forcedDisabledFileListFor(plan)];
}
