import { getCommandCatalog } from './catalog';

// Preset = setelan massal `commands_disabled` berbasis kategori plugin di katalog.
// Toggle tetap per file plugin (bukan per alias); preset hanya mengisi daftar itu sekaligus.
export interface CommandPreset {
  id: string;
  label: string;
  description: string;
  // Kategori yang tetap hidup; `null` = semua kategori hidup (preset "Semua aktif").
  keepCategories: string[] | null;
}

export const COMMAND_PRESETS: CommandPreset[] = [
  {
    id: 'all',
    label: 'Semua aktif',
    description: 'Nyalakan semua plugin (command khusus owner tetap terkunci).',
    keepCategories: null,
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description:
      'Sisakan grup, info, owner, premium, dan tools. Kategori lain (AI, downloader, game, RPG, dll) dimatikan.',
    keepCategories: ['group', 'info', 'owner', 'premium', 'tools'],
  },
  {
    id: 'hemat',
    label: 'Hemat resource',
    description:
      'Matikan plugin berat: downloader, game, minigames, RPG, manga, dan mini app. Sisanya tetap aktif.',
    keepCategories: [
      'ai',
      'fun',
      'generator',
      'group',
      'info',
      'owner',
      'premium',
      'search',
      'sticker',
      'tools',
    ],
  },
];

export function getPresets(): Array<Omit<CommandPreset, 'keepCategories'>> {
  return COMMAND_PRESETS.map(({ id, label, description }) => ({ id, label, description }));
}

export function findPreset(id: string): CommandPreset | undefined {
  return COMMAND_PRESETS.find((preset) => preset.id === id);
}

// Daftar file plugin yang harus dimatikan untuk preset ini. Command owner/rowner dilewati
// karena server juga menolak mengunci plugin tersebut.
export function resolvePresetFiles(preset: CommandPreset): string[] {
  const keep = preset.keepCategories ? new Set(preset.keepCategories) : null;
  if (!keep) return [];

  return getCommandCatalog()
    .commands.filter((entry) => !entry.locked && !keep.has(entry.category))
    .map((entry) => entry.file);
}
