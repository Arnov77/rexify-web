import type { FastifyInstance } from 'fastify';
import { invalidateCache, createDefaultConfig } from '../config/bot-config';
import { applyConfigToBot } from '../config/generator';
import type { ConnectMode, SessionRow } from '../types/session';
import {
  destroySession,
  getSessionRuntime,
  getSessionStatus,
  hasSessionCredentials,
  removeSessionCredentials,
  restartSession,
  spawnSession,
  stopSession,
} from './pm2-manager';
import {
  clearConnectedPhone,
  createSession,
  deleteSession,
  getSession,
  listPluginLogs,
  listSessions,
  syncStatus,
  updatePhoneInput,
} from './store';

const DEFAULT_LOG_LIMIT = 50;
const MAX_LOG_LIMIT = 200;

interface ListQuery {
  limit?: unknown;
  offset?: unknown;
}

interface CreateBody {
  label?: unknown;
  phone_number?: unknown;
  connect_mode?: unknown;
}

const PHONE_RE = /^\d{10,15}$/;
const CONNECT_MODES = ['qr', 'pairing'] as const;

interface SessionParams {
  sessionId: string;
}

function parseLabel(body: CreateBody): { ok: true; label: string | null } | { ok: false } {
  if (body.label === undefined || body.label === null) return { ok: true, label: null };
  if (typeof body.label !== 'string') return { ok: false };
  const trimmed = body.label.trim();
  return { ok: true, label: trimmed.length > 0 ? trimmed : null };
}

// Bot hanya bisa request pairing code dengan format internasional tanpa '+', jadi nomor
// gaya lokal (0812..., 812..., +62 812...) dinormalisasi ke 62812... sebelum disimpan.
function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  let digits = raw.replace(/[^0-9]/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith('8')) digits = `62${digits}`;

  return PHONE_RE.test(digits) ? digits : null;
}

function parseConnectMode(raw: unknown): ConnectMode | null {
  if (raw === undefined || raw === null) return 'qr';
  if (typeof raw !== 'string') return null;
  return (CONNECT_MODES as readonly string[]).includes(raw) ? (raw as ConnectMode) : null;
}

function parsePaging(query: ListQuery): { limit: number; offset: number } {
  const limitRaw = Number(query.limit);
  const offsetRaw = Number(query.offset);

  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), MAX_LOG_LIMIT)
      : DEFAULT_LOG_LIMIT;
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

  return { limit, offset };
}

// Bot dianggap hidup kalau prosesnya masih connecting/qr_pending/active.
function isBotRunning(status: string): boolean {
  return status === 'active' || status === 'connecting' || status === 'qr_pending';
}

// Status di DB hanya diperbarui saat modal QR terbuka. Kalau bot connect setelah itu
// (reconnect otomatis, restart 515 setelah pairing), DB bisa tertinggal di 'connecting'.
// Karena itu status diselaraskan dari keadaan asli proses + connected.txt setiap dibaca.
async function reconcileStatus(sessions: SessionRow[]): Promise<SessionRow[]> {
  return Promise.all(
    sessions.map(async (session) => {
      if (session.status === 'banned') return session;

      try {
        const runtime = await getSessionRuntime(session.id);

        // Proses bot tidak ada (mis. mati / dibersihkan manual).
        if (!runtime.status) {
          if (session.status !== 'disconnected') {
            await syncStatus(session.id, 'disconnected');
            return { ...session, status: 'disconnected' as const };
          }
          return session;
        }

        // Proses hidup dan WhatsApp benar-benar terhubung.
        if (runtime.connected) {
          if (session.status !== 'active') {
            await syncStatus(session.id, 'active', runtime.phone);
            return { ...session, status: 'active' as const, phone_number: runtime.phone ?? session.phone_number };
          }

          // Nomor tersimpan telat (mis. bot connect sebelum kolom ini terisi).
          if (!session.phone_number && runtime.phone) {
            await syncStatus(session.id, 'active', runtime.phone);
            return { ...session, phone_number: runtime.phone };
          }
        }
      } catch {
        // Bot Runner / PM2 tidak terjangkau: tampilkan status DB apa adanya.
      }

      return session;
    }),
  );
}

export default async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/sessions', async (request, reply) => {
    const body = (request.body ?? {}) as CreateBody;

    const parsedLabel = parseLabel(body);
    if (!parsedLabel.ok) {
      return reply.code(400).send({ error: 'INVALID_LABEL', message: 'Label harus berupa teks' });
    }

    const phoneNumber = normalizePhone(body.phone_number);
    if (!phoneNumber) {
      return reply.code(400).send({
        error: 'INVALID_PHONE_NUMBER',
        message: 'Nomor WhatsApp wajib diisi, minimal 10 digit angka (boleh diawali +)',
      });
    }

    const connectMode = parseConnectMode(body.connect_mode);
    if (!connectMode) {
      return reply
        .code(400)
        .send({ error: 'INVALID_CONNECT_MODE', message: "connect_mode hanya boleh 'qr' atau 'pairing'" });
    }

    const session = await createSession(request.user.id, parsedLabel.label, phoneNumber, connectMode);
    await createDefaultConfig(session.id, parsedLabel.label ?? undefined);
    return reply.code(201).send({ session });
  });

  app.get('/api/sessions', async (request) => {
    const sessions = await listSessions(request.user.id);
    return { sessions: await reconcileStatus(sessions) };
  });

  app.get('/api/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as SessionParams;
    const found = await getSession(request.user.id, sessionId);

    if (!found) {
      return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: 'Session tidak ditemukan' });
    }

    const [session] = await reconcileStatus([found]);
    // has_credentials = sessions/auth.db sudah ada → reconnect tidak perlu QR/pairing.
    const hasCredentials = await hasSessionCredentials(sessionId);

    return reply.code(200).send({
      session: { ...session, has_credentials: hasCredentials },
      pm2: await getSessionStatus(sessionId),
    });
  });

  app.post('/api/sessions/:sessionId/connect', async (request, reply) => {
    const { sessionId } = request.params as SessionParams;
    const session = await getSession(request.user.id, sessionId);

    if (!session) {
      return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: 'Session tidak ditemukan' });
    }

    await spawnSession(request.user.id, sessionId);

    const spawned = await getSession(request.user.id, sessionId);
    // Frontend memakai flag ini untuk memutuskan: buka modal QR atau langsung tunggu connect.
    const hasCredentials = await hasSessionCredentials(sessionId);

    return reply.code(200).send({
      session: spawned ? { ...spawned, has_credentials: hasCredentials } : null,
      pm2: await getSessionStatus(sessionId),
    });
  });

  app.post('/api/sessions/:sessionId/restart', async (request, reply) => {
    const { sessionId } = request.params as SessionParams;
    const session = await getSession(request.user.id, sessionId);

    if (!session) {
      return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: 'Session tidak ditemukan' });
    }

    // Restart hanya masuk akal untuk bot yang sedang jalan.
    if (session.status !== 'active') {
      return reply
        .code(400)
        .send({ error: 'SESSION_NOT_RUNNING', message: 'Bot tidak sedang berjalan' });
    }

    await restartSession(sessionId);

    return reply.code(200).send({ ok: true });
  });

  app.get('/api/sessions/:sessionId/logs', async (request, reply) => {
    const { sessionId } = request.params as SessionParams;
    const session = await getSession(request.user.id, sessionId);

    if (!session) {
      return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: 'Session tidak ditemukan' });
    }

    const { limit, offset } = parsePaging((request.query ?? {}) as ListQuery);

    return reply.code(200).send({
      logs: await listPluginLogs(sessionId, limit, offset),
      limit,
      offset,
    });
  });

  app.post('/api/sessions/:sessionId/disconnect', async (request, reply) => {
    const { sessionId } = request.params as SessionParams;
    const session = await getSession(request.user.id, sessionId);

    if (!session) {
      return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: 'Session tidak ditemukan' });
    }

    await stopSession(sessionId);

    return reply.code(200).send({
      session: await getSession(request.user.id, sessionId),
      pm2: await getSessionStatus(sessionId),
    });
  });

  // Hapus credentials Baileys: bot harus pairing/QR lagi, nomor input tetap dipakai.
  app.delete('/api/sessions/:sessionId/credentials', async (request, reply) => {
    const { sessionId } = request.params as SessionParams;
    const session = await getSession(request.user.id, sessionId);

    if (!session) {
      return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: 'Session tidak ditemukan' });
    }

    // Bot harus berhenti dulu: file auth SQLite tidak boleh dihapus saat masih dipakai.
    if (isBotRunning(session.status)) {
      await stopSession(sessionId);
    }

    await removeSessionCredentials(sessionId);
    await clearConnectedPhone(sessionId);

    return reply.code(200).send({ ok: true });
  });

  // Ganti nomor bot: credentials lama dibuang (nomor beda = auth beda), nomor input diganti.
  app.patch('/api/sessions/:sessionId/phone', async (request, reply) => {
    const { sessionId } = request.params as SessionParams;
    const session = await getSession(request.user.id, sessionId);

    if (!session) {
      return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: 'Session tidak ditemukan' });
    }

    const body = (request.body ?? {}) as { phone_number?: unknown };
    const phone = normalizePhone(body.phone_number);
    if (!phone) {
      return reply.code(400).send({
        error: 'INVALID_PHONE_NUMBER',
        message: 'Nomor WhatsApp tidak valid, minimal 10 digit',
      });
    }

    if (isBotRunning(session.status)) {
      await stopSession(sessionId);
    }

    await removeSessionCredentials(sessionId);
    await updatePhoneInput(sessionId, phone);
    // config.json memakai phone_number_input (lihat generator.ts), jadi perlu ditulis ulang.
    await applyConfigToBot(sessionId);

    return reply.code(200).send({ ok: true });
  });

  app.delete('/api/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as SessionParams;
    const session = await getSession(request.user.id, sessionId);

    if (!session) {
      return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: 'Session tidak ditemukan' });
    }

    await destroySession(sessionId);
    await deleteSession(request.user.id, sessionId);
    invalidateCache(sessionId);

    return reply.code(200).send({ deleted: true });
  });
}
