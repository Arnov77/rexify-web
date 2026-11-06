import { NavLink } from 'react-router-dom';
import { IconBilling, IconDashboard, IconLogout, IconMoon, IconSun } from '../icons';
import type { Theme } from '../../lib/useTheme';

interface BottomNavProps {
  theme: Theme;
  onToggleTheme: () => void;
  onLogout: () => void;
}

// Hanya destinasi yang sudah ada; item Config belum punya halaman.
export default function BottomNav({ theme, onToggleTheme, onLogout }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Navigasi bawah">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          isActive ? 'bottom-nav__item bottom-nav__item--active' : 'bottom-nav__item'
        }
      >
        <IconDashboard size={22} />
        <span>Dashboard</span>
      </NavLink>

      <NavLink
        to="/billing"
        className={({ isActive }) =>
          isActive ? 'bottom-nav__item bottom-nav__item--active' : 'bottom-nav__item'
        }
      >
        <IconBilling size={22} />
        <span>Billing</span>
      </NavLink>

      <button
        type="button"
        className="bottom-nav__item"
        onClick={onToggleTheme}
        aria-label={theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
      >
        {theme === 'dark' ? <IconSun size={22} /> : <IconMoon size={22} />}
        <span>Tema</span>
      </button>

      <button type="button" className="bottom-nav__item" onClick={onLogout}>
        <IconLogout size={22} />
        <span>Keluar</span>
      </button>
    </nav>
  );
}