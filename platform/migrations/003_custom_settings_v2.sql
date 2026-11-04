-- Struktur custom_settings v2 (identitas bot, grup/channel, limit, antilink, premium,
-- behaviour, API key milik user). Kolom di-drop lalu dibuat ulang supaya nilai lama
-- (botname/prefix/language/antilink_whitelist) tidak bercampur dengan bentuk baru.

ALTER TABLE bot_configs DROP COLUMN IF EXISTS custom_settings;
ALTER TABLE bot_configs ADD COLUMN custom_settings JSONB DEFAULT '{}';
