import type { FastifyInstance } from 'fastify';
import { pool } from '../db';
import { hashPassword, verifyPassword } from './password';
import { JWT_EXPIRES_IN } from './token';

const MIN_PASSWORD_LENGTH = 8;
// bcrypt memotong input di 72 byte; batasi supaya tidak ada karakter yang diam-diam dibuang.
const MAX_PASSWORD_LENGTH = 72;

interface PasswordBody {
  current_password?: unknown;
  new_password?: unknown;
}

interface PasswordRow {
  password_hash: string | null;
  token_version: number;
}

export default async function accountRoutes(app: FastifyInstance): Promise<void> {
  // Ganti password akun yang sedang login. Selalu butuh password saat ini: akun Google-only
  // membuat password pertama lewat alur "Lupa password" (email + OTP), bukan lewat JWT saja,
  // supaya token yang dicuri tidak bisa jadi akses permanen.
  app.patch('/api/auth/password', async (request, reply) => {
    const body = (request.body ?? {}) as PasswordBody;
    const newPassword = typeof body.new_password === 'string' ? body.new_password : '';
    const currentPassword = typeof body.current_password === 'string' ? body.current_password : '';

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return reply.code(400).send({
        error: 'INVALID_PASSWORD',
        message: `Password baru minimal ${MIN_PASSWORD_LENGTH} karakter`,
      });
    }

    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      return reply.code(400).send({
        error: 'INVALID_PASSWORD',
        message: `Password baru maksimal ${MAX_PASSWORD_LENGTH} karakter`,
      });
    }

    const { rows } = await pool.query<PasswordRow>(
      'SELECT password_hash, token_version FROM users WHERE id = $1::uuid',
      [request.user.id],
    );

    const row = rows[0];
    if (!row) {
      return reply
        .code(401)
        .send({ error: 'UNAUTHORIZED', message: 'User tidak ditemukan' });
    }

    if (!row.password_hash) {
      return reply.code(409).send({
        error: 'PASSWORD_NOT_SET',
        message: 'Akun ini belum punya password. Buat lewat "Lupa password" (verifikasi email).',
      });
    }

    if (!currentPassword) {
      return reply.code(400).send({
        error: 'CURRENT_PASSWORD_REQUIRED',
        message: 'Password saat ini wajib diisi',
      });
    }

    if (!(await verifyPassword(currentPassword, row.password_hash))) {
      return reply
        .code(401)
        .send({ error: 'INVALID_CREDENTIALS', message: 'Password saat ini salah' });
    }

    // Token lama (termasuk yang dipakai request ini) langsung mati; kirim penggantinya.
    const nextVersion = row.token_version + 1;
    await pool.query(
      `UPDATE users
       SET password_hash = $2, token_version = $3, updated_at = now()
       WHERE id = $1::uuid`,
      [request.user.id, await hashPassword(newPassword), nextVersion],
    );

    const token = app.jwt.sign(
      {
        userId: request.user.id,
        email: request.user.email,
        plan: request.user.plan,
        ver: nextVersion,
      },
      { expiresIn: JWT_EXPIRES_IN },
    );

    return reply.code(200).send({ ok: true, token });
  });
}
