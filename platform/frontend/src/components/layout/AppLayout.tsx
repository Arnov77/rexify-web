import { useState, type ReactNode } from 'react';
import { useTheme } from '../../lib/useTheme';
import BottomNav from './BottomNav';
import Sidebar, { type ActiveSessionInfo } from './Sidebar';
import Topbar from './Topbar';
import '../../styles/layout.css';

interface AppLayoutProps {
  title: string;
  userEmail: string;
  plan: string;
  trialEndsAt: string | null;
  planExpiresAt: string | null;
  onLogout: () => void;
  activeSession?: ActiveSessionInfo;
  children: ReactNode;
}

// Satu state dipakai dua peran: collapse sidebar di desktop, buka/tutup drawer di mobile.
// Di mobile default collapsed (tersembunyi) supaya konten tidak tertutup overlay saat load.
function initialCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return !window.matchMedia('(min-width: 768px)').matches;
}

export default function AppLayout({
  title,
  userEmail,
  plan,
  trialEndsAt,
  planExpiresAt,
  onLogout,
  activeSession,
  children,
}: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const { theme, toggleTheme } = useTheme();

  const toggleSidebar = () => setCollapsed((value) => !value);

  // Di mobile sidebar berperan sebagai drawer: setiap navigasi menutupnya kembali.
  const closeOnMobile = () => {
    if (window.matchMedia('(max-width: 767px)').matches) setCollapsed(true);
  };

  return (
    <div className={collapsed ? 'app-shell app-shell--collapsed' : 'app-shell'}>
      {!collapsed && (
        <button
          type="button"
          className="sidebar-backdrop"
          onClick={() => setCollapsed(true)}
          aria-label="Tutup menu navigasi"
        />
      )}

      <Sidebar
        collapsed={collapsed}
        theme={theme}
        userEmail={userEmail}
        plan={plan}
        trialEndsAt={trialEndsAt}
        planExpiresAt={planExpiresAt}
        activeSession={activeSession}
        onToggleCollapse={toggleSidebar}
        onToggleTheme={toggleTheme}
        onLogout={onLogout}
        onNavigate={closeOnMobile}
      />

      <div className="app-main">
        <Topbar title={title} userEmail={userEmail} onMenuToggle={toggleSidebar} />
        <main className="content">{children}</main>
      </div>

      <BottomNav theme={theme} onToggleTheme={toggleTheme} onLogout={onLogout} />
    </div>
  );
}
