import type {
  AutoReplyRule,
  BotConfigFile,
  CustomSettings,
  PluginsEnabled,
  WelcomeMsg,
} from '../types/config';

export const DEFAULT_AUTO_REPLY: AutoReplyRule[] = [];

export const DEFAULT_WELCOME_MSG: WelcomeMsg = {
  enabled: false,
  message: '',
  onlyOnce: true,
};

export const DEFAULT_PLUGINS_ENABLED: PluginsEnabled = {
  autoReply: true,
  welcomeMsg: true,
  aiChat: false,
  downloader: true,
  antiLink: false,
};

export const DEFAULT_CUSTOM_SETTINGS: CustomSettings = {
  botname: 'Rexify Bot',
  prefix: '!',
  language: 'id',
  typingDelay: 0,
  readReceipt: true,
  antilink_whitelist: [],
};

/** Nilai default config.json instance bot, sebelum ditimpa setting user. */
export function defaultBotConfig(): BotConfigFile {
  return {
    botname: DEFAULT_CUSTOM_SETTINGS.botname,
    owner: [],
    nomor: '',
    tz: 'Asia/Jakarta',
    limit: { free: 25, premium: 200 },
    antilink: { whitelist_domain: [], whitelist_number: [] },
    apikey: { rex: 'https://rexapi.my.id' },
    token: { rex: process.env.REX_API_KEY ?? '' },
    auto_reply: [],
    welcome_msg: { ...DEFAULT_WELCOME_MSG },
  };
}