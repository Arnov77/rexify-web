import { randomBytes } from 'node:crypto';

// Kode tukar sekali-pakai untuk menyerahkan JWT dari callback OAuth ke frontend tanpa
// menaruh token di URL: kode mati setelah dipakai atau 60 detik, mana yang lebih dulu.
const TTL_MS = 60_000;
// Batas aman kalau banyak login menggantung: entri kedaluwarsa dibuang saat kode baru dibuat.
const MAX_ENTRIES = 5000;

// shortcut: kode disimpan di memori proses, jadi hanya cocok untuk satu instance platform.
// Pindah ke tabel DB kalau backend di-scale ke lebih dari satu instance.
const codes = new Map<string, { token: string; expiresAt: number }>();

function sweep(now: number): void {
  for (const [code, entry] of codes) {
    if (entry.expiresAt <= now) codes.delete(code);
  }
}

export function issueExchangeCode(token: string): string {
  const now = Date.now();
  if (codes.size >= MAX_ENTRIES) sweep(now);

  const code = randomBytes(24).toString('hex');
  codes.set(code, { token, expiresAt: now + TTL_MS });
  return code;
}

export function consumeExchangeCode(code: string): string | null {
  const entry = codes.get(code);
  if (!entry) return null;

  // Dihapus sebelum dicek umurnya: kode yang sudah dipakai tidak boleh bisa dicoba lagi.
  codes.delete(code);
  return entry.expiresAt > Date.now() ? entry.token : null;
}
