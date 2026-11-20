// Streaming log bot realtime via WebSocket: mode 'same' baca file log PM2 dari disk,
// mode 'other' proxy WS ke Bot Runner.

import { existsSync, readFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import WebSocket, { type RawData } from 'ws';
import { instanceConfigPath, instanceErrorLogPath, instanceLogPath } from '../paths';
import { botRunnerLogsUrl } from '../session/bot-runner-client';
import { getSessionLogPaths, isRemoteMode } from '../session/pm2-manager';
import { getSession } from '../session/store';
import type { JWTPayload } from '../types/auth';

const POLL_MS = 1000;
// Kirim 100 baris terakhir saat pertama connect.
const TAIL_LINES = 100;
// Batas baca awal supaya file log raksasa tidak dibaca utuh.
const TAIL_BYTES = 64 * 1024;
// Kalau window 64KB mulai di tengah dump error (stack trace tanpa timestamp),
// baca lebih jauh ke belakang untuk menemukan baris header error-nya.
const HEADER_LOOKBACK_BYTES = 512 * 1024;
// Satu dump error bisa ratusan baris; simpan header + awal dump tiap error.
const ERROR_BLOCK_KEEP_LINES = 40;
// Zona waktu cadangan kalau config instance tidak terbaca.
const DEFAULT_LOG_TZ = process.env.LOG_TZ ?? 'Asia/Jakarta';
// ws: 1 = OPEN, tapi `ws` hanya expose konstanta ini sebagai static.
const SOCKET_OPEN = 1;
const POLICY_VIOLATION = 1008;

type LogMessage =
  | { type: 'history'; lines: string[] }
  | { type: 'line'; data: string };

// Baris log bisa diawali ANSI, prefix "[ERR] ", lalu waktu:
// "YYYY-MM-DD HH:MM:SS" (PM2) atau "HH:MM:SS" (logger bot core).
const ANSI_PREFIX_RE = /^(?:\u001b\[[0-9;]*m)+/;
const LINE_TIME_RE =
  /^(?:\[ERR\]\s*)?(?:(\d{4})-(\d{2})-(\d{2})[ T])?(\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?/;
// Selisih > 12 jam dianggap lewat tengah malam, bukan urutan terbalik.
const ROLLOVER_MS = 12 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Timestamp log ditulis core/lib/logger.js memakai TZ proses bot (config.tz,
// default Asia/Jakarta), sedangkan platform bisa jalan di UTC. Tanpa konversi,
// jam "08:23:45" dianggap 7 jam lebih lambat dari aslinya sehingga error lama
// tampil di bawah log baru.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function normalizeTimezone(timeZone?: string | null): string {
  if (!timeZone) return DEFAULT_LOG_TZ;
  try {
    formatterFor(timeZone);
    return timeZone;
  } catch {
    return DEFAULT_LOG_TZ;
  }
}

// Selisih zona terhadap UTC pada detik tertentu (WIB = +7 jam, tanpa DST).
function timezoneOffsetMs(timeZone: string, utcMs: number): number {
  const parts = formatterFor(timeZone).formatToParts(new Date(utcMs));
  const value = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour') % 24,
    value('minute'),
    value('second'),
  );
  return asUtc - utcMs;
}

// Ubah jam dinding (wall clock) di zona `timeZone` menjadi epoch milidetik.
function wallClockToEpoch(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  // Dua langkah untuk zona yang punya DST.
  const first = guess - timezoneOffsetMs(timeZone, guess);
  return guess - timezoneOffsetMs(timeZone, first);
}

function readTimezone(sessionId: string): string {
  try {
    const raw = readFileSync(instanceConfigPath(sessionId), 'utf8');
    return normalizeTimezone((JSON.parse(raw) as { tz?: string } | null)?.tz);
  } catch {
    return normalizeTimezone(DEFAULT_LOG_TZ);
  }
}

interface ParsedTime {
  time: number;
  hasDate: boolean;
}

function parseLineTime(line: string, timeZone: string): ParsedTime | null {
  // Baris error diberi prefix "[ERR] " oleh LogTailer, dan timestamp aslinya
  // masih terbungkus ANSI. Bersihkan keduanya sebelum parsing.
  const cleaned = line.replace(/^\[ERR\]\s*/, '').replace(ANSI_PREFIX_RE, '');
  const match = LINE_TIME_RE.exec(cleaned);
  if (!match) return null;

  const [, year, month, day, hour, minute, second, millis] = match;
  const ms = millis ? Number(millis.padEnd(3, '0')) : 0;

  if (year && month && day) {
    const time = wallClockToEpoch(
      timeZone,
      Number(year),
      Number(month),
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      ms,
    );
    return Number.isNaN(time) ? null : { time, hasDate: true };
  }

  // Tanpa tanggal: tempel ke tanggal berjalan di zona waktu bot.
  const nowParts = formatterFor(timeZone).formatToParts(new Date());
  const value = (type: string): number => Number(nowParts.find((part) => part.type === type)?.value ?? 0);
  const time = wallClockToEpoch(
    timeZone,
    value('year'),
    value('month'),
    value('day'),
    Number(hour),
    Number(minute),
    Number(second),
    ms,
  );
  return Number.isNaN(time) ? null : { time, hasDate: false };
}

// File yang seluruhnya "HH:MM:SS" bisa berisi log kemarin; kalau baris terakhir
// tampak di masa depan, geser seluruh file ke hari sebelumnya.
function normalizeTimes(lines: string[], timeZone: string): Array<number | null> {
  const parsed = lines.map((line) => parseLineTime(line, timeZone));
  const onlyTime = parsed.length > 0 && parsed.every((item) => item === null || !item.hasDate);

  let times = parsed.map((item) => item?.time ?? null);

  if (onlyTime) {
    const last = [...times].reverse().find((time) => time !== null) ?? null;
    if (last !== null && last > Date.now() + 5 * 60_000) {
      times = times.map((time) => (time === null ? null : time - DAY_MS));
    }
  }

  // Pastikan urutan naik di dalam satu file (baris lewat tengah malam ditambah sehari).
  let previous: number | null = null;
  return times.map((time) => {
    if (time === null) return null;
    let value = time;
    while (previous !== null && value < previous - ROLLOVER_MS) value += DAY_MS;
    previous = Math.max(previous ?? value, value);
    return value;
  });
}

// PM2 hanya menempel timestamp di baris pertama tiap chunk; baris lanjutan mewarisi
// timestamp baris sebelumnya supaya tidak menumpuk di paling bawah.
function withInheritedTimes(
  lines: string[],
  timeZone: string,
): Array<{ line: string; time: number | null }> {
  const times = normalizeTimes(lines, timeZone);
  // Baris pembuka tanpa timestamp (chunk terpotong) ikut timestamp pertama yang ada.
  let current = times.find((time) => time !== null) ?? null;

  return lines.map((line, index) => {
    const time = times[index];
    if (time !== null) current = time;
    return { line, time: time ?? current };
  });
}

// Baris error lanjutan (stack trace/object dump) tidak punya timestamp. Dulu baris
// seperti ini dianggap "paling tua" dan ditempel di atas log biasa, sehingga error
// terlihat lepas dari konteksnya. Sekarang baris tanpa waktu memakai fallback:
// - history: mtime file error (kapan blok itu terakhir ditulis),
// - live: waktu polling saat ini.
export function mergeChronological(
  outLines: string[],
  errLines: string[],
  fallbackTime?: number | null,
  timeZone: string = DEFAULT_LOG_TZ,
): string[] {
  const tz = normalizeTimezone(timeZone);
  const tagged = [
    ...withInheritedTimes(outLines, tz).map((item, index) => ({ ...item, index })),
    ...withInheritedTimes(errLines, tz).map((item, index) => ({ ...item, index: outLines.length + index })),
  ];

  const newest = tagged.reduce((max, item) => (item.time !== null && item.time > max ? item.time : max), 0);
  const fallback = fallbackTime ?? (newest > 0 ? newest : Date.now());

  tagged.sort((a, b) => {
    const at = a.time ?? fallback;
    const bt = b.time ?? fallback;
    return at - bt || a.index - b.index;
  });

  return tagged.map((item) => item.line);
}

function lineHasTime(line: string, timeZone: string): boolean {
  return parseLineTime(line, timeZone) !== null;
}

// Index baris ber-timestamp terakhir sebelum `before`, atau -1 kalau tidak ada.
function lastHeaderIndex(lines: string[], before: number, timeZone: string): number {
  for (let i = Math.min(before, lines.length) - 1; i >= 0; i -= 1) {
    if (lineHasTime(lines[i], timeZone)) return i;
  }
  return -1;
}

// Dump error bisa ratusan baris. Simpan semua header error (pesan aslinya),
// tapi batasi baris lanjutan tiap dump supaya console tidak tenggelam di object
// internal. Dengan begitu error baru tidak ikut terbuang saat ada dump panjang.
function capErrorBlock(lines: string[], timeZone: string): string[] {
  const output: string[] = [];
  let kept = 0;
  let dropped = 0;

  const flushDropped = (): void => {
    if (dropped === 0) return;
    output.push(`\u001b[90m... (${dropped} baris dump dipotong)\u001b[39m`);
    dropped = 0;
  };

  for (const line of lines) {
    if (lineHasTime(line, timeZone)) {
      flushDropped();
      output.push(line);
      kept = 0;
      continue;
    }

    if (kept < ERROR_BLOCK_KEEP_LINES) {
      output.push(line);
      kept += 1;
    } else {
      dropped += 1;
    }
  }

  flushDropped();
  return output;
}

// Pembaca incremental: simpan offset byte + sisa baris yang belum lengkap, jadi hanya
// bytes baru yang dibaca tiap tick dan baris yang terpotong tidak dikirim separuh.
// Diekspor supaya bisa diuji langsung dengan file log asli.
export class LogTailer {
  private offset = 0;
  private rest = '';
  // inode file yang sedang dipantau, untuk mendeteksi file diganti (logrotate).
  private ino: number | null = null;

  constructor(
    private readonly file: string,
    private readonly prefix = '',
    timeZone: string = DEFAULT_LOG_TZ,
  ) {
    this.timezone = normalizeTimezone(timeZone);
  }

  private readonly timezone: string;

  private decorate(line: string): string {
    return this.prefix ? `${this.prefix}${line}` : line;
  }

  async history(
    count: number,
    options: { errorBlock?: boolean } = {},
  ): Promise<{ lines: string[]; fallbackTime: number | null }> {
    if (!existsSync(this.file)) return { lines: [], fallbackTime: null };

    const handle = await open(this.file, 'r');
    try {
      const stats = await handle.stat();
      const size = stats.size;
      const start = Math.max(0, size - TAIL_BYTES);

      // Posisi polling lanjut dari akhir file supaya baris lama tidak dikirim dua kali.
      this.offset = size;
      this.ino = stats.ino;

      const readRange = async (from: number): Promise<string[]> => {
        const length = size - from;
        const buffer = Buffer.alloc(length);
        if (length > 0) await handle.read(buffer, 0, length, from);

        const parts = buffer.toString('utf8').split('\n');
        // Baris pertama bisa terpotong kalau `from` bukan di awal baris.
        if (from > 0) parts.shift();
        return parts.filter((line) => line.length > 0);
      };

      let lines = await readRange(start);

      if (options.errorBlock) {
        const tail = lines.slice(-count);

        // Kalau potongan terakhir mulai di tengah dump (baris pertama tanpa
        // timestamp), mundur ke header error supaya pesan aslinya ikut tampil.
        if (tail.length > 0 && !lineHasTime(tail[0], this.timezone)) {
          let header = lastHeaderIndex(lines, lines.length - tail.length, this.timezone);

          if (header === -1 && start > 0) {
            // Window 64KB masih mulai di tengah dump; baca lebih jauh ke belakang.
            const widerStart = Math.max(0, start - HEADER_LOOKBACK_BYTES);
            const wider = await readRange(widerStart);
            header = lastHeaderIndex(wider, wider.length - tail.length, this.timezone);
            if (header !== -1) lines = wider;
          }

          lines = header !== -1 ? lines.slice(header) : tail;
        } else {
          lines = tail;
        }

        lines = capErrorBlock(lines, this.timezone)
      } else {
        lines = lines.slice(-count);
      }

      return {
        lines: lines.map((line) => this.decorate(line)),
        fallbackTime: stats.mtimeMs,
      };
    } finally {
      await handle.close();
    }
  }

  async readNew(): Promise<string[]> {
    if (!existsSync(this.file)) return [];

    const handle = await open(this.file, 'r');
    try {
      const stats = await handle.stat();
      const size = stats.size;

      // File diganti (logrotate: inode baru walau ukurannya bisa lebih besar) atau
      // dikosongkan (pm2 flush): mulai dari awal supaya baris baru tidak terlewat.
      if ((this.ino !== null && stats.ino !== this.ino) || size < this.offset) {
        this.offset = 0;
        this.rest = '';
      }
      this.ino = stats.ino;

      if (size === this.offset) return [];

      const length = size - this.offset;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, this.offset);
      this.offset = size;

      const parts = (this.rest + buffer.toString('utf8')).split('\n');
      // Simpan sisa baris terakhir yang belum lengkap untuk tick berikutnya.
      this.rest = parts.pop() ?? '';

      return parts.filter((line) => line.length > 0).map((line) => this.decorate(line));
    } finally {
      await handle.close();
    }
  }
}

// PM2 bisa jalan dengan user / PM2_HOME berbeda dari proses platform, jadi tebakan di
// paths.ts hanya dipakai kalau PM2 tidak melaporkan path log-nya.
async function resolveLogPaths(sessionId: string): Promise<{ out: string; err: string }> {
  const fallback = { out: instanceLogPath(sessionId), err: instanceErrorLogPath(sessionId) };

  try {
    const paths = await getSessionLogPaths(sessionId);
    return { out: paths.out ?? fallback.out, err: paths.err ?? fallback.err };
  } catch {
    return fallback;
  }
}

export default async function logServer(app: FastifyInstance): Promise<void> {
  app.get('/api/ws/logs/:sessionId', { websocket: true }, (connection: SocketStream, request) => {
    const socket = connection.socket;
    const { sessionId } = request.params as { sessionId: string };
    const token = (request.query as { token?: string } | undefined)?.token;

    const send = (message: LogMessage): void => {
      if (socket.readyState !== SOCKET_OPEN) return;
      socket.send(JSON.stringify(message));
    };

    let payload: JWTPayload;
    try {
      // WS tidak bisa kirim header Authorization dari browser, jadi token lewat query.
      if (!token) throw new Error('token kosong');
      payload = app.jwt.verify<JWTPayload>(token);
    } catch {
      socket.close(POLICY_VIOLATION, 'unauthorized');
      return;
    }

    let stopped = false;
    let busy = false;
    let timer: NodeJS.Timeout | null = null;
    let upstream: WebSocket | null = null;

    const stop = (): void => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (upstream) {
        try {
          upstream.close();
        } catch {
          // upstream mungkin sudah tertutup
        }
        upstream = null;
      }
    };

    socket.on('close', stop);
    socket.on('error', stop);

    // Mode 'other': log ada di mesin Bot Runner, jadi cukup diteruskan apa adanya.
    const proxyRemote = (): void => {
      try {
        upstream = new WebSocket(botRunnerLogsUrl(sessionId));
      } catch (err) {
        request.log.error(err);
        socket.close(POLICY_VIOLATION, 'bot runner unavailable');
        return;
      }

      upstream.on('message', (raw: RawData) => {
        if (socket.readyState === SOCKET_OPEN) socket.send(raw.toString());
      });

      upstream.on('error', (err: Error) => {
        request.log.error(err);
        socket.close(POLICY_VIOLATION, 'bot runner error');
      });

      upstream.on('close', () => {
        if (stopped) return;
        socket.close(1000, 'log stream closed');
      });
    };

    void (async () => {
      const session = await getSession(payload.userId, sessionId);
      if (stopped) return;

      if (!session) {
        socket.close(POLICY_VIOLATION, 'session not found');
        return;
      }

      if (isRemoteMode()) {
        proxyRemote();
        return;
      }

      const logPaths = await resolveLogPaths(sessionId);
      request.log.info(
        { sessionId, out: logPaths.out, err: logPaths.err, outExists: existsSync(logPaths.out) },
        'log stream start',
      );

      // out.log dan error.log dipantau bersamaan; baris error diberi prefix [ERR].
      // Jam log mengikuti TZ instance bot, bukan TZ proses platform.
      const timezone = readTimezone(sessionId);
      const out = new LogTailer(logPaths.out, '', timezone);
      const err = new LogTailer(logPaths.err, '[ERR] ', timezone);

      const outHistory = await out.history(TAIL_LINES);
      const errHistory = await err.history(TAIL_LINES, { errorBlock: true });
      const history = mergeChronological(
        outHistory.lines,
        errHistory.lines,
        errHistory.fallbackTime ?? outHistory.fallbackTime,
        timezone,
      );
      send({ type: 'history', lines: history });

      timer = setInterval(() => {
        void (async () => {
          if (stopped || busy) return;
          busy = true;

          try {
            const lines = mergeChronological(
              await out.readNew(),
              await err.readNew(),
              Date.now(),
              timezone,
            );
            for (const line of lines) send({ type: 'line', data: line });
          } catch (error) {
            // Detail error hanya ke log server; klien tidak perlu tahu isi exception.
            request.log.error(error);
          } finally {
            busy = false;
          }
        })();
      }, POLL_MS);
    })();
  });
}
