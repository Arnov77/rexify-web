-- Tab Command: daftar plugin core (path relatif dari root core) yang dimatikan user.
-- Contoh isi: ["plugins/downloader/tiktok.js", "plugins/ai/auto-ai.js"].
-- Ditulis ke config.json instance sebagai `commands_disabled` dan dibaca core/handler.js.
ALTER TABLE bot_configs ADD COLUMN commands_disabled JSONB NOT NULL DEFAULT '[]'::jsonb;
