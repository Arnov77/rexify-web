import type {
  AiSettings,
  AutoReplyRule,
  CustomSettings,
  MatchType,
  PluginsEnabled,
  WelcomeMsg,
} from '../types/config';

const MATCH_TYPES: MatchType[] = ['exact', 'contains', 'startswith', 'regex'];
const MAX_PREFIX_LENGTH = 3;
const MAX_TYPING_DELAY = 5000;
// Batas panjang konfigurasi AI: cukup untuk prompt panjang, tapi tidak membengkakkan JSONB.
const MAX_AI_NAME_LENGTH = 60;
const MAX_AI_FIELD_LENGTH = 2000;
const MAX_AI_SYSTEM_PROMPT_LENGTH = 12000;

// Field teks customSettings yang boleh kosong (diisi user sendiri).
const OPTIONAL_TEXT_FIELDS = [
  'botname',
  'ownername',
  'owner_number',
  'thumbnailUrl',
  'audioUrl',
  'web',
  'link_group',
  'link_saluran',
  'id_saluran',
  'id_group',
  'id_ownerGroup',
  'token_rex',
  'token_jerexd',
  'git_name',
  'git_token',
] as const;

const STRING_ARRAY_FIELDS = [
  'antilink_whitelist_domain',
  'antilink_whitelist_number',
] as const;

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

  // Teks bebas (boleh kosong) — dipakai identitas bot, link/id grup, dan API key.
  for (const field of OPTIONAL_TEXT_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    if (typeof value !== 'string') {
      throw new ValidationError(`${field} harus berupa teks`);
    }
    result[field] = value.trim();
  }

  // Nomor owner opsional: kosong = pakai nomor session. Disimpan sebagai digit saja karena
  // core mencocokkan global.owner dengan nomor pengirim.
  if (result.owner_number) {
    const digits = result.owner_number.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      throw new ValidationError('owner_number harus 8-15 digit');
    }
    result.owner_number = digits;
  }

  if (input.prefix !== undefined) {
    if (typeof input.prefix !== 'string' || input.prefix.trim().length === 0) {
      throw new ValidationError('prefix wajib diisi');
    }
    if (input.prefix.length > MAX_PREFIX_LENGTH) {
      throw new ValidationError(`prefix maksimal ${MAX_PREFIX_LENGTH} karakter`);
    }
    result.prefix = input.prefix.trim();
  }

  if (input.tz !== undefined) {
    if (typeof input.tz !== 'string' || !input.tz.trim()) {
      throw new ValidationError('tz wajib diisi');
    }
    result.tz = input.tz.trim();
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

  for (const field of ['limit_free', 'limit_premium'] as const) {
    const value = input[field];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new ValidationError(`${field} harus angka positif`);
    }
    result[field] = Math.floor(value);
  }

  for (const field of STRING_ARRAY_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
      throw new ValidationError(`${field} harus array of string`);
    }
    result[field] = value.map((entry) => (entry as string).trim()).filter(Boolean);
  }

  if (input.premium_packages !== undefined) {
    const packages = input.premium_packages;
    if (!Array.isArray(packages)) {
      throw new ValidationError('premium_packages harus array');
    }
    result.premium_packages = packages.map((item, index) => {
      if (!isRecord(item)) {
        throw new ValidationError(`premium_packages[${index}] harus berupa object`);
      }

      const id = typeof item.id === 'string' ? item.id.trim() : '';
      const label = typeof item.label === 'string' ? item.label.trim() : '';

      if (!id) throw new ValidationError(`premium_packages[${index}].id wajib diisi`);
      if (!label) throw new ValidationError(`premium_packages[${index}].label wajib diisi`);
      if (typeof item.days !== 'number' || !Number.isFinite(item.days) || item.days < 0) {
        throw new ValidationError(`premium_packages[${index}].days harus angka >= 0`);
      }
      if (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price < 0) {
        throw new ValidationError(`premium_packages[${index}].price harus angka >= 0`);
      }

      return {
        id,
        label,
        days: Math.floor(item.days),
        price: Math.floor(item.price),
        ...(item.permanent === undefined ? {} : { permanent: Boolean(item.permanent) }),
      };
    });
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

// Field teks konfigurasi AI; urutannya sama dengan payload API (lihat auto-ai.js).
const AI_TEXT_FIELDS = [
  'name',
  'persona',
  'tone',
  'defense_rules',
  'custom_instructions',
  'system_prompt',
] as const;

export function validateAiSettings(input: unknown): Partial<AiSettings> {
  if (!isRecord(input)) {
    throw new ValidationError('ai_settings harus berupa object');
  }

  const result: Partial<AiSettings> = {};

  for (const field of AI_TEXT_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    if (typeof value !== 'string') {
      throw new ValidationError(`ai_settings.${field} harus berupa teks`);
    }

    const max =
      field === 'name'
        ? MAX_AI_NAME_LENGTH
        : field === 'system_prompt'
          ? MAX_AI_SYSTEM_PROMPT_LENGTH
          : MAX_AI_FIELD_LENGTH;
    if (value.length > max) {
      throw new ValidationError(`ai_settings.${field} maksimal ${max} karakter`);
    }

    result[field] = value.trim();
  }

  return result;
}

// Satu entri = path relatif file plugin di core, bukan nama command: satu file bisa punya
// beberapa alias dan plugin.before (antilink/auto-AI) hanya bisa dimatikan per file.
const PLUGIN_PATH_PATTERN = /^plugins\/[a-z0-9_-]+\/[^/\\]+\.(js|mjs|cjs)$/i;
const MAX_DISABLED_COMMANDS = 500;

export function validateCommandsDisabled(input: unknown): string[] {
  if (!Array.isArray(input)) {
    throw new ValidationError('commands_disabled harus berupa array');
  }
  if (input.length > MAX_DISABLED_COMMANDS) {
    throw new ValidationError(`commands_disabled maksimal ${MAX_DISABLED_COMMANDS} entri`);
  }

  const paths = input.map((item, index) => {
    if (typeof item !== 'string') {
      throw new ValidationError(`commands_disabled[${index}] harus berupa teks`);
    }
    const normalized = item.trim().replace(/\\/g, '/');
    if (!PLUGIN_PATH_PATTERN.test(normalized)) {
      throw new ValidationError(
        `commands_disabled[${index}] harus path plugin, contoh plugins/downloader/tiktok.js`,
      );
    }
    return normalized;
  });

  return [...new Set(paths)];
}