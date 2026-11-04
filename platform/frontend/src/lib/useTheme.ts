import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'rexify-theme';

function readInitialTheme(): Theme {
  const stored = document.documentElement.getAttribute('data-theme');
  return stored === 'light' ? 'light' : 'dark';
}

/** DESIGN §6: default dark, preferensi disimpan di localStorage. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage diblokir browser: tema tetap jalan untuk sesi ini.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
}