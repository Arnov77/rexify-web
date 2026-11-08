// Midtrans Core API client — charge QRIS/GoPay.
// Docs: https://docs.midtrans.com/docs/coreapi-e-money-integration

import { createHash, timingSafeEqual } from 'node:crypto';

const SANDBOX_URL = 'https://api.sandbox.midtrans.com';
const PRODUCTION_URL = 'https://api.midtrans.com';

function baseUrl(): string {
  return process.env.MIDTRANS_ENV === 'production' ? PRODUCTION_URL : SANDBOX_URL;
}

function serverKey(): string {
  const key = process.env.MIDTRANS_SERVER_KEY ?? '';
  if (!key) throw new Error('MIDTRANS_SERVER_KEY wajib di-set');
  return key;
}

function authHeader(): string {
  // Basic auth: server key sebagai username, password kosong.
  return `Basic ${Buffer.from(`${serverKey()}:`).toString('base64')}`;
}

export interface MidtransAction {
  name: string;
  method?: string;
  url?: string;
}

export interface MidtransChargeResponse {
  transaction_id: string;
  order_id: string;
  transaction_status: string;
  payment_type?: string;
  fraud_status?: string;
  actions?: MidtransAction[];
}

export interface ChargeResult {
  transaction_id: string;
  order_id: string;
  // URL gambar QR dari actions[generate-qr-code] — boleh di-hotlink langsung oleh frontend.
  qr_code_url: string;
  status: string;
  payment_type: string;
}

export async function chargeQris(
  orderId: string,
  amount: number,
  customerEmail: string,
): Promise<ChargeResult> {
  const res = await fetch(`${baseUrl()}/v2/charge`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      payment_type: 'gopay',
      transaction_details: { order_id: orderId, gross_amount: amount },
      customer_details: { email: customerEmail },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Midtrans charge failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as MidtransChargeResponse;
  const qrAction = data.actions?.find((action) => action.name === 'generate-qr-code');

  return {
    transaction_id: data.transaction_id,
    order_id: data.order_id,
    qr_code_url: qrAction?.url ?? '',
    status: data.transaction_status,
    payment_type: data.payment_type ?? 'gopay',
  };
}

// Batalkan transaksi di Midtrans (POST /v2/{order_id}/cancel). Gagal di sini tidak
// menghalangi penutupan transaksi lokal: webhook settlement tetap menang kalau sudah dibayar.
export async function cancelCharge(orderId: string): Promise<void> {
  const res = await fetch(`${baseUrl()}/v2/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: authHeader(),
    },
    // Body {} wajib: Midtrans/Fastify menolak request JSON tanpa body.
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Midtrans cancel failed: ${res.status} ${text}`);
  }
}

// Verifikasi signature webhook dari Midtrans:
// signature = SHA512(order_id + status_code + gross_amount + server_key)
export function verifyWebhookSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  receivedSignature: string,
): boolean {
  const key = process.env.MIDTRANS_SERVER_KEY ?? '';
  if (!key || !receivedSignature) return false;

  const expected = createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${key}`)
    .digest('hex');
  const received = receivedSignature.trim().toLowerCase();

  // Panjang harus sama sebelum timingSafeEqual, kalau beda fungsinya melempar error.
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}
