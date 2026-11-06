import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';
import { ApiError } from '../../lib/api';
import {
  BILLING_PLAN_INFO,
  chargeBilling,
  formatRupiah,
  getBillingStatus,
  type BillingPlan,
} from '../../lib/billing';
import '../../styles/dialog.css';
import '../../styles/modal-qr.css';
import '../../styles/billing.css';

type ModalState = 'loading' | 'qr' | 'polling' | 'success' | 'failed' | 'expired';

const POLL_MS = 5000;
// QR Midtrans berlaku ±15 menit; hitungan lokal supaya user lihat sisa waktu.
const EXPIRY_MS = 15 * 60 * 1000;
const CLOSE_DELAY_MS = 2000;

interface BillingModalProps {
  plan: BillingPlan;
  onClose: () => void;
  onPaid: () => void;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function BillingModal({ plan, onClose, onPaid }: BillingModalProps) {
  const info = BILLING_PLAN_INFO[plan];

  const [state, setState] = useState<ModalState>('loading');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(EXPIRY_MS);
  // Dinaikkan tombol "Coba lagi" untuk memicu charge baru.
  const [attempt, setAttempt] = useState(0);

  const deadline = useRef(Date.now() + EXPIRY_MS);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Parent bisa mengirim callback baru tiap render; simpan di ref supaya timer sukses tidak
  // di-reset hanya karena identitas fungsi berubah.
  const onPaidRef = useRef(onPaid);

  useEffect(() => {
    onPaidRef.current = onPaid;
  }, [onPaid]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  // Charge baru tiap mount / retry. Hasilnya QR URL yang bisa langsung di-hotlink.
  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setError(null);
    setOrderId(null);
    setQrUrl(null);
    setRemaining(EXPIRY_MS);

    chargeBilling(plan)
      .then((result) => {
        if (cancelled) return;
        deadline.current = Date.now() + EXPIRY_MS;
        setOrderId(result.order_id);
        setQrUrl(result.qr_code_url);
        setState('qr');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Gagal memulai pembayaran');
        setState('failed');
      });

    return () => {
      cancelled = true;
    };
  }, [plan, attempt]);

  const waiting = state === 'qr' || state === 'polling';

  // Polling status tiap 5 detik selama QR ditampilkan.
  useEffect(() => {
    if (!orderId || !waiting) return;

    let cancelled = false;

    const tick = async (): Promise<void> => {
      try {
        const result = await getBillingStatus(orderId);
        if (cancelled) return;

        if (result.status === 'success') {
          setState('success');
          return;
        }
        if (result.status === 'failed') {
          setError('Pembayaran gagal atau dibatalkan.');
          setState('failed');
          return;
        }
        setState((current) => (current === 'qr' ? 'polling' : current));
      } catch (err) {
        // Jaringan putus sesaat: biarkan polling jalan sampai countdown habis.
        if (err instanceof ApiError && err.status === 404) {
          setError('Transaksi tidak ditemukan. Coba lagi.');
          setState('failed');
        }
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [orderId, waiting]);

  // Countdown 15 menit; berhenti saat sukses/gagal/kadaluarsa.
  useEffect(() => {
    if (!waiting) return;

    const timer = window.setInterval(() => {
      const left = deadline.current - Date.now();
      setRemaining(Math.max(0, left));
      if (left <= 0) setState('expired');
    }, 1000);

    return () => window.clearInterval(timer);
  }, [waiting]);

  // Sukses: beri waktu user membaca pesan, lalu parent menutup modal + refresh data.
  useEffect(() => {
    if (state !== 'success') return;
    const timer = window.setTimeout(() => onPaidRef.current(), CLOSE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    closeRef.current?.focus();

    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="dialog-overlay" role="presentation">
      <div
        className="dialog billing-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="billing-modal-title"
      >
        <button
          ref={closeRef}
          type="button"
          className="qr-modal__cancel"
          onClick={onClose}
          aria-label="Batalkan pembayaran"
        >
          Batal
        </button>

        <h2 className="qr-modal__title" id="billing-modal-title">
          Pembayaran {info.label}
        </h2>
        <p className="billing-modal__amount">{formatRupiah(info.amount)}</p>
        <p className="qr-modal__hint">
          {info.durationDays} hari · {info.sessions} bot
        </p>

        {state === 'loading' && (
          <>
            <div className="qr-box">
              <span className="qr-skeleton" aria-hidden="true" />
            </div>
            <p className="qr-modal__status" role="status">
              Menyiapkan pembayaran...
            </p>
          </>
        )}

        {waiting && (
          <>
            <div className="qr-box">
              {qrUrl ? (
                <img src={qrUrl} alt={`QR pembayaran ${info.label}`} width={176} height={176} />
              ) : (
                <span className="qr-skeleton" aria-hidden="true" />
              )}
            </div>
            <p className="qr-modal__status" role="status">
              <span className="qr-modal__pulse" aria-hidden="true" /> Menunggu pembayaran...
            </p>
            <p className="billing-modal__countdown mono">
              QR kadaluarsa dalam {formatCountdown(remaining)}
            </p>
            <p className="qr-modal__hint">Scan dengan GoPay, OVO, DANA, atau app QRIS lainnya.</p>
          </>
        )}

        {state === 'success' && (
          <>
            <p className="billing-modal__state billing-modal__state--success" role="status">
              Pembayaran berhasil
            </p>
            <p className="qr-modal__hint">
              Plan {info.label} aktif. Halaman akan diperbarui otomatis.
            </p>
          </>
        )}

        {state === 'failed' && (
          <>
            <p className="billing-modal__state billing-modal__state--error" role="alert">
              {error ?? 'Pembayaran gagal'}
            </p>
            <Button variant="secondary" size="sm" onClick={retry}>
              Coba lagi
            </Button>
          </>
        )}

        {state === 'expired' && (
          <>
            <p className="billing-modal__state billing-modal__state--error" role="alert">
              QR Code kadaluarsa, silakan coba lagi.
            </p>
            <Button variant="secondary" size="sm" onClick={retry}>
              Coba lagi
            </Button>
          </>
        )}

        {state !== 'success' && (
          <div className="billing-modal__actions">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Batalkan pembayaran
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
