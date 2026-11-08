import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './lib/auth';
import Account from './pages/Account';
import Billing from './pages/Billing';
import Dashboard from './pages/Dashboard';
import ForgotPassword from './pages/ForgotPassword';
import GoogleCallback from './pages/GoogleCallback';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Privacy from './pages/Privacy';
import Register from './pages/Register';
import SessionDetail from './pages/SessionDetail';
import Terms from './pages/Terms';
import VerifyEmail from './pages/VerifyEmail';
import './styles/components.css';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            {/* Tujuan redirect /api/auth/google/callback; token di query langsung dibuang. */}
            <Route path="/auth/google/callback" element={<GoogleCallback />} />
            {/* Semi-protected: butuh login, tapi belum harus verified (halaman ini justru memverifikasi). */}
            <Route path="/verify-email" element={<VerifyEmail />} />

            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/account" element={<Account />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/sessions/:sessionId" element={<SessionDetail />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
