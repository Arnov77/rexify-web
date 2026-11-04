import type { FastifyInstance } from 'fastify';
import {
  addAutoReplyRule,
  defaultConfigFor,
  getConfig,
  removeAutoReplyRule,
  updateConfig,
} from '../config/bot-config';
import { syncInstanceConfig } from '../config/generator';
import { getSession } from '../session/store';
import type { BotConfig } from '../types/config';

interface SessionParams {
  sessionId: string;
}

interface RuleParams extends SessionParams {
  ruleId: string;
}

async function loadConfig(sessionId: string): Promise<BotConfig> {
  return (await getConfig(sessionId)) ?? defaultConfigFor(sessionId);
}

export default async function configRoutes(app: FastifyInstance): Promise<void> {
  // Semua endpoint di bawah memakai session milik user yang login; session orang lain dianggap tidak ada.
  app.addHook('preHandler', async (request, reply) => {
    const { sessionId } = (request.params ?? {}) as SessionParams;
    if (!sessionId) return;

    const session = await getSession(request.user.id, sessionId);
    if (!session) {
      return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: 'Session tidak ditemukan' });
    }
  });

  app.get('/api/sessions/:sessionId/config', async (request) => {
    const { sessionId } = request.params as SessionParams;
    return { config: await loadConfig(sessionId) };
  });

  app.patch('/api/sessions/:sessionId/config', async (request) => {
    const { sessionId } = request.params as SessionParams;
    const body = (request.body ?? {}) as Record<string, unknown>;

    const config = await updateConfig(sessionId, {
      autoReply: body.autoReply,
      welcomeMsg: body.welcomeMsg,
      pluginsEnabled: body.pluginsEnabled,
      customSettings: body.customSettings,
    });

    await syncInstanceConfig(sessionId);
    return { config };
  });

  app.post('/api/sessions/:sessionId/config/auto-reply', async (request, reply) => {
    const { sessionId } = request.params as SessionParams;
    const { rule, config } = await addAutoReplyRule(sessionId, request.body ?? {});

    await syncInstanceConfig(sessionId);
    return reply.code(201).send({ rule, config });
  });

  app.delete('/api/sessions/:sessionId/config/auto-reply/:ruleId', async (request, reply) => {
    const { sessionId, ruleId } = request.params as RuleParams;
    const { removed, config } = await removeAutoReplyRule(sessionId, ruleId);

    if (!removed) {
      return reply.code(404).send({ error: 'AUTO_REPLY_NOT_FOUND', message: 'Rule tidak ditemukan' });
    }

    await syncInstanceConfig(sessionId);
    return reply.code(200).send({ config });
  });
}