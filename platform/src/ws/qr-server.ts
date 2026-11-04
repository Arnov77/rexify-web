import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import QRCode from 'qrcode';
import { instanceQrPath } from '../paths';
import { getSession, syncStatus } from '../session/store';
import type { JWTPayload } from '../types/auth';

const POLL_INTERVAL_MS = 2000;
// ws: 1 = OPEN, tapi `ws` hanya expose konstanta ini sebagai static, bukan di instance.
const SOCKET_OPEN = 1;
const POLICY_VIOLATION = 1008;

type WsMessage =
  | { type: 'qr'; data: string }
  | { type: 'pairing'; data: string }
  | { type: 'connected' }
  | { type: 'error'; message: string };

// Bot menulis pairing code ke file sebelah qr.txt (lihat core/main.js requestPairing).
function instancePairingPath(sessionId: string): string {
  return instanceQrPath(sessionId).replace(/qr\.txt$/, 'pairing.txt');
}

// Bot menulis connected.txt saat connection === 'open'. Di mode pairing qr.txt tidak pernah
// dibuat (jadi tidak pernah dihapus), maka file ini yang jadi sinyal connect ke platform.
function instanceConnectedPath(sessionId: string): string {
  return instanceQrPath(sessionId).replace(/qr\.txt$/, 'connected.txt');
}

async function readTextFile(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;

  const raw = await readFile(path, 'utf8');
  const text = raw.trim();
  return text.length > 0 ? text : null;
}

async function readQr(sessionId: string): Promise<string | null> {
  return readTextFile(instanceQrPath(sessionId));
}

async function readPairing(sessionId: string): Promise<string | null> {
  return readTextFile(instancePairingPath(sessionId));
}

export default async function qrServer(app: FastifyInstance): Promise<void> {
  app.get('/api/ws/qr/:sessionId', { websocket: true }, (connection: SocketStream, request) => {
    const socket = connection.socket;
    const { sessionId } = request.params as { sessionId: string };
    const token = (request.query as { token?: string } | undefined)?.token;

    const send = (message: WsMessage): void => {
      if (socket.readyState !== SOCKET_OPEN) return;
      socket.send(JSON.stringify(message));
    };

    let payload: JWTPayload;
    try {
      if (!token) throw new Error('token kosong');
      payload = app.jwt.verify<JWTPayload>(token);
    } catch {
      send({ type: 'error', message: 'Token tidak valid atau kadaluarsa' });
      socket.close(POLICY_VIOLATION, 'unauthorized');
      return;
    }

    let stopped = false;
    let busy = false;
    let lastQr: string | null = null;
    let lastPairing: string | null = null;
    let timer: NodeJS.Timeout | null = null;

    const stop = (): void => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const finishConnected = (): void => {
      send({ type: 'connected' });
      stop();
      socket.close(1000, 'connected');
    };

    const tick = async (): Promise<void> => {
      if (stopped || busy) return;
      busy = true;

      try {
        // Status DB dicek tiap tick (2 detik) supaya session yang dihapus atau sudah
        // active dari luar langsung menghentikan polling.
        const current = await getSession(payload.userId, sessionId);
        if (!current) {
          send({ type: 'error', message: 'Session tidak ditemukan' });
          stop();
          socket.close(POLICY_VIOLATION, 'session not found');
          return;
        }
        if (current.status === 'active') {
          finishConnected();
          return;
        }

        // Cek paling awal: begitu bot terhubung, hentikan polling tanpa menunggu qr.txt hilang.
        if (existsSync(instanceConnectedPath(sessionId))) {
          await syncStatus(sessionId, 'active');
          finishConnected();
          return;
        }

        const qr = await readQr(sessionId);
        const pairing = await readPairing(sessionId);

        if (!qr && lastQr !== null) {
          // Bot menghapus qr.txt setelah pairing berhasil (SPEC § WebSocket — QR Streaming).
          await syncStatus(sessionId, 'active');
          finishConnected();
          return;
        }

        if (qr && qr !== lastQr) {
          lastQr = qr;
          send({ type: 'qr', data: await QRCode.toDataURL(qr) });
        }

        // pairing.txt tidak dihapus di sini: bot yang membersihkannya setelah connect.
        // Dedupe sama seperti QR supaya kode yang sama tidak dikirim tiap tick.
        if (pairing && pairing !== lastPairing) {
          lastPairing = pairing;
          send({ type: 'pairing', data: pairing });
        }
      } catch (err) {
        // Detail error hanya ke log; klien cukup tahu QR gagal diproses.
        request.log.error(err);
        send({ type: 'error', message: 'Gagal memproses QR' });
      } finally {
        busy = false;
      }
    };

    socket.on('close', stop);
    socket.on('error', stop);

    void (async () => {
      const session = await getSession(payload.userId, sessionId);
      if (stopped) return;

      if (!session) {
        send({ type: 'error', message: 'Session tidak ditemukan' });
        socket.close(POLICY_VIOLATION, 'session not found');
        stop();
        return;
      }

      await tick();
      if (stopped) return;

      timer = setInterval(() => {
        void tick();
      }, POLL_INTERVAL_MS);
    })();
  });
}