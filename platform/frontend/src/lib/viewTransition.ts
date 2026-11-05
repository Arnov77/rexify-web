import { flushSync } from 'react-dom';

// Animasi pindah halaman pakai View Transitions API.
// Browser yang belum mendukung langsung navigasi tanpa animasi.
export function withViewTransition(update: () => void): void {
  if (typeof document.startViewTransition !== 'function') {
    update();
    return;
  }

  document.startViewTransition(() => {
    // flushSync supaya React commit DOM sebelum snapshot "new" diambil.
    flushSync(update);
  });
}
