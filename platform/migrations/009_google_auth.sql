-- Login Google: akun OAuth tidak punya password, dan google_id memetakan `sub` Google ke user.
-- Akun password lama yang login pakai Google ditautkan lewat email (lihat auth/google.ts).

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;
