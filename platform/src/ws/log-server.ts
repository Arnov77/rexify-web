// Streaming log bot realtime ke frontend via WebSocket.
// Same mode: baca file log PM2 langsung dari disk.
// Other mode: proxy WS ke Bot Runner.

import { existsSync } from 'node:fs';
import { open } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import WebSocket, { type RawData } from 'ws';
import { instanceErrorLogPath, instanceLogPath } from '../paths';
import { botRunnerLogsUrl } from '../session/bot-runner-client';
import { isRemoteMode } from '../session/pm2-manager';
import { getSession } from '../session/store';
import type { JWTPayload } from '../types/auth';

const POLL_MS = 1000;
// Kirim 100 baris terakhir saat pertama connect.
const TAIL_LINES = 100;
// Batas baca awal supaya file log raksasa tidak dibaca utuh.
const TAIL_BYTES = 64 * 1024;
// ws: 1 = OPEN, tapi `ws` hanya expose konstanta ini sebagai static.
const SOCKET_OPEN = 1;
const POLICY_VIOLATION = 1008;

type LogMessage =
  | { type: 'history'; lines: string[] }
  | { type: 'line'; data: string };

// Pembaca incremental: simpan offset byte + sisa baris yang belum lengkap, jadi hanya
// bytes baru yang dibaca tiap tick dan baris yang terpotong tidak dikirim separuh.
class LogTailer {
  private offset = 0;
  private rest = '';

  constructor(
    private readonly file: string,
    private readonly prefix = '',
  ) {}

  private decorate(line: string): string {
    return this.prefix ? `${this.prefix}${line}` : line;
  }

  async history(count: number): Promise<string[]> {
    if (!existsSync(this.file)) return [];

    const handle = await open(this.file, 'r');
    try {
      const { size } = await handle.stat();
      const start = Math.max(0, size - TAIL_BYTES);
      const length = size - start;
      const buffer = Buffer.alloc(length);
      if (length > 0) await handle.read(buffer, 0, length, start);

      // Posisi polling lanjut dari akhir file supaya baris lama tidak dikirim dua kali.
      this.offset = size;

      const lines = buffer.toString('utf8').split('\n');
      // Baris pertama bisa terpotong kalau start bukan di awal baris.
      if (start > 0) lines.shift();

      return lines
        .filter((line) => line.length > 0)
        .slice(-count)
        .map((line) => this.decorate(line));
    } finally {
      await handle.close();
    }
  }

  async readNew(): Promise<string[]> {
    if (!existsSync(this.file)) return [];

    const handle = await open(this.file, 'r');
    try {
      const { size } = await handle.stat();

      // File dirotasi / dikosongkan (pm2 flush): mulai lagi dari awal.
      if (size < this.offset) {
        this.offset = 0;
        this.rest = '';
      }
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

      // out.log dan error.log dipantau bersamaan; baris error diberi prefix [ERR].
      const out = new LogTailer(instanceLogPath(sessionId));
      const err = new LogTailer(instanceErrorLogPath(sessionId), '[ERR] ');

      const history = [...(await out.history(TAIL_LINES)), ...(await err.history(TAIL_LINES))];
      send({ type: 'history', lines: history });

      timer = setInterval(() => {
        void (async () => {
          if (stopped || busy) return;
          busy = true;

          try {
            const lines = [...(await out.readNew()), ...(await err.readNew())];
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
