import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/middleware';
import { pool } from '../db';
import { cancelCharge, chargeQris, verifyWebhookSignature } from './midtrans';
import { BILLING_PLANS, isBillingPlan, type BillingPlan } from './plans';

const MAX_HISTORY = 10;
// QR Midtrans kadaluarsa ~15 menit; transaksi pending yang lebih tua dianggap hangus.
const PENDING_WINDOW = '15 minutes';

type TransactionStatus = 'pending' | 'success' | 'failed' | 'cancelled' | 'expired';

interface TransactionRow {
  id: string;
  user_id: string;
  order_id: string;
  plan: string;
  amount: number;
  status: TransactionStatus;
  midtrans_transaction_id: string | null;
  payment_type: string | null;
  qr_code_url: string | null;
  created_at: Date;
}

interface ChargeBody {
  plan?: unknown;
}

interface StatusParams {
  orderId: string;
}

interface WebhookBody {
  order_id?: unknown;
  status_code?: unknown;
  gross_amount?: unknown;
  signature_key?: unknown;
  transaction_status?: unknown;
  transaction_id?: unknown;
  payment_type?: unknown;
  fraud_status?: unknown;
}

interface UserPlanRow {
  plan: string;
  plan_expires_at: Date | null;
}

function orderIdFor(): string {
  // Order ID tidak boleh membocorkan user/waktu: nilainya dipakai di URL status & cancel.
  return `rexify-${randomUUID()}`;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// 'settlement' = QRIS/GoPay lunas. 'capture' hanya sah kalau fraud check accept.
function isPaidStatus(status: string, fraudStatus: string): boolean {
  if (status === 'settlement') return true;
  return status === 'capture' && (fraudStatus === '' || fraudStatus === 'accept');
}

// Status akhir untuk notifikasi non-lunas: dibedakan supaya riwayat tidak menyebut
// pembatalan user sebagai kegagalan pembayaran.
function finalStatusFor(transactionStatus: string): TransactionStatus | null {
  if (transactionStatus === 'expire') return 'expired';
  if (transactionStatus === 'cancel') return 'cancelled';
  if (transactionStatus === 'deny') return 'failed';
  return null;
}

// Hanya transaksi yang masih pending yang ditutup, supaya notifikasi telat tidak menimpa
// transaksi yang sudah sukses.
async function markTransactionStatus(
  orderId: string,
  status: TransactionStatus,
  paymentType: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE transactions
     SET status = $2, payment_type = COALESCE(payment_type, $3), updated_at = now()
     WHERE order_id = $1 AND status = 'pending'`,
    [orderId, status, paymentType],
  );
}

// Sukses: transaksi ditandai lunas DAN plan user diperpanjang dalam satu transaksi DB.
async function applyPaymentSuccess(
  orderId: string,
  plan: BillingPlan,
  midtransTransactionId: string | null,
  paymentType: string | null,
): Promise<void> {
  const durationDays = BILLING_PLANS[plan].duration_days;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const txResult = await client.query<TransactionRow>(
      `SELECT id, user_id, order_id, plan, amount, status, midtrans_transaction_id, payment_type, created_at
       FROM transactions WHERE order_id = $1 FOR UPDATE`,
      [orderId],
    );
    const tx = txResult.rows[0];

    // Webhook bisa datang dua kali (settlement + capture); perpanjangan hanya sekali.
    if (!tx || tx.status === 'success') {
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `UPDATE transactions
       SET status = 'success',
           midtrans_transaction_id = COALESCE($2, midtrans_transaction_id),
           payment_type = COALESCE($3, payment_type),
           updated_at = now()
       WHERE order_id = $1`,
      [orderId, midtransTransactionId, paymentType],
    );

    const userResult = await client.query<UserPlanRow>(
      'SELECT plan, plan_expires_at FROM users WHERE id = $1::uuid FOR UPDATE',
      [tx.user_id],
    );
    const user = userResult.rows[0];

    if (user) {
      // Extend: lanjut dari tanggal expired lama kalau masih aktif, kalau sudah lewat mulai sekarang.
      const now = new Date();
      const current =
        user.plan_expires_at && new Date(user.plan_expires_at).getTime() > now.getTime()
          ? new Date(user.plan_expires_at)
          : now;
      const expiresAt = new Date(current.getTime() + durationDays * 86_400_000);

      await client.query(
        `UPDATE users
         SET plan = $2, plan_expires_at = $3, updated_at = now()
         WHERE id = $1::uuid`,
        [tx.user_id, plan, expiresAt],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default async function billingRoutes(app: FastifyInstance): Promise<void> {
  // Publik: Midtrans tidak mengirim JWT, keaslian request dicek lewat signature.
  app.post('/api/billing/webhook', async (request, reply) => {
    const body = (request.body ?? {}) as WebhookBody;

    const orderId = asString(body.order_id);
    const statusCode = asString(body.status_code);
    const grossAmount = asString(body.gross_amount);
    const signature = asString(body.signature_key);

    if (!orderId || !verifyWebhookSignature(orderId, statusCode, grossAmount, signature)) {
      return reply
        .code(403)
        .send({ error: 'INVALID_SIGNATURE', message: 'Signature webhook tidak valid' });
    }

    const transactionStatus = asString(body.transaction_status);
    const midtransTransactionId = asString(body.transaction_id) || null;
    const paymentType = asString(body.payment_type) || null;
    const fraudStatus = asString(body.fraud_status);

    const { rows } = await pool.query<{ plan: string; amount: number }>(
      'SELECT plan, amount FROM transactions WHERE order_id = $1',
      [orderId],
    );
    const transaction = rows[0];

    if (!transaction) {
      // Order asing: tetap 200 supaya Midtrans berhenti retry.
      return reply.code(200).send({ received: true, ignored: true });
    }

    // Signature membuktikan notifikasi berasal dari Midtrans, tapi nominalnya tetap harus
    // sama dengan yang tercatat supaya plan tidak aktif dengan harga lain.
    if (Number(grossAmount) !== transaction.amount) {
      request.log.warn(
        { order_id: orderId, gross_amount: grossAmount, amount: transaction.amount },
        '[billing] gross_amount tidak cocok dengan transaksi',
      );
      return reply.code(403).send({ error: 'AMOUNT_MISMATCH', message: 'Nominal tidak cocok' });
    }

    if (isBillingPlan(transaction.plan) && isPaidStatus(transactionStatus, fraudStatus)) {
      await applyPaymentSuccess(orderId, transaction.plan, midtransTransactionId, paymentType);
    } else {
      const finalStatus = finalStatusFor(transactionStatus);
      if (finalStatus) await markTransactionStatus(orderId, finalStatus, paymentType);
    }

    // Midtrans butuh 200 untuk semua notifikasi valid, kalau tidak dia retry terus.
    return reply.code(200).send({ received: true });
  });

  // Endpoint berbayar butuh JWT; scope terpisah supaya webhook di atas tetap publik.
  await app.register(async (instance) => {
    instance.addHook('onRequest', authMiddleware);

    instance.post('/api/billing/charge', async (request, reply) => {
      const body = (request.body ?? {}) as ChargeBody;
      const plan = body.plan;

      if (!isBillingPlan(plan)) {
        return reply.code(400).send({
          error: 'INVALID_PLAN',
          message: "plan hanya boleh 'pro' atau 'enterprise'",
        });
      }

      // Paket sama masih pending: kembalikan QR yang sudah tersimpan supaya user bisa
      // melanjutkan pembayaran (mis. popup tertutup) tanpa charge baru.
      const pending = await pool.query<TransactionRow>(
        `SELECT id, user_id, order_id, plan, amount, status, midtrans_transaction_id, payment_type, qr_code_url, created_at
         FROM transactions
         WHERE user_id = $1::uuid AND plan = $2 AND status = 'pending'
           AND created_at > now() - interval '${PENDING_WINDOW}'
         ORDER BY created_at DESC LIMIT 1`,
        [request.user.id, plan],
      );
      const pendingTransaction = pending.rows[0];

      if (pendingTransaction?.qr_code_url) {
        return reply.code(200).send({
          order_id: pendingTransaction.order_id,
          qr_code_url: pendingTransaction.qr_code_url,
          amount: pendingTransaction.amount,
          plan_label: BILLING_PLANS[plan].label,
          reused: true,
        });
      }

      // Pending dari sebelum migrasi 006 (QR tidak tersimpan): tutup sebagai kedaluwarsa,
      // lalu buat transaksi baru.
      if (pendingTransaction) {
        await markTransactionStatus(
          pendingTransaction.order_id,
          'expired',
          pendingTransaction.payment_type,
        );
      }

      const amount = BILLING_PLANS[plan].amount;
      const orderId = orderIdFor();

      let charge;
      try {
        charge = await chargeQris(orderId, amount, request.user.email);
      } catch (err) {
        request.log.error(err);
        return reply.code(502).send({
          error: 'PAYMENT_GATEWAY_ERROR',
          message: 'Gagal membuat transaksi ke Midtrans, coba lagi beberapa saat',
        });
      }

      if (!charge.qr_code_url) {
        return reply.code(502).send({
          error: 'QR_UNAVAILABLE',
          message: 'Midtrans tidak mengembalikan QR code, coba lagi',
        });
      }

      // Sandbox: URL QR cuma bisa dibuka manual, jadi cetak ke log supaya bisa dites tanpa UI.
      // Simulator resmi Midtrans untuk menandai transaksi lunas: https://simulator.sandbox.midtrans.com/
      if (process.env.MIDTRANS_ENV !== 'production') {
        request.log.info(
          {
            order_id: orderId,
            amount,
            qr_code_url: charge.qr_code_url,
            simulator: 'https://simulator.sandbox.midtrans.com/',
          },
          '[midtrans-sandbox] buka qr_code_url untuk bayar, atau tandai lunas lewat simulator',
        );
      }

      await pool.query(
        `INSERT INTO transactions
           (user_id, order_id, plan, amount, status, midtrans_transaction_id, payment_type, qr_code_url)
         VALUES ($1::uuid, $2, $3, $4, 'pending', $5, $6, $7)`,
        [
          request.user.id,
          orderId,
          plan,
          amount,
          charge.transaction_id,
          charge.payment_type,
          charge.qr_code_url,
        ],
      );

      return reply.code(201).send({
        order_id: orderId,
        qr_code_url: charge.qr_code_url,
        amount,
        plan_label: BILLING_PLANS[plan].label,
      });
    });

    instance.get('/api/billing/status/:orderId', async (request, reply) => {
      const { orderId } = request.params as StatusParams;

      const { rows } = await pool.query<TransactionRow>(
        `SELECT id, user_id, order_id, plan, amount, status, midtrans_transaction_id, payment_type, qr_code_url, created_at
         FROM transactions WHERE order_id = $1 AND user_id = $2::uuid`,
        [orderId, request.user.id],
      );
      const transaction = rows[0];

      if (!transaction) {
        return reply
          .code(404)
          .send({ error: 'TRANSACTION_NOT_FOUND', message: 'Transaksi tidak ditemukan' });
      }

      return reply.code(200).send({
        status: transaction.status,
        plan: transaction.plan,
        amount: transaction.amount,
        qr_code_url: transaction.qr_code_url,
        created_at: transaction.created_at,
      });
    });

    // Batalkan pembayaran pending: QR di Midtrans dicancel (best effort) lalu row ditandai failed.
    instance.post('/api/billing/cancel/:orderId', async (request, reply) => {
      const { orderId } = request.params as StatusParams;

      const { rows } = await pool.query<TransactionRow>(
        `SELECT id, user_id, order_id, plan, amount, status, midtrans_transaction_id, payment_type, qr_code_url, created_at
         FROM transactions WHERE order_id = $1 AND user_id = $2::uuid`,
        [orderId, request.user.id],
      );
      const transaction = rows[0];

      if (!transaction) {
        return reply
          .code(404)
          .send({ error: 'TRANSACTION_NOT_FOUND', message: 'Transaksi tidak ditemukan' });
      }

      if (transaction.status !== 'pending') {
        return reply.code(409).send({
          error: 'TRANSACTION_NOT_PENDING',
          message: 'Transaksi ini tidak sedang menunggu pembayaran',
        });
      }

      try {
        await cancelCharge(orderId);
      } catch (err) {
        // Gagal cancel di Midtrans bukan alasan menolak request: transaksi lokal tetap ditutup,
        // dan kalau ternyata user sudah bayar, webhook settlement yang menang.
        request.log.warn({ err, order_id: orderId }, '[billing] gagal cancel transaksi di Midtrans');
      }

      // Status akhir 'cancelled' (bukan 'failed') supaya riwayat jujur: user yang membatalkan.
      await markTransactionStatus(orderId, 'cancelled', transaction.payment_type);

      return reply.code(200).send({ cancelled: true, order_id: orderId });
    });

    instance.get('/api/billing/transactions', async (request) => {
      const { rows } = await pool.query<TransactionRow>(
        `SELECT id, user_id, order_id, plan, amount, status, midtrans_transaction_id, payment_type, qr_code_url, created_at
         FROM transactions WHERE user_id = $1::uuid
         ORDER BY created_at DESC LIMIT $2`,
        [request.user.id, MAX_HISTORY],
      );

      return {
        transactions: rows.map((row) => ({
          id: row.id,
          order_id: row.order_id,
          plan: row.plan,
          amount: row.amount,
          status: row.status,
          payment_type: row.payment_type,
          // Ditampilkan di dialog detail supaya user bisa cocokkan dengan dashboard Midtrans.
          midtrans_transaction_id: row.midtrans_transaction_id,
          qr_code_url: row.qr_code_url,
          created_at: row.created_at,
        })),
      };
    });
  });
}

