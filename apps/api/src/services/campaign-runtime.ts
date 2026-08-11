import type { PrismaClient } from '@meteorico/database';
import { Prisma } from '@meteorico/database';
import { OutboundBlockedError, assertStagingRecipientAllowed } from '@meteorico/shared';
import { enqueueOutboundMessage } from '../queues/outbound-message.js';
import { writeAuditLog } from './audit.js';
import { classifyContact, type ContactClassification } from './classification.js';
import { renderTemplate } from './template.js';

const FLOW_NAME_PREFIX = 'campaign:';

type Enqueue = typeof enqueueOutboundMessage;

export interface CampaignRuntimeResult {
  campaignId: string | null;
  classification: ContactClassification | null;
  groupId: string | null;
  outboundQueued: boolean;
  duplicateOutbound: boolean;
  reason:
    | 'queued'
    | 'duplicate'
    | 'no_active_campaign'
    | 'no_available_group'
    | 'no_invite_link'
    | 'no_published_flow'
    | 'outbound_disabled'
    | 'blocked';
}

interface RuntimeInput {
  contactId: string;
  conversationId: string;
}

interface ResolvedMessage {
  content: string;
  templateId: string | null;
  sourceId: string;
}

export async function processInboundCampaign(
  db: PrismaClient,
  input: RuntimeInput,
  enqueue: Enqueue = enqueueOutboundMessage,
): Promise<CampaignRuntimeResult> {
  const campaign = await db.campaign.findFirst({
    where: { status: 'active' },
    orderBy: { createdAt: 'desc' },
  });

  if (!campaign) {
    return emptyResult('no_active_campaign');
  }

  const classification = await classifyContact(db, input.contactId, campaign.id, {
    allocateGroup: true,
    persist: false,
  });

  await writeAuditLog(db, {
    action: 'classification',
    resource: 'contacts',
    resourceId: input.contactId,
    newValue: {
      campaignId: campaign.id,
      classification: classification.classification,
      facts: classification.facts,
    },
  });

  if (!classification.groupId) {
    const reason = classification.classification === 'blocked' ? 'blocked' : 'no_available_group';
    return {
      campaignId: campaign.id,
      classification: classification.classification,
      groupId: null,
      outboundQueued: false,
      duplicateOutbound: false,
      reason,
    };
  }

  const [contact, group, resolvedMessage] = await Promise.all([
    db.contact.findUnique({ where: { id: input.contactId } }),
    db.group.findUnique({ where: { id: classification.groupId } }),
    resolvePublishedMessage(db, campaign.slug),
  ]);

  if (!contact || !group) {
    throw new Error('Campaign runtime context not found');
  }

  await writeAuditLog(db, {
    action: 'group.assigned',
    resource: 'groups',
    resourceId: group.id,
    newValue: {
      campaignId: campaign.id,
      contactId: contact.id,
      classification: classification.classification,
    },
  });

  if (!group.inviteLink) {
    return resultFor(classification.classification, campaign.id, group.id, 'no_invite_link');
  }

  if (!resolvedMessage) {
    return resultFor(classification.classification, campaign.id, group.id, 'no_published_flow');
  }

  const phone = contact.normalizedPhone ?? contact.phone ?? '';
  const content = renderTemplate(resolvedMessage.content, {
    nome: contact.name || 'Olá',
    telefone: phone,
    classificacao: classification.classification,
    campanha: campaign.name,
    grupo: group.name,
    edicao: campaign.editionNumber?.toString() ?? '',
    link: group.inviteLink,
    data_abertura: campaign.startsAt?.toISOString() ?? '',
    data_fechamento: campaign.endsAt?.toISOString() ?? '',
  });
  const idempotencyKey = [
    'campaign-group-link:v1',
    campaign.id,
    contact.id,
    group.id,
    resolvedMessage.sourceId,
  ].join(':');

  const existing = await db.outboundRecord.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return {
      campaignId: campaign.id,
      classification: classification.classification,
      groupId: group.id,
      outboundQueued: false,
      duplicateOutbound: true,
      reason: 'duplicate',
    };
  }

  if (process.env.WHATSAPP_OUTBOUND_ENABLED !== 'true') {
    await writeAuditLog(db, {
      action: 'outbound.disabled',
      resource: 'contacts',
      resourceId: contact.id,
      newValue: { campaignId: campaign.id, groupId: group.id },
    });
    return resultFor(classification.classification, campaign.id, group.id, 'outbound_disabled');
  }

  const provider = (process.env.WHATSAPP_PRIVATE_PROVIDER ?? 'mock').toLowerCase();
  try {
    assertStagingRecipientAllowed(
      phone,
      process.env.DEPLOYMENT_ENV ?? 'development',
      process.env.WHATSAPP_STAGING_ALLOWLIST,
    );
  } catch (error) {
    const reason = error instanceof OutboundBlockedError ? error.code : 'INVALID_RECIPIENT_PHONE';
    await db.outboundRecord.create({
      data: {
        idempotencyKey,
        contactId: contact.id,
        campaignId: campaign.id,
        conversationId: input.conversationId,
        provider,
        status: 'blocked',
        attempts: 0,
        lastError: reason,
      },
    });
    await writeAuditLog(db, {
      action: 'outbound.blocked',
      resource: 'outbound_records',
      resourceId: idempotencyKey,
      newValue: { campaignId: campaign.id, contactId: contact.id, reason },
    });
    return resultFor(classification.classification, campaign.id, group.id, 'blocked');
  }

  let record;
  try {
    record = await db.outboundRecord.create({
      data: {
        idempotencyKey,
        contactId: contact.id,
        campaignId: campaign.id,
        conversationId: input.conversationId,
        provider,
        status: 'pending',
        attempts: 0,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return {
        campaignId: campaign.id,
        classification: classification.classification,
        groupId: group.id,
        outboundQueued: false,
        duplicateOutbound: true,
        reason: 'duplicate',
      };
    }
    throw error;
  }

  try {
    await enqueue({
      conversationId: input.conversationId,
      contactId: contact.id,
      campaignId: campaign.id,
      content,
      messageType: 'link',
      templateId: resolvedMessage.templateId ?? undefined,
      idempotencyKey,
    });
  } catch (error) {
    await db.outboundRecord.update({
      where: { id: record.id },
      data: { status: 'failed', lastError: 'queue_unavailable' },
    });
    throw error;
  }

  await writeAuditLog(db, {
    action: 'outbound.queued',
    resource: 'outbound_records',
    resourceId: record.id,
    newValue: {
      campaignId: campaign.id,
      contactId: contact.id,
      groupId: group.id,
      templateId: resolvedMessage.templateId,
    },
  });

  return {
    campaignId: campaign.id,
    classification: classification.classification,
    groupId: group.id,
    outboundQueued: true,
    duplicateOutbound: false,
    reason: 'queued',
  };
}

async function resolvePublishedMessage(
  db: PrismaClient,
  campaignSlug: string,
): Promise<ResolvedMessage | null> {
  const flow = await db.flowDefinition.findFirst({
    where: {
      name: `${FLOW_NAME_PREFIX}${campaignSlug}`,
      trigger: 'on_classification',
      isActive: true,
    },
    include: {
      versions: {
        where: { isPublished: true },
        orderBy: { version: 'desc' },
        take: 1,
        include: {
          steps: {
            where: { stepType: 'message' },
            orderBy: { order: 'asc' },
            take: 1,
          },
        },
      },
    },
  });

  const step = flow?.versions[0]?.steps[0];
  if (!step) return null;

  const config = asObject(step.config);
  const templateId = step.templateId ?? stringValue(config.templateId);
  if (templateId) {
    const template = await db.messageTemplate.findFirst({
      where: { id: templateId, isActive: true },
      include: {
        versions: {
          where: { isCurrent: true },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });
    const version = template?.versions[0];
    if (!template || !version) return null;
    return {
      content: version.content,
      templateId: template.id,
      sourceId: version.id,
    };
  }

  const content = stringValue(config.content);
  return content ? { content, templateId: null, sourceId: step.id } : null;
}

function asObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function emptyResult(reason: CampaignRuntimeResult['reason']): CampaignRuntimeResult {
  return {
    campaignId: null,
    classification: null,
    groupId: null,
    outboundQueued: false,
    duplicateOutbound: false,
    reason,
  };
}

function resultFor(
  classification: ContactClassification,
  campaignId: string,
  groupId: string,
  reason: CampaignRuntimeResult['reason'],
): CampaignRuntimeResult {
  return {
    campaignId,
    classification,
    groupId,
    outboundQueued: false,
    duplicateOutbound: false,
    reason,
  };
}
