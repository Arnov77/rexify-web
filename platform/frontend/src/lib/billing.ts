import { apiRequest } from './api';

// Harga & kuota harus sama dengan platform/src/billing/plans.ts dan config/plans.ts.
export const BILLING_PLAN_INFO = {
  pro: { label: 'Pro', amount: 5000, durationDays: 30, sessions: 2 },
  enterprise: { label: 'Enterprise', amount: 10000, durationDays: 30, sessions: 5 },
} as const;

export type BillingPlan = keyof typeof BILLING_PLAN_INFO;

export type BillingTransactionStatus = 'pending' | 'success' | 'failed' | 'cancelled' | 'expired';

export const BILLING_STATUS_LABEL: Record<string, string> = {
  pending: 'Menunggu',
  success: 'Berhasil',
  failed: 'Gagal',
  cancelled: 'Dibatalkan',
  expired: 'Kedaluwarsa',
};

export interface BillingTransaction {
  id: string;
  order_id: string;
  plan: string;
  amount: number;
  status: BillingTransactionStatus;
  payment_type: string | null;
  // ID transaksi dari Midtrans; null selama charge belum tercatat.
  midtrans_transaction_id: string | null;
  // QR disimpan di DB supaya transaksi pending bisa dilanjutkan dari riwayat.
  qr_code_url: string | null;
  created_at: string;
}

export interface ChargeBillingResult {
  order_id: string;
  qr_code_url: string;
  amount: number;
  plan_label: string;
  // true = pakai transaksi pending yang sudah ada (bukan charge baru).
  reused?: boolean;
}

export interface BillingStatusResult {
  status: BillingTransactionStatus;
  plan: string;
  amount: number;
  qr_code_url: string | null;
  created_at: string;
}

export function chargeBilling(plan: BillingPlan): Promise<ChargeBillingResult> {
  return apiRequest<ChargeBillingResult>('/billing/charge', {
    method: 'POST',
    body: { plan },
  });
}

export function getBillingStatus(orderId: string): Promise<BillingStatusResult> {
  return apiRequest<BillingStatusResult>(`/billing/status/${encodeURIComponent(orderId)}`);
}

export function getBillingHistory(): Promise<BillingTransaction[]> {
  return apiRequest<{ transactions: BillingTransaction[] }>('/billing/transactions').then(
    (data) => data.transactions,
  );
}

// Tutup transaksi pending: QR di Midtrans dicancel, row ditandai failed.
export function cancelBilling(orderId: string): Promise<void> {
  return apiRequest<{ cancelled: boolean }>(
    `/billing/cancel/${encodeURIComponent(orderId)}`,
    { method: 'POST' },
  ).then(() => undefined);
}

const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

export function formatRupiah(amount: number): string {
  return rupiah.format(amount);
}

export function planLabel(plan: string): string {
  return plan in BILLING_PLAN_INFO ? BILLING_PLAN_INFO[plan as BillingPlan].label : plan;
}

export function isBillingPlan(value: string): value is BillingPlan {
  return value in BILLING_PLAN_INFO;
}
