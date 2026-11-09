import type { FastifyInstance } from 'fastify';
import { pool } from '../db';
import { PLAN_LIMITS } from '../config/plans';
import type { UserRow } from '../types/auth';
import { hashPassword } from './password';
import { JWT_EXPIRES_IN } from './token';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
// bcrypt memotong input di 72 byte; batasi supaya tidak ada karakter yang diam-diam dibuang.
const MAX_PASSWORD_LENGTH = 72;

// Override rate limit global (100/menit): cegah pembuatan akun massal.
const RATE_LIMIT_AUTH = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

interface RegisterBody {
  email?: unknown;
  password?: unknown;
}

export default async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/register', RATE_LIMIT_AUTH, async (request, reply) => {
    const body = (request.body ?? {}) as RegisterBody;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!EMAIL_RE.test(email)) {
      return reply.code(400).send({
        error: 'INVALID_EMAIL',
        message: 'Format email tidak valid',
      });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return reply.code(400).send({
        error: 'INVALID_PASSWORD',
        message: `Password minimal ${MIN_PASSWORD_LENGTH} karakter`,
      });
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      return reply.code(400).send({
        error: 'INVALID_PASSWORD',
        message: `Password maksimal ${MAX_PASSWORD_LENGTH} karakter`,
      });
    }

    const passwordHash = await hashPassword(password);

    try {
      const { rows } = await pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, plan, trial_ends_at)
         VALUES ($1, $2, 'free', now() + make_interval(days => $3))
         RETURNING id, email, password_hash, plan, trial_ends_at, plan_expires_at, email_verified, token_version, created_at, updated_at`,
        [email, passwordHash, PLAN_LIMITS.free.trial_days],
      );

      const user = rows[0];
      if (!user) {
        return reply.code(500).send({ error: 'REGISTER_FAILED', message: 'Gagal membuat user' });
      }

      const token = app.jwt.sign(
        { userId: user.id, email: user.email, plan: user.plan, ver: user.token_version },
        { expiresIn: JWT_EXPIRES_IN },
      );

      return reply.code(201).send({
        token,
        user: {
          id: user.id,
          email: user.email,
          plan: user.plan,
          trial_ends_at: user.trial_ends_at,
          plan_expires_at: user.plan_expires_at,
          email_verified: user.email_verified,
          created_at: user.created_at,
        },
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === '23505') {
        return reply.code(409).send({
          error: 'EMAIL_TAKEN',
          message: 'Email sudah terdaftar',
        });
      }
      throw err;
    }
  });
}