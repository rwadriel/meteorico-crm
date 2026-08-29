import type { PrismaClient } from '@meteorico/database';
import { normalizeWhatsAppPhone } from '@meteorico/shared';
import type {
  IncomingMessage,
  DeliveryStatus,
  MessagingProvider,
  MessagePayload,
} from '../providers/messaging.js';

export interface AttributionData {
  source: string;
  medium: string;
  campaignRef: string;
  landingUrl: string;
  metaCampaignId?: string;
  metaAdsetId?: string;
  metaAdId?: string;
  creativeId?: string;
  placement?: string;
  trackingCode?: string;
  clickedAt?: Date;
  confidence: 'high' | 'medium' | 'low';
}

export async function handleIncomingMessage(
  db: PrismaClient,
  incoming: IncomingMessage,
  provider: MessagingProvider,
): Promise<{
  conversationId: string;
  contactId: string;
  isNew: boolean;
  isDuplicate: boolean;
}> {
  const existingMessage = await db.conversationMessage.findUnique({
    where: { externalMessageId: incoming.externalMessageId },
    include: { conversation: { select: { contactId: true } } },
  });
  if (existingMessage) {
    return {
      conversationId: existingMessage.conversationId,
      contactId: existingMessage.conversation.contactId,
      isNew: false,
      isDuplicate: true,
    };
  }

  const phone = normalizeWhatsAppPhone(incoming.from);
  if (!phone) throw new Error('Invalid sender phone');

  let contact = await db.contact.findFirst({
    where: {
      OR: [{ phone }, { normalizedPhone: phone }],
    },
  });

  if (!contact) {
    contact = await db.contact.create({
      data: {
        phone,
        normalizedPhone: phone,
        name: '',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
  } else {
    await db.contact.update({
      where: { id: contact.id },
      data: {
        lastSeenAt: new Date(),
        phone: contact.phone ?? phone,
        normalizedPhone: phone,
      },
    });
  }

  let conversation = await db.conversation.findFirst({
    where: { contactId: contact.id, status: 'active' },
  });

  const isNew = !conversation;

  if (!conversation) {
    conversation = await db.conversation.create({
      data: {
        contactId: contact.id,
        status: 'active',
        startedAt: new Date(),
      },
    });
  }

  await db.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      direction: 'inbound',
      content: incoming.content,
      messageType: incoming.messageType,
      externalMessageId: incoming.externalMessageId,
      provider: provider.name,
      deliveryStatus: 'delivered',
      sentAt: new Date(incoming.timestamp),
    },
  });

  if (isNew && incoming.referral) {
    await tryAttributeFromReferral(db, contact.id, conversation.id, incoming.referral);
  }

  return {
    conversationId: conversation.id,
    contactId: contact.id,
    isNew,
    isDuplicate: false,
  };
}

export async function handleDeliveryStatus(db: PrismaClient, status: DeliveryStatus) {
  const message = await db.conversationMessage.findUnique({
    where: { externalMessageId: status.externalMessageId },
  });

  if (!message) return;

  const data: Record<string, unknown> = {
    deliveryStatus: status.status,
  };
  if (status.status === 'delivered') data.deliveredAt = new Date(status.timestamp);
  if (status.status === 'read') data.readAt = new Date(status.timestamp);

  await db.conversationMessage.update({
    where: { id: message.id },
    data,
  });

  await db.outboundRecord.updateMany({
    where: { providerMessageId: status.externalMessageId },
    data: {
      status: status.status,
      ...(status.status === 'sent' ? { sentAt: new Date(status.timestamp) } : {}),
      ...(status.status === 'failed' ? { lastError: status.error ?? 'meta_delivery_failed' } : {}),
    },
  });

  await db.auditLog.create({
    data: {
      action: `outbound.${status.status}`,
      resource: 'conversation_messages',
      resourceId: message.id,
      newValue: { status: status.status },
    },
  });
}

export async function sendMessage(
  db: PrismaClient,
  provider: MessagingProvider,
  conversationId: string,
  payload: MessagePayload,
) {
  const optOut = await db.contactPreference.findFirst({
    where: {
      contact: {
        conversations: { some: { id: conversationId } },
      },
      channel: 'whatsapp',
      optedOut: true,
    },
  });

  if (optOut) {
    throw new Error('Contact has opted out');
  }

  const formatted = provider.capabilities.interactiveButtons
    ? payload
    : provider.formatInteractive(payload);

  const { externalMessageId } = await provider.sendMessage(formatted);

  return db.conversationMessage.create({
    data: {
      conversationId,
      direction: 'outbound',
      content: formatted.content,
      messageType: formatted.messageType,
      externalMessageId,
      provider: provider.name,
      deliveryStatus: 'sent',
      sentAt: new Date(),
    },
  });
}

export async function optOutContact(db: PrismaClient, contactId: string, channel = 'whatsapp') {
  return db.contactPreference.upsert({
    where: {
      contactId_channel: { contactId, channel },
    },
    create: {
      contactId,
      channel,
      optedOut: true,
    },
    update: {
      optedOut: true,
    },
  });
}

export async function optInContact(db: PrismaClient, contactId: string, channel = 'whatsapp') {
  return db.contactPreference.upsert({
    where: {
      contactId_channel: { contactId, channel },
    },
    create: {
      contactId,
      channel,
      optedOut: false,
    },
    update: {
      optedOut: false,
    },
  });
}

export async function attributeConversation(
  db: PrismaClient,
  contactId: string,
  campaignId: string,
  attribution: AttributionData,
) {
  let participation = await db.campaignParticipation.findUnique({
    where: {
      contactId_campaignId: { contactId, campaignId },
    },
  });

  if (!participation) {
    participation = await db.campaignParticipation.create({
      data: {
        contactId,
        campaignId,
        status: 'active',
        classification: 'new',
      },
    });

    await db.contact.update({
      where: { id: contactId },
      data: { totalParticipations: { increment: 1 } },
    });
  }

  await db.leadAttribution.create({
    data: {
      participationId: participation.id,
      source: attribution.source,
      medium: attribution.medium,
      campaignRef: attribution.campaignRef,
      landingUrl: attribution.landingUrl,
      metaCampaignId: attribution.metaCampaignId ?? null,
      metaAdsetId: attribution.metaAdsetId ?? null,
      metaAdId: attribution.metaAdId ?? null,
      creativeId: attribution.creativeId ?? null,
      placement: attribution.placement ?? null,
      trackingCode: attribution.trackingCode ?? null,
      clickedAt: attribution.clickedAt ?? null,
      confidence: attribution.confidence,
    },
  });

  return participation;
}

async function tryAttributeFromReferral(
  db: PrismaClient,
  contactId: string,
  conversationId: string,
  referral: { source: string; body?: string },
) {
  const campaign = await db.campaign.findFirst({
    where: { status: 'active' },
    orderBy: { createdAt: 'desc' },
  });

  if (!campaign) return;

  await db.conversation.update({
    where: { id: conversationId },
    data: {
      participation: {
        connectOrCreate: {
          where: {
            contactId_campaignId: { contactId, campaignId: campaign.id },
          },
          create: {
            contactId,
            campaignId: campaign.id,
            status: 'active',
            classification: 'new',
          },
        },
      },
    },
  });

  const participation = await db.campaignParticipation.findUnique({
    where: {
      contactId_campaignId: { contactId, campaignId: campaign.id },
    },
  });

  if (participation) {
    await db.leadAttribution.create({
      data: {
        participationId: participation.id,
        source: referral.source,
        medium: 'referral',
        campaignRef: campaign.slug,
        landingUrl: '',
      },
    });
  }
}
