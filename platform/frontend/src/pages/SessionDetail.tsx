import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import AutoReplyEditor from '../components/session/AutoReplyEditor';
import PluginToggle from '../components/session/PluginToggle';
import QRModal from '../components/session/QRModal';
import StatusBadge from '../components/session/StatusBadge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
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
import type {
  BotConfig,
  CustomSettings,
  PluginsEnabled,
  Session,
  SessionTab,
} from '../lib/types';
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

type SecretKey = 'token_rex' | 'token_jerexd' | 'git_token';

interface SecretFieldProps {
  label: string;
  value: string;
  visible: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}

// Input password dengan tombol lihat/sembunyikan (Input biasa tidak punya slot tombol).
function SecretField({ label, value, visible, onChange, onToggle }: SecretFieldProps) {
  const inputId = useId();

  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="secret-input">
        <input
          id={inputId}
          className="input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="secret-input__toggle"
          onClick={onToggle}
          aria-label={visible ? `Sembunyikan ${label}` : `Tampilkan ${label}`}
        >
          {visible ? 'Sembunyikan' : 'Lihat'}
        </button>
      </div>
    </div>
  );
}

const TABS: { key: SessionTab; label: string }[] = [
  { key: 'autoReply', label: 'Auto Reply' },
  { key: 'plugin', label: 'Plugin' },
  { key: 'settings', label: 'Pengaturan' },
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
  const [tab, setTab] = useState<SessionTab>('autoReply');
  const [settings, setSettings] = useState<CustomSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [showSecret, setShowSecret] = useState<Record<SecretKey, boolean>>({
    token_rex: false,
    token_jerexd: false,
    git_token: false,
  });

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [detail, botConfig] = await Promise.all([getSession(sessionId), getConfig(sessionId)]);
      setSession(detail.session);
      setPm2(detail.pm2);
      setConfig(botConfig);
      setSettings(botConfig.customSettings);
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

  function updateSetting<K extends keyof CustomSettings>(key: K, value: CustomSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleSecret(key: SecretKey) {
    setShowSecret((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;

    setSavingSettings(true);
    try {
      const updated = await updateConfig(sessionId, { customSettings: settings });
      setConfig(updated);
      setSettings(updated.customSettings);
      showToast('Pengaturan disimpan', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan pengaturan', 'error');
    } finally {
      setSavingSettings(false);
    }
  }

  const isRunning =
    session?.status === 'active' ||
    session?.status === 'connecting' ||
    session?.status === 'qr_pending';

  return (
    <AppLayout
      title={loading ? 'Memuat...' : session?.label ?? 'Bot tanpa nama'}
      userEmail={user?.email ?? ''}
      plan={user?.plan ?? 'free'}
      trialEndsAt={user?.trial_ends_at ?? null}
      planExpiresAt={user?.plan_expires_at ?? null}
      activeSession={{
        id: sessionId,
        label: session?.label ?? null,
        tab,
        onTabChange: setTab,
      }}
      sessions={[]}
      onLogout={logout}
    >
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
                <h2 className="detail-header__name">{session.label ?? 'Bot tanpa nama'}</h2>
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

          <div className="tabs" role="tablist" aria-label="Bagian session">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                id={`tab-${item.key}`}
                aria-selected={tab === item.key}
                aria-controls={`panel-${item.key}`}
                className={tab === item.key ? 'tab tab--active' : 'tab'}
                onClick={() => setTab(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'autoReply' && (
            <div className="tab-panel">
              <section
                className="section"
                role="tabpanel"
                id="panel-autoReply"
                aria-labelledby="tab-autoReply"
              >
                <div className="section__head">
                  <h2 className="section__title">Auto reply</h2>
                  <p className="caption">{config.autoReply.length} rule tersimpan</p>
                </div>
                <div className="card">
                  <AutoReplyEditor sessionId={sessionId} config={config} onChange={setConfig} />
                </div>
              </section>
            </div>
          )}

          {tab === 'plugin' && (
            <div className="tab-panel">
              <section
                className="section"
                role="tabpanel"
                id="panel-plugin"
                aria-labelledby="tab-plugin"
              >
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
            </div>
          )}

          {tab === 'settings' && settings && (
            <div className="tab-panel">
              <section
                className="section"
                role="tabpanel"
                id="panel-settings"
                aria-labelledby="tab-settings"
              >
                <div className="section__head">
                  <h2 className="section__title">Pengaturan bot</h2>
                  <p className="caption">Berlaku setelah bot di-restart</p>
                </div>

                <form className="card settings-form" onSubmit={handleSaveSettings} noValidate>
                  <p className="notice notice--info notice--with-icon">
                    <span className="notice__icon" aria-hidden="true">
                      ℹ
                    </span>
                    <span>Perubahan berlaku setelah bot di-restart.</span>
                  </p>

                  <fieldset className="settings-group">
                    <legend className="settings-group__title">Identitas bot</legend>
                    <div className="settings-grid">
                      <Input
                        label="Nama bot"
                        placeholder="Rexify Bot"
                        value={settings.botname}
                        onChange={(event) => updateSetting('botname', event.target.value)}
                        maxLength={60}
                      />
                      <Input
                        label="Nama owner"
                        placeholder="Nama kamu"
                        value={settings.ownername}
                        onChange={(event) => updateSetting('ownername', event.target.value)}
                        maxLength={60}
                      />
                      <Input
                        label="URL thumbnail"
                        placeholder="https://…/thumbnail.jpg"
                        value={settings.thumbnailUrl}
                        onChange={(event) => updateSetting('thumbnailUrl', event.target.value)}
                        inputMode="url"
                      />
                      <Input
                        label="URL audio"
                        placeholder="https://…/audio.mp3"
                        value={settings.audioUrl}
                        onChange={(event) => updateSetting('audioUrl', event.target.value)}
                        inputMode="url"
                      />
                      <Input
                        label="URL website"
                        placeholder="https://rexapi.my.id/"
                        value={settings.web}
                        onChange={(event) => updateSetting('web', event.target.value)}
                        inputMode="url"
                      />
                    </div>
                  </fieldset>

                  <fieldset className="settings-group">
                    <legend className="settings-group__title">Grup &amp; channel</legend>
                    <div className="settings-grid">
                      <Input
                        label="Link grup"
                        placeholder="https://chat.whatsapp.com/…"
                        value={settings.link_group}
                        onChange={(event) => updateSetting('link_group', event.target.value)}
                      />
                      <Input
                        label="Link saluran"
                        placeholder="https://whatsapp.com/channel/…"
                        value={settings.link_saluran}
                        onChange={(event) => updateSetting('link_saluran', event.target.value)}
                      />
                      <Input
                        label="ID saluran"
                        hint="format: 123456@newsletter"
                        placeholder="120363xxxx@newsletter"
                        value={settings.id_saluran}
                        onChange={(event) => updateSetting('id_saluran', event.target.value)}
                      />
                      <Input
                        label="ID grup owner"
                        placeholder="120363xxxx@g.us"
                        value={settings.id_ownerGroup}
                        onChange={(event) => updateSetting('id_ownerGroup', event.target.value)}
                      />
                    </div>
                  </fieldset>

                  <fieldset className="settings-group">
                    <legend className="settings-group__title">Limit</legend>
                    <div className="settings-grid">
                      <Input
                        label="Limit free"
                        type="number"
                        min={1}
                        max={100000}
                        value={settings.limit_free}
                        onChange={(event) => updateSetting('limit_free', Number(event.target.value) || 0)}
                      />
                      <Input
                        label="Limit premium"
                        type="number"
                        min={1}
                        max={100000}
                        value={settings.limit_premium}
                        onChange={(event) =>
                          updateSetting('limit_premium', Number(event.target.value) || 0)
                        }
                      />
                    </div>
                  </fieldset>

                  <fieldset className="settings-group">
                    <legend className="settings-group__title">API keys</legend>
                    <p className="settings-group__hint">Kosongkan untuk pakai key default platform.</p>
                    <div className="settings-grid">
                      <SecretField
                        label="Rex API Key"
                        value={settings.token_rex}
                        visible={showSecret.token_rex}
                        onChange={(value) => updateSetting('token_rex', value)}
                        onToggle={() => toggleSecret('token_rex')}
                      />
                      <SecretField
                        label="Jerexd API Key"
                        value={settings.token_jerexd}
                        visible={showSecret.token_jerexd}
                        onChange={(value) => updateSetting('token_jerexd', value)}
                        onToggle={() => toggleSecret('token_jerexd')}
                      />
                      <Input
                        label="GitHub username"
                        placeholder="username"
                        value={settings.git_name}
                        onChange={(event) => updateSetting('git_name', event.target.value)}
                        maxLength={60}
                      />
                      <SecretField
                        label="GitHub token"
                        value={settings.git_token}
                        visible={showSecret.git_token}
                        onChange={(value) => updateSetting('git_token', value)}
                        onToggle={() => toggleSecret('git_token')}
                      />
                    </div>
                  </fieldset>

                  <div className="settings-actions">
                    <Button type="submit" loading={savingSettings}>
                      Simpan pengaturan
                    </Button>
                  </div>
                </form>
              </section>
            </div>
          )}
        </>
      ) : null}

      {qrOpen && session && (
        <QRModal
          sessionId={sessionId}
          sessionLabel={session.label ?? 'session ini'}
          connectMode={session.connect_mode}
          onClose={() => setQrOpen(false)}
          onConnected={() => void handleConnected()}
        />
      )}
    </AppLayout>
  );
}
