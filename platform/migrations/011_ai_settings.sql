-- Konfigurasi auto-AI (core/plugins/ai/auto-ai.js), satu objek per session.
-- Field: name, persona, tone, defense_rules, custom_instructions, system_prompt.
-- Objek kosong = pakai DEFAULT_AI_SETTINGS di platform/src/config/defaults.ts.

ALTER TABLE bot_configs ADD COLUMN ai_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
