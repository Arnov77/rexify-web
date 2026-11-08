import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Logo from '../components/Logo';
import { ApiError, apiRequest, setToken } from '../lib/api';
import { useAuth } from '../lib/auth';
import '../styles/auth.css';

export default function GoogleCallback() {
  const [params] = useSearchParams();
  const code = params.get('code');
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // StrictMode menjalankan effect dua kali saat dev; kode sekali-pakai tidak boleh ditukar dua kali.
  const exchanged = useRef<string | null>(null);

  useEffect(() => {
    if (!code) {
      setError('Login Google tidak selesai. Coba lagi dari halaman masuk.');
      return;
    }
    if (exchanged.current === code) return;
    exchanged.current = code;

    // Kode sekali-pakai langsung dibuang dari URL supaya tidak ikut tersimpan di history.
    window.history.replaceState(null, '', '/auth/google/callback');

    void (async () => {
      try {
        const result = await apiRequest<{ token: string }>('/auth/google/exchange', {
          method: 'POST',
          body: { code },
        });
        setToken(result.token);
        await refresh();
        navigate('/dashboard', { replace: true });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Gagal menyelesaikan login Google.');
      }
    })();
  }, [code, refresh, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <Logo className="auth-brand__logo" />
          <span>Rexify</span>
        </div>

        {error ? (
          <>
            <h1 className="auth-title">Gagal masuk</h1>
            <p className="auth-subtitle">{error}</p>
            <Link className="btn btn--secondary btn--lg btn--block" to="/login">
              <span>Kembali ke halaman masuk</span>
            </Link>
          </>
        ) : (
          <p className="auth-subtitle" role="status">
            Menyelesaikan login Google…
          </p>
        )}
      </div>
    </div>
  );
}
