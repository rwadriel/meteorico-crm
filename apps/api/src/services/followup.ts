import type { Prisma, PrismaClient } from '@meteorico/database';
import { randomBytes } from 'node:crypto';
import {
  OutboundBlockedError,
  assertStagingRecipientAllowed,
  parseStagingAllowlist,
} from '@meteorico/shared';
import { uploadWhatsAppImage } from './meta-media.js';
import { extractMetaTemplateButtons, type MetaTemplateButton } from './meta-template.js';

export const FOLLOWUP_TEMPLATES = [
  {
    name: 'meteorico_acompanhamento',
    language: 'pt_BR',
    requiresUrl: false,
    label: 'Acompanhamento do grupo',
    preview:
      'Oi! Vi que você está no grupo do Meteórico e queria saber se está conseguindo acompanhar os conteúdos por lá.\n\nSe quiser, posso te ajudar por aqui com as informações mais importantes.\n\nSe não quiser mais receber mensagens sobre o Meteórico, responda SAIR.',
  },
  {
    name: 'meteorico_oferta',
    language: 'pt_BR',
    requiresUrl: true,
    label: 'Oferta disponível',
    preview:
      'Oi! A condição especial do Meteórico já está disponível.\n\nSe você quiser aproveitar, acesse:\n{{1}}\n\nSe tiver alguma dúvida, pode responder por aqui.\n\nSe não quiser mais receber mensagens sobre o Meteórico, responda SAIR.',
  },
  {
    name: 'meteorico_ultimo_aviso',
    language: 'pt_BR',
    requiresUrl: true,
    label: 'Último aviso',
    preview:
      'Oi! Passando para avisar que a condição especial do Meteórico está chegando ao fim.\n\nSe você ainda quiser aproveitar, acesse:\n{{1}}\n\nSe tiver alguma dúvida, responda esta mensagem.\n\nSe não quiser mais receber mensagens sobre o Meteórico, responda SAIR.',
  },
] as const;

const OPT_OUT_TERMS = new Set([
  'SAIR',
  'PARAR',
  'PARE',
  'CANCELAR',
  'REMOVER',
  'STOP',
  'NAO QUERO',
  'NAO TENHO INTERESSE',
]);
const TERMINAL_MESSAGE_STATUSES = ['submitted', 'sent', 'delivered', 'read', 'failed', 'skipped'];

export function getFollowupTemplate(name: string) {
  return FOLLOWUP_TEMPLATES.find((template) => template.name === name) ?? null;
}

export function validateFollowupCampaignInput(input: {
  name: string;
  templateName: string;
  offerUrl?: string | null;
}): void {
  if (!input.name.trim() || input.name.trim().length > 160) {
    throw new Error('Informe um nome de campanha válido');
  }
  const template = getFollowupTemplate(input.templateName);
  if (!template) throw new Error('Template não permitido');
  if (!template.requiresUrl) return;
  if (!input.offerUrl) throw new Error('Este template exige a URL da oferta');
  let url: URL;
  try {
    url = new URL(input.offerUrl);
  } catch {
    throw new Error('Informe uma URL de oferta válida');
  }
  if (url.protocol !== 'https:') throw new Error('A URL da oferta deve usar HTTPS');
}

export async function getAvailableFollowupTemplates(db: PrismaClient) {
  const managed = await db.messageTemplate.findMany({
    where: {
      isActive: true,
      metaStatus: 'APPROVED',
      language: 'pt_BR',
      metaCategory: { in: ['MARKETING', 'UTILITY'] },
    },
    include: { versions: { where: { isCurrent: true }, take: 1 } },
    orderBy: { updatedAt: 'desc' },
  });
  const result = managed
    .filter((template) => {
      const version = template.versions[0];
      const content = version?.content;
      const mediaReady = version?.headerFormat !== 'IMAGE' || Boolean(version.headerData);
      return Boolean(content) && mediaReady && !/\{\{(?!\d+\}\})/.test(content!);
    })
    .map((template) => {
      const preview = template.versions[0]!.content;
      const parameterCount = extractParameterCount(preview);
      const examples = Array.isArray(template.versions[0]!.exampleValues)
        ? template.versions[0]!.exampleValues.map(String)
        : [];
      const buttons = extractMetaTemplateButtons(template.versions[0]!.components);
      const hasTrackedUrlButton = buttons.some(
        (button) => button.type === 'URL' && button.url?.includes('{{1}}'),
      );
      const bodyRequiresUrl = parameterCount > 0 && /\b(link|url|acesse|acessar)\b/i.test(preview);
      return {
        id: template.id,
        name: template.name,
        language: template.language,
        label: template.label || template.name,
        preview,
        parameterCount,
        examples,
        requiresUrl: bodyRequiresUrl || hasTrackedUrlButton,
        urlMode: hasTrackedUrlButton
          ? ('button' as const)
          : bodyRequiresUrl
            ? ('body' as const)
            : null,
        buttons,
        category: template.metaCategory || template.requestedCategory || template.category,
        status: 'approved' as const,
        headerFormat: template.versions[0]!.headerFormat || 'NONE',
        hasHeaderImage: Boolean(template.versions[0]!.headerData),
      };
    });

  const known = new Set(result.map((template) => template.name));
  const approvedNames = new Set(
    (process.env.META_APPROVED_TEMPLATE_NAMES ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  );
  for (const legacy of FOLLOWUP_TEMPLATES) {
    if (known.has(legacy.name) || !approvedNames.has(legacy.name)) continue;
    result.push({
      id: legacy.name,
      ...legacy,
      parameterCount: extractParameterCount(legacy.preview),
      examples: legacy.requiresUrl ? ['https://sua-oferta.com'] : [],
      urlMode: legacy.requiresUrl ? ('body' as const) : null,
      buttons: [] as MetaTemplateButton[],
      category: 'MARKETING',
      status: 'approved' as const,
      headerFormat: 'NONE',
      hasHeaderImage: false,
    });
  }
  return result;
}

export async function validateFollowupCampaignWithDb(
  db: PrismaClient,
  input: {
    name: string;
    templateName: string;
    offerUrl?: string | null;
    templateParameters?: unknown;
  },
) {
  if (!input.name.trim() || input.name.trim().length > 160) {
    throw new Error('Informe um nome de campanha válido');
  }

  const templates = await getAvailableFollowupTemplates(db);
  const template = templates.find((candidate) => candidate.name === input.templateName);
  if (!template) throw new Error('Escolha um template aprovado pela Meta');

  const parameters = readTemplateParameters(input.templateParameters, input.offerUrl);
  if (parameters.length !== template.parameterCount) {
    throw new Error(`Este template exige ${template.parameterCount} valor(es) de variável`);
  }
  if (parameters.some((value) => !value.trim()))
    throw new Error('Preencha todos os valores do template');

  let offerUrl: string | null = null;
  if (template.requiresUrl) {
    const candidate = template.urlMode === 'button' ? input.offerUrl : parameters[0];
    if (!candidate) throw new Error('Este template exige uma URL HTTPS');
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      throw new Error('Informe uma URL válida para a primeira variável');
    }
    if (url.protocol !== 'https:') throw new Error('A URL da oferta deve usar HTTPS');
    offerUrl = candidate;
  }
  return { template, parameters, offerUrl };
}

export async function getAudienceLists(db: PrismaClient) {
  const lists = await db.contactList.findMany({
    where: { isActive: true },
    include: {
      sourceImport: {
        select: {
          editionName: true,
          landingPageUrl: true,
          consentSource: true,
          consentText: true,
          consentVersion: true,
          consentAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return Promise.all(
    lists.map(async (list) => ({
      id: list.id,
      name: list.name,
      createdAt: list.createdAt,
      editionName: list.sourceImport?.editionName ?? null,
      landingPageUrl: list.sourceImport?.landingPageUrl ?? null,
      consentSource: list.sourceImport?.consentSource ?? null,
      consentText: list.sourceImport?.consentText ?? null,
      consentVersion: list.sourceImport?.consentVersion ?? null,
      consentAt: list.sourceImport?.consentAt ?? null,
      ...(await getAudienceStats(db, list.id)),
    })),
  );
}

export async function getAudienceStats(db: PrismaClient, audienceListId?: string | null) {
  const scope: Prisma.ContactWhereInput = audienceListId
    ? { listMemberships: { some: { listId: audienceListId } } }
    : {};
  const [total, validPhones, buyers, optOuts, eligible] = await Promise.all([
    db.contact.count({ where: scope }),
    db.contact.count({ where: { AND: [scope, { normalizedPhone: { not: null } }] } }),
    db.contact.count({
      where: {
        AND: [
          scope,
          {
            OR: [
              { isStudent: true },
              { totalPurchases: { gt: 0 } },
              { purchaseStatus: 'purchased' },
            ],
          },
        ],
      },
    }),
    db.contact.count({
      where: {
        AND: [scope, { preferences: { some: { channel: 'whatsapp', optedOut: true } } }],
      },
    }),
    db.contact.count({ where: eligibleContactWhere(audienceListId) }),
  ]);

  return {
    total,
    eligible,
    excluded: total - eligible,
    invalidPhones: total - validPhones,
    buyers,
    optOuts,
  };
}

export async function getCampaignPreflight(
  db: PrismaClient,
  input: { audienceListId: string; templateName: string; cooldownDays?: number },
) {
  const cooldownDays = Math.max(0, input.cooldownDays ?? 7);
  const cutoff = new Date(Date.now() - cooldownDays * 86_400_000);
  const allowlist =
    (process.env.DEPLOYMENT_ENV ?? 'development').toLowerCase() === 'staging'
      ? process.env.WHATSAPP_STAGING_ALLOWLIST?.trim()
      : undefined;
  const allowedPhones = allowlist ? parseStagingAllowlist(allowlist) : null;
  const contacts = await db.contact.findMany({
    where: { listMemberships: { some: { listId: input.audienceListId } } },
    select: {
      id: true,
      name: true,
      normalizedPhone: true,
      isStudent: true,
      totalPurchases: true,
      purchaseStatus: true,
      preferences: { where: { channel: 'whatsapp' }, take: 1 },
      followupMessages: {
        where: {
          campaign: { templateName: input.templateName },
          status: { in: ['submitted', 'sent', 'delivered', 'read'] },
          submittedAt: { gte: cutoff },
        },
        select: { id: true },
        take: 1,
      },
    },
  });
  const exclusions = { invalidPhone: 0, buyer: 0, optOut: 0, recentDuplicate: 0 };
  let consentMissing = 0;
  const eligible: Array<{ id: string; name: string; phone: string }> = [];
  for (const contact of contacts) {
    const preference = contact.preferences?.[0];
    const phoneAllowed =
      Boolean(contact.normalizedPhone) &&
      (!allowedPhones || allowedPhones.has(contact.normalizedPhone!));
    if (!phoneAllowed) exclusions.invalidPhone += 1;
    else if (
      contact.isStudent ||
      contact.totalPurchases > 0 ||
      contact.purchaseStatus === 'purchased'
    )
      exclusions.buyer += 1;
    else if (preference?.optedOut) exclusions.optOut += 1;
    else if (cooldownDays > 0 && (contact.followupMessages?.length ?? 0) > 0)
      exclusions.recentDuplicate += 1;
    else {
      if (!preference?.optedInAt) consentMissing += 1;
      eligible.push({
        id: contact.id,
        name: contact.name,
        phone: maskPhone(contact.normalizedPhone!),
      });
    }
  }
  return {
    total: contacts.length,
    eligible: eligible.length,
    excluded: contacts.length - eligible.length,
    exclusions,
    consentMissing,
    cooldownDays,
    sample: eligible.slice(0, 5),
  };
}

export async function prepareFollowupCampaign(db: PrismaClient, campaignId: string) {
  const campaign = await db.followupCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campanha não encontrada');
  if (!['draft', 'ready', 'paused'].includes(campaign.status)) {
    throw new Error('A campanha não pode ser preparada neste estado');
  }

  const [stats, contacts] = await Promise.all([
    getAudienceStats(db, campaign.audienceListId),
    db.contact.findMany({
      where: eligibleContactWhere(
        campaign.audienceListId,
        campaign.templateName,
        campaign.cooldownDays,
      ),
      select: { id: true },
    }),
  ]);

  if (contacts.length > 0) {
    await db.followupCampaignMessage.createMany({
      data: contacts.map((contact) => ({
        campaignId,
        contactId: contact.id,
        status: 'queued',
        ...(campaign.offerUrl ? { trackingCode: createTrackingCode() } : {}),
      })),
      skipDuplicates: true,
    });
  }

  const queuedCount = await db.followupCampaignMessage.count({
    where: { campaignId, status: { in: ['queued', 'processing'] } },
  });

  return db.followupCampaign.update({
    where: { id: campaignId },
    data: {
      totalContacts: stats.total,
      eligibleContacts: contacts.length,
      queuedCount,
      status: campaign.status === 'paused' ? 'paused' : 'ready',
    },
  });
}

export async function processFollowupBatch(db: PrismaClient, campaignId: string, batchSize = 10) {
  let campaign = await db.followupCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campanha não encontrada');
  if (campaign.status !== 'running') {
    return { campaignId, processed: 0, remaining: 0, status: campaign.status };
  }
  if (process.env.WHATSAPP_OUTBOUND_ENABLED !== 'true') {
    throw new Error('Envio do WhatsApp está desativado');
  }
  campaign = await ensureCampaignHeaderMedia(db, campaign);
  const templateButtons = await getCampaignTemplateButtons(db, campaign);
  const hasTrackedUrlButton = templateButtons.some(
    (button) => button.type === 'URL' && button.url?.includes('{{1}}'),
  );

  const now = new Date();
  const effectiveBatchSize = Math.max(1, Math.min(campaign.batchSize || batchSize, 25));
  const candidates = await db.followupCampaignMessage.findMany({
    where: {
      campaignId,
      status: 'queued',
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { createdAt: 'asc' },
    take: effectiveBatchSize,
    include: {
      contact: {
        include: { preferences: { where: { channel: 'whatsapp' }, take: 1 } },
      },
    },
  });

  let processed = 0;
  for (const message of candidates) {
    const claimed = await db.followupCampaignMessage.updateMany({
      where: { id: message.id, status: 'queued' },
      data: { status: 'processing', attempts: { increment: 1 }, nextAttemptAt: null },
    });
    if (claimed.count !== 1) continue;

    const optedOut = message.contact.preferences.some((preference) => preference.optedOut);
    const purchased =
      message.contact.isStudent ||
      message.contact.totalPurchases > 0 ||
      message.contact.purchaseStatus === 'purchased';
    const phone = message.contact.normalizedPhone;

    if (!phone || optedOut || purchased) {
      await db.followupCampaignMessage.update({
        where: { id: message.id },
        data: {
          status: 'skipped',
          errorCode: !phone ? 'invalid_phone' : optedOut ? 'opt_out' : 'purchased',
          errorMessage: 'Contato tornou-se inelegível antes do envio',
        },
      });
      processed += 1;
      continue;
    }

    try {
      let trackingCode = message.trackingCode;
      if (campaign.offerUrl && !trackingCode) {
        trackingCode = createTrackingCode();
        await db.followupCampaignMessage.update({
          where: { id: message.id },
          data: { trackingCode },
        });
      }
      const parameters = readTemplateParameters(campaign.templateParameters, campaign.offerUrl);
      if (trackingCode && parameters.length > 0 && !hasTrackedUrlButton) {
        parameters[0] = trackingPublicUrl(trackingCode);
      }
      const metaMessageId = await sendTemplateMessage({
        to: phone,
        templateName: campaign.templateName,
        language: campaign.templateLanguage,
        parameters,
        headerMediaId: campaign.headerMediaId,
        buttons: templateButtons,
        trackingCode,
      });
      await db.followupCampaignMessage.update({
        where: { id: message.id },
        data: {
          status: 'submitted',
          metaMessageId,
          submittedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
    } catch (error) {
      const result = classifySendError(error, message.attempts + 1);
      await db.followupCampaignMessage.update({
        where: { id: message.id },
        data: result,
      });
    }
    processed += 1;
  }

  const metrics = await refreshFollowupCampaignMetrics(db, campaignId);
  const remaining = await db.followupCampaignMessage.count({
    where: { campaignId, status: { in: ['queued', 'processing'] } },
  });

  if (remaining === 0 && metrics.eligibleContacts > 0) {
    await db.followupCampaign.update({
      where: { id: campaignId },
      data: { status: 'completed', finishedAt: new Date(), queuedCount: 0 },
    });
  }

  return {
    campaignId,
    processed,
    remaining,
    status: remaining === 0 ? 'completed' : 'running',
    waitSeconds: campaign.batchIntervalSeconds,
    batchSize: effectiveBatchSize,
  };
}

export async function handleFollowupDeliveryStatus(
  db: PrismaClient,
  status: {
    externalMessageId: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp: string;
    error?: string;
  },
) {
  const existing = await db.followupCampaignMessage.findUnique({
    where: { metaMessageId: status.externalMessageId },
  });
  if (!existing) return null;

  const ranks: Record<string, number> = {
    queued: 0,
    processing: 1,
    submitted: 2,
    sent: 3,
    delivered: 4,
    read: 5,
  };
  if (status.status !== 'failed' && (ranks[status.status] ?? 0) < (ranks[existing.status] ?? 0)) {
    return existing;
  }

  const at = new Date(status.timestamp);
  const updated = await db.followupCampaignMessage.update({
    where: { id: existing.id },
    data: {
      status: status.status,
      ...(status.status === 'sent' ? { sentAt: at } : {}),
      ...(status.status === 'delivered' ? { deliveredAt: at } : {}),
      ...(status.status === 'read' ? { readAt: at } : {}),
      ...(status.status === 'failed'
        ? {
            failedAt: at,
            errorCode: status.error ?? 'meta_delivery_failed',
            errorMessage: 'Falha reportada pela Meta',
          }
        : {}),
    },
  });
  await refreshFollowupCampaignMetrics(db, existing.campaignId);
  return updated;
}

export async function handleFollowupInbound(
  db: PrismaClient,
  input: { contactId: string; content: string; receivedAt: string },
) {
  const normalized = input.content
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const isOptOut = isOptOutText(normalized);

  if (isOptOut) {
    await db.$transaction([
      db.contactPreference.upsert({
        where: { contactId_channel: { contactId: input.contactId, channel: 'whatsapp' } },
        create: {
          contactId: input.contactId,
          channel: 'whatsapp',
          optedOut: true,
          blockedAt: new Date(input.receivedAt),
          reason: 'keyword',
        },
        update: { optedOut: true, blockedAt: new Date(input.receivedAt), reason: 'keyword' },
      }),
      db.contact.update({
        where: { id: input.contactId },
        data: { optOutAt: new Date(input.receivedAt) },
      }),
    ]);
  }

  const latest = await db.followupCampaignMessage.findFirst({
    where: {
      contactId: input.contactId,
      status: { in: ['submitted', 'sent', 'delivered', 'read'] },
    },
    orderBy: { submittedAt: 'desc' },
  });
  if (!latest) return { isOptOut, campaignId: null };

  if (!latest.repliedAt) {
    await db.followupCampaignMessage.update({
      where: { id: latest.id },
      data: { repliedAt: new Date(input.receivedAt) },
    });
  }
  await refreshFollowupCampaignMetrics(db, latest.campaignId);
  return { isOptOut, campaignId: latest.campaignId };
}

export function isOptOutText(content: string): boolean {
  const normalized = content
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (OPT_OUT_TERMS.has(normalized)) return true;
  return (
    /^(EU )?(QUERO|GOSTARIA DE) (SAIR|PARAR|CANCELAR)$/.test(normalized) ||
    /^PARE( DE)? (ME )?(ENVIAR|MANDAR)( MENSAGENS)?$/.test(normalized) ||
    /^NAO (QUERO|DESEJO)( MAIS)? (RECEBER|PARTICIPAR|MENSAGENS)/.test(normalized) ||
    /^ME (REMOVA|RETIRE)( DA LISTA)?$/.test(normalized)
  );
}

export async function refreshFollowupCampaignMetrics(db: PrismaClient, campaignId: string) {
  const grouped = await db.followupCampaignMessage.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { _all: true },
  });
  const counts = Object.fromEntries(grouped.map((row) => [row.status, row._count._all]));
  const readCount = counts.read ?? 0;
  const deliveredCount = (counts.delivered ?? 0) + readCount;
  const sentCount = (counts.sent ?? 0) + deliveredCount;
  const submittedCount = (counts.submitted ?? 0) + sentCount;
  const [eligibleContacts, repliedCount, optOutCount] = await Promise.all([
    db.followupCampaignMessage.count({ where: { campaignId } }),
    db.followupCampaignMessage.count({ where: { campaignId, repliedAt: { not: null } } }),
    db.followupCampaignMessage.count({
      where: {
        campaignId,
        contact: { preferences: { some: { channel: 'whatsapp', optedOut: true } } },
      },
    }),
  ]);

  return db.followupCampaign.update({
    where: { id: campaignId },
    data: {
      eligibleContacts,
      queuedCount: (counts.queued ?? 0) + (counts.processing ?? 0),
      submittedCount,
      sentCount,
      deliveredCount,
      readCount,
      failedCount: counts.failed ?? 0,
      repliedCount,
      optOutCount,
    },
  });
}

function eligibleContactWhere(
  audienceListId?: string | null,
  templateName?: string,
  cooldownDays = 0,
): Prisma.ContactWhereInput {
  const stagingAllowlist =
    (process.env.DEPLOYMENT_ENV ?? 'development').toLowerCase() === 'staging'
      ? process.env.WHATSAPP_STAGING_ALLOWLIST?.trim()
      : undefined;
  const allowedPhones = stagingAllowlist ? [...parseStagingAllowlist(stagingAllowlist)] : null;

  const cooldownFilter: Prisma.ContactWhereInput =
    templateName && cooldownDays > 0
      ? {
          NOT: {
            followupMessages: {
              some: {
                campaign: { templateName },
                status: { in: ['submitted', 'sent', 'delivered', 'read'] },
                submittedAt: { gte: new Date(Date.now() - cooldownDays * 86_400_000) },
              },
            },
          },
        }
      : {};

  return {
    ...(audienceListId ? { listMemberships: { some: { listId: audienceListId } } } : {}),
    normalizedPhone: allowedPhones ? { in: allowedPhones } : { not: null },
    isStudent: false,
    totalPurchases: 0,
    purchaseStatus: { not: 'purchased' },
    NOT: { preferences: { some: { channel: 'whatsapp', optedOut: true } } },
    AND: [cooldownFilter],
  };
}

function maskPhone(phone: string): string {
  return phone.length < 8 ? '***' : `${phone.slice(0, 4)}***${phone.slice(-2)}`;
}

async function sendTemplateMessage(input: {
  to: string;
  templateName: string;
  language: string;
  parameters: string[];
  headerMediaId?: string | null;
  buttons?: MetaTemplateButton[];
  trackingCode?: string | null;
}): Promise<string> {
  const provider = (process.env.WHATSAPP_PRIVATE_PROVIDER ?? 'mock').toLowerCase();
  if (provider === 'mock') return `mock-${crypto.randomUUID()}`;
  if (provider !== 'meta_cloud') throw new Error('Provedor do WhatsApp não suportado');

  const token = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.META_GRAPH_API_VERSION ?? 'v25.0';
  if (!token || !phoneNumberId) throw new Error('Meta Cloud API não configurada');

  const stagingAllowlist = process.env.WHATSAPP_STAGING_ALLOWLIST;
  const safetyEnvironment = process.env.DEPLOYMENT_ENV ?? 'development';
  const recipient = assertStagingRecipientAllowed(input.to, safetyEnvironment, stagingAllowlist);

  const components = buildFollowupTemplateComponents(input);
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'template',
        template: {
          name: input.templateName,
          language: { code: input.language },
          ...(components.length > 0 ? { components } : {}),
        },
      }),
    },
  );
  const body = (await response.json().catch(() => null)) as {
    messages?: Array<{ id?: string }>;
    error?: { code?: number; message?: string };
  } | null;
  if (!response.ok) {
    throw new MetaSendError(response.status, body?.error?.code, body?.error?.message);
  }
  const id = body?.messages?.[0]?.id;
  if (!id) throw new Error('A Meta não retornou o identificador da mensagem');
  return id;
}

export function buildFollowupTemplateComponents(input: {
  parameters: string[];
  headerMediaId?: string | null;
  buttons?: MetaTemplateButton[];
  trackingCode?: string | null;
}): Array<Record<string, unknown>> {
  const components: Array<Record<string, unknown>> = [];
  if (input.headerMediaId) {
    components.push({
      type: 'header',
      parameters: [{ type: 'image', image: { id: input.headerMediaId } }],
    });
  }
  if (input.parameters.length > 0) {
    components.push({
      type: 'body',
      parameters: input.parameters.map((text) => ({ type: 'text', text })),
    });
  }
  input.buttons?.forEach((button, index) => {
    if (button.type === 'URL' && button.url?.includes('{{1}}') && input.trackingCode) {
      components.push({
        type: 'button',
        sub_type: 'url',
        index: String(index),
        parameters: [{ type: 'text', text: input.trackingCode }],
      });
    }
    if (button.type === 'QUICK_REPLY') {
      components.push({
        type: 'button',
        sub_type: 'quick_reply',
        index: String(index),
        parameters: [{ type: 'payload', payload: button.text }],
      });
    }
  });
  return components;
}

class MetaSendError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly metaCode?: number,
    message?: string,
  ) {
    super(message ?? 'Meta Cloud API request failed');
  }
}

function classifySendError(error: unknown, attempts: number) {
  if (error instanceof OutboundBlockedError) {
    return {
      status: 'skipped',
      errorCode: 'staging_allowlist',
      errorMessage: 'Contato fora da lista autorizada para staging',
    };
  }

  const transient =
    error instanceof MetaSendError && (error.httpStatus === 429 || error.httpStatus >= 500);
  if (transient && attempts < 3) {
    return {
      status: 'queued',
      errorCode: `meta_${error.metaCode ?? error.httpStatus}`,
      errorMessage: 'Falha transitória; nova tentativa agendada',
      nextAttemptAt: new Date(Date.now() + 2 ** attempts * 60_000),
    };
  }
  return {
    status: 'failed',
    errorCode:
      error instanceof MetaSendError ? `meta_${error.metaCode ?? error.httpStatus}` : 'send_failed',
    errorMessage: 'Não foi possível enviar a mensagem',
    failedAt: new Date(),
  };
}

export function hasPendingMessages(status: string): boolean {
  return !TERMINAL_MESSAGE_STATUSES.includes(status);
}

function extractParameterCount(content: string): number {
  const indexes = [...content.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  return indexes.length === 0 ? 0 : Math.max(...indexes);
}

function readTemplateParameters(value: unknown, offerUrl?: string | null): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  return offerUrl ? [offerUrl] : [];
}

function createTrackingCode(): string {
  return randomBytes(12).toString('base64url');
}

export function trackingPublicUrl(code: string): string {
  const publicBase = process.env.TRACKING_LINK_BASE_URL?.trim();
  if (publicBase) return `${publicBase.replace(/\/$/, '')}/${code}`;
  const base =
    process.env.TRACKING_BASE_URL?.trim() ||
    process.env.CRM_PUBLIC_URL?.trim() ||
    'http://localhost:5173';
  return `${base.replace(/\/$/, '')}/api/t/${code}`;
}

async function ensureCampaignHeaderMedia<
  T extends {
    id: string;
    templateName: string;
    templateLanguage: string;
    headerMediaId: string | null;
  },
>(db: PrismaClient, campaign: T): Promise<T> {
  if (campaign.headerMediaId) return campaign;
  const template = await db.messageTemplate.findFirst({
    where: {
      name: campaign.templateName,
      language: campaign.templateLanguage,
      isActive: true,
    },
    include: { versions: { where: { isCurrent: true }, take: 1 } },
  });
  const version = template?.versions[0];
  if (version?.headerFormat !== 'IMAGE') return campaign;
  if (!version.headerData || !version.headerMimeType || !version.headerFileName) {
    throw new Error('O template usa imagem, mas o arquivo não está disponível no CRM');
  }
  const storedData = new Uint8Array(version.headerData.length);
  storedData.set(version.headerData);
  const headerMediaId = await uploadWhatsAppImage({
    data: storedData,
    mimeType: version.headerMimeType as 'image/jpeg' | 'image/png',
    fileName: version.headerFileName,
  });
  await db.followupCampaign.update({
    where: { id: campaign.id },
    data: { headerMediaId },
  });
  return { ...campaign, headerMediaId };
}

async function getCampaignTemplateButtons(
  db: PrismaClient,
  campaign: { templateName: string; templateLanguage: string },
): Promise<MetaTemplateButton[]> {
  const template = await db.messageTemplate.findFirst({
    where: {
      name: campaign.templateName,
      language: campaign.templateLanguage,
      isActive: true,
    },
    include: { versions: { where: { isCurrent: true }, take: 1 } },
  });
  return extractMetaTemplateButtons(template?.versions[0]?.components);
}

export async function recordFollowupClick(
  db: PrismaClient,
  code: string,
  visitor: { ipAddress: string; userAgent: string; referer: string },
): Promise<string | null> {
  return db.$transaction(async (tx) => {
    const message = await tx.followupCampaignMessage.findUnique({
      where: { trackingCode: code },
      include: { campaign: { select: { id: true, offerUrl: true } } },
    });
    if (!message?.campaign.offerUrl) return null;
    const firstClick = await tx.followupCampaignMessage.updateMany({
      where: { id: message.id, clickedAt: null },
      data: { clickedAt: new Date() },
    });
    await tx.followupCampaignMessage.update({
      where: { id: message.id },
      data: { clickCount: { increment: 1 } },
    });
    await tx.followupCampaign.update({
      where: { id: message.campaign.id },
      data: {
        clickCount: { increment: 1 },
        ...(firstClick.count === 1 ? { uniqueClickCount: { increment: 1 } } : {}),
      },
    });
    await tx.trackingClick.create({
      data: {
        contactId: message.contactId,
        url: message.campaign.offerUrl,
        ipAddress: visitor.ipAddress,
        userAgent: visitor.userAgent,
        referer: visitor.referer,
      },
    });
    return message.campaign.offerUrl;
  });
}
