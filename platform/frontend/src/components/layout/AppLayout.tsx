import { useState, type ReactNode } from 'react';
import { useTheme } from '../../lib/useTheme';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import '../../styles/layout.css';

interface AppLayoutProps {
  title: string;
  userEmail: string;
  onLogout: () => void;
  children: ReactNode;
}

export default function AppLayout({ title, userEmail, onLogout, children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { theme, toggleTheme } = useTheme();

  return (
    <div className={collapsed ? 'app-shell app-shell--collapsed' : 'app-shell'}>
      <Sidebar
        collapsed={collapsed}
        theme={theme}
        userEmail={userEmail}
        onToggleCollapse={() => setCollapsed((value) => !value)}
        onToggleTheme={toggleTheme}
        onLogout={onLogout}
      />

      <div className="app-main">
        <Topbar title={title} userEmail={userEmail} />
        <main className="content">{children}</main>
      </div>

      <BottomNav theme={theme} onToggleTheme={toggleTheme} onLogout={onLogout} />
    </div>
  );
}