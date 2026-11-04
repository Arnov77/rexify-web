import type { SessionStatus } from '../../lib/types';

const LABELS: Record<SessionStatus, string> = {
  active: 'Aktif',
  connecting: 'Connecting',
  qr_pending: 'Menunggu QR',
  disconnected: 'Disconnected',
  banned: 'Banned',
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