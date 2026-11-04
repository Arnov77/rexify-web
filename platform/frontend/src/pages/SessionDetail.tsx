import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import AutoReplyEditor from '../components/session/AutoReplyEditor';
import PluginToggle from '../components/session/PluginToggle';
import QRModal from '../components/session/QRModal';
import StatusBadge from '../components/session/StatusBadge';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  connectSession,
  disconnectSession,
  getConfig,
  getSession,
  updateConfig,
} from '../lib/sessions';
import type { BotConfig, PluginsEnabled, Session } from '../lib/types';
import '../styles/detail.css';

const PLUGIN_META: { key: keyof PluginsEnabled; label: string; description: string }[] = [
  {
    key: 'autoReply',
    label: 'Auto reply',
    description: 'Balas pesan otomatis sesuai rule yang kamu buat.',
  },
  {
    key: 'welcomeMsg',
    label: 'Pesan sambutan',
    description: 'Kirim pesan sambutan ke chat yang baru masuk.',
  },
  {
    key: 'aiChat',
    label: 'AI chat',
    description: 'Jawab pesan dengan model AI.',
  },
  {
    key: 'downloader',
    label: 'Downloader',
    description: 'Unduh media dari link yang dikirim ke bot.',
  },
  {
    key: 'antiLink',
    label: 'Anti link',
    description: 'Hapus pesan berisi link di luar whitelist.',
  },
];

const dateFormat = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export default function SessionDetail() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const { sessionId = '' } = useParams<{ sessionId: string }>();

  const [session, setSession] = useState<Session | null>(null);
  const [pm2, setPm2] = useState<string | null>(null);
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [savingPlugin, setSavingPlugin] = useState<keyof PluginsEnabled | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [detail, botConfig] = await Promise.all([getSession(sessionId), getConfig(sessionId)]);
      setSession(detail.session);
      setPm2(detail.pm2);
      setConfig(botConfig);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Gagal memuat session');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleConnect() {
    setBusy(true);
    try {
      const detail = await connectSession(sessionId);
      setSession(detail.session);
      setPm2(detail.pm2);
      setQrOpen(true);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menjalankan bot', 'error');
    } finally {
      setBusy(false);
    }
  }

  const handleConnected = useCallback(async () => {
    setQrOpen(false);
    await load();
    showToast('WhatsApp terhubung', 'success');
  }, [load, showToast]);

  async function handleDisconnect() {
    setBusy(true);
    try {
      const detail = await disconnectSession(sessionId);
      setSession(detail.session);
      setPm2(detail.pm2);
      showToast('Bot dihentikan', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menghentikan bot', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handlePluginToggle(key: keyof PluginsEnabled, value: boolean) {
    if (!config) return;

    const previous = config;
    const nextPlugins = { ...config.pluginsEnabled, [key]: value };
    setConfig({ ...config, pluginsEnabled: nextPlugins });
    setSavingPlugin(key);

    try {
      const updated = await updateConfig(sessionId, { pluginsEnabled: nextPlugins });
      setConfig(updated);
      showToast('Config disimpan', 'success');
    } catch (err) {
      setConfig(previous);
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan config', 'error');
    } finally {
      setSavingPlugin(null);
    }
  }

  const isRunning =
    session?.status === 'active' ||
    session?.status === 'connecting' ||
    session?.status === 'qr_pending';

  return (
    <AppLayout title="Detail session" userEmail={user?.email ?? ''} onLogout={logout}>
      <p className="detail-back">
        <Link className="btn btn--ghost btn--sm" to="/">
          Kembali ke dashboard
        </Link>
      </p>

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
      ) : session && config ? (
        <>
          <section className="card detail-header">
            <div className="detail-header__main">
              <div>
                <h2 className="detail-header__name">{session.label ?? 'Session tanpa nama'}</h2>
                <p className="detail-header__phone mono">
                  {session.phone_number ?? 'Belum terhubung'}
                </p>
              </div>
              <StatusBadge status={session.status} />
            </div>

            <dl className="detail-meta">
              <div>
                <dt>Proses PM2</dt>
                <dd className="mono">{pm2 ?? 'tidak ada'}</dd>
              </div>
              <div>
                <dt>Terhubung sejak</dt>
                <dd>
                  {session.connected_at
                    ? dateFormat.format(new Date(session.connected_at))
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Dibuat</dt>
                <dd>{dateFormat.format(new Date(session.created_at))}</dd>
              </div>
            </dl>

            <div className="detail-actions">
              {isRunning ? (
                <Button variant="secondary" onClick={() => void handleDisconnect()} loading={busy}>
                  Disconnect
                </Button>
              ) : (
                <Button onClick={() => void handleConnect()} loading={busy}>
                  Connect
                </Button>
              )}
            </div>
          </section>

          <p className="notice notice--info">Perubahan config berlaku setelah bot di-restart</p>

          <section className="section">
            <div className="section__head">
              <h2 className="section__title">Auto reply</h2>
              <p className="caption">{config.autoReply.length} rule tersimpan</p>
            </div>
            <div className="card">
              <AutoReplyEditor sessionId={sessionId} config={config} onChange={setConfig} />
            </div>
          </section>

          <section className="section">
            <div className="section__head">
              <h2 className="section__title">Plugin</h2>
              <p className="caption">Aktifkan hanya plugin yang kamu pakai</p>
            </div>
            <div className="card plugin-list">
              {PLUGIN_META.map((plugin) => (
                <PluginToggle
                  key={plugin.key}
                  label={plugin.label}
                  description={plugin.description}
                  checked={config.pluginsEnabled[plugin.key]}
                  disabled={savingPlugin === plugin.key}
                  onChange={(value) => void handlePluginToggle(plugin.key, value)}
                />
              ))}
            </div>
          </section>
        </>
      ) : null}

      {qrOpen && session && (
        <QRModal
          sessionId={sessionId}
          sessionLabel={session.label ?? 'session ini'}
          onClose={() => setQrOpen(false)}
          onConnected={() => void handleConnected()}
        />
      )}
    </AppLayout>
  );
}