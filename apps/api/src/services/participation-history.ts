import { Prisma, type PrismaClient } from '@meteorico/database';
import type { ExternalParticipationHistoryRecord } from '../providers/participation-history.js';

export type HistoryStatus = 'none' | 'resolved' | 'unresolved';

export interface HistoryEvidence {
  hasEvidence: boolean;
  legacyCount: number | null;
  externalCount: number | null;
  confirmedParticipations: number;
  status: HistoryStatus;
}

interface StoredExternalEvidence {
  source: string;
  totalParticipations: number | null;
  campaignEditions: number[];
}

interface HistoryQualityRow {
  unresolvedHistory: bigint;
  needsReview: bigint;
}

export interface ExternalHistoryReconciliationResult {
  confirmedParticipations: number;
  createdParticipations: number;
  matchedEditions: number[];
  unresolvedEditions: number[];
  history: HistoryEvidence;
}

export function getHistoryEvidence(
  metadataValue: unknown,
  confirmedParticipations: number,
): HistoryEvidence {
  const metadata = asObject(metadataValue);
  const legacyCount = toNonNegativeInteger(metadata.quantidade_participacoes_csv);
  const externalCount = toNonNegativeInteger(metadata.externalParticipationCount);
  const explicitEvidence = metadata.historicalEvidence === true;
  const hasEvidence = explicitEvidence || (legacyCount ?? 0) > 0 || (externalCount ?? 0) > 0;

  return {
    hasEvidence,
    legacyCount,
    externalCount,
    confirmedParticipations,
    status: confirmedParticipations > 0 ? 'resolved' : hasEvidence ? 'unresolved' : 'none',
  };
}

export async function getHistoryQualityCounts(db: PrismaClient) {
  const [row] = await db.$queryRaw<HistoryQualityRow[]>`
    WITH confirmed AS (
      SELECT contact_id, COUNT(DISTINCT campaign_id)::int AS count
      FROM campaign_participations
      GROUP BY contact_id
    ), history AS (
      SELECT
        c.is_student,
        COALESCE(confirmed.count, 0) AS confirmed_count,
        (
          c.metadata->>'historicalEvidence' = 'true'
          OR CASE
            WHEN c.metadata->>'quantidade_participacoes_csv' ~ '^[0-9]+$'
              THEN (c.metadata->>'quantidade_participacoes_csv')::int > 0
            ELSE false
          END
          OR CASE
            WHEN c.metadata->>'externalParticipationCount' ~ '^[0-9]+$'
              THEN (c.metadata->>'externalParticipationCount')::int > 0
            ELSE false
          END
        ) AS has_evidence
      FROM contacts c
      LEFT JOIN confirmed ON confirmed.contact_id = c.id
    )
    SELECT
      COUNT(*) FILTER (
        WHERE confirmed_count = 0 AND has_evidence
      )::bigint AS "unresolvedHistory",
      COUNT(*) FILTER (
        WHERE confirmed_count = 0 AND has_evidence AND NOT is_student
      )::bigint AS "needsReview"
    FROM history
  `;

  return {
    unresolvedHistory: Number(row?.unresolvedHistory ?? 0),
    needsReview: Number(row?.needsReview ?? 0),
  };
}

export async function reconcileExternalParticipationHistory(
  db: PrismaClient,
  source: string,
  record: ExternalParticipationHistoryRecord,
): Promise<ExternalHistoryReconciliationResult> {
  const normalizedSource = source.trim();
  const phone = record.phone.trim();
  if (!normalizedSource) throw new Error('Participation history source is required');
  if (!phone) throw new Error('Contact phone is required');

  const totalParticipations = record.totalParticipations === undefined
    ? null
    : toNonNegativeInteger(record.totalParticipations);
  if (record.totalParticipations !== undefined && totalParticipations === null) {
    throw new Error('totalParticipations must be a non-negative integer');
  }

  const requestedEditions = uniquePositiveIntegers(record.campaignEditions ?? []);
  const contact = await db.contact.findUnique({ where: { phone } });
  if (!contact) throw new Error('Contact not found');

  const campaigns = requestedEditions.length > 0
    ? await db.campaign.findMany({
        where: { editionNumber: { in: requestedEditions } },
        select: { id: true, editionNumber: true },
      })
    : [];
  const matchedEditions = campaigns
    .map((campaign) => campaign.editionNumber)
    .filter((edition): edition is number => edition !== null)
    .sort((a, b) => a - b);
  const matchedSet = new Set(matchedEditions);
  const unresolvedEditions = requestedEditions.filter((edition) => !matchedSet.has(edition));

  let createdParticipations = 0;
  await db.$transaction(async (tx) => {
    for (const campaign of campaigns) {
      const existing = await tx.campaignParticipation.findUnique({
        where: {
          contactId_campaignId: {
            contactId: contact.id,
            campaignId: campaign.id,
          },
        },
        select: { id: true },
      });

      if (!existing) {
        await tx.campaignParticipation.create({
          data: {
            contactId: contact.id,
            campaignId: campaign.id,
            classification: 'new',
            status: 'completed',
            metadata: {
              historySource: normalizedSource,
              reconciledFromExternalEvidence: true,
            },
          },
        });
        createdParticipations++;
      }
    }

    const currentMetadata = asObject(contact.metadata);
    const storedEvidence = readStoredExternalEvidence(currentMetadata.externalParticipationEvidence)
      .filter((evidence) => evidence.source !== normalizedSource);
    storedEvidence.push({
      source: normalizedSource,
      totalParticipations,
      campaignEditions: requestedEditions,
    });
    storedEvidence.sort((a, b) => a.source.localeCompare(b.source));

    const externalParticipationCount = storedEvidence.reduce((maximum, evidence) => {
      const evidenceCount = evidence.totalParticipations ?? evidence.campaignEditions.length;
      return Math.max(maximum, evidenceCount);
    }, 0);
    const confirmedParticipations = await tx.campaignParticipation.count({
      where: { contactId: contact.id },
    });

    await tx.contact.update({
      where: { id: contact.id },
      data: {
        totalParticipations: confirmedParticipations,
        metadata: {
          ...currentMetadata,
          externalParticipationEvidence: storedEvidence,
          externalParticipationCount,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  });

  const confirmedParticipations = await db.campaignParticipation.count({
    where: { contactId: contact.id },
  });
  const updated = await db.contact.findUnique({
    where: { id: contact.id },
    select: { metadata: true },
  });

  return {
    confirmedParticipations,
    createdParticipations,
    matchedEditions,
    unresolvedEditions,
    history: getHistoryEvidence(updated?.metadata, confirmedParticipations),
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

function toNonNegativeInteger(value: unknown): number | null {
  if (typeof value === 'string' && value.trim() !== '') value = Number(value);
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function uniquePositiveIntegers(values: number[]): number[] {
  for (const value of values) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error('campaignEditions must contain positive integers');
    }
  }
  return [...new Set(values)].sort((a, b) => a - b);
}

function readStoredExternalEvidence(value: unknown): StoredExternalEvidence[] {
  if (!Array.isArray(value)) return [];
  const evidence: StoredExternalEvidence[] = [];

  for (const item of value) {
    const object = asObject(item);
    if (typeof object.source !== 'string' || !object.source.trim()) continue;
    const count = object.totalParticipations === null
      ? null
      : toNonNegativeInteger(object.totalParticipations);
    const editions = Array.isArray(object.campaignEditions)
      ? object.campaignEditions.filter((edition): edition is number => (
          typeof edition === 'number' && Number.isInteger(edition) && edition > 0
        ))
      : [];
    evidence.push({
      source: object.source,
      totalParticipations: count,
      campaignEditions: [...new Set(editions)].sort((a, b) => a - b),
    });
  }

  return evidence;
}
