export const PLAN_LIMITS = {
  free: { sessions: 1, trial_days: 7 },
  pro: { sessions: 2, duration_days: 30 },
  enterprise: { sessions: 5, duration_days: 30 },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;

export interface PlanSubject {
  plan: string;
  trial_ends_at: Date | string | null;
  plan_expires_at: Date | string | null;
}

function toTime(value: Date | string | null): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

// free hidup selama trial_ends_at, pro/enterprise selama plan_expires_at (SPEC § Plan & Limits).
export function isAccessActive(user: PlanSubject): boolean {
  const now = Date.now();

  if (user.plan === 'free') {
    const trialEnds = toTime(user.trial_ends_at);
    return trialEnds !== null && trialEnds > now;
  }

  if (user.plan === 'pro' || user.plan === 'enterprise') {
    const planExpires = toTime(user.plan_expires_at);
    return planExpires !== null && planExpires > now;
  }

  return false;
}

export function sessionQuotaFor(plan: string): number {
  const limits = PLAN_LIMITS[plan as PlanName];
  return limits ? limits.sessions : 0;
}

export interface CommandAccess {
  // Kategori plugin yang boleh dipakai; `null` = semua kategori.
  keepCategories: string[] | null;
}

// Kategori dasar plan free. Game, RPG, dan mini-app dibuka atas permintaan produk:
// isi mini-app adalah game lokal (2048, snake, dst) plus dashboard RPG (rpgui), tanpa
// biaya API, jadi mematikannya cuma memotong fitur tanpa menghemat apa pun.
// `fun` dan `generator` juga dibuka; fitur premium di dalamnya tetap di-gate lewat
// PLAN_FORCED_DISABLED_FILES (mis. generator/viuprem).
const FREE_CATEGORIES = [
  'group',
  'info',
  'tools',
  'search',
  'sticker',
  'downloader',
  'premium',
  'games',
  'game',
  'rpg',
  'mini-app',
  'fun',
  'generator',
];

// Gating command per plan: free dapat fitur inti, pro menambah AI/manga, enterprise
// membuka semua. Plugin `owner` tetap terkunci untuk semua plan lewat flag `locked`.
export const PLAN_COMMANDS: Record<PlanName, CommandAccess> = {
  free: { keepCategories: FREE_CATEGORIES },
  // Ditulis sebagai free + tambahan supaya pro tidak mungkin kehilangan kategori yang
  // dimiliki free (sebelumnya pro justru tidak punya games/game/rpg).
  pro: {
    keepCategories: [...FREE_CATEGORIES, 'ai', 'manga'],
  },
  enterprise: { keepCategories: null },
};

// Plan tak dikenal diperlakukan seperti free (fail closed: jangan buka fitur karena typo).
export function commandAccessFor(plan: string): CommandAccess {
  return PLAN_COMMANDS[plan as PlanName] ?? PLAN_COMMANDS.free;
}

// Plugin jerexd yang di core ditandai `plugin.premium = true` (butuh premium bot).
// Token jerexd-nya sendiri dibuka untuk semua plan, jadi yang dimatikan untuk free cuma
// fitur premiumnya: tanpa ini, kuota API jerexd tetap bisa kepakai lewat `.addprem`.
// 3 plugin ai di bawah juga sudah tercakup PLAN_FORCED_DISABLED_CATEGORIES.free, tapi
// didaftar ulang supaya aturan "fitur premium jerexd" tetap utuh kalau kategori ai berubah.
export const PLAN_FORCED_DISABLED_FILES: Record<PlanName, string[]> = {
  free: [
    'plugins/ai/img2video.js',
    'plugins/ai/suno.js',
    'plugins/ai/vclone.js',
    'plugins/generator/viuprem.js',
    'plugins/tools/ambulk.js',
    'plugins/tools/amgen.js',
    'plugins/tools/cekevo.js',
    'plugins/tools/cekmb.js',
    'plugins/tools/cekprime.js',
    'plugins/tools/gemini-plus.js',
    'plugins/tools/reactch.js',
  ],
  pro: [],
  enterprise: [],
};

export function forcedDisabledFileListFor(plan: string): string[] {
  return PLAN_FORCED_DISABLED_FILES[plan as PlanName] ?? PLAN_FORCED_DISABLED_FILES.free;
}