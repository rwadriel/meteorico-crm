import { createWorkerLogger } from '../logger.js';

const logger = createWorkerLogger();

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
  events: WmEvent[];
  nextSince: number;
  hasMore: boolean;
  lastSeq: number;
}

export interface WmHealthResponse {
  ok: boolean;
  lastSeq: number;
  events: number;
}

export interface WmSnapshotGroup {
  groupId: string;
  groupName: string;
  memberCount?: number;
  updatedAt: string;
  members?: WmParticipant[];
}

export interface WmSnapshotsResponse {
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
    return this.request<WmHealthResponse>('/api/integration/health');
  }

  async events(since: number, limit = 2000): Promise<WmEventsResponse> {
    return this.request<WmEventsResponse>(
      `/api/integration/events?since=${since}&limit=${limit}`,
    );
  }

  async snapshots(groupId?: string): Promise<WmSnapshotsResponse> {
    const qs = groupId ? `?groupId=${encodeURIComponent(groupId)}` : '';
    return this.request<WmSnapshotsResponse>(
      `/api/integration/snapshots${qs}`,
    );
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
