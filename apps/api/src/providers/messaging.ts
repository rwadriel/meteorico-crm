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
  error?: string;
}

export interface IncomingMessage {
  externalMessageId: string;
  from: string;
  content: string;
  messageType: string;
  timestamp: string;
  referral?: {
    source: string;
    body?: string;
  };
}

export interface WebhookPayload {
  provider: string;
  type: 'message' | 'status';
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
  verifyWebhook(headers: Record<string, string>, body: unknown): boolean;
  parseWebhook(headers: Record<string, string>, body: unknown): WebhookPayload | null;
  formatInteractive(payload: MessagePayload): MessagePayload;
}

export function createNumberedFallback(buttons: Array<{ id: string; label: string }>): string {
  return buttons.map((b, i) => `${i + 1}. ${b.label}`).join('\n');
}
