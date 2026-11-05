import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import '../styles/auth.css';

export default function Register() {
  const { register, user, loading } = useAuth();
  const navigate = useNavigate();
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
      await register(email.trim(), password);
      // Akun baru belum verified: lanjut ke halaman OTP, bukan landing.
      navigate('/verify-email', { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Gagal membuat akun, coba lagi');
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

        <h1 className="auth-title">Buat akun</h1>
        <p className="auth-subtitle">Satu akun untuk semua nomor WhatsApp yang kamu kelola.</p>

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
            autoComplete="new-password"
            placeholder="Minimal 8 karakter"
            hint="Minimal 8 karakter"
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
            Buat akun
          </Button>
        </form>

        <p className="auth-note">Trial 7 hari aktif langsung, tanpa verifikasi email.</p>
        <p className="auth-footer">
          Sudah punya akun? <Link to="/login">Masuk</Link>
        </p>
      </div>
    </div>
  );
}