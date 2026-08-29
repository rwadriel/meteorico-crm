import type { PrismaClient } from '@meteorico/database';
import { getHistoryQualityCounts } from './participation-history.js';

export interface DateFilter {
  from?: Date;
  to?: Date;
}

export interface MetricDefinition {
  key: string;
  label: string;
  description: string;
  unit: string;
  source: string;
}

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  { key: 'total_contacts', label: 'Contatos', description: 'Total de contatos unicos no sistema', unit: 'count', source: 'contacts' },
  { key: 'total_campaigns', label: 'Todas as campanhas', description: 'Total de campanhas em qualquer status', unit: 'count', source: 'campaigns' },
  { key: 'total_participations', label: 'Participacoes', description: 'Total de participacoes em campanhas', unit: 'count', source: 'campaign_participations' },
  { key: 'total_entries', label: 'Entradas', description: 'Total de entradas em grupos', unit: 'count', source: 'group_events' },
  { key: 'total_exits', label: 'Saidas', description: 'Total de saidas de grupos', unit: 'count', source: 'group_events' },
  { key: 'total_purchases', label: 'Compras', description: 'Total de compras realizadas', unit: 'count', source: 'purchases' },
  { key: 'total_revenue_cents', label: 'Receita bruta', description: 'Receita bruta total em centavos', unit: 'BRL_cents', source: 'purchases' },
  { key: 'total_refunds', label: 'Reembolsos', description: 'Total de reembolsos', unit: 'count', source: 'refunds' },
  { key: 'net_revenue_cents', label: 'Receita liquida', description: 'Receita bruta menos reembolsos', unit: 'BRL_cents', source: 'purchases+refunds' },
  { key: 'total_conversations', label: 'Conversas', description: 'Total de conversas iniciadas', unit: 'count', source: 'conversations' },
  { key: 'total_messages_sent', label: 'Mensagens enviadas', description: 'Total de mensagens outbound', unit: 'count', source: 'conversation_messages' },
  { key: 'total_redirect_clicks', label: 'Cliques em links', description: 'Total de cliques em redirect links', unit: 'count', source: 'tracking_clicks' },
  { key: 'total_diagnoses', label: 'Diagnosticos', description: 'Total de diagnosticos de IA realizados', unit: 'count', source: 'diagnoses' },
  { key: 'historical_unresolved', label: 'Historico nao resolvido', description: 'Contatos com evidencia historica sem campanha confirmada', unit: 'count', source: 'contacts.metadata+campaign_participations' },
  { key: 'needs_review', label: 'Em revisao', description: 'Nao alunos fora do roteamento automatico por historico pendente', unit: 'count', source: 'contacts.metadata+campaign_participations' },
];

export async function getGlobalDashboard(db: PrismaClient, dateFilter?: DateFilter) {
  const dateWhere = buildDateWhere(dateFilter);

  const [
    contacts,
    participations,
    entries,
    exits,
    purchases,
    refunds,
    conversations,
    messagesSent,
    clicks,
    diagnoses,
    campaigns,
    historyQuality,
  ] = await Promise.all([
    db.contact.count({ where: dateWhere.created }),
    db.campaignParticipation.count({ where: dateWhere.created }),
    db.groupEvent.count({ where: { ...dateWhere.occurred, eventType: { in: ['entrou', 'adicionado'] } } }),
    db.groupEvent.count({ where: { ...dateWhere.occurred, eventType: { in: ['saiu', 'removido'] } } }),
    db.purchase.aggregate({ where: dateWhere.purchased, _count: true, _sum: { amountCents: true } }),
    db.refund.aggregate({ where: dateWhere.refunded, _count: true }),
    db.conversation.count({ where: dateWhere.started }),
    db.conversationMessage.count({ where: { ...dateWhere.sent, direction: 'outbound' } }),
    db.trackingClick.count({ where: dateWhere.created }),
    db.diagnosis.count({ where: dateWhere.created }),
    db.campaign.count(),
    getHistoryQualityCounts(db),
  ]);

  const totalRevenue = purchases._sum.amountCents ?? 0;
  const refundCount = refunds._count;

  const refundAmounts = await db.refund.findMany({
    where: dateWhere.refunded,
    select: { purchase: { select: { amountCents: true } } },
  });
  const totalRefundAmount = refundAmounts.reduce((sum, r) => sum + r.purchase.amountCents, 0);

  return {
    metrics: {
      total_contacts: contacts,
      total_participations: participations,
      total_entries: entries,
      total_exits: exits,
      total_purchases: purchases._count,
      total_revenue_cents: totalRevenue,
      total_refunds: refundCount,
      net_revenue_cents: totalRevenue - totalRefundAmount,
      total_conversations: conversations,
      total_messages_sent: messagesSent,
      total_redirect_clicks: clicks,
      total_diagnoses: diagnoses,
      total_campaigns: campaigns,
      historical_unresolved: historyQuality.unresolvedHistory,
      needs_review: historyQuality.needsReview,
    },
    freshness: {
      calculatedAt: new Date().toISOString(),
      isEstimate: false,
    },
  };
}

export async function getCampaignDashboard(
  db: PrismaClient,
  campaignId: string,
  dateFilter?: DateFilter,
) {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: { groups: { select: { id: true, name: true, category: true, currentCount: true, capacity: true } } },
  });

  if (!campaign) throw new Error('Campaign not found');

  const dateWhere = buildDateWhere(dateFilter);

  const [
    participations,
    classifications,
    entries,
    exits,
    purchases,
    conversations,
    messagesSent,
  ] = await Promise.all([
    db.campaignParticipation.count({ where: { campaignId, ...dateWhere.created } }),
    db.campaignParticipation.groupBy({
      by: ['classification'],
      where: { campaignId },
      _count: true,
    }),
    db.groupEvent.count({
      where: {
        ...dateWhere.occurred,
        eventType: { in: ['entrou', 'adicionado'] },
        group: { campaignId },
      },
    }),
    db.groupEvent.count({
      where: {
        ...dateWhere.occurred,
        eventType: { in: ['saiu', 'removido'] },
        group: { campaignId },
      },
    }),
    db.purchase.aggregate({
      where: { ...dateWhere.purchased, participation: { campaignId } },
      _count: true,
      _sum: { amountCents: true },
    }),
    db.conversation.count({
      where: { ...dateWhere.started, participation: { campaignId } },
    }),
    db.conversationMessage.count({
      where: {
        ...dateWhere.sent,
        direction: 'outbound',
        conversation: { participation: { campaignId } },
      },
    }),
  ]);

  const classificationMap: Record<string, number> = {};
  for (const c of classifications) {
    classificationMap[c.classification] = c._count;
  }

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      slug: campaign.slug,
      status: campaign.status,
      editionNumber: campaign.editionNumber,
    },
    groups: campaign.groups,
    metrics: {
      total_participations: participations,
      classifications: classificationMap,
      total_entries: entries,
      total_exits: exits,
      total_purchases: purchases._count,
      total_revenue_cents: purchases._sum.amountCents ?? 0,
      total_conversations: conversations,
      total_messages_sent: messagesSent,
    },
    freshness: {
      calculatedAt: new Date().toISOString(),
      isEstimate: false,
    },
  };
}

export async function getGroupDashboard(db: PrismaClient, groupId: string) {
  const group = await db.group.findUnique({ where: { id: groupId } });
  if (!group) throw new Error('Group not found');

  const [activeMemberships, totalEvents, entries, exits] = await Promise.all([
    db.groupMembership.count({ where: { groupId, isActive: true } }),
    db.groupEvent.count({ where: { groupId } }),
    db.groupEvent.count({ where: { groupId, eventType: { in: ['entrou', 'adicionado'] } } }),
    db.groupEvent.count({ where: { groupId, eventType: { in: ['saiu', 'removido'] } } }),
  ]);

  return {
    group: {
      id: group.id,
      name: group.name,
      category: group.category,
      capacity: group.capacity,
      currentCount: group.currentCount,
    },
    metrics: {
      active_memberships: activeMemberships,
      total_events: totalEvents,
      total_entries: entries,
      total_exits: exits,
      fill_rate: group.capacity > 0 ? Math.round((group.currentCount / group.capacity) * 100) : 0,
    },
  };
}

export async function getContactTimeline(
  db: PrismaClient,
  contactId: string,
  options: { page?: number; limit?: number } = {},
) {
  const page = options.page ?? 1;
  const limit = Math.min(options.limit ?? 50, 100);
  const skip = (page - 1) * limit;

  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error('Contact not found');

  const [participations, events, purchases, messages, diagnoses] = await Promise.all([
    db.campaignParticipation.findMany({
      where: { contactId },
      include: { campaign: { select: { name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    db.groupEvent.findMany({
      where: { contactId },
      include: { group: { select: { name: true } } },
      orderBy: { occurredAt: 'desc' },
      take: limit,
      skip,
    }),
    db.purchase.findMany({
      where: { contactId },
      orderBy: { purchasedAt: 'desc' },
    }),
    db.conversationMessage.findMany({
      where: { conversation: { contactId } },
      orderBy: { sentAt: 'desc' },
      take: 20,
      select: { direction: true, content: true, sentAt: true, deliveryStatus: true },
    }),
    db.diagnosis.findMany({
      where: { contactId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  return {
    contact: {
      id: contact.id,
      name: contact.name,
      phone: contact.phone ? `${contact.phone.slice(0, 4)}***${contact.phone.slice(-2)}` : null,
      isStudent: contact.isStudent,
      totalParticipations: contact.totalParticipations,
      firstSeenAt: contact.firstSeenAt,
      lastSeenAt: contact.lastSeenAt,
    },
    participations,
    events,
    purchases: purchases.map((p) => ({
      ...p,
      productName: p.productName,
      amountCents: p.amountCents,
      purchasedAt: p.purchasedAt,
    })),
    recentMessages: messages,
    diagnoses,
    pagination: { page, limit },
  };
}

export async function compareCampaigns(
  db: PrismaClient,
  campaignIds: string[],
) {
  const results = [];

  for (const campaignId of campaignIds) {
    const campaign = await db.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true, slug: true, editionNumber: true, status: true },
    });

    if (!campaign) continue;

    const [participations, purchases, conversations] = await Promise.all([
      db.campaignParticipation.count({ where: { campaignId } }),
      db.purchase.aggregate({
        where: { participation: { campaignId } },
        _count: true,
        _sum: { amountCents: true },
      }),
      db.conversation.count({
        where: { participation: { campaignId } },
      }),
    ]);

    results.push({
      campaign,
      metrics: {
        participations,
        purchases: purchases._count,
        revenue_cents: purchases._sum.amountCents ?? 0,
        conversations,
        conversion_rate: participations > 0
          ? Math.round((purchases._count / participations) * 10000) / 100
          : 0,
      },
    });
  }

  return results;
}

export async function exportCampaignCsv(
  db: PrismaClient,
  campaignId: string,
): Promise<string> {
  const participations = await db.campaignParticipation.findMany({
    where: { campaignId },
    include: {
      contact: { select: { name: true, phone: true, isStudent: true } },
      campaign: { select: { name: true } },
      group: { select: { name: true, category: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const headers = [
    'contato_nome',
    'contato_telefone_mascarado',
    'classificacao',
    'status',
    'grupo',
    'grupo_categoria',
    'campanha',
    'criado_em',
  ];

  const rows = participations.map((p) => [
    sanitizeCsvField(p.contact.name),
    p.contact.phone ? `${p.contact.phone.slice(0, 4)}***${p.contact.phone.slice(-2)}` : '',
    p.classification,
    p.status,
    p.group?.name ?? '',
    p.group?.category ?? '',
    p.campaign.name,
    p.createdAt.toISOString(),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

function sanitizeCsvField(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildDateWhere(filter?: DateFilter) {
  const from = filter?.from;
  const to = filter?.to;

  const createdAt = from || to
    ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
    : {};

  return {
    created: createdAt,
    occurred: from || to
      ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {},
    purchased: from || to
      ? { purchasedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {},
    refunded: from || to
      ? { refundedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {},
    started: from || to
      ? { startedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {},
    sent: from || to
      ? { sentAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {},
  };
}
