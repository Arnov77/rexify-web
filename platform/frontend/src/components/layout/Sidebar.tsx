import { NavLink } from 'react-router-dom';
import Logo from '../Logo';
import {
  IconBilling,
  IconChevronLeft,
  IconChevronRight,
  IconDashboard,
  IconLogout,
  IconMoon,
  IconSun,
  IconUser,
} from '../icons';
import type { SessionTab } from '../../lib/types';
import SupportLinks from './SupportLinks';
import type { Theme } from '../../lib/useTheme';

export interface ActiveSessionInfo {
  id: string;
  label: string | null;
  tab: SessionTab;
  onTabChange: (tab: SessionTab) => void;
}

interface SidebarProps {
  collapsed: boolean;
  theme: Theme;
  userEmail: string;
  plan: string;
  trialEndsAt: string | null;
  activeSession?: ActiveSessionInfo;
  // List bot yang tampil di sidebar selama berada di Dashboard.
  sessions?: Array<{ id: string; label: string | null; status: string }>;
  onToggleCollapse: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
  // Dipakai untuk menutup drawer mobile setelah memilih menu.
  onNavigate?: () => void;
}

const SUBNAV_TABS: { key: SessionTab; label: string }[] = [
  { key: 'ai', label: 'AI' },
  { key: 'plugin', label: 'Plugin' },
  { key: 'tampilan', label: 'Tampilan' },
  { key: 'settings', label: 'Pengaturan' },
];

function planBadge(plan: string, trialEndsAt: string | null): { label: string; className: string } {
  if (plan === 'pro') return { label: 'Pro', className: 'plan-badge plan-badge--pro' };
  if (plan === 'enterprise') {
    return { label: 'Enterprise', className: 'plan-badge plan-badge--enterprise' };
  }

  let days: number | null = null;
  if (trialEndsAt) {
    const end = new Date(trialEndsAt).getTime();
    if (!Number.isNaN(end)) days = Math.ceil((end - Date.now()) / 86_400_000);
  }
  const label = days !== null ? `Trial ${days} hari` : 'Trial';
  return { label, className: 'plan-badge plan-badge--free' };
}

export default function Sidebar({
  collapsed,
  theme,
  userEmail,
  plan,
  trialEndsAt,
  activeSession,
  sessions,
  onToggleCollapse,
  onToggleTheme,
  onLogout,
  onNavigate,
}: SidebarProps) {
  const badge = planBadge(plan, trialEndsAt);

  return (
    <aside className={collapsed ? 'sidebar sidebar--collapsed' : 'sidebar'}>
      <div className="sidebar__brand">
        <Logo className="sidebar__logo" />
        {!collapsed && <span className="sidebar__brand-name">Rexify</span>}
        <button
          type="button"
          className="sidebar__collapse"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Lebarkan sidebar' : 'Sempitkan sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
        </button>
      </div>

      {/* Fitur bot (auto reply, plugin, pengaturan) ada di detail session, bukan nav global. */}
      <nav className="sidebar__nav" aria-label="Navigasi utama">
        {!collapsed && <p className="sidebar__section">Main</p>}
        <NavLink
          to="/"
          end
          className={({ isActive }) => (isActive ? 'nav-item nav-item--active' : 'nav-item')}
          title={collapsed ? 'Dashboard' : undefined}
          onClick={onNavigate}
        >
          <IconDashboard />
          {!collapsed && <span className="nav-item__label">Dashboard</span>}
        </NavLink>

        <NavLink
          to="/billing"
          className={({ isActive }) => (isActive ? 'nav-item nav-item--active' : 'nav-item')}
          title={collapsed ? 'Billing' : undefined}
          onClick={onNavigate}
        >
          <IconBilling />
          {!collapsed && <span className="nav-item__label">Billing</span>}
        </NavLink>

        <NavLink
          to="/account"
          className={({ isActive }) => (isActive ? 'nav-item nav-item--active' : 'nav-item')}
          title={collapsed ? 'Akun' : undefined}
          onClick={onNavigate}
        >
          <IconUser />
          {!collapsed && <span className="nav-item__label">Akun</span>}
        </NavLink>

        {!collapsed && sessions && sessions.length > 0 && (
          <div className="session-subnav">
            <p className="session-subnav__title">Bot kamu</p>

            {sessions.map((session) => (
              <NavLink
                key={session.id}
                to={`/sessions/${session.id}`}
                className={({ isActive }) =>
                  isActive ? 'session-subnav__item session-subnav__item--active' : 'session-subnav__item'
                }
                onClick={onNavigate}
              >
                <span
                  className={`subnav-dot subnav-dot--${session.status === 'active' ? 'active' : 'off'}`}
                />
                {session.label ?? 'Bot tanpa nama'}
              </NavLink>
            ))}
          </div>
        )}
      </nav>

      {!collapsed && activeSession && (
        <div className="session-subnav">
          <p
            className="session-subnav__title"
            title={activeSession.label ?? activeSession.id}
          >
            {activeSession.label ?? 'Bot'}
          </p>
          {SUBNAV_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={
                activeSession.tab === item.key
                  ? 'session-subnav__item session-subnav__item--active'
                  : 'session-subnav__item'
              }
              aria-current={activeSession.tab === item.key ? 'page' : undefined}
              onClick={() => {
                activeSession.onTabChange(item.key);
                onNavigate?.();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div className="sidebar__footer">
        {!collapsed && (
          <span className={badge.className}>{badge.label}</span>
        )}

        <SupportLinks collapsed={collapsed} onNavigate={onNavigate} />

        <button
          type="button"
          className="nav-item"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
          title={collapsed ? 'Ganti tema' : undefined}
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
          {!collapsed && (
            <span className="nav-item__label">{theme === 'dark' ? 'Mode terang' : 'Mode gelap'}</span>
          )}
        </button>

        <button
          type="button"
          className="nav-item"
          onClick={onLogout}
          title={collapsed ? 'Keluar' : undefined}
        >
          <IconLogout />
          {!collapsed && <span className="nav-item__label">Keluar</span>}
        </button>

        {!collapsed && (
          <p className="sidebar__account mono" title={userEmail}>
            {userEmail}
          </p>
        )}
      </div>
    </aside>
  );
}
