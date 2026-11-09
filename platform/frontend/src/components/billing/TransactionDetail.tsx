import { useEffect, useRef } from 'react';
import Button from '../ui/Button';
import { IconClose } from '../icons';
import {
  BILLING_STATUS_LABEL,
  formatRupiah,
  planLabel,
  type BillingTransaction,
} from '../../lib/billing';
import '../../styles/dialog.css';
import '../../styles/billing.css';

const dateTimeFormat = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

interface TransactionDetailProps {
  transaction: BillingTransaction;
  onClose: () => void;
}

// Order ID dan ID Midtrans dipakai user saat klaim ke support, jadi ditampilkan utuh
// (tidak dipotong seperti kalau ditaruh di kolom tabel).
export default function TransactionDetail({ transaction, onClose }: TransactionDetailProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const createdAt = new Date(transaction.created_at);

  return (
    <div className="dialog-overlay" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog__header">
          <h2 className="dialog__title" id="transaction-detail-title">
            Detail transaksi
          </h2>
          <button type="button" className="dialog__close" onClick={onClose} aria-label="Tutup">
            <IconClose size={18} />
          </button>
        </div>

        <dl className="billing-detail">
          <dt>Order ID</dt>
          <dd className="mono">{transaction.order_id}</dd>

          <dt>ID Midtrans</dt>
          <dd className="mono">{transaction.midtrans_transaction_id ?? '-'}</dd>

          <dt>Paket</dt>
          <dd>{planLabel(transaction.plan)}</dd>

          <dt>Nominal</dt>
          <dd className="mono">{formatRupiah(transaction.amount)}</dd>

          <dt>Metode</dt>
          <dd>{transaction.payment_type ?? '-'}</dd>

          <dt>Status</dt>
          <dd>{BILLING_STATUS_LABEL[transaction.status] ?? transaction.status}</dd>

          <dt>Dibuat</dt>
          <dd>{Number.isNaN(createdAt.getTime()) ? '-' : dateTimeFormat.format(createdAt)}</dd>
        </dl>

        <div className="dialog__actions">
          <Button variant="ghost" ref={closeRef} onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </div>
  );
}
