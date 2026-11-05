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

export type ConnectMode = 'qr' | 'pairing';

export type SessionTab = 'autoReply' | 'plugin' | 'settings';

export interface Session {
  id: string;
  user_id: string;
  phone_number: string | null;
  phone_number_input: string | null;
  connect_mode: ConnectMode;
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

export interface PremiumPackage {
  id: string;
  label: string;
  days: number;
  price: number;
  permanent?: boolean;
}

export interface CustomSettings {
  // Identitas bot
  botname: string;
  ownername: string;
  thumbnailUrl: string;
  audioUrl: string;
  web: string;

  // Grup & channel
  link_group: string;
  link_saluran: string;
  id_saluran: string;
  id_group: string;
  id_ownerGroup: string;

  // Limit
  limit_free: number;
  limit_premium: number;

  // Antilink
  antilink_whitelist_domain: string[];
  antilink_whitelist_number: string[];

  // Premium packages
  premium_packages: PremiumPackage[];

  // Behaviour
  prefix: string;
  tz: string;
  typingDelay: number;
  readReceipt: boolean;

  // API keys (opsional, diisi user sendiri; kalau kosong platform inject dari env)
  token_rex: string;
  token_jerexd: string;
  git_name: string;
  git_token: string;
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
