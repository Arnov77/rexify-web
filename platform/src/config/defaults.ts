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
  // Identitas bot
  botname: 'Rexify Bot',
  ownername: 'Rexify User',
  thumbnailUrl:
    'https://raw.githubusercontent.com/Leoojon/dat1/main/uploads/25eb4e-1767859162744.jpg',
  audioUrl: 'https://h.top4top.io/m_3622t3r7l1.mp3',
  web: 'https://rexapi.my.id/',

  // Grup & channel
  link_group: '',
  link_saluran: '',
  id_saluran: '',
  id_group: '',
  id_ownerGroup: '',

  // Limit
  limit_free: 25,
  limit_premium: 200,

  // Antilink (kosong = pakai daftar default di defaultBotConfig)
  antilink_whitelist_domain: [],
  antilink_whitelist_number: [],

  // Premium packages (kosong = pakai paket default bot)
  premium_packages: [],

  // Behaviour
  prefix: '.',
  tz: 'Asia/Jakarta',
  typingDelay: 1200,
  readReceipt: true,

  // API keys
  token_rex: '',
  token_jerexd: '',
  git_name: '',
  git_token: '',
};

/**
 * Nilai default config.json instance rex-bot-v2, sebelum ditimpa setting user.
 * core/lib/global.js melakukan `Object.assign(global, config)` lalu langsung memakai
 * global.id.saluran, global.ownername, global.web, dan global.thumbnailUrl — jadi key
 * tersebut wajib ada walau nilainya kosong.
 *
 * Blok `midtrans`, `token.midtrans*`, dan `proxy` sengaja tidak dikirim (MVP tanpa
 * pembayaran). Core memakai default internal lewat optional chaining, dan webhook
 * pembayaran tidak dijalankan selama server key kosong.
 */
export function defaultBotConfig(): BotConfigFile {
  return {
    botname: 'Rexify Bot',
    ownername: 'Rexify User',
    owner: [],
    nomor: '',
    tz: 'Asia/Jakarta',
    thumbnailUrl: '',
    audioUrl: '',
    web: 'https://rexapi.my.id/',
    link: { group: '', saluran: '' },
    id: { saluran: '', group: '', ownerGroup: '' },
    limit: { free: 25, premium: 200 },
    antilink: {
      whitelist_domain: [
        'tokopedia.com',
        'shopee.co.id',
        'bukalapak.com',
        'lazada.co.id',
        'blibli.com',
        'tiktok.com',
        'instagram.com',
        'facebook.com',
        'twitter.com',
        'youtube.com',
        'google.com',
      ],
      whitelist_number: [''],
    },
    premium: {
      packages: [
        { id: '1hari', label: '1 Hari', days: 1, price: 2000 },
        { id: '3hari', label: '3 Hari', days: 3, price: 3000 },
        { id: '7hari', label: '7 Hari', days: 7, price: 5000 },
        { id: '30hari', label: '30 Hari', days: 30, price: 10000 },
        { id: 'permanen', label: 'Permanen', days: 0, price: 50000, permanent: true },
      ],
    },
    git: { name: [''], token: [''] },
    apikey: {
      rex: 'https://rexapi.my.id',
      jerexd: 'https://api.jerexd.my.id',
    },
    token: {
      rex: process.env.REX_API_KEY ?? '',
      jerexd: '',
    },
    auto_reply: [],
    welcome_msg: { ...DEFAULT_WELCOME_MSG },
  };
}