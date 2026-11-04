import { apiRequest } from './api';
import type { AutoReplyRule, BotConfig, PluginLog, Session } from './types';

interface SessionDetail {
  session: Session;
  pm2: string | null;
}

export function listSessions(): Promise<Session[]> {
  return apiRequest<{ sessions: Session[] }>('/sessions').then((data) => data.sessions);
}

export function createSession(label: string | null): Promise<Session> {
  return apiRequest<{ session: Session }>('/sessions', {
    method: 'POST',
    body: { label },
  }).then((data) => data.session);
}

export function getSession(sessionId: string): Promise<SessionDetail> {
  return apiRequest<SessionDetail>(`/sessions/${sessionId}`);
}

export function connectSession(sessionId: string): Promise<SessionDetail> {
  return apiRequest<SessionDetail>(`/sessions/${sessionId}/connect`, { method: 'POST' });
}

export function disconnectSession(sessionId: string): Promise<SessionDetail> {
  return apiRequest<SessionDetail>(`/sessions/${sessionId}/disconnect`, { method: 'POST' });
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

export function countEnabledPlugins(config: BotConfig): number {
  return Object.values(config.pluginsEnabled).filter(Boolean).length;
}