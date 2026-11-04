export interface ApiUser {
  id: string;
  email: string;
  plan: string;
  trial_ends_at: string | null;
  plan_expires_at: string | null;
  created_at?: string;
  active?: boolean;
}

export interface AuthResponse {
  token: string;
  user: ApiUser;
}

export interface MeResponse {
  user: ApiUser & { active: boolean };
  limits: { sessions: number };
}

export type SessionStatus = 'connecting' | 'qr_pending' | 'active' | 'disconnected' | 'banned';

export interface Session {
  id: string;
  user_id: string;
  phone_number: string | null;
  status: SessionStatus;
  label: string | null;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MatchType = 'exact' | 'contains' | 'startswith' | 'regex';

export interface AutoReplyRule {
  id: string;
  trigger: string;
  response: string;
  match: MatchType;
  enabled: boolean;
}

export interface WelcomeMsg {
  enabled: boolean;
  message: string;
  onlyOnce: boolean;
}

export interface PluginsEnabled {
  autoReply: boolean;
  welcomeMsg: boolean;
  aiChat: boolean;
  downloader: boolean;
  antiLink: boolean;
}

export interface CustomSettings {
  botname: string;
  prefix: string;
  language: 'id' | 'en';
  typingDelay: number;
  readReceipt: boolean;
  antilink_whitelist: string[];
}

export interface BotConfig {
  sessionId: string;
  autoReply: AutoReplyRule[];
  welcomeMsg: WelcomeMsg;
  pluginsEnabled: PluginsEnabled;
  customSettings: CustomSettings;
  updatedAt: string;
}

export interface PluginLog {
  id: string;
  session_id: string;
  plugin_name: string;
  trigger: string | null;
  status: string;
  created_at: string;
}
