import type { FastifyReply, FastifyRequest } from 'fastify';
import { isAccessActive } from '../config/plans';
import { pool } from '../db';
import { isUuid } from '../session/store';
import type { AuthUser, JWTPayload, UserRow } from '../types/auth';

// Endpoint auth (send-otp/verify-email/reset-password) dan /api/me tetap terbuka supaya
// frontend bisa menampilkan halaman verifikasi tanpa data user hilang.
// Allowlist eksplisit: prefix '/api/auth/' juga mencakup /api/auth/password yang terproteksi.
const UNVERIFIED_ALLOWED = new Set([
  '/api/auth/send-otp',
  '/api/auth/verify-email',
  '/api/auth/reset-password',
  '/api/auth/google/callback',
  '/api/me',
]);

// User dibaca ulang dari DB tiap request supaya perubahan plan langsung berlaku.
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  let payload: JWTPayload;

  try {
    payload = await request.jwtVerify<JWTPayload>();
  } catch {
    await reply.code(401).send({
      error: 'UNAUTHORIZED',
      message: 'Token tidak valid atau kadaluarsa',
    });
    return;
  }

  if (!isUuid(payload.userId)) {
    await reply.code(401).send({
      error: 'UNAUTHORIZED',
      message: 'Token tidak valid atau kadaluarsa',
    });
    return;
  }

  const { rows } = await pool.query<UserRow & { google_id: string | null }>(
    `SELECT id, email, password_hash, google_id, plan, trial_ends_at, plan_expires_at, email_verified, token_version, created_at, updated_at
     FROM users WHERE id = $1::uuid`,
    [payload.userId],
  );
  const user = rows[0];

  if (!user) {
    await reply.code(401).send({
      error: 'UNAUTHORIZED',
      message: 'User tidak ditemukan',
    });
    return;
  }

  // Token yang diterbitkan sebelum ganti/reset password langsung ditolak.
  if ((payload.ver ?? 0) !== user.token_version) {
    await reply.code(401).send({
      error: 'UNAUTHORIZED',
      message: 'Sesi sudah tidak berlaku, silakan masuk ulang',
    });
    return;
  }

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    plan: user.plan,
    trial_ends_at: user.trial_ends_at,
    plan_expires_at: user.plan_expires_at,
    email_verified: user.email_verified,
    has_password: user.password_hash !== null,
    has_google: user.google_id !== null,
  };

  const allowedWhileUnverified = UNVERIFIED_ALLOWED.has(request.url.split('?')[0]);

  if (!authUser.email_verified && !allowedWhileUnverified) {
    await reply.code(403).send({
      error: 'EMAIL_NOT_VERIFIED',
      message: 'Verifikasi email kamu terlebih dahulu',
    });
    return;
  }

  if (!isAccessActive(authUser)) {
    await reply.code(403).send({
      error: 'ACCESS_EXPIRED',
      message: 'Masa aktif plan sudah habis, silakan upgrade plan',
    });
    return;
  }

  request.user = authUser;
}