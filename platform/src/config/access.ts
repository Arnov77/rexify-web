import type { CommandEntry } from '../types/config';
import { getCommandCatalog } from './catalog';
import { commandAccessFor } from './plans';

// Entry katalog boleh dipakai plan ini? Plugin `locked` (owner/rowner) tetap terkunci
// terpisah oleh flag `locked`, bukan oleh gating plan.
export function isEntryAvailableForPlan(plan: string, entry: CommandEntry): boolean {
  const keep = commandAccessFor(plan).keepCategories;
  return keep === null || keep.includes(entry.category);
}

// Dipakai saat menyaring `commands_disabled` dari client: hanya file yang boleh
// dipakai plan ini yang diterima (anti-bypass lewat request manual).
export function allowedFileSetForPlan(plan: string): Set<string> {
  const files = getCommandCatalog()
    .commands.filter((entry) => isEntryAvailableForPlan(plan, entry))
    .map((entry) => entry.file);
  return new Set(files);
}
