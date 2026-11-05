-- Verifikasi email OTP + reset password. otp_code menyimpan hash bcrypt (bukan kode mentah),
-- otp_type membedakan alur verifikasi akun ('verify') dan lupa password ('reset').

ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN otp_code TEXT;
ALTER TABLE users ADD COLUMN otp_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN otp_type TEXT; -- 'verify' | 'reset'
ALTER TABLE users ADD COLUMN otp_last_sent_at TIMESTAMPTZ;

-- User existing dianggap sudah terverifikasi
UPDATE users SET email_verified = true WHERE email_verified = false;
