import type { FastifyInstance } from 'fastify';
import { invalidateCache } from '../config/bot-config';
import { destroySession, getSessionStatus, spawnSession, stopSession } from './pm2-manager';
import { createSession, deleteSession, getSession, listPluginLogs, listSessions } from './store';

const DEFAULT_LOG_LIMIT = 50;
const MAX_LOG_LIMIT = 200;

interface ListQuery {
  limit?: unknown;
  offset?: unknown;
}

interface CreateBody {
  label?: unknown;
}

interface SessionParams {
  sessionId: string;
}

function parseLabel(body: CreateBody): { ok: true; label: string | null } | { ok: false } {
  if (body.label === undefined || body.label === null) return { ok: true, label: null };
  if (typeof body.label !== 'string') return { ok: false };
  const trimmed = body.label.trim();
  return { ok: true, label: trimmed.length > 0 ? trimmed : null };
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

export default async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/sessions', async (request, reply) => {
    const parsed = parseLabel((request.body ?? {}) as CreateBody);
    if (!parsed.ok) {
      return reply.code(400).send({ error: 'INVALID_LABEL', message: 'Label harus berupa teks' });
    }

    const session = await createSession(request.user.id, parsed.label);
    return reply.code(201).send({ session });
  });

  app.get('/api/sessions', async (request) => {
    return { sessions: await listSessions(request.user.id) };
  });

  app.get('/api/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as SessionParams;
    const session = await getSession(request.user.id, sessionId);

    if (!session) {
      return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: 'Session tidak ditemukan' });
    }

    return reply.code(200).send({ session, pm2: await getSessionStatus(sessionId) });
  });

  app.post('/api/sessions/:sessionId/connect', async (request, reply) => {
    const { sessionId } = request.params as SessionParams;
    const session = await getSession(request.user.id, sessionId);

    if (!session) {
      return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: 'Session tidak ditemukan' });
    }

    await spawnSession(request.user.id, sessionId);

    return reply.code(200).send({
      session: await getSession(request.user.id, sessionId),
      pm2: await getSessionStatus(sessionId),
    });
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
