import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import '../styles/auth.css';

export default function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/" replace />;
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
      navigate('/', { replace: true });
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
          <span className="auth-brand__logo" aria-hidden="true">
            R
          </span>
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

        <p className="auth-footer">
          Belum punya akun? <Link to="/register">Buat akun</Link>
        </p>
      </div>
    </div>
  );
}