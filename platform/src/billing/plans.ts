// Harga paket berbayar. Nominal harus sama dengan yang tampil di landing page dan dengan
// kuota session di config/plans.ts (pro 2 bot, enterprise 5 bot).
export const BILLING_PLANS = {
  pro: { label: 'Pro', amount: 5000, duration_days: 30 },
  enterprise: { label: 'Enterprise', amount: 10000, duration_days: 30 },
} as const;

export type BillingPlan = keyof typeof BILLING_PLANS;

export function isBillingPlan(value: unknown): value is BillingPlan {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BILLING_PLANS, value);
}
