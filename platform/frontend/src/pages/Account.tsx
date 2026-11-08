import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';
import { changePassword } from '../lib/account';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { planLabel } from '../lib/billing';
import { LEGAL_CONTACT_EMAIL, LEGAL_ACCOUNT_RETENTION } from '../lib/legal';
import '../styles/account.css';

const MIN_PASSWORD_LENGTH = 8;

const dateFormat = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

function loginMethod(hasPassword: boolean, hasGoogle: boolean): string {
  if (hasPassword && hasGoogle) return 'Password dan Google';
  if (hasGoogle) return 'Google';
  if (hasPassword) return 'Password';
  return 'Tidak diketahui';
}

export default function Account() {
  const { user, logout, refresh } = useAuth();
  const { showToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const hasPassword = user?.has_password === true;
  const hasGoogle = user?.has_google === true;
  const expiry = formatDate(
    user?.plan === 'free' ? user?.trial_ends_at : user?.plan_expires_at,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setFormError(`Password baru minimal ${MIN_PASSWORD_LENGTH} karakter`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('Ulangi password baru dengan isian yang sama');
      return;
    }
    if (hasPassword && !currentPassword) {
      setFormError('Password saat ini wajib diisi');
      return;
    }

    setSaving(true);
    try {
      await changePassword({
        currentPassword: hasPassword ? currentPassword : undefined,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // Untuk akun Google-only, has_password berubah jadi true setelah ini.
      await refresh();
      showToast(hasPassword ? 'Password diperbarui' : 'Password berhasil dibuat', 'success');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Gagal menyimpan password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout
      title="Akun"
      userEmail={user?.email ?? ''}
      plan={user?.plan ?? 'free'}
      trialEndsAt={user?.trial_ends_at ?? null}
      onLogout={logout}
    >
      <div className="account-grid">
        <section className="card account-card">
          <h2 className="account-card__title">Identitas</h2>
          <dl className="account-list">
            <div className="account-row">
              <dt>Email</dt>
              <dd className="mono">{user?.email ?? '-'}</dd>
            </div>
            <div className="account-row">
              <dt>Status email</dt>
              <dd>{user?.email_verified === false ? 'Belum diverifikasi' : 'Terverifikasi'}</dd>
            </div>
            <div className="account-row">
              <dt>Cara masuk</dt>
              <dd>{loginMethod(hasPassword, hasGoogle)}</dd>
            </div>
            <div className="account-row">
              <dt>Paket</dt>
              <dd>
                {user?.plan === 'free' ? 'Free (trial)' : planLabel(user?.plan ?? 'free')}
                {expiry && (
                  <span className="account-row__note">
                    {user?.plan === 'free' ? 'Trial berakhir' : 'Aktif sampai'} {expiry}
                  </span>
                )}
              </dd>
            </div>
          </dl>
          <Link className="btn btn--secondary btn--sm account-card__action" to="/billing">
            <span>Kelola paket</span>
          </Link>
        </section>

        <section className="card account-card">
          <h2 className="account-card__title">
            {hasPassword ? 'Ganti password' : 'Buat password'}
          </h2>
          <p className="account-card__hint">
            {hasPassword
              ? 'Dipakai untuk masuk tanpa lewat Google. Minimal 8 karakter.'
              : 'Akun ini masuk lewat Google dan belum punya password. Buat sekarang supaya bisa masuk tanpa akun Google.'}
          </p>

          <form className="account-form" onSubmit={handleSubmit} noValidate>
            {hasPassword && (
              <Input
                label="Password saat ini"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            )}
            <Input
              label="Password baru"
              type="password"
              autoComplete="new-password"
              hint="Minimal 8 karakter"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <Input
              label="Ulangi password baru"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />

            {formError && (
              <p className="account-form__error" role="alert">
                {formError}
              </p>
            )}

            <Button type="submit" loading={saving}>
              {hasPassword ? 'Simpan password' : 'Buat password'}
            </Button>
          </form>
        </section>

        <section className="card account-card">
          <h2 className="account-card__title">Hapus akun</h2>
          <p className="account-card__hint">
            Penghapusan akun masih diproses manual. Kirim permintaan dari email akun ini ke{' '}
            <a className="account-link" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
              {LEGAL_CONTACT_EMAIL}
            </a>
            . Data akun, bot, dan setelanmu ikut dihapus dalam {LEGAL_ACCOUNT_RETENTION}.
          </p>
        </section>
      </div>
    </AppLayout>
  );
}
