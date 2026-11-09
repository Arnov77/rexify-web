import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import { IconClose, IconEdit, IconRefresh, IconTrash } from '../components/icons';
import AppLayout from '../components/layout/AppLayout';
import AutoReplyEditor from '../components/session/AutoReplyEditor';
import CommandAudit from '../components/session/CommandAudit';
import CommandList from '../components/session/CommandList';
import QRModal from '../components/session/QRModal';
import StatusBadge from '../components/session/StatusBadge';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Input from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  applyCommandPreset,
  changePhone,
  connectSession,
  deleteCredentials,
  disconnectSession,
  getCommandCatalog,
  getConfigAudit,
  getConfig,
  getSession,
  refreshCommandCatalog,
  restartSession,
  updateConfig,
} from '../lib/sessions';
import type {
  BotConfig,
  CommandCatalog,
  CommandEntry,
  CommandPreset,
  ConfigAuditEntry,
  CustomSettings,
  PremiumPackage,
  Session,
  SessionTab,
} from '../lib/types';
import '../styles/detail.css';

type SecretKey = 'token_rex' | 'git_token';

interface SecretFieldProps {
  label: string;
  value: string;
  visible: boolean;
  hint?: ReactNode;
  onChange: (value: string) => void;
  onToggle: () => void;
}

// Input password dengan tombol lihat/sembunyikan (Input biasa tidak punya slot tombol).
function SecretField({ label, value, visible, hint, onChange, onToggle }: SecretFieldProps) {
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
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

interface PremiumPackagesEditorProps {
  packages: PremiumPackage[];
  onChange: (packages: PremiumPackage[]) => void;
}

// Editor inline daftar paket premium: tiap baris bisa diubah langsung, tanpa tombol simpan sendiri.
function PremiumPackagesEditor({ packages, onChange }: PremiumPackagesEditorProps) {
  function patch(index: number, changes: Partial<PremiumPackage>) {
    onChange(packages.map((pkg, i) => (i === index ? { ...pkg, ...changes } : pkg)));
  }

  function remove(index: number) {
    onChange(packages.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...packages, { id: '', label: '', days: 0, price: 0 }]);
  }

  return (
    <div>
      <div className="pkg-table-wrapper">
        <table className="pkg-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Label</th>
              <th>Hari</th>
              <th>Harga</th>
              <th>Permanen?</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {packages.length === 0 && (
              <tr>
                <td className="caption" colSpan={6}>
                  Belum ada paket.
                </td>
              </tr>
            )}
            {packages.map((pkg, index) => (
              <tr key={index}>
                <td data-label="ID">
                  <input
                    className="input pkg-input"
                    value={pkg.id}
                    placeholder="1hari"
                    aria-label={`ID paket ${index + 1}`}
                    onChange={(event) => patch(index, { id: event.target.value })}
                  />
                </td>
                <td data-label="Label">
                  <input
                    className="input pkg-input"
                    value={pkg.label}
                    placeholder="1 Hari"
                    aria-label={`Label paket ${index + 1}`}
                    onChange={(event) => patch(index, { label: event.target.value })}
                  />
                </td>
                <td data-label="Hari">
                  <input
                    className="input pkg-input pkg-input--sm"
                    type="number"
                    min={0}
                    value={pkg.days}
                    aria-label={`Hari paket ${index + 1}`}
                    disabled={pkg.permanent === true}
                    onChange={(event) => patch(index, { days: Number(event.target.value) || 0 })}
                  />
                </td>
                <td data-label="Harga">
                  <input
                    className="input pkg-input pkg-input--sm"
                    type="number"
                    min={0}
                    value={pkg.price}
                    aria-label={`Harga paket ${index + 1}`}
                    onChange={(event) => patch(index, { price: Number(event.target.value) || 0 })}
                  />
                </td>
                <td data-label="Permanen?">
                  <label className="pkg-toggle">
                    <input
                      type="checkbox"
                      checked={pkg.permanent === true}
                      onChange={(event) => patch(index, { permanent: event.target.checked })}
                    />{' '}
                    Permanen
                  </label>
                </td>
                <td data-label="Aksi">
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    aria-label={`Hapus paket ${pkg.label || pkg.id || index + 1}`}
                    onClick={() => remove(index)}
                  >
                    <IconTrash size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="secondary" size="sm" className="pkg-add" onClick={add}>
        + Tambah paket
      </Button>
    </div>
  );
}

interface WhitelistChipEditorProps {
  values: string[];
  placeholder: string;
  sanitize: (raw: string) => string;
  onChange: (values: string[]) => void;
}

// Chip editor antilink: tambah lewat input kecil inline, konfirmasi dengan Enter atau blur.
function WhitelistChipEditor({
  values,
  placeholder,
  sanitize,
  onChange,
}: WhitelistChipEditorProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  function commit() {
    const value = sanitize(draft);
    if (value && !values.includes(value)) {
      onChange([...values, value]);
    }
    setDraft('');
    setAdding(false);
  }

  function cancel() {
    setDraft('');
    setAdding(false);
  }

  return (
    <div className="chip-group">
      {values.map((value, index) => (
        <span className="chip" key={`${value}-${index}`}>
          {value}
          <button
            type="button"
            className="chip__remove"
            aria-label={`Hapus ${value}`}
            onClick={() => onChange(values.filter((item) => item !== value))}
          >
            ✕
          </button>
        </span>
      ))}
      {adding ? (
        <input
          ref={inputRef}
          className="chip-add-input"
          value={draft}
          placeholder={placeholder}
          aria-label={`Tambah ${placeholder}`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              cancel();
            }
          }}
        />
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
          + Tambah
        </Button>
      )}
    </div>
  );
}

const TABS: { key: SessionTab; label: string }[] = [
  { key: 'autoReply', label: 'Auto Reply' },
  { key: 'plugin', label: 'Command' },
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
  const [commandCatalog, setCommandCatalog] = useState<CommandCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
  const [savingCommand, setSavingCommand] = useState<string | null>(null);
  const [applyingPreset, setApplyingPreset] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<ConfigAuditEntry[]>([]);
  const [tab, setTab] = useState<SessionTab>('autoReply');
  const [settings, setSettings] = useState<CustomSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [deletingCreds, setDeletingCreds] = useState(false);
  const [confirmDeleteCreds, setConfirmDeleteCreds] = useState(false);
  const [changePhoneOpen, setChangePhoneOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [changingPhone, setChangingPhone] = useState(false);
  const [showSecret, setShowSecret] = useState<Record<SecretKey, boolean>>({
    token_rex: false,
    git_token: false,
  });

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [detail, botConfig, catalog, audit] = await Promise.all([
        getSession(sessionId),
        getConfig(sessionId),
        // Katalog gagal dimuat tidak boleh memblokir tab lain: tangkap sendiri.
        getCommandCatalog().catch(() => null),
        // Riwayat perubahan juga opsional; tab Command tetap jalan tanpa itu.
        getConfigAudit(sessionId).catch(() => []),
      ]);
      setSession(detail.session);
      setPm2(detail.pm2);
      setConfig(botConfig);
      setSettings(botConfig.customSettings);
      setCommandCatalog(catalog);
      setAuditLogs(audit);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Gagal memuat session');
    } finally {
      setLoading(false);
      setCatalogLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Riwayat perubahan disegarkan setelah aksi yang mengubah command/limit.
  const refreshAudit = useCallback(async () => {
    try {
      setAuditLogs(await getConfigAudit(sessionId));
    } catch {
      // Diamkan: riwayat bukan data kritis, percobaan berikutnya menyusul.
    }
  }, [sessionId]);

  // Status bot bisa berubah tanpa aksi user (reconnect otomatis, proses mati), jadi status
  // disegarkan berkala tanpa mengambil ulang config.
  useEffect(() => {
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const detail = await getSession(sessionId);
          setSession(detail.session);
          setPm2(detail.pm2);
        } catch {
          // Diamkan: percobaan berikutnya menyusul.
        }
      })();
    }, 15_000);

    return () => window.clearInterval(timer);
  }, [sessionId]);

  async function handleConnect() {
    setBusy(true);
    try {
      const detail = await connectSession(sessionId);
      setSession(detail.session);
      setPm2(detail.pm2);
      // Credentials Baileys sudah ada → bot reconnect sendiri tanpa QR/pairing.
      if (detail.session?.has_credentials) {
        showToast('Bot sedang menghubungkan…', 'success');
      } else {
        setQrOpen(true);
      }
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

  // Hapus credentials: bot harus pairing/QR lagi, nomor input tidak berubah.
  async function handleDeleteCredentials() {
    setDeletingCreds(true);
    try {
      await deleteCredentials(sessionId);
      await load();
      showToast('Credentials berhasil dihapus. Connect ulang untuk pairing.', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menghapus credentials', 'error');
    } finally {
      setDeletingCreds(false);
      setConfirmDeleteCreds(false);
    }
  }

  // Ganti nomor: credentials lama ikut dihapus server, config.json ditulis ulang.
  async function handleChangePhone() {
    setChangingPhone(true);
    try {
      await changePhone(sessionId, newPhone);
      await load();
      setChangePhoneOpen(false);
      setNewPhone('');
      showToast('Nomor berhasil diubah. Connect ulang untuk pairing.', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal mengubah nomor', 'error');
    } finally {
      setChangingPhone(false);
    }
  }

  async function handleRestart() {
    setRestarting(true);
    try {
      await restartSession(sessionId);
      await load();
      showToast('Bot berhasil direstart', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal restart bot', 'error');
    } finally {
      setRestarting(false);
    }
  }

  // Toggle command = daftar path plugin yang dimatikan. Server langsung mendorong config.json
  // baru ke bot (watcher core), jadi tidak perlu restart.
  async function saveCommandsDisabled(next: string[], savingKey: string | null) {
    if (!config) return;

    const previous = config;
    setConfig({ ...config, commandsDisabled: next });
    setSavingCommand(savingKey);

    try {
      const updated = await updateConfig(sessionId, { commandsDisabled: next });
      setConfig(updated);
      showToast('Command disimpan. Berlaku otomatis (hot reload).', 'success');
      void refreshAudit();
    } catch (err) {
      setConfig(previous);
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan command', 'error');
    } finally {
      setSavingCommand(null);
    }
  }

  function handleCommandToggle(entry: CommandEntry, enabled: boolean) {
    if (!config || entry.locked) return;

    const next = enabled
      ? config.commandsDisabled.filter((file) => file !== entry.file)
      : [...new Set([...config.commandsDisabled, entry.file])];
    void saveCommandsDisabled(next, entry.file);
  }

  function handleCommandBulk(entries: CommandEntry[], enabled: boolean) {
    if (!config) return;

    const targets = new Set(entries.filter((entry) => !entry.locked).map((entry) => entry.file));
    const next = enabled
      ? config.commandsDisabled.filter((file) => !targets.has(file))
      : [...new Set([...config.commandsDisabled, ...targets])];
    void saveCommandsDisabled(next, null);
  }

  // Preset = setelan massal per kategori. Server yang menghitung daftar file plugin,
  // lalu config baru langsung didorong ke bot (hot reload).
  async function handleApplyPreset(preset: CommandPreset) {
    if (!config || applyingPreset !== null) return;

    setApplyingPreset(preset.id);
    try {
      const result = await applyCommandPreset(sessionId, preset.id);
      setConfig(result.config);
      void refreshAudit();
      showToast(
        `Preset "${result.preset.label}" diterapkan: ${result.disabledTotal} plugin dimatikan.`,
        'success',
      );
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menerapkan preset', 'error');
    } finally {
      setApplyingPreset(null);
    }
  }

  // Generate ulang katalog setelah plugin core berubah; tidak menyentuh config bot.
  async function handleRefreshCatalog() {
    setRefreshingCatalog(true);
    try {
      const catalog = await refreshCommandCatalog();
      setCommandCatalog(catalog);
      showToast(`Katalog diperbarui: ${catalog.total} plugin`, 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal membuat ulang katalog', 'error');
    } finally {
      setRefreshingCatalog(false);
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
                  {session.phone_number ?? session.phone_number_input ?? 'Belum terhubung'}
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
                    : '-'}
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
              {session.status === 'active' && (
                <Button
                  variant="secondary"
                  loading={restarting}
                  onClick={() => void handleRestart()}
                >
                  <IconRefresh size={16} />
                  Restart Bot
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                loading={deletingCreds}
                onClick={() => setConfirmDeleteCreds(true)}
              >
                <IconTrash size={16} />
                Hapus Credentials
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setChangePhoneOpen(true)}>
                <IconEdit size={16} />
                Ganti Nomor
              </Button>
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
                  <h2 className="section__title">Command</h2>
                  <p className="caption">
                    Matikan command yang tidak dipakai. Perubahan langsung dipakai bot (hot
                    reload).
                  </p>
                </div>
                <CommandList
                  catalog={commandCatalog}
                  loading={catalogLoading}
                  disabled={config.commandsDisabled}
                  plan={user?.plan ?? null}
                  savingFile={savingCommand}
                  presetBusy={applyingPreset}
                  refreshing={refreshingCatalog}
                  onToggle={handleCommandToggle}
                  onBulkToggle={handleCommandBulk}
                  onApplyPreset={handleApplyPreset}
                  onRefresh={() => void handleRefreshCatalog()}
                />
                <CommandAudit logs={auditLogs} />
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
                    {user?.plan === 'free' && (
                      <p className="notice notice--warning notice--with-icon">
                        <span className="notice__icon" aria-hidden="true">
                          🔒
                        </span>
                        <span>Identitas bot hanya bisa diubah di plan Pro ke atas.</span>
                      </p>
                    )}
                    <div className="settings-grid">
                      <Input
                        label="Nama bot"
                        placeholder="Rexify Bot"
                        value={settings.botname}
                        onChange={(event) => updateSetting('botname', event.target.value)}
                        maxLength={60}
                        disabled={user?.plan === 'free'}
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
                        disabled={user?.plan === 'free'}
                      />
                      <Input
                        label="URL audio"
                        placeholder="https://…/audio.mp3"
                        value={settings.audioUrl}
                        onChange={(event) => updateSetting('audioUrl', event.target.value)}
                        inputMode="url"
                        disabled={user?.plan === 'free'}
                      />
                      <Input
                        label="URL website"
                        placeholder="https://rexapi.my.id/"
                        value={settings.web}
                        onChange={(event) => updateSetting('web', event.target.value)}
                        inputMode="url"
                        disabled={user?.plan === 'free'}
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
                    <legend className="settings-group__title">Paket premium</legend>
                    <PremiumPackagesEditor
                      packages={settings.premium_packages ?? []}
                      onChange={(next) => updateSetting('premium_packages', next)}
                    />
                  </fieldset>

                  <fieldset className="settings-group">
                    <legend className="settings-group__title">Antilink whitelist</legend>
                    <div className="whitelist-section">
                      <span className="whitelist-label">Domain</span>
                      <WhitelistChipEditor
                        values={settings.antilink_whitelist_domain ?? []}
                        placeholder="tokopedia.com"
                        sanitize={(raw) => raw.trim().toLowerCase()}
                        onChange={(next) => updateSetting('antilink_whitelist_domain', next)}
                      />
                    </div>
                    <div className="whitelist-section">
                      <span className="whitelist-label">Nomor</span>
                      <WhitelistChipEditor
                        values={settings.antilink_whitelist_number ?? []}
                        placeholder="6281234"
                        sanitize={(raw) => raw.replace(/\D/g, '')}
                        onChange={(next) => updateSetting('antilink_whitelist_number', next)}
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
                        hint={
                          <>
                            Dapatkan key di{' '}
                            <a href="https://rexapi.my.id" target="_blank" rel="noopener">
                              rexapi.my.id
                            </a>
                          </>
                        }
                        onChange={(value) => updateSetting('token_rex', value)}
                        onToggle={() => toggleSecret('token_rex')}
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

      <ConfirmDialog
        open={confirmDeleteCreds}
        title="Hapus credentials?"
        description="Bot akan disconnect dan perlu pairing ulang saat connect berikutnya. Nomor WhatsApp tidak berubah."
        confirmLabel="Hapus"
        busy={deletingCreds}
        onConfirm={() => void handleDeleteCredentials()}
        onCancel={() => setConfirmDeleteCreds(false)}
      />

      {changePhoneOpen && (
        <div className="dialog-overlay" role="presentation">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="phone-dialog-title" style={{ maxWidth: 400 }}>
            <div className="dialog__header">
              <h2 className="dialog__title" id="phone-dialog-title">
                Ganti Nomor
              </h2>
              <button
                type="button"
                className="dialog__close"
                onClick={() => setChangePhoneOpen(false)}
                aria-label="Tutup"
              >
                <IconClose size={16} />
              </button>
            </div>
            <p className="caption">
              Credentials lama akan dihapus. Bot perlu pairing ulang dengan nomor baru.
            </p>
            <Input
              label="Nomor WhatsApp baru"
              placeholder="628123456789"
              hint="Format internasional tanpa +"
              inputMode="numeric"
              value={newPhone}
              onChange={(event) => setNewPhone(event.target.value.replace(/\D/g, ''))}
              maxLength={15}
            />
            <div className="dialog__actions">
              <Button variant="ghost" onClick={() => setChangePhoneOpen(false)}>
                Batal
              </Button>
              <Button
                loading={changingPhone}
                disabled={newPhone.length < 10}
                onClick={() => void handleChangePhone()}
              >
                Simpan
              </Button>
            </div>
          </div>
        </div>
      )}

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
