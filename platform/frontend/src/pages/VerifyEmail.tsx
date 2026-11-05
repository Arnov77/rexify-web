import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import Button from '../components/ui/Button';
import { ApiError, apiRequest } from '../lib/api';
import { useAuth } from '../lib/auth';
import '../styles/auth.css';

interface SendOtpResponse {
  ok: boolean;
  resend_after?: number;
}

// Backend mengirim 429 OTP_TOO_SOON dengan seconds_left; ApiError cuma menyimpan message,
// jadi sisa detik dibaca dari kalimat "Tunggu N detik ...".
function cooldownFromError(err: unknown): number | null {
  if (!(err instanceof ApiError) || err.code !== 'OTP_TOO_SOON') return null;
  const match = /(\d+)\s*detik/.exec(err.message);
  return match ? Number(match[1]) : 60;
}

export default function VerifyEmail() {
  const { user, loading, markEmailVerified } = useAuth();
  const navigate = useNavigate();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const autoSent = useRef(false);

  const sendOtp = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      const result = await apiRequest<SendOtpResponse>('/auth/send-otp', {
        method: 'POST',
        body: { type: 'verify' },
      });
      setSecondsLeft(result.resend_after ?? 60);
    } catch (err) {
      const cooldown = cooldownFromError(err);
      if (cooldown !== null) setSecondsLeft(cooldown);
      setError(err instanceof ApiError ? err.message : 'Gagal mengirim kode verifikasi');
    } finally {
      setSending(false);
    }
  }, []);

  // OTP dikirim otomatis sekali saat halaman dibuka (bukan tiap re-render).
  useEffect(() => {
    if (loading || !user || user.email_verified || autoSent.current) return;
    autoSent.current = true;
    void sendOtp();
  }, [loading, user, sendOtp]);

  const cooling = secondsLeft > 0;
  useEffect(() => {
    if (!cooling) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooling]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (otp.length !== 6) {
      setError('Kode verifikasi harus 6 digit angka');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest('/auth/verify-email', { method: 'POST', body: { otp } });
      markEmailVerified();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memverifikasi email');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="route-loading" role="status">
        <p>Memuat…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.email_verified) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <Logo className="auth-brand__logo" />
          <span>Rexify</span>
        </div>

        <h1 className="auth-title">Verifikasi Email</h1>
        <p className="auth-subtitle">
          Kode verifikasi dikirim ke <strong>{user.email}</strong>. Masukkan kode 6 digit di bawah.
        </p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor="verify-otp">
              Kode verifikasi
            </label>
            <input
              id="verify-otp"
              className="input auth-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" block loading={submitting}>
            Verifikasi
          </Button>

          <Button
            type="button"
            variant="secondary"
            block
            loading={sending}
            disabled={cooling}
            onClick={() => void sendOtp()}
          >
            {cooling ? `Kirim ulang kode (${secondsLeft}s)` : 'Kirim ulang kode'}
          </Button>
        </form>

        <p className="auth-footer">
          Salah email? <Link to="/login">Kembali ke halaman masuk</Link>
        </p>
      </div>
    </div>
  );
}
