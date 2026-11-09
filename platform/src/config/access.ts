import type { CommandCatalog, CommandEntry } from '../types/config';
import { getCommandCatalog } from './catalog';
import { commandAccessFor, forcedDisabledCategoriesFor } from './plans';

// Entry katalog boleh dipakai plan ini? Plugin `locked` (owner/rowner) dikunci flag sendiri.
export function isEntryAvailableForPlan(plan: string, entry: CommandEntry): boolean {
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

// File yang wajib dimatikan untuk plan ini walau user tidak mematikannya. Dipakai
// generator supaya fitur di luar plan benar-benar tidak jalan di bot.
export function forcedDisabledFilesForPlan(plan: string): string[] {
  const categories = forcedDisabledCategoriesFor(plan);
  if (categories.length === 0) return [];

  return getCommandCatalog()
    .commands.filter((entry) => categories.includes(entry.category))
    .map((entry) => entry.file);
}
