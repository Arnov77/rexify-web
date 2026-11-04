export type SessionStatus = 'connecting' | 'qr_pending' | 'active' | 'disconnected' | 'banned';

export interface ManagedSession {
  userId: string;
  sessionId: string;
  status: SessionStatus;
}

export interface PluginLogRow {
  id: string;
  session_id: string;
  plugin_name: string;
  trigger: string | null;
  status: string;
  created_at: Date;
}

export interface SessionRow {
  id: string;
  user_id: string;
  phone_number: string | null;
  status: SessionStatus;
  label: string | null;
  connected_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
