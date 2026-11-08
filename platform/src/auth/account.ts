import type { FastifyInstance } from 'fastify';
import { pool } from '../db';
import { hashPassword, verifyPassword } from './password';

const MIN_PASSWORD_LENGTH = 8;

interface PasswordBody {
  current_password?: unknown;
  new_password?: unknown;
}

export default async function accountRoutes(app: FastifyInstance): Promise<void> {
  // Ganti password akun yang sedang login. Akun Google-only (password_hash NULL) memakai
  // endpoint ini untuk membuat password pertama, jadi current_password tidak diwajibkan.
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

    const { rows } = await pool.query<{ password_hash: string | null }>(
      'SELECT password_hash FROM users WHERE id = $1::uuid',
      [request.user.id],
    );

    const row = rows[0];
    if (!row) {
      return reply
        .code(401)
        .send({ error: 'UNAUTHORIZED', message: 'User tidak ditemukan' });
    }

    if (row.password_hash) {
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
    }

    await pool.query(
      'UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1::uuid',
      [request.user.id, await hashPassword(newPassword)],
    );

    return reply.code(200).send({ ok: true });
  });
}
