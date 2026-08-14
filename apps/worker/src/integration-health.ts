import type { PrismaClient } from '@meteorico/database';

const INTEGRATION = 'whatsapp-manager';
const MAX_ERROR_LENGTH = 240;

interface ProviderObservation {
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
  const current = await db.integrationCursor.findUnique({
    where: { integration: INTEGRATION },
  });
  const cursor = String(observation.cursor);
  const cursorAdvanced = current?.cursor !== cursor;
  const activePollFailure = current?.lastProviderErrorScope !== 'snapshot';
  const recovered = activePollFailure && (
    (current?.consecutiveFailures ?? 0) > 0
    || (current?.lastProviderError ?? null) !== null
  );

  await db.integrationCursor.upsert({
    where: { integration: INTEGRATION },
    create: {
      integration: INTEGRATION,
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
    providerSnapshotAt: Date | null;
    successfulAt?: Date;
    providerConnected?: boolean;
  },
): Promise<{ recovered: boolean }> {
  const current = await db.integrationCursor.findUnique({
    where: { integration: INTEGRATION },
  });
  const snapshotRecovered = observation.successfulAt !== undefined
    && current?.lastProviderErrorScope === 'snapshot';

  await db.integrationCursor.updateMany({
    where: { integration: INTEGRATION },
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
    providerConnected?: boolean;
    scope?: 'poll' | 'snapshot';
  } = {},
): Promise<string> {
  const message = sanitizeProviderError(error);
  const scope = options.scope ?? 'poll';
  const current = await db.integrationCursor.findUnique({
    where: { integration: INTEGRATION },
  });
  const sameFailureScope = current?.lastProviderErrorScope === scope;

  await db.integrationCursor.upsert({
    where: { integration: INTEGRATION },
    create: {
      integration: INTEGRATION,
      cursor: '0',
      lastProviderError: message,
      lastProviderErrorScope: scope,
      consecutiveFailures: 1,
      providerConnected: options.providerConnected ?? null,
    },
    update: {
      lastProviderError: message,
      lastProviderErrorScope: scope,
      consecutiveFailures: sameFailureScope ? { increment: 1 } : 1,
      ...(options.providerConnected === undefined
        ? {}
        : { providerConnected: options.providerConnected }),
    },
  });

  return message;
}

export function sanitizeProviderError(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Unknown provider error';
  return raw
    .replace(/(authorization|token|secret|password)([=: ]+)[^\s&,;]+/gi, '$1$2[REDACTED]')
    .replace(/https?:\/\/[^\s]+/gi, '[provider-url]')
    .slice(0, MAX_ERROR_LENGTH);
}
