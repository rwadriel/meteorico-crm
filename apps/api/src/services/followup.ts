import type { PrismaClient } from '@meteorico/database';

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

const OPT_OUT_TERMS = new Set(['SAIR', 'PARAR', 'CANCELAR', 'REMOVER', 'NAO QUERO']);
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

  if (template.requiresUrl) {
    if (!input.offerUrl) throw new Error('Este template exige a URL da oferta');
    let url: URL;
    try {
      url = new URL(input.offerUrl);
    } catch {
      throw new Error('Informe uma URL de oferta válida');
    }
    if (url.protocol !== 'https:') throw new Error('A URL da oferta deve usar HTTPS');
  }
}

export async function getAudienceStats(db: PrismaClient) {
  const [total, validPhones, buyers, optOuts, eligible] = await Promise.all([
    db.contact.count(),
    db.contact.count({ where: { normalizedPhone: { not: null } } }),
    db.contact.count({
      where: {
        OR: [{ isStudent: true }, { totalPurchases: { gt: 0 } }, { purchaseStatus: 'purchased' }],
      },
    }),
    db.contact.count({
      where: { preferences: { some: { channel: 'whatsapp', optedOut: true } } },
    }),
    db.contact.count({ where: eligibleContactWhere() }),
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

export async function prepareFollowupCampaign(db: PrismaClient, campaignId: string) {
  const campaign = await db.followupCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campanha não encontrada');
  if (!['draft', 'ready', 'paused'].includes(campaign.status)) {
    throw new Error('A campanha não pode ser preparada neste estado');
  }

  const [stats, contacts] = await Promise.all([
    getAudienceStats(db),
    db.contact.findMany({ where: eligibleContactWhere(), select: { id: true } }),
  ]);

  if (contacts.length > 0) {
    await db.followupCampaignMessage.createMany({
      data: contacts.map((contact) => ({ campaignId, contactId: contact.id, status: 'queued' })),
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
      eligibleContacts: stats.eligible,
      queuedCount,
      status: campaign.status === 'paused' ? 'paused' : 'ready',
    },
  });
}

export async function processFollowupBatch(db: PrismaClient, campaignId: string, batchSize = 10) {
  const campaign = await db.followupCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campanha não encontrada');
  if (campaign.status !== 'running') {
    return { campaignId, processed: 0, remaining: 0, status: campaign.status };
  }
  if (process.env.WHATSAPP_OUTBOUND_ENABLED !== 'true') {
    throw new Error('Envio do WhatsApp está desativado');
  }

  const now = new Date();
  const candidates = await db.followupCampaignMessage.findMany({
    where: {
      campaignId,
      status: 'queued',
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { createdAt: 'asc' },
    take: Math.max(1, Math.min(batchSize, 25)),
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
      const metaMessageId = await sendTemplateMessage({
        to: phone,
        templateName: campaign.templateName,
        language: campaign.templateLanguage,
        offerUrl: campaign.offerUrl,
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

  return { campaignId, processed, remaining, status: remaining === 0 ? 'completed' : 'running' };
}

export async function handleFollowupDeliveryStatus(
  db: PrismaClient,
  status: { externalMessageId: string; status: 'sent' | 'delivered' | 'read' | 'failed'; timestamp: string; error?: string },
) {
  const existing = await db.followupCampaignMessage.findUnique({
    where: { metaMessageId: status.externalMessageId },
  });
  if (!existing) return null;

  const ranks: Record<string, number> = { queued: 0, processing: 1, submitted: 2, sent: 3, delivered: 4, read: 5 };
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
        ? { failedAt: at, errorCode: status.error ?? 'meta_delivery_failed', errorMessage: 'Falha reportada pela Meta' }
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
    .replace(/\s+/g, ' ');
  const isOptOut = OPT_OUT_TERMS.has(normalized);

  if (isOptOut) {
    await db.$transaction([
      db.contactPreference.upsert({
        where: { contactId_channel: { contactId: input.contactId, channel: 'whatsapp' } },
        create: { contactId: input.contactId, channel: 'whatsapp', optedOut: true, blockedAt: new Date(input.receivedAt), reason: 'keyword' },
        update: { optedOut: true, blockedAt: new Date(input.receivedAt), reason: 'keyword' },
      }),
      db.contact.update({ where: { id: input.contactId }, data: { optOutAt: new Date(input.receivedAt) } }),
    ]);
  }

  const latest = await db.followupCampaignMessage.findFirst({
    where: { contactId: input.contactId, status: { in: ['submitted', 'sent', 'delivered', 'read'] } },
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
      where: { campaignId, contact: { preferences: { some: { channel: 'whatsapp', optedOut: true } } } },
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

function eligibleContactWhere() {
  return {
    normalizedPhone: { not: null },
    isStudent: false,
    totalPurchases: 0,
    purchaseStatus: { not: 'purchased' },
    NOT: { preferences: { some: { channel: 'whatsapp', optedOut: true } } },
  } as const;
}

async function sendTemplateMessage(input: {
  to: string;
  templateName: string;
  language: string;
  offerUrl: string | null;
}): Promise<string> {
  const provider = (process.env.WHATSAPP_PRIVATE_PROVIDER ?? 'mock').toLowerCase();
  if (provider === 'mock') return `mock-${crypto.randomUUID()}`;
  if (provider !== 'meta_cloud') throw new Error('Provedor do WhatsApp não suportado');

  const token = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.META_GRAPH_API_VERSION ?? 'v25.0';
  if (!token || !phoneNumberId) throw new Error('Meta Cloud API não configurada');

  const components = input.offerUrl
    ? [{ type: 'body', parameters: [{ type: 'text', text: input.offerUrl }] }]
    : undefined;
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'template',
      template: { name: input.templateName, language: { code: input.language }, ...(components ? { components } : {}) },
    }),
  });
  const body = (await response.json().catch(() => null)) as { messages?: Array<{ id?: string }>; error?: { code?: number; message?: string } } | null;
  if (!response.ok) {
    throw new MetaSendError(response.status, body?.error?.code, body?.error?.message);
  }
  const id = body?.messages?.[0]?.id;
  if (!id) throw new Error('A Meta não retornou o identificador da mensagem');
  return id;
}

class MetaSendError extends Error {
  constructor(readonly httpStatus: number, readonly metaCode?: number, message?: string) {
    super(message ?? 'Meta Cloud API request failed');
  }
}

function classifySendError(error: unknown, attempts: number) {
  const transient = error instanceof MetaSendError && (error.httpStatus === 429 || error.httpStatus >= 500);
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
    errorCode: error instanceof MetaSendError ? `meta_${error.metaCode ?? error.httpStatus}` : 'send_failed',
    errorMessage: 'Não foi possível enviar a mensagem',
    failedAt: new Date(),
  };
}

export function hasPendingMessages(status: string): boolean {
  return !TERMINAL_MESSAGE_STATUSES.includes(status);
}
