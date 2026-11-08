import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { IconGoogle } from '../components/icons';
import Logo from '../components/Logo';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import '../styles/auth.css';

// Kode dari server di /login?google_error=<kode> (lihat auth/google.ts).
const GOOGLE_ERRORS: Record<string, string> = {
  cancelled: 'Login Google dibatalkan.',
  state: 'Sesi login Google kedaluwarsa, coba lagi.',
  token: 'Google menolak permintaan login. Coba lagi.',
  profile: 'Akun Google itu tidak mengirim alamat email. Pakai akun lain.',
  server: 'Gagal memproses login Google. Coba lagi.',
};

export default function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const googleError = params.get('google_error');
  const googleErrorMessage = googleError
    ? (GOOGLE_ERRORS[googleError] ?? 'Login Google gagal. Coba lagi.')
    : null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to={user.email_verified === false ? '/verify-email' : '/'} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!email.trim()) {
      setFormError('Email wajib diisi');
      return;
    }
    if (password.length < 8) {
      setFormError('Password minimal 8 karakter');
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // ProtectedRoute mengarahkan ke /verify-email kalau email belum verified.
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Gagal masuk, coba lagi');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <Logo className="auth-brand__logo" />
          <span>Rexify</span>
        </div>

        <h1 className="auth-title">Masuk</h1>
        <p className="auth-subtitle">Kelola bot WhatsApp kamu dari satu dashboard.</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="nama@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="Minimal 8 karakter"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          {formError && (
            <p className="auth-error" role="alert">
              {formError}
            </p>
          )}

          <Button type="submit" size="lg" block loading={submitting}>
            Masuk
          </Button>
        </form>

        <p className="auth-divider">atau</p>

        {googleErrorMessage && (
          <p className="auth-error" role="alert">
            {googleErrorMessage}
          </p>
        )}

        <a className="btn btn--secondary btn--lg btn--block" href="/api/auth/google">
          <span>
            <IconGoogle size={18} />
            Lanjutkan dengan Google
          </span>
        </a>

        <p className="auth-footer">
          <Link to="/forgot-password">Lupa password?</Link>
        </p>

        <p className="auth-footer">
          Belum punya akun? <Link to="/register">Buat akun</Link>
        </p>
      </div>
    </div>
  );
}