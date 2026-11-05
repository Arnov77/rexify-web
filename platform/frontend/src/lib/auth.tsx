import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, apiRequest, getToken, setToken } from './api';
import type { AuthResponse, MeResponse } from './types';

type MeUser = MeResponse['user'];

interface AuthContextValue {
  user: MeUser | null;
  limits: MeResponse['limits'] | null;
  loading: boolean;
  accessExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  // Dipanggil setelah OTP benar supaya ProtectedRoute langsung membuka dashboard.
  markEmailVerified: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeUser | null>(null);
  const [limits, setLimits] = useState<MeResponse['limits'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessExpired, setAccessExpired] = useState(false);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setLimits(null);
    setAccessExpired(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLimits(null);
      setLoading(false);
      return;
    }

    try {
      const me = await apiRequest<MeResponse>('/me');
      setUser(me.user);
      setLimits(me.limits);
      setAccessExpired(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
      }
      // 403 EMAIL_NOT_VERIFIED bukan plan habis: user harus ke halaman verifikasi.
      if (
        err instanceof ApiError &&
        err.status === 403 &&
        err.code !== 'EMAIL_NOT_VERIFIED'
      ) {
        setAccessExpired(true);
      }
      setUser(null);
      setLimits(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const authenticate = useCallback(
    async (path: '/auth/login' | '/auth/register', email: string, password: string) => {
      const result = await apiRequest<AuthResponse>(path, {
        method: 'POST',
        body: { email, password },
      });
      setToken(result.token);
      await refresh();
    },
    [refresh],
  );

  const login = useCallback(
    (email: string, password: string) => authenticate('/auth/login', email, password),
    [authenticate],
  );

  const register = useCallback(
    (email: string, password: string) => authenticate('/auth/register', email, password),
    [authenticate],
  );

  const markEmailVerified = useCallback(() => {
    setUser((prev) => (prev ? { ...prev, email_verified: true } : prev));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      limits,
      loading,
      accessExpired,
      login,
      register,
      logout,
      refresh,
      markEmailVerified,
    }),
    [user, limits, loading, accessExpired, login, register, logout, refresh, markEmailVerified],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth harus dipakai di dalam AuthProvider');
  }
  return context;
}