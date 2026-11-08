-- Proteksi brute force OTP: hitung percobaan salah dan kunci sementara setelah 5 kali.
-- otp_attempts di-reset ke 0 saat OTP berhasil diverifikasi.

ALTER TABLE users ADD COLUMN otp_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN otp_locked_until TIMESTAMPTZ;
