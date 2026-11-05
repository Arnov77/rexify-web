import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import Button from './ui/Button';
import '../styles/auth.css';

export default function ProtectedRoute() {
  const { user, loading, accessExpired, logout } = useAuth();

  if (loading) {
    return (
      <div className="route-loading" role="status">
        <p>Memuat dashboard…</p>
      </div>
    );
  }

  if (accessExpired) {
    return (
      <div className="route-loading">
        <h1 className="auth-title">Masa aktif habis</h1>
        <p>Trial atau plan kamu sudah berakhir. Hubungi admin untuk perpanjangan.</p>
        <Button variant="secondary" onClick={logout}>
          Keluar
        </Button>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Akun baru wajib verifikasi OTP dulu sebelum masuk dashboard/session.
  if (user.email_verified === false) {
    return <Navigate to="/verify-email" replace />;
  }

  return <Outlet />;
}