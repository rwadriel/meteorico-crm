import { createWorkerLogger } from '../logger.js';
import { assertProviderSourceId } from '../source-aware-cursor.js';

const logger = createWorkerLogger();
const REQUEST_TIMEOUT_MS = 10000;

export interface WmParticipant {
  id: string;
  number: string | null;
  name: string;
  isSaved: boolean;
}

export interface WmEvent {
  seq: number;
  event_id: string;
  ts: string;
  event: 'entrou' | 'adicionado' | 'saiu' | 'removido' | 'baseline' | 'grupo_criado' | 'alteracao';
  groupId: string;
  groupName: string;
  participants: WmParticipant[];
  author: string;
  detail: string;
}

export interface WmEventsResponse {
  sourceId: string;
  events: WmEvent[];
  nextSince: number;
  hasMore: boolean;
  lastSeq: number;
}

export interface WmHealthResponse {
  sourceId: string;
  ok: boolean;
  lastSeq: number;
  events: number;
  connected?: boolean;
  status?: string;
}

export interface WmSnapshotGroup {
  groupId: string;
  groupName: string;
  memberCount?: number;
  updatedAt: string;
  members?: WmParticipant[];
}

export interface WmSnapshotsResponse {
  sourceId: string;
  groups: WmSnapshotGroup[];
}

export interface WhatsAppManagerProvider {
  health(): Promise<WmHealthResponse>;
  events(since: number, limit?: number): Promise<WmEventsResponse>;
  snapshots(groupId?: string): Promise<WmSnapshotsResponse>;
}

export class WhatsAppManagerReadProvider implements WhatsAppManagerProvider {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (res.status === 401) {
      throw new Error('WhatsApp Manager: unauthorized');
    }
    if (res.status === 503) {
      throw new Error('WhatsApp Manager: integration not configured');
    }
    if (!res.ok) {
      throw new Error(`WhatsApp Manager: HTTP ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  async health(): Promise<WmHealthResponse> {
    const response = await this.request<WmHealthResponse>('/api/integration/health');
    assertProviderSourceId(response.sourceId);
    return response;
  }

  async events(since: number, limit = 2000): Promise<WmEventsResponse> {
    const response = await this.request<WmEventsResponse>(
      `/api/integration/events?since=${since}&limit=${limit}`,
    );
    assertProviderSourceId(response.sourceId);
    return response;
  }

  async snapshots(groupId?: string): Promise<WmSnapshotsResponse> {
    const qs = groupId ? `?groupId=${encodeURIComponent(groupId)}` : '';
    const response = await this.request<WmSnapshotsResponse>(
      `/api/integration/snapshots${qs}`,
    );
    assertProviderSourceId(response.sourceId);
    return response;
  }
}

export function createProvider(): WhatsAppManagerProvider | null {
  const baseUrl = process.env.WHATSAPP_MANAGER_URL;
  const token = process.env.WHATSAPP_MANAGER_INTEGRATION_TOKEN;

  if (!baseUrl || !token) {
    logger.warn('WhatsApp Manager not configured (WHATSAPP_MANAGER_URL or token missing)');
    return null;
  }

  return new WhatsAppManagerReadProvider(baseUrl, token);
}
