import bcrypt from 'bcrypt';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { pool } from '../db';
import { sendOtpEmail } from '../lib/mailer';
import { generateOtp, OTP_EXPIRES_MINUTES, OTP_RESEND_SECONDS } from '../lib/otp';
import type { JWTPayload, UserRow } from '../types/auth';
import { hashPassword } from './password';

const OTP_HASH_ROUNDS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const OTP_RE = /^\d{6}$/;
const MAX_OTP_ATTEMPTS = 5;

// Override rate limit global (100/menit): endpoint auth butuh batas jauh lebih ketat.
const RATE_LIMIT_AUTH = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };
const RATE_LIMIT_SEND_OTP = { config: { rateLimit: { max: 5, timeWindow: '5 minutes' } } };

const COLUMNS =
  'id, email, password_hash, plan, trial_ends_at, plan_expires_at, email_verified, otp_code, otp_expires_at, otp_type, otp_last_sent_at, otp_attempts, otp_locked_until, created_at, updated_at';

type OtpType = 'verify' | 'reset';

interface OtpUserRow extends UserRow {
  otp_code: string | null;
  otp_expires_at: Date | null;
  otp_type: string | null;
  otp_last_sent_at: Date | null;
  otp_attempts: number | null;
  otp_locked_until: Date | null;
}

interface SendOtpBody {
  type?: unknown;
  email?: unknown;
}

interface VerifyEmailBody {
  otp?: unknown;
}

interface ResetPasswordBody {
  email?: unknown;
  otp?: unknown;
  new_password?: unknown;
}

function normalizeEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

function normalizeOtp(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function parseOtpType(raw: unknown): OtpType | null {
  return raw === 'verify' || raw === 'reset' ? raw : null;
}

async function findById(userId: string): Promise<OtpUserRow | null> {
  const { rows } = await pool.query<OtpUserRow>(
    `SELECT ${COLUMNS} FROM users WHERE id = $1::uuid`,
    [userId],
  );
  return rows[0] ?? null;
}

async function findByEmail(email: string): Promise<OtpUserRow | null> {
  const { rows } = await pool.query<OtpUserRow>(
    `SELECT ${COLUMNS} FROM users WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

// Route OTP tidak memakai authMiddleware (harus bisa diakses user yang belum verified),
// jadi JWT diverifikasi manual di sini.
async function currentUser(
  request: FastifyRequest,
): Promise<{ payload: JWTPayload; user: OtpUserRow } | null> {
  let payload: JWTPayload;
  try {
    payload = await request.jwtVerify<JWTPayload>();
  } catch {
    return null;
  }

  if (typeof payload.userId !== 'string') return null;
  const user = await findById(payload.userId);
  return user ? { payload, user } : null;
}

function secondsUntilResend(lastSentAt: Date | null): number {
  if (!lastSentAt) return 0;
  const elapsed = Date.now() - new Date(lastSentAt).getTime();
  const remaining = OTP_RESEND_SECONDS * 1000 - elapsed;
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

function isOtpExpired(user: OtpUserRow): boolean {
  if (!user.otp_expires_at) return true;
  return new Date(user.otp_expires_at).getTime() <= Date.now();
}

// Sisa detik lockout; 0 berarti OTP tidak sedang terkunci.
function lockoutSeconds(user: OtpUserRow): number {
  if (!user.otp_locked_until) return 0;
  const remaining = new Date(user.otp_locked_until).getTime() - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

// Percobaan salah dihitung; percobaan ke-5 mengunci OTP selama 15 menit.
async function registerFailedOtp(user: OtpUserRow): Promise<void> {
  const attempts = (user.otp_attempts ?? 0) + 1;
  const locked = attempts >= MAX_OTP_ATTEMPTS;
  await pool.query(
    `UPDATE users
     SET otp_attempts = $2,
         otp_locked_until = CASE WHEN $3 THEN now() + interval '15 minutes' ELSE NULL END,
         updated_at = now()
     WHERE id = $1::uuid`,
    [user.id, attempts, locked],
  );
}

async function clearOtp(userId: string): Promise<void> {
  await pool.query(
    `UPDATE users
     SET otp_code = NULL,
         otp_expires_at = NULL,
         otp_type = NULL,
         otp_last_sent_at = NULL,
         updated_at = now()
     WHERE id = $1::uuid`,
    [userId],
  );
}

export default async function verifyRoutes(app: FastifyInstance): Promise<void> {
  // Kirim / kirim ulang OTP. type 'verify' butuh JWT, type 'reset' cukup email.
  app.post('/api/auth/send-otp', RATE_LIMIT_SEND_OTP, async (request, reply) => {
    const body = (request.body ?? {}) as SendOtpBody;
    const type = parseOtpType(body.type);

    if (!type) {
      return reply.code(400).send({
        error: 'INVALID_TYPE',
        message: "type harus 'verify' atau 'reset'",
      });
    }

    let user: OtpUserRow | null = null;

    if (type === 'verify') {
      const authenticated = await currentUser(request);
      if (!authenticated) {
        return reply.code(401).send({
          error: 'UNAUTHORIZED',
          message: 'Token tidak valid atau kadaluarsa',
        });
      }
      user = authenticated.user;
    } else {
      const email = normalizeEmail(body.email);
      if (!EMAIL_RE.test(email)) {
        return reply.code(400).send({ error: 'INVALID_EMAIL', message: 'Format email tidak valid' });
      }

      user = await findByEmail(email);
      // Email tidak terdaftar: balas ok tanpa mengirim apa pun supaya tidak bisa dipakai
      // menebak akun mana yang ada.
      if (!user) {
        return reply.code(200).send({ ok: true, resend_after: OTP_RESEND_SECONDS });
      }
    }

    if (type === 'verify' && user.email_verified) {
      return reply.code(400).send({
        error: 'EMAIL_ALREADY_VERIFIED',
        message: 'Email sudah terverifikasi',
      });
    }

    const wait = secondsUntilResend(user.otp_last_sent_at);
    if (wait > 0) {
      return reply.code(429).send({
        error: 'OTP_TOO_SOON',
        message: `Tunggu ${wait} detik sebelum minta kode lagi`,
        seconds_left: wait,
      });
    }

    const otp = generateOtp();
    const hash = await bcrypt.hash(otp, OTP_HASH_ROUNDS);

    await pool.query(
      `UPDATE users
       SET otp_code = $2,
           otp_expires_at = now() + make_interval(mins => $3),
           otp_type = $4,
           otp_last_sent_at = now(),
           updated_at = now()
       WHERE id = $1::uuid`,
      [user.id, hash, OTP_EXPIRES_MINUTES, type],
    );

    try {
      await sendOtpEmail(user.email, otp, type);
    } catch (err) {
      request.log.error(err);
      return reply.code(502).send({
        error: 'EMAIL_SEND_FAILED',
        message: 'Gagal mengirim email, coba lagi sebentar',
      });
    }

    return reply.code(200).send({ ok: true, resend_after: OTP_RESEND_SECONDS });
  });

  // Verifikasi akun: butuh JWT (user sudah login) tapi boleh belum verified.
  app.post('/api/auth/verify-email', RATE_LIMIT_AUTH, async (request, reply) => {
    const authenticated = await currentUser(request);
    if (!authenticated) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Token tidak valid atau kadaluarsa',
      });
    }

    const { user } = authenticated;
    if (user.email_verified) {
      return reply.code(200).send({ ok: true });
    }

    const otp = normalizeOtp(((request.body ?? {}) as VerifyEmailBody).otp);
    if (!OTP_RE.test(otp)) {
      return reply.code(400).send({ error: 'INVALID_OTP', message: 'Kode harus 6 digit angka' });
    }

    if (user.otp_type !== 'verify' || !user.otp_code || isOtpExpired(user)) {
      return reply.code(400).send({
        error: 'OTP_EXPIRED',
        message: 'Kode verifikasi sudah kadaluarsa, minta kode baru',
      });
    }

    const lockedFor = lockoutSeconds(user);
    if (lockedFor > 0) {
      return reply.code(429).send({
        error: 'OTP_LOCKED',
        message: `Terlalu banyak percobaan. Coba lagi dalam ${lockedFor} detik.`,
      });
    }

    const valid = await bcrypt.compare(otp, user.otp_code);
    if (!valid) {
      await registerFailedOtp(user);
      return reply.code(400).send({ error: 'INVALID_OTP', message: 'Kode verifikasi salah' });
    }

    await pool.query(
      `UPDATE users
       SET email_verified = true,
           otp_code = NULL,
           otp_expires_at = NULL,
           otp_type = NULL,
           otp_last_sent_at = NULL,
           otp_attempts = 0,
           otp_locked_until = NULL,
           updated_at = now()
       WHERE id = $1::uuid`,
      [user.id],
    );

    return reply.code(200).send({ ok: true });
  });

  // Reset password publik: email + OTP 'reset' + password baru.
  app.post('/api/auth/reset-password', RATE_LIMIT_AUTH, async (request, reply) => {
    const body = (request.body ?? {}) as ResetPasswordBody;
    const email = normalizeEmail(body.email);
    const otp = normalizeOtp(body.otp);
    const newPassword = typeof body.new_password === 'string' ? body.new_password : '';

    if (!EMAIL_RE.test(email)) {
      return reply.code(400).send({ error: 'INVALID_EMAIL', message: 'Format email tidak valid' });
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return reply.code(400).send({
        error: 'INVALID_PASSWORD',
        message: `Password minimal ${MIN_PASSWORD_LENGTH} karakter`,
      });
    }

    if (!OTP_RE.test(otp)) {
      return reply.code(400).send({ error: 'INVALID_OTP', message: 'Kode harus 6 digit angka' });
    }

    const user = await findByEmail(email);
    // Pesan disamakan dengan kode salah supaya email terdaftar tidak bisa ditebak dari respons.
    if (!user || user.otp_type !== 'reset' || !user.otp_code || isOtpExpired(user)) {
      return reply.code(400).send({
        error: 'OTP_EXPIRED',
        message: 'Kode reset sudah kadaluarsa, minta kode baru',
      });
    }

    const lockedFor = lockoutSeconds(user);
    if (lockedFor > 0) {
      return reply.code(429).send({
        error: 'OTP_LOCKED',
        message: `Terlalu banyak percobaan. Coba lagi dalam ${lockedFor} detik.`,
      });
    }

    const valid = await bcrypt.compare(otp, user.otp_code);
    if (!valid) {
      await registerFailedOtp(user);
      return reply.code(400).send({ error: 'INVALID_OTP', message: 'Kode reset salah' });
    }

    const passwordHash = await hashPassword(newPassword);
    await pool.query(
      `UPDATE users
       SET password_hash = $2,
           otp_attempts = 0,
           otp_locked_until = NULL,
           updated_at = now()
       WHERE id = $1::uuid`,
      [user.id, passwordHash],
    );
    await clearOtp(user.id);

    return reply.code(200).send({ ok: true });
  });
}
