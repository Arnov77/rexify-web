export interface AutoReplyRule {
  id: string;
  trigger: string;
  response: string;
  match: 'exact' | 'contains' | 'startswith' | 'regex';
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
  updatedAt: Date;
}

export interface BotConfigRow {
  id: string;
  session_id: string;
  auto_reply: AutoReplyRule[] | null;
  welcome_msg: Partial<WelcomeMsg> | null;
  plugins_enabled: Partial<PluginsEnabled> | null;
  custom_settings: Partial<CustomSettings> | null;
  updated_at: Date;
}

export type MatchType = AutoReplyRule['match'];

// Bentuk config.json yang dibaca instance bot (SPEC § Config Generator).
export interface BotConfigFile {
  botname: string;
  owner: string[];
  nomor: string;
  tz: string;
  limit: { free: number; premium: number };
  antilink: { whitelist_domain: string[]; whitelist_number: string[] };
  apikey: { rex: string };
  token: { rex: string };
  auto_reply: AutoReplyRule[];
  welcome_msg: WelcomeMsg;
}