import type {
  MessagingProvider,
  MessagePayload,
  ProviderCapabilities,
  WebhookPayload,
} from './messaging.js';
import { createNumberedFallback } from './messaging.js';

const MOCK_CAPABILITIES: ProviderCapabilities = {
  receiveWebhook: true,
  sendText: true,
  sendLink: true,
  interactiveButtons: false,
  deliveryStatus: true,
  serviceWindow: false,
  handoff: false,
};

export class MockMessagingProvider implements MessagingProvider {
  name = 'mock';
  capabilities = MOCK_CAPABILITIES;
  sentMessages: Array<MessagePayload & { externalMessageId: string }> = [];

  async sendMessage(payload: MessagePayload): Promise<{ externalMessageId: string }> {
    const externalMessageId = `mock-${crypto.randomUUID().slice(0, 8)}`;
    this.sentMessages.push({ ...payload, externalMessageId });
    return { externalMessageId };
  }

  verifyWebhook(_headers: Record<string, string>, _rawBody: Uint8Array): boolean {
    return true;
  }

  parseWebhook(_headers: Record<string, string>, body: unknown): WebhookPayload | null {
    if (!body || typeof body !== 'object') return null;
    return body as WebhookPayload;
  }

  formatInteractive(payload: MessagePayload): MessagePayload {
    if (payload.buttons && payload.buttons.length > 0) {
      return {
        ...payload,
        messageType: 'text',
        content: `${payload.content}\n\n${createNumberedFallback(payload.buttons)}`,
        buttons: undefined,
      };
    }
    return payload;
  }
}

let instance: MockMessagingProvider | null = null;

export function getMockProvider(): MockMessagingProvider {
  if (!instance) {
    instance = new MockMessagingProvider();
  }
  return instance;
}
