import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import QRCode from 'qrcode';
import WebSocket, { type RawData } from 'ws';
import { instanceConnectedPath, instancePhonePath, instanceQrPath } from '../paths';
import { botRunnerStreamUrl } from '../session/bot-runner-client';
import { isRemoteMode } from '../session/pm2-manager';
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
// Path-nya dipakai bersama session/routes.ts (reconcile status) lewat paths.ts.

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

// Nomor WhatsApp asli yang ditulis bot saat connection === 'open'.
async function readPhone(sessionId: string): Promise<string | null> {
  return readTextFile(instancePhonePath(sessionId));
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

    // Mode 'other': file qr/pairing/connected ada di mesin Bot Runner, jadi platform cuma
    // meneruskan (proxy) WebSocket-nya ke frontend, plus konversi QR mentah ke PNG data URL.
    const proxyRemote = (): void => {
      let remote: WebSocket | null = null;
      let remoteStopped = false;

      const stopRemote = (): void => {
        if (remoteStopped) return;
        remoteStopped = true;
        if (
          remote &&
          (remote.readyState === WebSocket.OPEN || remote.readyState === WebSocket.CONNECTING)
        ) {
          remote.close();
        }
        remote = null;
      };

      socket.on('close', stopRemote);
      socket.on('error', stopRemote);

      try {
        remote = new WebSocket(botRunnerStreamUrl(sessionId));
      } catch (err) {
        request.log.error(err);
        send({ type: 'error', message: 'Gagal terhubung ke Bot Runner' });
        socket.close(POLICY_VIOLATION, 'bot runner unavailable');
        return;
      }

      remote.on('message', (raw: RawData) => {
        void (async () => {
          try {
            const message = JSON.parse(raw.toString()) as WsMessage;

            if (message.type === 'qr') {
              send({ type: 'qr', data: await QRCode.toDataURL(message.data) });
              return;
            }

            if (message.type === 'connected') {
              await syncStatus(sessionId, 'active', await readPhone(sessionId));
              send({ type: 'connected' });
              stopRemote();
              socket.close(1000, 'connected');
              return;
            }

            send(message);
          } catch (err) {
            request.log.error(err);
            send({ type: 'error', message: 'Gagal memproses pesan Bot Runner' });
          }
        })();
      });

      remote.on('error', (err: Error) => {
        request.log.error(err);
        send({ type: 'error', message: 'Koneksi ke Bot Runner gagal' });
      });

      remote.on('close', () => {
        // Penutupan yang kita sendiri picu (connected) tidak perlu dilaporkan sebagai error.
        if (remoteStopped) return;
        send({ type: 'error', message: 'Koneksi ke Bot Runner terputus' });
        stopRemote();
        socket.close(POLICY_VIOLATION, 'bot runner disconnected');
      });
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
          await syncStatus(sessionId, 'active', await readPhone(sessionId));
          finishConnected();
          return;
        }

        const qr = await readQr(sessionId);
        const pairing = await readPairing(sessionId);

        if (!qr && lastQr !== null) {
          // Bot menghapus qr.txt setelah pairing berhasil (SPEC § WebSocket — QR Streaming).
          await syncStatus(sessionId, 'active', await readPhone(sessionId));
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

      if (isRemoteMode()) {
        proxyRemote();
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