import { useCallback, useEffect, useState } from 'react';
import BillingModal from '../components/billing/BillingModal';
import AppLayout from '../components/layout/AppLayout';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { IconBilling } from '../components/icons';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  BILLING_PLAN_INFO,
  cancelBilling,
  formatRupiah,
  getBillingHistory,
  isBillingPlan,
  planLabel,
  type BillingPlan,
  type BillingTransaction,
} from '../lib/billing';
import '../styles/dashboard.css';
import '../styles/detail.css';
import '../styles/billing.css';

const PLAN_KEYS = Object.keys(BILLING_PLAN_INFO) as BillingPlan[];

const dateFormat = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const STATUS_LABEL: Record<string, string> = {
  pending: 'Menunggu',
  success: 'Berhasil',
  failed: 'Gagal',
  cancelled: 'Dibatalkan',
  expired: 'Kedaluwarsa',
};

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : dateFormat.format(date);
}

function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const end = new Date(value).getTime();
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

function billingBadge(status: string): { label: string; className: string } {
  const label = STATUS_LABEL[status] ?? 'Menunggu';

  if (status === 'success') return { label, className: 'billing-badge billing-badge--success' };
  if (status === 'failed') return { label, className: 'billing-badge billing-badge--failed' };
  // Dibatalkan / kedaluwarsa bukan kegagalan pembayaran: badge abu, bukan merah.
  if (status === 'cancelled' || status === 'expired') {
    return { label, className: 'billing-badge billing-badge--cancelled' };
  }
  return { label, className: 'billing-badge billing-badge--pending' };
}

export default function Billing() {
  const { user, logout, refresh } = useAuth();
  const { showToast } = useToast();

  const [history, setHistory] = useState<BillingTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan | null>(null);
  // Transaksi pending yang dibuka ulang dari riwayat (pakai QR lama, tanpa charge baru).
  const [resumeTarget, setResumeTarget] = useState<BillingTransaction | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryError(null);
    try {
      setHistory(await getBillingHistory());
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : 'Gagal memuat riwayat transaksi');
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const plan = user?.plan ?? 'free';
  const trialDays = daysUntil(user?.trial_ends_at ?? null);
  const planDays = daysUntil(user?.plan_expires_at ?? null);

  const handlePaid = useCallback(async () => {
    setSelectedPlan(null);
    setResumeTarget(null);
    await refresh();
    await loadHistory();
    showToast('Pembayaran berhasil, plan diperbarui', 'success');
  }, [refresh, loadHistory, showToast]);

  // Lanjutkan transaksi pending: buka modal dengan QR yang sudah tersimpan.
  function handleResume(transaction: BillingTransaction): void {
    if (transaction.qr_code_url) {
      setResumeTarget(transaction);
      return;
    }

    // Row lama tanpa QR tersimpan: minta charge lagi; backend menutup pending lama otomatis.
    setSelectedPlan(isBillingPlan(transaction.plan) ? transaction.plan : 'pro');
  }

  async function handleCancelHistory(transaction: BillingTransaction): Promise<void> {
    setCancellingId(transaction.order_id);
    try {
      await cancelBilling(transaction.order_id);
      await loadHistory();
      showToast('Pembayaran dibatalkan', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal membatalkan pembayaran', 'error');
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <AppLayout
      title="Billing"
      userEmail={user?.email ?? ''}
      plan={plan}
      trialEndsAt={user?.trial_ends_at ?? null}
      onLogout={logout}
    >
      {/* Section 1 — status plan saat ini */}
      <section className="card billing-status">
        <div className="billing-status__main">
          <p className="caption">Plan aktif</p>
          <p className="billing-status__plan">
            <IconBilling size={20} />
            {plan === 'free' ? 'Free (Trial)' : planLabel(plan)}
          </p>
          <p className="caption">
            {plan === 'free'
              ? `Trial berakhir ${formatDate(user?.trial_ends_at ?? null)}`
              : `Aktif sampai ${formatDate(user?.plan_expires_at ?? null)}`}
          </p>
        </div>

        <span className={`billing-badge billing-badge--${plan}`}>
          {plan === 'free'
            ? trialDays !== null
              ? `Sisa ${trialDays} hari`
              : 'Trial'
            : planDays !== null
              ? `Sisa ${planDays} hari`
              : 'Aktif'}
        </span>
      </section>

      {plan === 'free' && trialDays !== null && (
        <div className="notice notice--warning billing-trial" role="status">
          <span>
            Trial berakhir dalam {trialDays} hari. Upgrade sekarang supaya bot kamu tetap jalan.
          </span>
        </div>
      )}

      {/* Section 2 — pilih paket (disembunyikan kalau sudah enterprise, sudah paling tinggi) */}
      {plan !== 'enterprise' && (
        <section className="section">
          <div className="section__head">
            <h2 className="section__title">Pilih paket</h2>
            <p className="caption">Bayar QRIS, plan aktif otomatis setelah pembayaran lunas.</p>
          </div>

          <div className="billing-plans">
            {PLAN_KEYS.map((key) => {
              const info = BILLING_PLAN_INFO[key];
              const active = plan === key;

              return (
                <article
                  key={key}
                  className={active ? 'card plan-card plan-card--active' : 'card plan-card'}
                >
                  <div className="plan-card__head">
                    <h3 className="plan-card__name">{info.label}</h3>
                    {active && <span className="plan-card__badge">Plan Aktif</span>}
                  </div>

                  <p className="plan-card__price">
                    {formatRupiah(info.amount)}
                    <span className="caption"> / {info.durationDays} hari</span>
                  </p>

                  <ul className="plan-card__list">
                    <li>{info.sessions} bot WhatsApp</li>
                    <li>Semua plugin &amp; AI chat</li>
                    <li>Masa aktif {info.durationDays} hari</li>
                  </ul>

                  <Button block onClick={() => setSelectedPlan(key)}>
                    {active ? 'Perpanjang' : 'Pilih'}
                  </Button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 3 — riwayat transaksi */}
      <section className="section">
        <div className="section__head">
          <h2 className="section__title">Riwayat transaksi</h2>
          <Button
            variant="ghost"
            size="sm"
            loading={loadingHistory}
            onClick={() => void loadHistory()}
          >
            Muat ulang
          </Button>
        </div>

        {historyError && (
          <div className="notice notice--error" role="alert">
            <span>{historyError}</span>
          </div>
        )}

        {loadingHistory ? (
          <p className="caption" role="status">
            Memuat transaksi…
          </p>
        ) : history.length === 0 ? (
          <p className="caption">Belum ada transaksi. Pembelian paket akan muncul di sini.</p>
        ) : (
          <div className="billing-table-wrap">
            <table className="billing-table">
              <thead>
                <tr>
                  <th scope="col">Tanggal</th>
                  <th scope="col">Paket</th>
                  <th scope="col">Nominal</th>
                  <th scope="col">Status</th>
                  <th scope="col">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {history.map((transaction) => {
                  const badge = billingBadge(transaction.status);

                  return (
                    <tr key={transaction.id}>
                      <td>{formatDate(transaction.created_at)}</td>
                      <td>{planLabel(transaction.plan)}</td>
                      <td className="mono">{formatRupiah(transaction.amount)}</td>
                      <td>
                        <span className={badge.className}>{badge.label}</span>
                      </td>
                      <td>
                        {transaction.status === 'pending' ? (
                          <div className="billing-table__actions">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleResume(transaction)}
                            >
                              Lanjutkan
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={cancellingId === transaction.order_id}
                              onClick={() => void handleCancelHistory(transaction)}
                            >
                              Batalkan
                            </Button>
                          </div>
                        ) : (
                          <span className="caption">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedPlan && (
        <BillingModal
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
          onPaid={() => void handlePaid()}
        />
      )}

      {resumeTarget && (
        <BillingModal
          plan={isBillingPlan(resumeTarget.plan) ? resumeTarget.plan : 'pro'}
          resume={
            resumeTarget.qr_code_url
              ? {
                  orderId: resumeTarget.order_id,
                  qrCodeUrl: resumeTarget.qr_code_url,
                  createdAt: resumeTarget.created_at,
                }
              : undefined
          }
          onClose={() => setResumeTarget(null)}
          onPaid={() => void handlePaid()}
        />
      )}
    </AppLayout>
  );
}
