import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { ApiError, apiRequest } from '../lib/api';
import '../styles/auth.css';

type Step = 'email' | 'otp' | 'done';

interface SendOtpResponse {
  ok: boolean;
  resend_after?: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cooldownFromError(err: unknown): number | null {
  if (!(err instanceof ApiError) || err.code !== 'OTP_TOO_SOON') return null;
  const match = /(\d+)\s*detik/.exec(err.message);
  return match ? Number(match[1]) : 60;
}

export default function ForgotPassword() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const cooling = secondsLeft > 0;
  useEffect(() => {
    if (!cooling) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooling]);

  async function requestOtp(nextStep: Step) {
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiRequest<SendOtpResponse>('/auth/send-otp', {
        method: 'POST',
        body: { type: 'reset', email: email.trim().toLowerCase() },
      });
      setSecondsLeft(result.resend_after ?? 60);
      setStep(nextStep);
    } catch (err) {
      const cooldown = cooldownFromError(err);
      if (cooldown !== null) setSecondsLeft(cooldown);
      setError(err instanceof ApiError ? err.message : 'Gagal mengirim kode reset');
    } finally {
      setSubmitting(false);
    }
  }

  function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!EMAIL_RE.test(email.trim())) {
      setError('Format email tidak valid');
      return;
    }

    void requestOtp('otp');
  }

  async function handleResetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (otp.length !== 6) {
      setError('Kode reset harus 6 digit angka');
      return;
    }
    if (password.length < 8) {
      setError('Password minimal 8 karakter');
      return;
    }
    if (password !== confirm) {
      setError('Konfirmasi password tidak sama');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), otp, new_password: password },
      });
      setStep('done');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengubah password');
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

        {step === 'email' && (
          <>
            <h1 className="auth-title">Lupa password</h1>
            <p className="auth-subtitle">
              Masukkan email akunmu, kami kirim kode 6 digit untuk reset password.
            </p>

            <form className="auth-form" onSubmit={handleEmailSubmit} noValidate>
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

              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" block loading={submitting}>
                Kirim Kode
              </Button>
            </form>
          </>
        )}

        {step === 'otp' && (
          <>
            <h1 className="auth-title">Reset password</h1>
            <p className="auth-subtitle">
              Kode dikirim ke <strong>{email.trim()}</strong>
            </p>

            <form className="auth-form" onSubmit={handleResetSubmit} noValidate>
              <div className="field">
                <label className="field__label" htmlFor="reset-otp">
                  Kode reset
                </label>
                <input
                  id="reset-otp"
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

              <Input
                label="Password baru"
                type="password"
                name="new_password"
                autoComplete="new-password"
                placeholder="Minimal 8 karakter"
                hint="Minimal 8 karakter"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <Input
                label="Konfirmasi password"
                type="password"
                name="confirm_password"
                autoComplete="new-password"
                placeholder="Ulangi password baru"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
              />

              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" block loading={submitting}>
                Reset Password
              </Button>

              <Button
                type="button"
                variant="secondary"
                block
                loading={submitting}
                disabled={cooling}
                onClick={() => void requestOtp('otp')}
              >
                {cooling ? `Kirim ulang (${secondsLeft}s)` : 'Kirim ulang kode'}
              </Button>
            </form>
          </>
        )}

        {step === 'done' && (
          <>
            <h1 className="auth-title">Password berhasil diubah</h1>
            <p className="auth-subtitle">Password berhasil diubah. Silakan login.</p>
            <Link className="btn btn--primary btn--lg btn--block" to="/login">
              Ke halaman login
            </Link>
          </>
        )}

        <p className="auth-footer">
          Ingat password? <Link to="/login">Masuk</Link>
        </p>
      </div>
    </div>
  );
}

