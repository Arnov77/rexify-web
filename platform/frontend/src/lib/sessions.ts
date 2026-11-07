import { apiRequest } from './api';
import type {
  AutoReplyRule,
  BotConfig,
  CommandCatalog,
  ConfigAuditEntry,
  ConnectMode,
  PluginLog,
  Session,
} from './types';

interface SessionDetail {
  session: Session;
  pm2: string | null;
}

export interface CreateSessionInput {
  label: string | null;
  phoneNumber: string;
  connectMode: ConnectMode;
}

export function listSessions(): Promise<Session[]> {
  return apiRequest<{ sessions: Session[] }>('/sessions').then((data) => data.sessions);
}

export function createSession(input: CreateSessionInput): Promise<Session> {
  return apiRequest<{ session: Session }>('/sessions', {
    method: 'POST',
    body: {
      label: input.label,
      phone_number: input.phoneNumber,
      connect_mode: input.connectMode,
    },
  }).then((data) => data.session);
}

export function getSession(sessionId: string): Promise<SessionDetail> {
  return apiRequest<SessionDetail>(`/sessions/${sessionId}`);
}

// Response berisi `session.has_credentials`: kalau true, bot reconnect sendiri dan
// frontend tidak perlu membuka modal QR/pairing.
export function connectSession(sessionId: string): Promise<SessionDetail> {
  return apiRequest<SessionDetail>(`/sessions/${sessionId}/connect`, { method: 'POST' });
}

export function disconnectSession(sessionId: string): Promise<SessionDetail> {
  return apiRequest<SessionDetail>(`/sessions/${sessionId}/disconnect`, { method: 'POST' });
}

// Hapus credentials Baileys: bot akan pairing/QR lagi, nomor input tidak berubah.
export function deleteCredentials(sessionId: string): Promise<void> {
  return apiRequest<{ ok: boolean }>(`/sessions/${sessionId}/credentials`, {
    method: 'DELETE',
  }).then(() => undefined);
}

// Ganti nomor bot: credentials lama dihapus di server, nomor input diganti, config di-regenerate.
export function changePhone(sessionId: string, phoneNumber: string): Promise<void> {
  return apiRequest<{ ok: boolean }>(`/sessions/${sessionId}/phone`, {
    method: 'PATCH',
    body: { phone_number: phoneNumber },
  }).then(() => undefined);
}

// Restart = stop lalu spawn ulang dengan config terbaru (server yang mengurus urutannya).
export function restartSession(sessionId: string): Promise<void> {
  return apiRequest<{ ok: boolean }>(`/sessions/${sessionId}/restart`, { method: 'POST' }).then(
    () => undefined,
  );
}

export function deleteSession(sessionId: string): Promise<void> {
  return apiRequest<{ deleted: boolean }>(`/sessions/${sessionId}`, { method: 'DELETE' }).then(
    () => undefined,
  );
}

export function getConfig(sessionId: string): Promise<BotConfig> {
  return apiRequest<{ config: BotConfig }>(`/sessions/${sessionId}/config`).then(
    (data) => data.config,
  );
}

export function updateConfig(sessionId: string, patch: Partial<BotConfig>): Promise<BotConfig> {
  return apiRequest<{ config: BotConfig }>(`/sessions/${sessionId}/config`, {
    method: 'PATCH',
    body: patch,
  }).then((data) => data.config);
}

export function addAutoReplyRule(
  sessionId: string,
  rule: Pick<AutoReplyRule, 'trigger' | 'response' | 'match' | 'enabled'>,
): Promise<{ rule: AutoReplyRule; config: BotConfig }> {
  return apiRequest<{ rule: AutoReplyRule; config: BotConfig }>(
    `/sessions/${sessionId}/config/auto-reply`,
    { method: 'POST', body: rule },
  );
}

export function removeAutoReplyRule(sessionId: string, ruleId: string): Promise<BotConfig> {
  return apiRequest<{ config: BotConfig }>(
    `/sessions/${sessionId}/config/auto-reply/${ruleId}`,
    { method: 'DELETE' },
  ).then((data) => data.config);
}

export function getPluginLogs(
  sessionId: string,
  limit = 50,
  offset = 0,
): Promise<{ logs: PluginLog[]; limit: number; offset: number }> {
  return apiRequest<{ logs: PluginLog[]; limit: number; offset: number }>(
    `/sessions/${sessionId}/logs?limit=${limit}&offset=${offset}`,
  );
}

// Katalog command sama untuk semua session (dibaca dari core/plugins di server).
export function getCommandCatalog(): Promise<CommandCatalog> {
  return apiRequest<CommandCatalog>('/commands');
}

// Generate ulang katalog dari source plugin core (hanya bisa kalau core ada di mesin platform).
export function refreshCommandCatalog(): Promise<CommandCatalog> {
  return apiRequest<CommandCatalog>('/commands/refresh', { method: 'POST' });
}

// Terapkan preset command (setelan massal per kategori); server yang menghitung daftar file.
export function applyCommandPreset(
  sessionId: string,
  presetId: string,
): Promise<{ config: BotConfig; preset: { id: string; label: string }; disabledTotal: number }> {
  return apiRequest<{
    config: BotConfig;
    preset: { id: string; label: string };
    disabledTotal: number;
  }>(`/sessions/${sessionId}/config/presets/${presetId}`, { method: 'POST' });
}

// Riwayat perubahan command/limit untuk tab Command.
export function getConfigAudit(sessionId: string, limit = 20, offset = 0): Promise<ConfigAuditEntry[]> {
  return apiRequest<{ logs: ConfigAuditEntry[] }>(
    `/sessions/${sessionId}/audit?limit=${limit}&offset=${offset}`,
  ).then((data) => data.logs);
}

// Jumlah command aktif = total katalog - yang dimatikan user. Entry tanpa command
// (plugin event murni) tidak dihitung supaya angkanya tidak membingungkan.
export function countEnabledCommands(catalog: CommandCatalog, config: BotConfig): number {
  const runnable = catalog.commands.filter((entry) => entry.commands.length > 0);
  const disabled = new Set(config.commandsDisabled);
  return runnable.filter((entry) => !disabled.has(entry.file)).length;
}