import { timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { authMiddleware } from './auth/middleware';
import loginRoutes from './auth/login';
import billingRoutes from './billing/routes';
import registerRoutes from './auth/register';
import verifyRoutes from './auth/verify';
import { isAccessActive, sessionQuotaFor } from './config/plans';
import {
  CatalogRefreshUnavailableError,
  refreshCatalogForOps,
  refreshCatalogIfStale,
} from './config/catalog-refresh';
import configRoutes from './config/routes';
import { ValidationError } from './config/validator';
import { closePool } from './db';
import { SessionQuotaExceededError } from './session/pm2-manager';
import { restoreActiveSessions } from './session/restore';
import sessionRoutes from './session/routes';
import logServer from './ws/log-server';
import qrServer from './ws/qr-server';

const PORT = Number(process.env.PORT ?? 3000);
const MIN_JWT_SECRET_LENGTH = 32;

async function main(): Promise<void> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET wajib di-set, minimal ${MIN_JWT_SECRET_LENGTH} karakter`);
  }

  const app = Fastify({ logger: true });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ValidationError) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: error.message });
    }
    if (error instanceof SessionQuotaExceededError) {
      return reply.code(403).send({ error: 'SESSION_QUOTA_EXCEEDED', message: error.message });
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode < 500) {
      return reply.code(statusCode).send({ error: 'BAD_REQUEST', message: error.message });
    }

    request.log.error(error);
    return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Terjadi kesalahan di server' });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      error: 'NOT_FOUND',
      message: `Route ${request.method} ${request.url} tidak ditemukan`,
    });
  });

  await app.register(jwt, { secret: jwtSecret });
  await app.register(websocket);

  await app.register(registerRoutes);
  await app.register(loginRoutes);
  // send-otp (verify/email terverifikasi boleh belum verified) dan reset-password publik;
  // endpoint verify tetap memvalidasi JWT sendiri di dalam handler.
  await app.register(verifyRoutes);
  // Webhook Midtrans harus publik; endpoint charge/status/riwayat memasang authMiddleware
  // sendiri di dalam plugin ini.
  await app.register(billingRoutes);

  // Ops-only: refresh katalog tanpa restart, header `x-catalog-token` = env CATALOG_REFRESH_TOKEN.
  // Mode 'other' = generate di Bot Runner; mode 'same' = jalankan generator lokal.
  app.post('/api/ops/catalog/refresh', async (request, reply) => {
    const expected = process.env.CATALOG_REFRESH_TOKEN ?? '';
    if (!expected) {
      return reply.code(503).send({
        error: 'OPS_TOKEN_NOT_CONFIGURED',
        message: 'CATALOG_REFRESH_TOKEN belum di-set',
      });
    }

    const provided = String(request.headers['x-catalog-token'] ?? '');
    const given = Buffer.from(provided);
    const wanted = Buffer.from(expected);
    const authorized = given.length === wanted.length && timingSafeEqual(given, wanted);
    if (!authorized) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Token ops tidak valid' });
    }

    try {
      const catalog = await refreshCatalogForOps();
      return { ok: true, total: catalog.total, generatedAt: catalog.generatedAt };
    } catch (err) {
      if (err instanceof CatalogRefreshUnavailableError) {
        return reply.code(503).send({ error: err.code, message: err.message });
      }
      request.log.error(err);
      return reply
        .code(500)
        .send({ error: 'CATALOG_REFRESH_FAILED', message: 'Gagal membuat ulang katalog' });
    }
  });

  await app.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);
    instance.register(sessionRoutes);
    instance.register(configRoutes);

    instance.get('/api/me', async (request) => ({
      user: { ...request.user, active: isAccessActive(request.user) },
      limits: { sessions: sessionQuotaFor(request.user.plan) },
    }));
  });

  await app.register(qrServer);
  await app.register(logServer);

  await restoreActiveSessions();
  // Plugin core bisa berubah (deploy/update) tanpa katalog ikut di-generate; jalankan
  // sekali saat boot dan biarkan selesai di belakang layar.
  void refreshCatalogIfStale();
  await app.listen({ port: PORT, host: '0.0.0.0' });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`menerima ${signal}, menutup server`);
    await app.close();
    await closePool().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
