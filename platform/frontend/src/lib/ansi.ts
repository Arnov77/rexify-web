// Log bot ditulis ke stdout dengan warna ANSI SGR (chalk), jadi escape code harus diurai
// dulu. Kalau tidak, panel console menampilkan sampah seperti "ESC[90m08:31:25ESC[39m".

export interface AnsiSpan {
  text: string;
  /** Class utilitas untuk atribut teks, mis. "ansi-bold ansi-dim". */
  className: string;
  /** Warna foreground hasil resolusi SGR; null = ikut warna default baris. */
  color: string | null;
  background: string | null;
}

interface AnsiState {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  color: string | null;
  background: string | null;
}

// Palet 16 warna standar, dipilih supaya tetap kebaca di background gelap maupun terang.
const BASE_COLORS = [
  '#7b7b88', // 30 hitam -> abu (hitam asli tak terbaca di dark)
  '#ef4444', // 31 merah
  '#22c55e', // 32 hijau
  '#eab308', // 33 kuning
  '#3b82f6', // 34 biru
  '#a855f7', // 35 magenta
  '#06b6d4', // 36 cyan
  '#d4d4d8', // 37 putih
];

const BRIGHT_COLORS = [
  '#9ca3af', // 90 hitam terang
  '#ff7b72', // 91
  '#4ade80', // 92
  '#fde047', // 93
  '#60a5fa', // 94
  '#c084fc', // 95
  '#22d3ee', // 96
  '#ffffff', // 97
];

// Tingkat warna kubus 6x6x6 untuk mode 256 warna (SGR 38;5;n).
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255];

// Escape CSI apa pun: SGR (…m), gerak kursor, hapus baris, dan sejenisnya.
// eslint-disable-next-line no-control-regex
const CSI_RE = /\u001b\[[0-9;?]*[A-Za-z]/g;

// Split sekaligus menangkap parameter SGR: index genap = teks, index ganjil = parameter.
// eslint-disable-next-line no-control-regex
const SGR_SPLIT_RE = /\u001b\[([0-9;]*)m/;

function rgbToHex(r: number, g: number, b: number): string {
  const hex = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function ansi256ToHex(index: number): string {
  if (index < 16) {
    return index < 8 ? BASE_COLORS[index] : BRIGHT_COLORS[index - 8];
  }

  if (index < 232) {
    const cube = index - 16;
    const r = CUBE_LEVELS[Math.floor(cube / 36) % 6];
    const g = CUBE_LEVELS[Math.floor(cube / 6) % 6];
    const b = CUBE_LEVELS[cube % 6];
    return rgbToHex(r, g, b);
  }

  // 232-255 = gradasi abu 8..238.
  const level = 8 + (index - 232) * 10;
  return rgbToHex(level, level, level);
}

function resetState(state: AnsiState): void {
  state.bold = false;
  state.dim = false;
  state.italic = false;
  state.underline = false;
  state.color = null;
  state.background = null;
}

function applySgr(state: AnsiState, raw: string): void {
  // "\x1b[m" (parameter kosong) sama artinya dengan reset.
  const codes = raw === '' ? [0] : raw.split(';').map((value) => Number(value) || 0);

  for (let i = 0; i < codes.length; i += 1) {
    const code = codes[i];

    if (code === 0) resetState(state);
    else if (code === 1) state.bold = true;
    else if (code === 2) state.dim = true;
    else if (code === 3) state.italic = true;
    else if (code === 4) state.underline = true;
    else if (code === 22) {
      state.bold = false;
      state.dim = false;
    } else if (code === 23) state.italic = false;
    else if (code === 24) state.underline = false;
    else if (code >= 30 && code <= 37) state.color = BASE_COLORS[code - 30];
    else if (code >= 90 && code <= 97) state.color = BRIGHT_COLORS[code - 90];
    else if (code === 39) state.color = null;
    else if (code >= 40 && code <= 47) state.background = BASE_COLORS[code - 40];
    else if (code >= 100 && code <= 107) state.background = BRIGHT_COLORS[code - 100];
    else if (code === 49) state.background = null;
    else if (code === 38 || code === 48) {
      // 38;5;n = 256 warna, 38;2;r;g;b = truecolor. Sisa parameternya dilewati.
      const mode = codes[i + 1];

      if (mode === 5) {
        const color = ansi256ToHex(codes[i + 2]);
        if (code === 38) state.color = color;
        else state.background = color;
        i += 2;
      } else if (mode === 2) {
        const color = rgbToHex(codes[i + 2], codes[i + 3], codes[i + 4]);
        if (code === 38) state.color = color;
        else state.background = color;
        i += 4;
      }
    }
  }
}

function classNameOf(state: AnsiState): string {
  const classes: string[] = [];
  if (state.bold) classes.push('ansi-bold');
  if (state.dim) classes.push('ansi-dim');
  if (state.italic) classes.push('ansi-italic');
  if (state.underline) classes.push('ansi-underline');
  return classes.join(' ');
}

/** Buang semua escape ANSI supaya teks bisa dipakai untuk deteksi timestamp / error. */
export function stripAnsi(text: string): string {
  return text.replace(CSI_RE, '');
}

/** Pecah satu baris log jadi span berwarna sesuai escape SGR-nya. */
export function parseAnsi(text: string): AnsiSpan[] {
  const spans: AnsiSpan[] = [];
  const state: AnsiState = {
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    color: null,
    background: null,
  };

  const parts = text.split(SGR_SPLIT_RE);

  for (let i = 0; i < parts.length; i += 1) {
    const chunk = parts[i];

    // Index ganjil = parameter SGR, bukan teks.
    if (i % 2 === 1) {
      applySgr(state, chunk);
      continue;
    }

    // Escape non-SGR (gerak kursor, hapus baris) dibuang, sisanya jadi satu span.
    const clean = chunk.replace(CSI_RE, '');
    if (!clean) continue;

    spans.push({
      text: clean,
      className: classNameOf(state),
      color: state.color,
      background: state.background,
    });
  }

  return spans;
}

/** Buang `count` karakter pertama dari hasil parseAnsi (untuk memotong timestamp). */
export function sliceSpans(spans: AnsiSpan[], count: number): AnsiSpan[] {
  if (count <= 0) return spans;

  let remaining = count;
  const result: AnsiSpan[] = [];

  for (const span of spans) {
    if (remaining >= span.text.length) {
      remaining -= span.text.length;
      continue;
    }

    result.push({ ...span, text: span.text.slice(remaining) });
    remaining = 0;
  }

  return result;
}
