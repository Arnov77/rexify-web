import type {
  AutoReplyRule,
  CustomSettings,
  MatchType,
  PluginsEnabled,
  WelcomeMsg,
} from '../types/config';

const MATCH_TYPES: MatchType[] = ['exact', 'contains', 'startswith', 'regex'];
const LANGUAGES: CustomSettings['language'][] = ['id', 'en'];
const MAX_PREFIX_LENGTH = 3;
const MAX_TYPING_DELAY = 5000;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateAutoReply(input: unknown): AutoReplyRule[] {
  if (!Array.isArray(input)) {
    throw new ValidationError('auto_reply harus berupa array');
  }

  return input.map((item, index) => {
    if (!isRecord(item)) {
      throw new ValidationError(`auto_reply[${index}] harus berupa object`);
    }

    const trigger = typeof item.trigger === 'string' ? item.trigger.trim() : '';
    const response = typeof item.response === 'string' ? item.response : '';
    const match = item.match;

    if (!trigger) {
      throw new ValidationError(`auto_reply[${index}].trigger tidak boleh kosong`);
    }
    if (!response.trim()) {
      throw new ValidationError(`auto_reply[${index}].response tidak boleh kosong`);
    }
    if (typeof match !== 'string' || !MATCH_TYPES.includes(match as MatchType)) {
      throw new ValidationError(`auto_reply[${index}].match harus salah satu: ${MATCH_TYPES.join(', ')}`);
    }
    if (match === 'regex') {
      try {
        new RegExp(trigger);
      } catch {
        throw new ValidationError(`auto_reply[${index}].trigger bukan regex valid`);
      }
    }

    return {
      id: typeof item.id === 'string' && item.id.trim() ? item.id : '',
      trigger,
      response,
      match: match as MatchType,
      enabled: item.enabled === undefined ? true : Boolean(item.enabled),
    };
  });
}

export function validateCustomSettings(input: unknown): Partial<CustomSettings> {
  if (!isRecord(input)) {
    throw new ValidationError('custom_settings harus berupa object');
  }

  const result: Partial<CustomSettings> = {};

  if (input.botname !== undefined) {
    if (typeof input.botname !== 'string' || !input.botname.trim()) {
      throw new ValidationError('botname tidak boleh kosong');
    }
    result.botname = input.botname.trim();
  }

  if (input.prefix !== undefined) {
    if (typeof input.prefix !== 'string' || input.prefix.length > MAX_PREFIX_LENGTH) {
      throw new ValidationError(`prefix maksimal ${MAX_PREFIX_LENGTH} karakter`);
    }
    result.prefix = input.prefix;
  }

  if (input.language !== undefined) {
    if (typeof input.language !== 'string' || !LANGUAGES.includes(input.language as CustomSettings['language'])) {
      throw new ValidationError(`language harus salah satu: ${LANGUAGES.join(', ')}`);
    }
    result.language = input.language as CustomSettings['language'];
  }

  if (input.typingDelay !== undefined) {
    const delay = input.typingDelay;
    if (typeof delay !== 'number' || !Number.isInteger(delay) || delay < 0 || delay > MAX_TYPING_DELAY) {
      throw new ValidationError(`typingDelay harus bilangan bulat 0-${MAX_TYPING_DELAY}`);
    }
    result.typingDelay = delay;
  }

  if (input.readReceipt !== undefined) {
    if (typeof input.readReceipt !== 'boolean') {
      throw new ValidationError('readReceipt harus boolean');
    }
    result.readReceipt = input.readReceipt;
  }

  if (input.antilink_whitelist !== undefined) {
    const list = input.antilink_whitelist;
    if (!Array.isArray(list) || list.some((entry) => typeof entry !== 'string')) {
      throw new ValidationError('antilink_whitelist harus array of string');
    }
    result.antilink_whitelist = list.map((entry) => (entry as string).trim()).filter(Boolean);
  }

  return result;
}

export function validateWelcomeMsg(input: unknown): Partial<WelcomeMsg> {
  if (!isRecord(input)) {
    throw new ValidationError('welcome_msg harus berupa object');
  }

  const patch: Partial<WelcomeMsg> = {};

  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') {
      throw new ValidationError('welcome_msg.enabled harus boolean');
    }
    patch.enabled = input.enabled;
  }
  if (input.message !== undefined) {
    if (typeof input.message !== 'string') {
      throw new ValidationError('welcome_msg.message harus teks');
    }
    patch.message = input.message;
  }
  if (input.onlyOnce !== undefined) {
    if (typeof input.onlyOnce !== 'boolean') {
      throw new ValidationError('welcome_msg.onlyOnce harus boolean');
    }
    patch.onlyOnce = input.onlyOnce;
  }

  return patch;
}

export function validatePluginsEnabled(input: unknown): Partial<PluginsEnabled> {
  if (!isRecord(input)) {
    throw new ValidationError('plugins_enabled harus berupa object');
  }

  const result: Partial<PluginsEnabled> = {};
  const keys: (keyof PluginsEnabled)[] = ['autoReply', 'welcomeMsg', 'aiChat', 'downloader', 'antiLink'];

  for (const key of keys) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') {
      throw new ValidationError(`plugins_enabled.${key} harus boolean`);
    }
    result[key] = value;
  }

  return result;
}