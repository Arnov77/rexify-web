import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import AppLayout from '../components/layout/AppLayout';
import QRModal from '../components/session/QRModal';
import SessionCard from '../components/session/SessionCard';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import Input from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';
import { IconPlus, IconSessions } from '../components/icons';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  connectSession,
  countEnabledPlugins,
  createSession,
  deleteSession,
  disconnectSession,
  getConfig,
  listSessions,
} from '../lib/sessions';
import type { Session } from '../lib/types';
import '../styles/dashboard.css';

const RUNNING_STATUSES = new Set(['active', 'connecting', 'qr_pending']);

export default function Dashboard() {
  const { user, limits, logout } = useAuth();
  const { showToast } = useToast();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [pluginCounts, setPluginCounts] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [qrSession, setQrSession] = useState<Session | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);
  const [deleting, setDeleting] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await listSessions();
      setSessions(list);

      const counts = await Promise.all(
        list.map(async (session) => {
          try {
            const config = await getConfig(session.id);
            return [session.id, countEnabledPlugins(config)] as const;
          } catch {
            return [session.id, null] as const;
          }
        }),
      );
      setPluginCounts(Object.fromEntries(counts));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Gagal memuat session');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    try {
      const trimmed = label.trim();
      await createSession(trimmed.length > 0 ? trimmed : null);
      setLabel('');
      await load();
      showToast('Session dibuat', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal membuat session', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleConnect(session: Session) {
    setBusyId(session.id);
    try {
      await connectSession(session.id);
      await load();
      setQrSession(session);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menjalankan bot', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDisconnect(session: Session) {
    setBusyId(session.id);
    try {
      await disconnectSession(session.id);
      await load();
      showToast('Bot dihentikan', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menghentikan bot', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSession(deleteTarget.id);
      setDeleteTarget(null);
      await load();
      showToast('Session dihapus', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menghapus session', 'error');
    } finally {
      setDeleting(false);
    }
  }

  const runningCount = sessions.filter((session) => RUNNING_STATUSES.has(session.status)).length;
  const quota = limits?.sessions ?? 0;

  const handleConnected = useCallback(async () => {
    setQrSession(null);
    await load();
    showToast('WhatsApp terhubung', 'success');
  }, [load, showToast]);

  return (
    <AppLayout title="Dashboard" userEmail={user?.email ?? ''} onLogout={logout}>
      <div className="dashboard-toolbar">
        <p className="caption">
          {runningCount} dari {quota} session berjalan
        </p>

        <form className="create-form" onSubmit={handleCreate}>
          <Input
            ref={labelRef}
            label="Nama session"
            placeholder="Contoh: Bot Utama"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={60}
          />
          <Button type="submit" loading={creating}>
            <IconPlus size={16} />
            Tambah
          </Button>
        </form>
      </div>

      {loadError && (
        <div className="notice notice--error" role="alert">
          <span>{loadError}</span>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            Coba lagi
          </Button>
        </div>
      )}

      {loading ? (
        <p className="caption" role="status">
          Memuat session…
        </p>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<IconSessions size={48} />}
          title="Belum ada session"
          text="Tambahkan session untuk menghubungkan nomor WhatsApp pertama kamu."
          action={
            <Button onClick={() => labelRef.current?.focus()}>
              <IconPlus size={16} />
              Tambah session
            </Button>
          }
        />
      ) : (
        <div className="session-grid">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              pluginCount={pluginCounts[session.id] ?? null}
              busy={busyId === session.id}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus session?"
        description={
          <>
            Session <strong>{deleteTarget?.label ?? deleteTarget?.id}</strong> akan dihentikan dan
            dihapus. Kredensial WhatsApp di folder <span className="mono">sessions/</span> tetap
            disimpan di server.
          </>
        }
        confirmLabel="Hapus"
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      {qrSession && (
        <QRModal
          sessionId={qrSession.id}
          sessionLabel={qrSession.label ?? 'session ini'}
          onClose={() => setQrSession(null)}
          onConnected={() => void handleConnected()}
        />
      )}
    </AppLayout>
  );
}