-- Schema awal Rexify (SPEC § Database Schema).
-- sessions.updated_at ditambah: SPEC § Session Manager mewajibkan store.ts meng-update kolom itu.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  plan_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  label TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_number TEXT,
  status TEXT NOT NULL DEFAULT 'connecting',
  label TEXT,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE bot_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  auto_reply JSONB DEFAULT '[]',
  welcome_msg JSONB DEFAULT '{}',
  plugins_enabled JSONB DEFAULT '{}',
  custom_settings JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE plugin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  plugin_name TEXT NOT NULL,
  trigger TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON sessions(user_id);
CREATE INDEX ON sessions(status);
CREATE INDEX ON plugin_logs(session_id);
CREATE INDEX ON plugin_logs(created_at DESC);