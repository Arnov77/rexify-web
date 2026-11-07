import { useCallback, useEffect, useState } from 'react';
import AppLayout from '../components/layout/AppLayout';
import AddSessionModal from '../components/session/AddSessionModal';
import ConsolePanel from '../components/session/ConsolePanel';
import QRModal from '../components/session/QRModal';
import SessionCard from '../components/session/SessionCard';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import { IconPlus, IconSessions } from '../components/icons';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  connectSession,
  countEnabledCommands,
  deleteSession,
  disconnectSession,
  getCommandCatalog,
  getConfig,
  listSessions,
  restartSession,
} from '../lib/sessions';
import type { Session } from '../lib/types';
import '../styles/dashboard.css';

const RUNNING_STATUSES = new Set(['active', 'connecting', 'qr_pending']);
// Status bot bisa berubah tanpa aksi user (reconnect otomatis), jadi disegarkan berkala.
const STATUS_POLL_MS = 15_000;
// Panel console yang terbuka disimpan supaya tetap terbuka setelah halaman di-refresh.
const CONSOLE_STORAGE_KEY = 'rexify.console.session';

function readStoredConsole(): string | null {
  try {
    return window.localStorage.getItem(CONSOLE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredConsole(sessionId: string | null): void {
  try {
    if (sessionId) window.localStorage.setItem(CONSOLE_STORAGE_KEY, sessionId);
    else window.localStorage.removeItem(CONSOLE_STORAGE_KEY);
  } catch {
    // localStorage bisa diblokir (mode privat); panel tetap jalan tanpa persistensi.
  }
}

export default function Dashboard() {
  const { user, limits, logout } = useAuth();
  const { showToast } = useToast();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [commandCounts, setCommandCounts] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [qrSession, setQrSession] = useState<Session | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Bot yang panel log-nya terbuka (satu panel sekaligus, menempel di kartunya).
  const [logSessionId, setLogSessionId] = useState<string | null>(() => readStoredConsole());
  const [restartingId, setRestartingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await listSessions();
      setSessions(list);

      // Katalog sama untuk semua bot; kalau gagal dimuat, jumlah command tampil "—".
      const catalog = await getCommandCatalog().catch(() => null);
      const counts = await Promise.all(
        list.map(async (session) => {
          try {
            const config = await getConfig(session.id);
            return [session.id, catalog ? countEnabledCommands(catalog, config) : null] as const;
          } catch {
            return [session.id, null] as const;
          }
        }),
      );
      setCommandCounts(Object.fromEntries(counts));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Gagal memuat bot');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Segarkan hanya kolom status: daftar bot + jumlah plugin tidak perlu di-fetch ulang,
  // dan hasil reconcile dari server (mis. 'connecting' → 'active') langsung terpakai.
  useEffect(() => {
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const fresh = await listSessions();
          setSessions((current) =>
            current.map((session) => {
              const updated = fresh.find((item) => item.id === session.id);
              return updated ? { ...session, status: updated.status } : session;
            }),
          );
        } catch {
          // Diamkan: percobaan berikutnya menyusul 15 detik lagi.
        }
      })();
    }, STATUS_POLL_MS);

    return () => window.clearInterval(timer);
  }, []);

  const handleCreated = useCallback(async () => {
    await load();
    showToast('Bot dibuat', 'success');
  }, [load, showToast]);

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
      showToast('Bot dihapus', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menghapus bot', 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function handleRestart(session: Session) {
    setRestartingId(session.id);
    try {
      await restartSession(session.id);
      await load();
      showToast('Bot berhasil direstart', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal restart bot', 'error');
    } finally {
      setRestartingId(null);
    }
  }

  // Satu panel console sekaligus; klik Log pada bot yang sama menutup panelnya.
  function handleToggleLog(session: Session): void {
    setLogSessionId((current) => {
      const next = current === session.id ? null : session.id;
      writeStoredConsole(next);
      return next;
    });
  }

  function closeLog(): void {
    setLogSessionId(null);
    writeStoredConsole(null);
  }

  // Session bisa hilang (dihapus / beda akun) setelah refresh: jangan biarkan panel yatim.
  useEffect(() => {
    if (!logSessionId || sessions.length === 0) return;
    if (sessions.some((session) => session.id === logSessionId)) return;

    setLogSessionId(null);
    writeStoredConsole(null);
  }, [sessions, logSessionId]);

  const runningCount = sessions.filter((session) => RUNNING_STATUSES.has(session.status)).length;
  const quota = limits?.sessions ?? 0;

  const handleConnected = useCallback(async () => {
    setQrSession(null);
    await load();
    showToast('WhatsApp terhubung', 'success');
  }, [load, showToast]);

  return (
    <AppLayout
      title="Dashboard"
      userEmail={user?.email ?? ''}
      plan={user?.plan ?? 'free'}
      trialEndsAt={user?.trial_ends_at ?? null}
      planExpiresAt={user?.plan_expires_at ?? null}
      sessions={sessions.map((s) => ({ id: s.id, label: s.label, status: s.status }))}
      onLogout={logout}
    >
      {sessions.length > 0 && (
        <div className="dashboard-toolbar">
          <p className="caption">
            {runningCount} dari {quota} bot berjalan
          </p>

          <Button onClick={() => setAddOpen(true)}>
            <IconPlus size={16} />
            Buat Bot
          </Button>
        </div>
      )}

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
          Memuat bot…
        </p>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<IconSessions size={48} />}
          title="Belum ada bot"
          text="Buat bot pertama untuk menghubungkan nomor WhatsApp kamu."
          action={
            <Button onClick={() => setAddOpen(true)}>
              <IconPlus size={16} />
              Buat Bot
            </Button>
          }
        />
      ) : (
        <div className="session-grid">
          {sessions.map((session) => (
            <div className="session-grid__item" key={session.id}>
              <SessionCard
                session={session}
                commandCount={commandCounts[session.id] ?? null}
                busy={busyId === session.id}
                restarting={restartingId === session.id}
                logOpen={logSessionId === session.id}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onRestart={handleRestart}
                onToggleLog={handleToggleLog}
                onDelete={setDeleteTarget}
              />

              {logSessionId === session.id && (
                <ConsolePanel sessionId={session.id} onClose={closeLog} />
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus bot?"
        description={
          <>
            Bot <strong>{deleteTarget?.label ?? deleteTarget?.id}</strong> akan dihentikan dan
            dihapus. Kredensial WhatsApp di folder <span className="mono">sessions/</span> tetap
            disimpan di server.
          </>
        }
        confirmLabel="Hapus"
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      {addOpen && (
        <AddSessionModal onClose={() => setAddOpen(false)} onCreated={handleCreated} />
      )}

      {qrSession && (
        <QRModal
          sessionId={qrSession.id}
          sessionLabel={qrSession.label ?? 'bot ini'}
          connectMode={qrSession.connect_mode}
          onClose={() => setQrSession(null)}
          onConnected={() => void handleConnected()}
        />
      )}
    </AppLayout>
  );
}