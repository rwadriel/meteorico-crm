import { MetaCloudWhatsAppProvider, requireEnv } from '@meteorico/shared';
import type { MessagingProvider } from './messaging.js';
import { getMockProvider } from './messaging-mock.js';

export function getMessagingProvider(): MessagingProvider {
  const provider = (process.env.WHATSAPP_PRIVATE_PROVIDER ?? 'mock').toLowerCase();
  if (provider === 'mock') return getMockProvider();
  if (provider === 'meta_cloud') return createMetaCloudProvider();
  throw new Error(`Unsupported WhatsApp provider: ${provider}`);
}

export function createMetaCloudProvider(): MetaCloudWhatsAppProvider {
  return new MetaCloudWhatsAppProvider({
    accessToken: requireEnv('META_WHATSAPP_ACCESS_TOKEN'),
    phoneNumberId: requireEnv('META_WHATSAPP_PHONE_NUMBER_ID'),
    wabaId: requireEnv('META_WHATSAPP_WABA_ID'),
    appSecret: requireEnv('META_APP_SECRET'),
    graphApiVersion: process.env.META_GRAPH_API_VERSION ?? 'v25.0',
    deploymentEnvironment: process.env.DEPLOYMENT_ENV ?? 'development',
    stagingAllowlist: process.env.WHATSAPP_STAGING_ALLOWLIST,
  });
}
