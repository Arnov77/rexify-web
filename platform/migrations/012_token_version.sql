-- Revocation JWT: token membawa `ver` dan harus sama dengan users.token_version.
-- Ganti/reset password menaikkan versi ini, sehingga token lama langsung tidak berlaku.

ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
