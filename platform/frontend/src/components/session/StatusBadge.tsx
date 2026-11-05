import type { SessionStatus } from '../../lib/types';

const LABELS: Record<SessionStatus, string> = {
  active: 'Aktif',
  connecting: 'Menghubungkan',
  qr_pending: 'Menunggu QR',
  disconnected: 'Tidak aktif',
  banned: 'Diblokir',
};

const TONES: Record<SessionStatus, string> = {
  active: 'active',
  connecting: 'connecting',
  qr_pending: 'connecting',
  disconnected: 'disconnected',
  banned: 'banned',
};

export default function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span className={`badge badge--${TONES[status]}`}>
      <span className="badge__dot" aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}