import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PLAN_LIMITS } from '../config/plans';
import { pool } from '../db';
import type { UserRow } from '../types/auth';
import { consumeExchangeCode, issueExchangeCode } from './exchange-code';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const STATE_COOKIE = 'rexify_google_state';
const STATE_TTL_SECONDS = 600;
const USER_COLUMNS =
  'id, email, password_hash, plan, trial_ends_at, plan_expires_at, email_verified, created_at, updated_at';

interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

interface GoogleProfile {
  sub?: string;
  email?: string;
  email_verified?: boolean;
}

function clientId(): string {
  return process.env.GOOGLE_CLIENT_ID ?? '';
}

function clientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET ?? '';
}

function isSecure(request: FastifyRequest): boolean {
  return String(request.headers['x-forwarded-proto'] ?? request.protocol) === 'https';
}

// Redirect URI harus sama persis dengan yang didaftarkan di Google Cloud Console.
// Default diturunkan dari request supaya dev (vite proxy) dan production sama-sama jalan.
function redirectUri(request: FastifyRequest): string {
  const configured = process.env.GOOGLE_REDIRECT_URI;
  if (configured) return configured;

  const proto = String(request.headers['x-forwarded-proto'] ?? request.protocol);
  const host = String(request.headers['x-forwarded-host'] ?? request.headers.host ?? '');
  return `${proto}://${host}/api/auth/google/callback`;
}

function readCookie(request: FastifyRequest, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function stateCookie(value: string, maxAge: number, secure: boolean): string {
  const flags = ['Path=/api/auth/google', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) flags.push('Secure');
  return `${STATE_COOKIE}=${encodeURIComponent(value)}; ${flags.join('; ')}`;
}

function fail(reply: FastifyReply, reason: string): FastifyReply {
  return reply.redirect(`/login?google_error=${reason}`);
}

async function exchangeCode(request: FastifyRequest, code: string): Promise<string | null> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(request),
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

// Access token didapat langsung dari Google lewat TLS, jadi userinfo cukup dipercaya tanpa
// verifikasi signature id_token.
async function fetchProfile(accessToken: string): Promise<GoogleProfile | null> {
  const res = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return null;
  return (await res.json()) as GoogleProfile;
}

async function upsertUser(
  googleId: string,
  email: string,
  emailVerified: boolean,
): Promise<UserRow> {
  const existing = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE google_id = $1 OR email = $2 LIMIT 1`,
    [googleId, email],
  );

  const found = existing.rows[0];
  if (found) {
    // Akun password lama ikut ditautkan supaya satu email tetap satu user.
    const { rows } = await pool.query<UserRow>(
      `UPDATE users
       SET google_id = $2, email_verified = email_verified OR $3, updated_at = now()
       WHERE id = $1::uuid
       RETURNING ${USER_COLUMNS}`,
      [found.id, googleId, emailVerified],
    );
    return rows[0] as UserRow;
  }

  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (email, google_id, plan, trial_ends_at, email_verified)
     VALUES ($1, $2, 'free', now() + make_interval(days => $3), $4)
     RETURNING ${USER_COLUMNS}`,
    [email, googleId, PLAN_LIMITS.free.trial_days, emailVerified],
  );
  return rows[0] as UserRow;
}

export default async function googleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/auth/google', async (request, reply) => {
    if (!clientId() || !clientSecret()) {
      return reply.code(503).send({
        error: 'GOOGLE_NOT_CONFIGURED',
        message: 'Login Google belum diaktifkan di server ini',
      });
    }

    const state = randomBytes(16).toString('hex');
    const url = new URL(AUTH_URL);
    url.searchParams.set('client_id', clientId());
    url.searchParams.set('redirect_uri', redirectUri(request));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'select_account');

    reply.header('set-cookie', stateCookie(state, STATE_TTL_SECONDS, isSecure(request)));
    return reply.redirect(url.toString());
  });

  app.get('/api/auth/google/callback', async (request, reply) => {
    const query = (request.query ?? {}) as CallbackQuery;
    const expectedState = readCookie(request, STATE_COOKIE);
    reply.header('set-cookie', stateCookie('', 0, isSecure(request)));

    if (query.error) return fail(reply, 'cancelled');
    if (!query.code || !query.state || !expectedState || query.state !== expectedState) {
      return fail(reply, 'state');
    }

    try {
      const accessToken = await exchangeCode(request, query.code);
      if (!accessToken) return fail(reply, 'token');

      const profile = await fetchProfile(accessToken);
      if (!profile?.sub || !profile.email) return fail(reply, 'profile');

      const user = await upsertUser(
        profile.sub,
        profile.email.trim().toLowerCase(),
        profile.email_verified === true,
      );

      const token = app.jwt.sign(
        { userId: user.id, email: user.email, plan: user.plan },
        { expiresIn: '30d' },
      );

      // Yang dibawa ke URL hanya kode sekali-pakai, bukan token: aman walau access log
      // proxy menyimpan URL lengkap.
      return reply.redirect(`/auth/google/callback?code=${issueExchangeCode(token)}`);
    } catch (err) {
      request.log.error(err);
      return fail(reply, 'server');
    }
  });

  // Tukar kode sekali-pakai dari callback jadi JWT. Kode mati setelah request ini.
  app.post('/api/auth/google/exchange', async (request, reply) => {
    const body = (request.body ?? {}) as { code?: unknown };
    if (typeof body.code !== 'string' || body.code.length === 0) {
      return reply.code(400).send({ error: 'INVALID_CODE', message: 'Kode login tidak valid' });
    }

    const token = consumeExchangeCode(body.code);
    if (!token) {
      return reply.code(401).send({
        error: 'CODE_EXPIRED',
        message: 'Kode login sudah kedaluwarsa, ulangi login Google',
      });
    }

    return reply.code(200).send({ token });
  });
}

