import {
  MetaCloudWhatsAppProvider,
  requireEnv,
  type MessagePayload,
  type MessagingProvider,
  type WebhookPayload,
} from '@meteorico/shared';

class WorkerMockMessagingProvider implements MessagingProvider {
  readonly name = 'mock';
  readonly capabilities = {
    receiveWebhook: false,
    sendText: true,
    sendLink: true,
    interactiveButtons: false,
    deliveryStatus: false,
    serviceWindow: false,
    handoff: false,
  };

  async sendMessage(_payload: MessagePayload): Promise<{ externalMessageId: string }> {
    return { externalMessageId: `mock-${crypto.randomUUID().slice(0, 8)}` };
  }

  verifyWebhook(_headers: Record<string, string>, _rawBody: Uint8Array): boolean {
    return false;
  }

  parseWebhook(_headers: Record<string, string>, _body: unknown): WebhookPayload | null {
    return null;
  }

  formatInteractive(payload: MessagePayload): MessagePayload {
    return { ...payload, messageType: 'text', buttons: undefined };
  }
}

export function createOutboundMessagingProvider(): MessagingProvider {
  const provider = (process.env.WHATSAPP_PRIVATE_PROVIDER ?? 'mock').toLowerCase();
  if (provider === 'mock') return new WorkerMockMessagingProvider();
  if (provider !== 'meta_cloud') {
    throw new Error(`Unsupported WhatsApp provider: ${provider}`);
  }

  return new MetaCloudWhatsAppProvider({
    accessToken: requireEnv('META_WHATSAPP_ACCESS_TOKEN'),
    phoneNumberId: requireEnv('META_WHATSAPP_PHONE_NUMBER_ID'),
    wabaId: requireEnv('META_WHATSAPP_WABA_ID'),
    appSecret: process.env.META_APP_SECRET ?? '',
    graphApiVersion: process.env.META_GRAPH_API_VERSION ?? 'v25.0',
    deploymentEnvironment: process.env.DEPLOYMENT_ENV ?? 'development',
    stagingAllowlist: process.env.WHATSAPP_STAGING_ALLOWLIST,
  });
}
