import type { PrismaClient } from '@meteorico/database';
import {
  GROUP_MANAGER_INTEGRATION,
  PROVIDER_BASELINE_REQUIRED,
  providerIntegrationKey,
} from './source-aware-cursor.js';

const MAX_ERROR_LENGTH = 240;

interface ProviderObservation {
  integration?: string;
  cursor: number;
  providerLastSeq: number;
  providerConnected?: boolean;
  observedAt?: Date;
}

export async function recordSuccessfulPoll(
  db: PrismaClient,
  observation: ProviderObservation,
): Promise<{ cursorAdvanced: boolean; recovered: boolean }> {
  const observedAt = observation.observedAt ?? new Date();
  const integration = observation.integration ?? GROUP_MANAGER_INTEGRATION;
  const current = await db.integrationCursor.findUnique({
    where: { integration },
  });
  const cursor = String(observation.cursor);
  const cursorAdvanced = current?.cursor !== cursor;
  const activePollFailure = current?.lastProviderErrorScope !== 'snapshot';
  const recovered = activePollFailure && (
    (current?.consecutiveFailures ?? 0) > 0
    || (current?.lastProviderError ?? null) !== null
  );

  await db.integrationCursor.upsert({
    where: { integration },
    create: {
      integration,
      cursor,
      lastPolledAt: observedAt,
      lastCursorAdvanceAt: observedAt,
      providerLastSeq: observation.providerLastSeq,
      providerConnected: observation.providerConnected ?? null,
    },
    update: {
      cursor,
      lastPolledAt: observedAt,
      providerLastSeq: observation.providerLastSeq,
      providerConnected: observation.providerConnected ?? null,
      ...(activePollFailure ? {
        lastProviderError: null,
        lastProviderErrorScope: null,
        consecutiveFailures: 0,
      } : {}),
      ...(cursorAdvanced ? { lastCursorAdvanceAt: observedAt } : {}),
    },
  });

  return { cursorAdvanced, recovered };
}

export async function recordSnapshotObservation(
  db: PrismaClient,
  observation: {
    integration?: string;
    providerSnapshotAt: Date | null;
    successfulAt?: Date;
    providerConnected?: boolean;
  },
): Promise<{ recovered: boolean }> {
  const integration = observation.integration ?? GROUP_MANAGER_INTEGRATION;
  const current = await db.integrationCursor.findUnique({
    where: { integration },
  });
  const snapshotRecovered = observation.successfulAt !== undefined
    && current?.lastProviderErrorScope === 'snapshot';

  await db.integrationCursor.updateMany({
    where: { integration },
    data: {
      providerSnapshotAt: observation.providerSnapshotAt,
      ...(observation.successfulAt === undefined
        ? {}
        : { lastSuccessfulSnapshotAt: observation.successfulAt }),
      ...(observation.providerConnected === undefined
        ? {}
        : { providerConnected: observation.providerConnected }),
      ...(snapshotRecovered ? {
        lastProviderError: null,
        lastProviderErrorScope: null,
        consecutiveFailures: 0,
      } : {}),
    },
  });

  return { recovered: snapshotRecovered };
}

export async function recordProviderFailure(
  db: PrismaClient,
  error: unknown,
  options: {
    integration?: string;
    providerConnected?: boolean;
    providerLastSeq?: number;
    scope?: 'poll' | 'snapshot';
  } = {},
): Promise<string> {
  const message = sanitizeProviderError(error);
  const integration = options.integration ?? GROUP_MANAGER_INTEGRATION;
  const scope = options.scope ?? 'poll';
  const current = await db.integrationCursor.findUnique({
    where: { integration },
  });
  const sameFailureScope = current?.lastProviderErrorScope === scope;

  await db.integrationCursor.upsert({
    where: { integration },
    create: {
      integration,
      cursor: '0',
      lastProviderError: message,
      lastProviderErrorScope: scope,
      consecutiveFailures: 1,
      providerConnected: options.providerConnected ?? null,
      providerLastSeq: options.providerLastSeq ?? null,
    },
    update: {
      lastProviderError: message,
      lastProviderErrorScope: scope,
      consecutiveFailures: sameFailureScope ? { increment: 1 } : 1,
      ...(options.providerConnected === undefined
        ? {}
        : { providerConnected: options.providerConnected }),
      ...(options.providerLastSeq === undefined
        ? {}
        : { providerLastSeq: options.providerLastSeq }),
    },
  });

  return message;
}

export async function markProviderBaselineRequired(
  db: PrismaClient,
  observation: {
    sourceId: string;
    providerLastSeq: number;
    providerConnected?: boolean;
  },
): Promise<string> {
  return recordProviderFailure(
    db,
    new Error(PROVIDER_BASELINE_REQUIRED),
    {
      integration: providerIntegrationKey(observation.sourceId),
      providerConnected: observation.providerConnected,
      providerLastSeq: observation.providerLastSeq,
      scope: 'poll',
    },
  );
}

export async function establishProviderBaseline(
  db: PrismaClient,
  observation: {
    sourceId: string;
    cursor: number;
    providerSnapshotAt: Date;
    providerConnected?: boolean;
    observedAt?: Date;
  },
): Promise<{ integration: string; created: boolean }> {
  const integration = providerIntegrationKey(observation.sourceId);
  const observedAt = observation.observedAt ?? new Date();
  const current = await db.integrationCursor.findUnique({ where: { integration } });

  await db.integrationCursor.upsert({
    where: { integration },
    create: {
      integration,
      cursor: String(observation.cursor),
      lastPolledAt: observedAt,
      lastSuccessfulSnapshotAt: observedAt,
      providerSnapshotAt: observation.providerSnapshotAt,
      lastCursorAdvanceAt: observedAt,
      providerLastSeq: observation.cursor,
      providerConnected: observation.providerConnected ?? null,
    },
    update: {
      cursor: String(observation.cursor),
      lastPolledAt: observedAt,
      lastSuccessfulSnapshotAt: observedAt,
      providerSnapshotAt: observation.providerSnapshotAt,
      lastCursorAdvanceAt: observedAt,
      providerLastSeq: observation.cursor,
      providerConnected: observation.providerConnected ?? null,
      lastProviderError: null,
      lastProviderErrorScope: null,
      consecutiveFailures: 0,
    },
  });

  return { integration, created: current === null };
}

export function sanitizeProviderError(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Unknown provider error';
  return raw
    .replace(/(authorization|token|secret|password)([=: ]+)[^\s&,;]+/gi, '$1$2[REDACTED]')
    .replace(/https?:\/\/[^\s]+/gi, '[provider-url]')
    .slice(0, MAX_ERROR_LENGTH);
}
