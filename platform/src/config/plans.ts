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

// Gating command per plan: free hanya dapat fitur inti, pro menambah AI/hiburan,
// enterprise membuka semua plugin berat. `owner` tetap terkunci untuk semua plan
// lewat flag `locked` katalog.
export const PLAN_COMMANDS: Record<PlanName, CommandAccess> = {
  free: {
    keepCategories: ['group', 'info', 'tools', 'search', 'sticker', 'downloader', 'premium'],
  },
  pro: {
    keepCategories: [
      'group',
      'info',
      'tools',
      'search',
      'sticker',
      'downloader',
      'premium',
      'ai',
      'fun',
      'generator',
      'mini-app',
      'manga',
    ],
  },
  enterprise: { keepCategories: null },
};

// Plan tak dikenal diperlakukan seperti free (fail closed: jangan buka fitur karena typo).
export function commandAccessFor(plan: string): CommandAccess {
  return PLAN_COMMANDS[plan as PlanName] ?? PLAN_COMMANDS.free;
}