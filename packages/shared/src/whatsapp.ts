import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizePhone } from './phone.js';

export interface MessagePayload {
  to: string;
  content: string;
  messageType: 'text' | 'link' | 'interactive';
  buttons?: Array<{ id: string; label: string }>;
  linkUrl?: string;
  linkPreview?: string;
}

export interface DeliveryStatus {
  externalMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  phoneNumberId?: string;
  error?: string;
}

export interface IncomingMessage {
  externalMessageId: string;
  from: string;
  content: string;
  messageType: string;
  timestamp: string;
  phoneNumberId?: string;
  referral?: {
    source: string;
    body?: string;
  };
}

export interface WebhookPayload {
  provider: string;
  type: 'message' | 'status';
  wabaId?: string;
  message?: IncomingMessage;
  status?: DeliveryStatus;
  raw: unknown;
}

export interface ProviderCapabilities {
  receiveWebhook: boolean;
  sendText: boolean;
  sendLink: boolean;
  interactiveButtons: boolean;
  deliveryStatus: boolean;
  serviceWindow: boolean;
  handoff: boolean;
}

export interface MessagingProvider {
  name: string;
  capabilities: ProviderCapabilities;
  sendMessage(payload: MessagePayload): Promise<{ externalMessageId: string }>;
  verifyWebhook(headers: Record<string, string>, rawBody: Uint8Array): boolean;
  parseWebhook(
    headers: Record<string, string>,
    body: unknown,
  ): WebhookPayload | WebhookPayload[] | null;
  formatInteractive(payload: MessagePayload): MessagePayload;
}

export interface MetaCloudWhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
  appSecret: string;
  graphApiVersion?: string;
  deploymentEnvironment?: string;
  stagingAllowlist?: string | string[];
}

export class OutboundBlockedError extends Error {
  readonly code = 'RECIPIENT_NOT_ALLOWLISTED';

  constructor() {
    super('Recipient is not allowed for staging outbound');
    this.name = 'OutboundBlockedError';
  }
}

const META_CAPABILITIES: ProviderCapabilities = {
  receiveWebhook: true,
  sendText: true,
  sendLink: true,
  interactiveButtons: true,
  deliveryStatus: true,
  serviceWindow: true,
  handoff: false,
};

export function createNumberedFallback(buttons: Array<{ id: string; label: string }>): string {
  return buttons.map((button, index) => `${index + 1}. ${button.label}`).join('\n');
}

export function parseStagingAllowlist(value: string | string[] | undefined): Set<string> {
  const entries = Array.isArray(value) ? value : (value ?? '').split(',');
  const normalized = entries
    .map((entry) => normalizePhone(entry.trim()))
    .filter((entry): entry is string => entry !== null);
  return new Set(normalized);
}

export function assertStagingRecipientAllowed(
  phone: string,
  deploymentEnvironment: string,
  allowlist: string | string[] | undefined,
): string {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error('Invalid recipient phone');

  if (deploymentEnvironment.toLowerCase() === 'staging') {
    const allowed = parseStagingAllowlist(allowlist);
    if (!allowed.has(normalized)) throw new OutboundBlockedError();
  }

  return normalized;
}

export class MetaCloudWhatsAppProvider implements MessagingProvider {
  readonly name = 'meta_cloud';
  readonly capabilities = META_CAPABILITIES;

  private readonly graphApiVersion: string;
  private readonly deploymentEnvironment: string;
  private readonly stagingAllowlist: string | string[] | undefined;

  constructor(private readonly config: MetaCloudWhatsAppConfig) {
    this.graphApiVersion = config.graphApiVersion ?? 'v25.0';
    this.deploymentEnvironment = config.deploymentEnvironment ?? 'development';
    this.stagingAllowlist = config.stagingAllowlist;
  }

  async sendMessage(payload: MessagePayload): Promise<{ externalMessageId: string }> {
    const to = assertStagingRecipientAllowed(
      payload.to,
      this.deploymentEnvironment,
      this.stagingAllowlist,
    );

    const body = this.buildGraphPayload({ ...payload, to });
    const response = await fetch(
      `https://graph.facebook.com/${this.graphApiVersion}/${this.config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    const responseBody = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const errorCode = readNestedNumber(responseBody, ['error', 'code']);
      throw new Error(
        `Meta Cloud API request failed (HTTP ${response.status}, code ${errorCode ?? 'unknown'})`,
      );
    }

    const externalMessageId = readNestedString(responseBody, ['messages', '0', 'id']);
    if (!externalMessageId) {
      throw new Error('Meta Cloud API response did not include a message id');
    }

    return { externalMessageId };
  }

  verifyWebhook(headers: Record<string, string>, rawBody: Uint8Array): boolean {
    const signature = headers['x-hub-signature-256'] ?? headers['X-Hub-Signature-256'];
    if (!signature?.startsWith('sha256=') || !this.config.appSecret) return false;

    const suppliedHex = signature.slice('sha256='.length);
    if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;

    const expected = createHmac('sha256', this.config.appSecret).update(rawBody).digest();
    const supplied = Buffer.from(suppliedHex, 'hex');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }

  parseWebhook(_headers: Record<string, string>, body: unknown): WebhookPayload[] | null {
    const root = asRecord(body);
    if (!root || root.object !== 'whatsapp_business_account' || !Array.isArray(root.entry)) {
      return null;
    }

    const payloads: WebhookPayload[] = [];
    for (const rawEntry of root.entry) {
      const entry = asRecord(rawEntry);
      if (!entry || entry.id !== this.config.wabaId || !Array.isArray(entry.changes)) continue;

      for (const rawChange of entry.changes) {
        const change = asRecord(rawChange);
        const value = asRecord(change?.value);
        if (!change || change.field !== 'messages' || !value) continue;

        const metadata = asRecord(value.metadata);
        const phoneNumberId = readString(metadata?.phone_number_id);
        if (phoneNumberId !== this.config.phoneNumberId) continue;

        if (Array.isArray(value.messages)) {
          for (const rawMessage of value.messages) {
            const message = asRecord(rawMessage);
            const text = asRecord(message?.text);
            const externalMessageId = readString(message?.id);
            const from = readString(message?.from);
            const timestamp = unixSecondsToIso(readString(message?.timestamp));
            if (
              !message ||
              message.type !== 'text' ||
              !externalMessageId ||
              !from ||
              !timestamp ||
              typeof text?.body !== 'string'
            ) {
              continue;
            }

            const referral = asRecord(message.referral);
            const source = readString(referral?.source_url) ?? readString(referral?.source_type);
            payloads.push({
              provider: this.name,
              type: 'message',
              wabaId: entry.id,
              message: {
                externalMessageId,
                from,
                content: text.body,
                messageType: 'text',
                timestamp,
                phoneNumberId,
                ...(source
                  ? {
                      referral: {
                        source,
                        body: readString(referral?.body) ?? undefined,
                      },
                    }
                  : {}),
              },
              raw: rawMessage,
            });
          }
        }

        if (Array.isArray(value.statuses)) {
          for (const rawStatus of value.statuses) {
            const statusRecord = asRecord(rawStatus);
            const externalMessageId = readString(statusRecord?.id);
            const status = readDeliveryStatus(statusRecord?.status);
            const timestamp = unixSecondsToIso(readString(statusRecord?.timestamp));
            if (!externalMessageId || !status || !timestamp) continue;

            const errors = Array.isArray(statusRecord?.errors) ? statusRecord.errors : [];
            const firstError = asRecord(errors[0]);
            const errorCode = readNumber(firstError?.code);
            payloads.push({
              provider: this.name,
              type: 'status',
              wabaId: entry.id,
              status: {
                externalMessageId,
                status,
                timestamp,
                phoneNumberId,
                ...(errorCode === null ? {} : { error: `meta_error_code_${errorCode}` }),
              },
              raw: rawStatus,
            });
          }
        }
      }
    }

    return payloads;
  }

  formatInteractive(payload: MessagePayload): MessagePayload {
    return payload;
  }

  private buildGraphPayload(payload: MessagePayload): Record<string, unknown> {
    if (payload.messageType === 'interactive' && payload.buttons?.length) {
      return {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: payload.to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: payload.content },
          action: {
            buttons: payload.buttons.slice(0, 3).map((button) => ({
              type: 'reply',
              reply: { id: button.id, title: button.label.slice(0, 20) },
            })),
          },
        },
      };
    }

    const content = payload.linkUrl
      ? `${payload.content}\n${payload.linkUrl}`.trim()
      : payload.content;
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: payload.to,
      type: 'text',
      text: {
        body: content,
        preview_url: payload.messageType === 'link',
      },
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readNestedString(value: unknown, path: string[]): string | null {
  let current: unknown = value;
  for (const segment of path) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else {
      current = asRecord(current)?.[segment];
    }
  }
  return readString(current);
}

function readNestedNumber(value: unknown, path: string[]): number | null {
  let current: unknown = value;
  for (const segment of path) current = asRecord(current)?.[segment];
  return readNumber(current);
}

function unixSecondsToIso(value: string | null): string | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp)) return null;
  return new Date(timestamp * 1000).toISOString();
}

function readDeliveryStatus(value: unknown): DeliveryStatus['status'] | null {
  return value === 'sent' || value === 'delivered' || value === 'read' || value === 'failed'
    ? value
    : null;
}
