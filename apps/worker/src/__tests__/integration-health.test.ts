import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@meteorico/database';
import {
  recordProviderFailure,
  recordSnapshotObservation,
  recordSuccessfulPoll,
  sanitizeProviderError,
} from '../integration-health.js';

const TEST_DB_URL = process.env.DATABASE_URL
  ?? 'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';

describe('Group Manager health persistence', () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  });

  beforeEach(async () => {
    await db.integrationCursor.deleteMany();
  });

  afterAll(async () => {
    await db.integrationCursor.deleteMany();
    await db.$disconnect();
  });

  it('records a successful poll even when the cursor does not advance', async () => {
    const firstPollAt = new Date('2026-08-14T10:00:00.000Z');
    const idlePollAt = new Date('2026-08-14T10:00:10.000Z');

    await recordSuccessfulPoll(db, {
      cursor: 42,
      providerLastSeq: 42,
      observedAt: firstPollAt,
    });
    const idle = await recordSuccessfulPoll(db, {
      cursor: 42,
      providerLastSeq: 42,
      observedAt: idlePollAt,
    });

    const record = await db.integrationCursor.findUnique({
      where: { integration: 'whatsapp-manager' },
    });
    expect(idle.cursorAdvanced).toBe(false);
    expect(record?.lastPolledAt).toEqual(idlePollAt);
    expect(record?.lastCursorAdvanceAt).toEqual(firstPollAt);
    expect(record?.providerLastSeq).toBe(42);
  });

  it('updates last cursor advance only when the provider sequence is consumed', async () => {
    await recordSuccessfulPoll(db, {
      cursor: 42,
      providerLastSeq: 42,
      observedAt: new Date('2026-08-14T10:00:00.000Z'),
    });
    const advancedAt = new Date('2026-08-14T10:00:20.000Z');
    const result = await recordSuccessfulPoll(db, {
      cursor: 43,
      providerLastSeq: 43,
      observedAt: advancedAt,
    });

    const record = await db.integrationCursor.findUnique({
      where: { integration: 'whatsapp-manager' },
    });
    expect(result.cursorAdvanced).toBe(true);
    expect(record?.lastCursorAdvanceAt).toEqual(advancedAt);
  });

  it('persists bounded failure diagnostics and clears them on recovery', async () => {
    await recordSuccessfulPoll(db, { cursor: 7, providerLastSeq: 7 });
    await recordProviderFailure(
      db,
      new Error('request token=super-secret https://provider.example/private'),
      { providerConnected: false },
    );

    const failed = await db.integrationCursor.findUnique({
      where: { integration: 'whatsapp-manager' },
    });
    expect(failed).toMatchObject({
      consecutiveFailures: 1,
      providerConnected: false,
    });
    expect(failed?.lastProviderError).not.toContain('super-secret');
    expect(failed?.lastProviderError).not.toContain('provider.example');

    const recovered = await recordSuccessfulPoll(db, {
      cursor: 7,
      providerLastSeq: 7,
    });
    const healthy = await db.integrationCursor.findUnique({
      where: { integration: 'whatsapp-manager' },
    });
    expect(recovered.recovered).toBe(true);
    expect(healthy).toMatchObject({
      consecutiveFailures: 0,
      lastProviderError: null,
      providerConnected: null,
    });
  });

  it('keeps last successful snapshot separate from stale provider evidence', async () => {
    const successfulAt = new Date('2026-08-14T10:00:00.000Z');
    const freshProviderAt = new Date('2026-08-14T09:59:00.000Z');
    const staleProviderAt = new Date('2026-08-01T00:00:00.000Z');
    await recordSuccessfulPoll(db, { cursor: 7, providerLastSeq: 7 });
    await recordSnapshotObservation(db, {
      providerSnapshotAt: freshProviderAt,
      successfulAt,
    });
    await recordProviderFailure(db, new Error('temporary provider failure'));
    await recordSnapshotObservation(db, {
      providerSnapshotAt: staleProviderAt,
    });

    const record = await db.integrationCursor.findUnique({
      where: { integration: 'whatsapp-manager' },
    });
    expect(record?.lastSuccessfulSnapshotAt).toEqual(successfulAt);
    expect(record?.providerSnapshotAt).toEqual(staleProviderAt);
  });

  it('does not let a successful poll hide a snapshot-channel failure', async () => {
    await recordSuccessfulPoll(db, { cursor: 7, providerLastSeq: 7 });
    await recordProviderFailure(
      db,
      new Error('snapshot endpoint unavailable'),
      { scope: 'snapshot' },
    );
    const poll = await recordSuccessfulPoll(db, { cursor: 7, providerLastSeq: 7 });

    const stillDegraded = await db.integrationCursor.findUnique({
      where: { integration: 'whatsapp-manager' },
    });
    expect(poll.recovered).toBe(false);
    expect(stillDegraded).toMatchObject({
      lastProviderError: 'snapshot endpoint unavailable',
      lastProviderErrorScope: 'snapshot',
      consecutiveFailures: 1,
    });

    await recordSnapshotObservation(db, {
      providerSnapshotAt: new Date('2026-08-14T11:59:00.000Z'),
      successfulAt: new Date('2026-08-14T12:00:00.000Z'),
    });
    const recovered = await db.integrationCursor.findUnique({
      where: { integration: 'whatsapp-manager' },
    });
    expect(recovered).toMatchObject({
      lastProviderError: null,
      lastProviderErrorScope: null,
      consecutiveFailures: 0,
    });
  });
});

describe('provider error sanitization', () => {
  it('redacts credentials and provider URLs', () => {
    const value = sanitizeProviderError(
      new Error('authorization=abc token:xyz https://provider.example/path?q=secret'),
    );
    expect(value).not.toContain('abc');
    expect(value).not.toContain('xyz');
    expect(value).not.toContain('provider.example');
    expect(value).toContain('[REDACTED]');
  });
});
