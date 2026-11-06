-- QR code URL disimpan supaya user bisa melanjutkan pembayaran yang belum dibayar
-- (mis. popup ditutup) tanpa membuat transaksi Midtrans baru.
ALTER TABLE transactions ADD COLUMN qr_code_url TEXT;
