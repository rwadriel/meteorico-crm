import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizeWhatsAppPhone } from './phone.js';

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

export interface MetaGraphError {
  type: string | null;
  code: number | null;
  subcode: number | null;
  message: string | null;
  fbtrace_id: string | null;
}

export interface MetaCheckResult {
  status: 'ok' | 'failed' | 'not_run';
  httpStatus: number | null;
  error: MetaGraphError | null;
}

export interface MetaTokenDiagnostics {
  present: boolean;
  empty: boolean;
  leadingWhitespace: boolean;
  trailingWhitespace: boolean;
  containsNewline: boolean;
  wrappedInQuotes: boolean;
  length: number;
}

export interface MetaAccessVerification {
  authenticated: boolean;
  tokenDiagnostics: MetaTokenDiagnostics;
  checks: {
    tokenBasicAuth: MetaCheckResult;
    waba: MetaCheckResult;
    phoneNumber: MetaCheckResult;
  };
  phoneNumber: {
    id: string;
    displayNumber: string;
    verifiedName: string;
    qualityRating: string;
  } | null;
  waba: { id: string; name: string } | null;
  error: string | null;
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
    .map((entry) => normalizeWhatsAppPhone(entry.trim()))
    .filter((entry): entry is string => entry !== null);
  return new Set(normalized);
}

export function assertStagingRecipientAllowed(
  phone: string,
  deploymentEnvironment: string,
  allowlist: string | string[] | undefined,
): string {
  const normalized = normalizeWhatsAppPhone(phone);
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
            const externalMessageId = readString(message?.id);
            const from = readString(message?.from);
            const timestamp = unixSecondsToIso(readString(message?.timestamp));
            const content = inboundMessageContent(message);
            if (!message || !externalMessageId || !from || !timestamp || !content) {
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
                content,
                messageType: message.type === 'text' ? 'text' : 'interactive',
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

  async verifyAccess(): Promise<MetaAccessVerification> {
    const token = this.config.accessToken;
    const tokenDiagnostics: MetaTokenDiagnostics = {
      present: token !== undefined && token !== null,
      empty: !token || token.length === 0,
      leadingWhitespace: !!token && token !== token.trimStart(),
      trailingWhitespace: !!token && token !== token.trimEnd(),
      containsNewline: !!token && /[\r\n]/.test(token),
      wrappedInQuotes:
        !!token &&
        token.length >= 2 &&
        ((token.startsWith('"') && token.endsWith('"')) ||
          (token.startsWith("'") && token.endsWith("'"))),
      length: token?.length ?? 0,
    };

    const result: MetaAccessVerification = {
      authenticated: false,
      tokenDiagnostics,
      checks: {
        tokenBasicAuth: { status: 'not_run', httpStatus: null, error: null },
        waba: { status: 'not_run', httpStatus: null, error: null },
        phoneNumber: { status: 'not_run', httpStatus: null, error: null },
      },
      phoneNumber: null,
      waba: null,
      error: null,
    };

    if (tokenDiagnostics.empty) {
      result.error = 'Token is empty';
      return result;
    }

    const effectiveToken = token.trim().replace(/^["']|["']$/g, '');
    const authHeaders = { Authorization: `Bearer ${effectiveToken}` };

    try {
      const meResp = await fetch(`https://graph.facebook.com/${this.graphApiVersion}/me`, {
        headers: authHeaders,
      });
      const meBody = (await meResp.json().catch(() => null)) as unknown;
      result.checks.tokenBasicAuth.httpStatus = meResp.status;
      if (!meResp.ok) {
        result.checks.tokenBasicAuth.status = 'failed';
        result.checks.tokenBasicAuth.error = extractMetaError(meBody);
        result.error = `Token basic auth failed (HTTP ${meResp.status})`;
      } else {
        result.checks.tokenBasicAuth.status = 'ok';
      }
    } catch (e) {
      result.checks.tokenBasicAuth.status = 'failed';
      result.checks.tokenBasicAuth.error = {
        type: 'NetworkError',
        code: null,
        subcode: null,
        message: e instanceof Error ? e.message : 'Unknown error',
        fbtrace_id: null,
      };
      result.error = e instanceof Error ? e.message : 'Unknown error';
    }

    try {
      const wabaResp = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${this.config.wabaId}?fields=name`,
        { headers: authHeaders },
      );
      const wabaBody = (await wabaResp.json().catch(() => null)) as unknown;
      result.checks.waba.httpStatus = wabaResp.status;
      if (!wabaResp.ok) {
        result.checks.waba.status = 'failed';
        result.checks.waba.error = extractMetaError(wabaBody);
        if (!result.error) result.error = `WABA read failed (HTTP ${wabaResp.status})`;
      } else {
        result.checks.waba.status = 'ok';
        const wabaRecord = asRecord(wabaBody);
        result.waba = {
          id: readString(wabaRecord?.id) ?? this.config.wabaId,
          name: readString(wabaRecord?.name) ?? '',
        };
      }
    } catch (e) {
      result.checks.waba.status = 'failed';
      result.checks.waba.error = {
        type: 'NetworkError',
        code: null,
        subcode: null,
        message: e instanceof Error ? e.message : 'Unknown error',
        fbtrace_id: null,
      };
    }

    try {
      const phoneResp = await fetch(
        `https://graph.facebook.com/${this.graphApiVersion}/${this.config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
        { headers: authHeaders },
      );
      const phoneBody = (await phoneResp.json().catch(() => null)) as unknown;
      result.checks.phoneNumber.httpStatus = phoneResp.status;
      if (!phoneResp.ok) {
        result.checks.phoneNumber.status = 'failed';
        result.checks.phoneNumber.error = extractMetaError(phoneBody);
        if (!result.error) result.error = `Phone Number read failed (HTTP ${phoneResp.status})`;
      } else {
        result.checks.phoneNumber.status = 'ok';
        const phoneRecord = asRecord(phoneBody);
        result.phoneNumber = {
          id: readString(phoneRecord?.id) ?? this.config.phoneNumberId,
          displayNumber: readString(phoneRecord?.display_phone_number) ?? '',
          verifiedName: readString(phoneRecord?.verified_name) ?? '',
          qualityRating: readString(phoneRecord?.quality_rating) ?? '',
        };
      }
    } catch (e) {
      result.checks.phoneNumber.status = 'failed';
      result.checks.phoneNumber.error = {
        type: 'NetworkError',
        code: null,
        subcode: null,
        message: e instanceof Error ? e.message : 'Unknown error',
        fbtrace_id: null,
      };
    }

    result.authenticated =
      result.checks.tokenBasicAuth.status === 'ok' &&
      result.checks.waba.status === 'ok' &&
      result.checks.phoneNumber.status === 'ok';

    return result;
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

function inboundMessageContent(message: Record<string, unknown> | null): string | null {
  if (!message) return null;
  if (message.type === 'text') return readString(asRecord(message.text)?.body);
  if (message.type === 'button') {
    const button = asRecord(message.button);
    return readString(button?.text) ?? readString(button?.payload);
  }
  if (message.type === 'interactive') {
    const interactive = asRecord(message.interactive);
    const buttonReply = asRecord(interactive?.button_reply);
    const listReply = asRecord(interactive?.list_reply);
    return (
      readString(buttonReply?.title) ??
      readString(buttonReply?.id) ??
      readString(listReply?.title) ??
      readString(listReply?.id)
    );
  }
  return null;
}

function extractMetaError(body: unknown): MetaGraphError {
  const root = asRecord(body);
  const err = asRecord(root?.error);
  return {
    type: readString(err?.type) ?? null,
    code: readNumber(err?.code) ?? null,
    subcode: readNumber(err?.error_subcode) ?? null,
    message: readString(err?.message) ?? null,
    fbtrace_id: readString(err?.fbtrace_id) ?? null,
  };
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
