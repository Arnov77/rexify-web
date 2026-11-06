import { Link } from 'react-router-dom';
import { IconRefresh, IconTerminal, IconTrash } from '../icons';
import Button from '../ui/Button';
import StatusBadge from './StatusBadge';
import type { Session } from '../../lib/types';

interface SessionCardProps {
  session: Session;
  pluginCount: number | null;
  busy: boolean;
  // Restart hanya masuk akal untuk bot aktif; loading ditahan di tombolnya sendiri.
  restarting?: boolean;
  // Panel console sedang terbuka untuk kartu ini.
  logOpen?: boolean;
  onConnect: (session: Session) => void;
  onDisconnect: (session: Session) => void;
  onRestart: (session: Session) => void;
  onToggleLog: (session: Session) => void;
  onDelete: (session: Session) => void;
}

const dateFormat = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function initials(session: Session): string {
  const source = session.label ?? session.phone_number ?? session.phone_number_input ?? 'WA';
  const digits = source.replace(/\D/g, '');
  if (digits.length >= 2) return digits.slice(-2);
  return source.slice(0, 2).toUpperCase();
}

export default function SessionCard({
  session,
  pluginCount,
  busy,
  restarting = false,
  logOpen = false,
  onConnect,
  onDisconnect,
  onRestart,
  onToggleLog,
  onDelete,
}: SessionCardProps) {
  const isRunning =
    session.status === 'active' ||
    session.status === 'connecting' ||
    session.status === 'qr_pending';

  return (
    <article className="card session-card">
      <div className="session-card__top">
        <div className="session-card__identity">
          <span className="session-card__avatar" aria-hidden="true">
            {initials(session)}
          </span>
          <div className="session-card__meta">
            <p className="session-card__name">{session.label ?? 'Bot tanpa nama'}</p>
            <p className="session-card__phone mono">
              {session.phone_number ?? session.phone_number_input ?? 'Belum terhubung'}
            </p>
          </div>
        </div>
        <StatusBadge status={session.status} />
      </div>

      <div className="session-card__actions">
        {isRunning ? (
          <Button variant="secondary" size="sm" onClick={() => onDisconnect(session)} loading={busy}>
            Hentikan
          </Button>
        ) : (
          <Button size="sm" onClick={() => onConnect(session)} loading={busy}>
            Jalankan
          </Button>
        )}

        {/* Restart = stop + spawn ulang; hanya untuk bot yang benar-benar aktif. */}
        {session.status === 'active' && (
          <Button
            variant="ghost"
            size="sm"
            loading={restarting}
            onClick={() => onRestart(session)}
          >
            <IconRefresh size={16} />
            Restart
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleLog(session)}
          aria-expanded={logOpen}
        >
          <IconTerminal size={16} />
          Log
        </Button>

        <Link className="btn btn--ghost btn--sm" to={`/sessions/${session.id}`}>
          Kelola
        </Link>

        <button
          type="button"
          className="session-card__delete"
          onClick={() => onDelete(session)}
          aria-label={`Hapus bot ${session.label ?? session.id}`}
        >
          <IconTrash size={16} />
        </button>
      </div>

      <div className="session-card__footer caption">
        <span>Dibuat {dateFormat.format(new Date(session.created_at))}</span>
        <span aria-hidden="true">·</span>
        <span>
          {pluginCount === null ? 'Plugin: —' : `${pluginCount} plugin aktif`}
        </span>
      </div>
    </article>
  );
}