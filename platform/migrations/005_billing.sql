-- Billing Midtrans Core API (QRIS/GoPay).
-- Satu row = satu percobaan charge. order_id dikirim ke Midtrans dan dipakai juga di webhook.

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'success' | 'failed'
  midtrans_transaction_id TEXT,
  payment_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON transactions(user_id);
CREATE INDEX ON transactions(order_id);
CREATE INDEX ON transactions(status);
