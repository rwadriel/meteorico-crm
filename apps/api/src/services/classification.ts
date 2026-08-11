import type { PrismaClient } from '@meteorico/database';
import { Prisma } from '@meteorico/database';
import { getHistoryEvidence } from './participation-history.js';

export type ContactClassification =
  'aluno' | 'novo' | 'reparticipante' | 'veterano' | 'needs_review' | 'blocked';

export interface ClassificationFact {
  key: string;
  value: string | number | boolean;
  source: string;
}

export interface ClassificationResult {
  classification: ContactClassification;
  explanation: string;
  facts: ClassificationFact[];
  groupId: string | null;
  isSimulation: boolean;
}

export interface ClassificationRules {
  studentPrevails: boolean;
  veteranThreshold: number;
}

const DEFAULT_RULES: ClassificationRules = {
  studentPrevails: true,
  veteranThreshold: 2,
};

export async function classifyContact(
  db: PrismaClient,
  contactId: string,
  campaignId: string,
  options: {
    simulate?: boolean;
    allocateGroup?: boolean;
    rules?: Partial<ClassificationRules>;
  } = {},
): Promise<ClassificationResult> {
  const rules = { ...DEFAULT_RULES, ...options.rules };
  const facts: ClassificationFact[] = [];
  const simulate = options.simulate ?? false;

  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error('Contact not found');

  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campaign not found');

  const optOut = await db.contactPreference.findFirst({
    where: { contactId, channel: 'whatsapp', optedOut: true },
  });

  if (optOut) {
    facts.push({ key: 'opted_out', value: true, source: 'contact_preferences' });
    return {
      classification: 'blocked',
      explanation: 'Contato optou por nao receber mensagens',
      facts,
      groupId: null,
      isSimulation: simulate,
    };
  }

  const existingParticipation = await db.campaignParticipation.findUnique({
    where: {
      contactId_campaignId: { contactId, campaignId },
    },
  });

  if (existingParticipation && existingParticipation.classification !== 'new') {
    facts.push({
      key: 'existing_classification',
      value: existingParticipation.classification,
      source: 'campaign_participations',
    });
    return {
      classification: existingParticipation.classification as ContactClassification,
      explanation: `Contato ja classificado como ${existingParticipation.classification} nesta campanha`,
      facts,
      groupId: existingParticipation.groupId,
      isSimulation: simulate,
    };
  }

  facts.push({ key: 'is_student', value: contact.isStudent, source: 'contacts' });

  if (rules.studentPrevails && contact.isStudent) {
    const result: ClassificationResult = {
      classification: 'aluno',
      explanation: 'Contato e aluno ativo',
      facts,
      groupId: null,
      isSimulation: simulate,
    };

    if (!simulate) {
      const groupId =
        options.allocateGroup === false ? null : await allocateGroup(db, campaignId, 'aluno');
      result.groupId = groupId;
      await persistClassification(db, contactId, campaignId, result);
    }
    return result;
  }

  const confirmedParticipations = await db.campaignParticipation.count({
    where: {
      contactId,
      campaignId: { not: campaignId },
      status: { in: ['active', 'completed', 'left'] },
    },
  });

  facts.push({
    key: 'confirmed_participations',
    value: confirmedParticipations,
    source: 'campaign_participations',
  });
  const history = getHistoryEvidence(contact.metadata, confirmedParticipations);
  facts.push({
    key: 'historical_evidence',
    value: history.hasEvidence,
    source: 'contacts.metadata',
  });
  facts.push({
    key: 'history_status',
    value: history.status,
    source: 'contacts.metadata+campaign_participations',
  });

  let classification: ContactClassification;
  let explanation: string;

  if (confirmedParticipations === 0 && history.hasEvidence) {
    classification = 'needs_review';
    explanation = 'Historico anterior indicado, mas sem campanha confirmada';
  } else if (confirmedParticipations === 0) {
    classification = 'novo';
    explanation = 'Primeira participacao do contato';
  } else if (confirmedParticipations < rules.veteranThreshold) {
    classification = 'reparticipante';
    explanation = `Contato participou de ${confirmedParticipations} campanha(s) anterior(es)`;
  } else {
    classification = 'veterano';
    explanation = `Contato participou de ${confirmedParticipations} campanhas (veterano)`;
  }

  const result: ClassificationResult = {
    classification,
    explanation,
    facts,
    groupId: null,
    isSimulation: simulate,
  };

  if (!simulate && classification !== 'needs_review') {
    const groupId =
      options.allocateGroup === false ? null : await allocateGroup(db, campaignId, classification);
    result.groupId = groupId;
    await persistClassification(db, contactId, campaignId, result);
  }

  return result;
}

async function allocateGroup(
  db: PrismaClient,
  campaignId: string,
  classification: ContactClassification,
): Promise<string | null> {
  const categoryMap: Record<ContactClassification, string[]> = {
    aluno: [],
    novo: ['novo', 'geral'],
    reparticipante: ['reparticipante', 'geral'],
    veterano: ['veterano', 'geral'],
    needs_review: [],
    blocked: [],
  };

  const categories = categoryMap[classification];
  if (categories.length === 0) return null;

  for (const category of categories) {
    const groups = await db.group.findMany({
      where: {
        campaignId,
        category,
        isActive: true,
      },
      orderBy: [{ priority: 'desc' }, { currentCount: 'asc' }],
    });

    const available = groups.find((g) => g.currentCount < g.capacity);
    if (available) return available.id;
  }

  const anyGroup = await db.group.findFirst({
    where: { campaignId, isActive: true },
    orderBy: [{ priority: 'desc' }, { currentCount: 'asc' }],
  });

  if (anyGroup && anyGroup.currentCount < anyGroup.capacity) {
    return anyGroup.id;
  }

  return null;
}

async function persistClassification(
  db: PrismaClient,
  contactId: string,
  campaignId: string,
  result: ClassificationResult,
) {
  await db.campaignParticipation.upsert({
    where: {
      contactId_campaignId: { contactId, campaignId },
    },
    create: {
      contactId,
      campaignId,
      classification: result.classification,
      status: 'active',
      groupId: result.groupId,
      metadata: { facts: result.facts } as unknown as Prisma.InputJsonValue,
    },
    update: {
      classification: result.classification,
      groupId: result.groupId,
      metadata: { facts: result.facts } as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function overrideClassification(
  db: PrismaClient,
  contactId: string,
  campaignId: string,
  newClassification: ContactClassification,
  adminUserId: string,
) {
  const groupId = await allocateGroup(db, campaignId, newClassification);

  await db.campaignParticipation.upsert({
    where: {
      contactId_campaignId: { contactId, campaignId },
    },
    create: {
      contactId,
      campaignId,
      classification: newClassification,
      status: 'active',
      groupId,
      metadata: {
        overriddenBy: adminUserId,
        overriddenAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
    update: {
      classification: newClassification,
      groupId,
      metadata: {
        overriddenBy: adminUserId,
        overriddenAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  return { classification: newClassification, groupId };
}

export async function simulateClassification(
  db: PrismaClient,
  contactId: string,
  campaignId: string,
) {
  return classifyContact(db, contactId, campaignId, { simulate: true });
}
