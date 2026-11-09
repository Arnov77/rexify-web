import type { FastifyInstance } from 'fastify';
import { isAccessActive } from '../config/plans';
import { pool } from '../db';
import type { UserRow } from '../types/auth';
import { verifyPassword } from './password';
import { JWT_EXPIRES_IN } from './token';

// Hash dummy: compare tetap jalan walau email tidak ada, supaya timing tidak membocorkan akun.
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.Mb7lVdFqO7xGZ8m0MStOQ2X6R5cM4Uu';
const INVALID_CREDENTIALS = 'Email atau password salah';

// Override rate limit global (100/menit): cegah credential stuffing.
const RATE_LIMIT_AUTH = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

export default async function loginRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', RATE_LIMIT_AUTH, async (request, reply) => {
    const body = (request.body ?? {}) as LoginBody;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      return reply.code(400).send({
        error: 'INVALID_BODY',
        message: 'Email dan password wajib diisi',
      });
    }

    const { rows } = await pool.query<UserRow>(
      `SELECT id, email, password_hash, plan, trial_ends_at, plan_expires_at, email_verified, token_version, created_at, updated_at
       FROM users WHERE email = $1`,
      [email],
    );

    const user = rows[0];

    if (!user) {
      await verifyPassword(password, DUMMY_HASH).catch(() => false);
      return reply.code(401).send({
        error: 'INVALID_CREDENTIALS',
        message: INVALID_CREDENTIALS,
      });
    }

    // Akun Google-only tidak punya password: compare ke hash dummy supaya timing tetap sama.
    const passwordOk = await verifyPassword(password, user.password_hash ?? DUMMY_HASH);
    if (!passwordOk) {
      return reply.code(401).send({
        error: 'INVALID_CREDENTIALS',
        message: INVALID_CREDENTIALS,
      });
    }

    const token = app.jwt.sign(
      { userId: user.id, email: user.email, plan: user.plan, ver: user.token_version },
      { expiresIn: JWT_EXPIRES_IN },
    );

    return reply.code(200).send({
      token,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        trial_ends_at: user.trial_ends_at,
        plan_expires_at: user.plan_expires_at,
        email_verified: user.email_verified,
        created_at: user.created_at,
        active: isAccessActive(user),
      },
    });
  });
}