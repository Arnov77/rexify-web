-- Audit log perubahan setelan bot dari dashboard: siapa mengubah command/limit dan kapan.
-- detail JSONB menyimpan ringkasan perubahan (mis. daftar plugin yang baru dimatikan,
-- nama preset, atau perubahan limit_free/limit_premium).
CREATE TABLE config_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON config_audit_log(session_id, created_at DESC);
