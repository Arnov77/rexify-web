import { NavLink } from 'react-router-dom';
import {
  IconAutoReply,
  IconBilling,
  IconChevronLeft,
  IconChevronRight,
  IconDashboard,
  IconLogout,
  IconMoon,
  IconPlugins,
  IconSettings,
  IconSun,
} from '../icons';
import type { Theme } from '../../lib/useTheme';

interface SidebarProps {
  collapsed: boolean;
  theme: Theme;
  userEmail: string;
  onToggleCollapse: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
}

const COMING_SOON = [
  { label: 'Auto Reply', icon: IconAutoReply },
  { label: 'Plugins', icon: IconPlugins },
  { label: 'Settings', icon: IconSettings },
];

export default function Sidebar({
  collapsed,
  theme,
  userEmail,
  onToggleCollapse,
  onToggleTheme,
  onLogout,
}: SidebarProps) {
  return (
    <aside className={collapsed ? 'sidebar sidebar--collapsed' : 'sidebar'}>
      <div className="sidebar__brand">
        <span className="sidebar__logo" aria-hidden="true">
          R
        </span>
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

      <nav className="sidebar__nav" aria-label="Navigasi utama">
        <p className="sidebar__section">{collapsed ? '' : 'Main'}</p>
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            isActive ? 'nav-item nav-item--active' : 'nav-item'
          }
          title={collapsed ? 'Dashboard' : undefined}
        >
          <IconDashboard />
          {!collapsed && <span className="nav-item__label">Dashboard</span>}
        </NavLink>

        <p className="sidebar__section">{collapsed ? '' : 'Config'}</p>
        {COMING_SOON.map((item) => {
          const Icon = item.icon;
          return (
            <span
              key={item.label}
              className="nav-item nav-item--disabled"
              aria-disabled="true"
              title={collapsed ? `${item.label} — segera` : undefined}
            >
              <Icon />
              {!collapsed && (
                <>
                  <span className="nav-item__label">{item.label}</span>
                  <span className="nav-item__tag">Segera</span>
                </>
              )}
            </span>
          );
        })}

        <p className="sidebar__section">{collapsed ? '' : 'Account'}</p>
        <span
          className="nav-item nav-item--disabled"
          aria-disabled="true"
          title={collapsed ? 'Billing — segera' : undefined}
        >
          <IconBilling />
          {!collapsed && (
            <>
              <span className="nav-item__label">Billing</span>
              <span className="nav-item__tag">Segera</span>
            </>
          )}
        </span>
      </nav>

      <div className="sidebar__footer">
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