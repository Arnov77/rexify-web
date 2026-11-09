export interface AutoReplyRule {
  id: string;
  trigger: string;
  response: string;
  match: 'exact' | 'contains' | 'startswith' | 'regex';
  enabled: boolean;
}

// Konfigurasi auto-AI: dikirim ke POST /api/ai/heru-ai/ tiap balasan.
// system_prompt (kalau diisi) menimpa seluruh field lain di sisi API.
export interface AiSettings {
  name: string;
  persona: string;
  tone: string;
  defense_rules: string;
  custom_instructions: string;
  system_prompt: string;
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

// Satu baris tab Command: satu file plugin core (bisa berisi beberapa alias command).
// Katalog di-generate dari core lewat `npm run catalog` (core/scripts/list-commands.mjs).
export interface CommandEntry {
  file: string;
  category: string;
  commands: string[];
  tags: string[];
  help: string[];
  // Command owner/rowner tidak boleh dimatikan dari dashboard.
  locked: boolean;
  defaultDisabled: boolean;
}

export interface CommandCatalog {
  generatedAt: string;
  source: string;
  total: number;
  commands: CommandEntry[];
}

export interface CustomSettings {
  // Identitas bot
  botname: string;
  ownername: string;
  // Kosong = pakai nomor session. Diisi kalau bot dikontrol dari nomor lain.
  owner_number: string;
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
  commandsDisabled: string[];
  customSettings: CustomSettings;
  aiSettings: AiSettings;
  updatedAt: Date;
}

export interface BotConfigRow {
  id: string;
  session_id: string;
  auto_reply: AutoReplyRule[] | null;
  welcome_msg: Partial<WelcomeMsg> | null;
  plugins_enabled: Partial<PluginsEnabled> | null;
  commands_disabled: string[] | null;
  custom_settings: Partial<CustomSettings> | null;
  ai_settings: Partial<AiSettings> | null;
  updated_at: Date;
}

export type MatchType = AutoReplyRule['match'];

export interface PremiumPackage {
  id: string;
  label: string;
  days: number;
  price: number;
  permanent?: boolean;
}

// Bentuk config.json yang dibaca instance rex-bot-v2: semua key yang dipakai core wajib ada.
// Blok midtrans & proxy sengaja tidak ditulis, core memakai default-nya sendiri.
export interface BotConfigFile {
  botname: string;
  ownername: string;
  owner: string[];
  nomor: string;
  tz: string;
  thumbnailUrl: string;
  audioUrl: string;
  web: string;
  link: { group: string; saluran: string };
  id: { saluran: string; group: string; ownerGroup: string };
  limit: { free: number; premium: number };
  antilink: { whitelist_domain: string[]; whitelist_number: string[] };
  premium: { packages: PremiumPackage[] };
  git: { name: string[]; token: string[] };
  apikey: { rex: string; jerexd: string };
  token: { rex: string; jerexd: string };
  auto_reply: AutoReplyRule[];
  welcome_msg: WelcomeMsg;
  commands_disabled: string[];
  // Dibaca core sebagai global.ai (lihat core/lib/global.js dan plugins/ai/auto-ai.js).
  ai: AiSettings;
}