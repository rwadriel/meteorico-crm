import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@meteorico/database';
import {
  establishProviderBaseline,
  markProviderBaselineRequired,
  recordSuccessfulPoll,
} from '../integration-health.js';
import {
  PROVIDER_BASELINE_REQUIRED,
  providerIntegrationKey,
  requiresProviderBaseline,
} from '../source-aware-cursor.js';

const TEST_DB_URL = process.env.DATABASE_URL
  ?? 'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';
const SOURCE_A = 'wm-stream-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SOURCE_B = 'wm-stream-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SNAPSHOT_AT = new Date('2026-08-15T15:01:03.000Z');

describe('source-aware Group Manager cursor', () => {
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

  it('A. advances a cursor only inside the same source', async () => {
    const integration = providerIntegrationKey(SOURCE_A);
    await establishProviderBaseline(db, {
      sourceId: SOURCE_A,
      cursor: 42,
      providerSnapshotAt: SNAPSHOT_AT,
    });

    await recordSuccessfulPoll(db, {
      integration,
      cursor: 43,
      providerLastSeq: 43,
    });

    expect(await db.integrationCursor.findUnique({ where: { integration } }))
      .toMatchObject({ cursor: '43', providerLastSeq: 43 });
  });

  it('B. preserves old 3497 and baselines independent source 54 without comparison', async () => {
    await db.integrationCursor.create({
      data: { integration: 'whatsapp-manager', cursor: '3497', lastPolledAt: new Date() },
    });

    await establishProviderBaseline(db, {
      sourceId: SOURCE_A,
      cursor: 54,
      providerSnapshotAt: SNAPSHOT_AT,
    });

    const oldCheckpoint = await db.integrationCursor.findUnique({
      where: { integration: 'whatsapp-manager' },
    });
    const newCheckpoint = await db.integrationCursor.findUnique({
      where: { integration: providerIntegrationKey(SOURCE_A) },
    });
    expect(oldCheckpoint?.cursor).toBe('3497');
    expect(newCheckpoint?.cursor).toBe('54');
    expect(await db.integrationCursor.count()).toBe(2);
  });

  it('C. blocks a new source before a fresh-snapshot baseline exists', async () => {
    expect(requiresProviderBaseline(null)).toBe(true);

    await markProviderBaselineRequired(db, {
      sourceId: SOURCE_A,
      providerLastSeq: 54,
      providerConnected: true,
    });

    const checkpoint = await db.integrationCursor.findUnique({
      where: { integration: providerIntegrationKey(SOURCE_A) },
    });
    expect(checkpoint).toMatchObject({
      cursor: '0',
      lastSuccessfulSnapshotAt: null,
      lastProviderError: PROVIDER_BASELINE_REQUIRED,
    });
    expect(requiresProviderBaseline(checkpoint)).toBe(true);
  });

  it('D. establishes the real provider cursor only after snapshot evidence', async () => {
    await markProviderBaselineRequired(db, {
      sourceId: SOURCE_A,
      providerLastSeq: 54,
      providerConnected: true,
    });
    await establishProviderBaseline(db, {
      sourceId: SOURCE_A,
      cursor: 54,
      providerSnapshotAt: SNAPSHOT_AT,
      providerConnected: true,
      observedAt: new Date('2026-08-15T15:02:00.000Z'),
    });

    const checkpoint = await db.integrationCursor.findUnique({
      where: { integration: providerIntegrationKey(SOURCE_A) },
    });
    expect(checkpoint).toMatchObject({
      cursor: '54',
      providerLastSeq: 54,
      providerSnapshotAt: SNAPSHOT_AT,
      lastProviderError: null,
    });
    expect(requiresProviderBaseline(checkpoint)).toBe(false);
  });

  it('E. resumes the same checkpoint after a same-source restart', async () => {
    await establishProviderBaseline(db, {
      sourceId: SOURCE_A,
      cursor: 61,
      providerSnapshotAt: SNAPSHOT_AT,
    });

    const afterRestart = await db.integrationCursor.findUnique({
      where: { integration: providerIntegrationKey(SOURCE_A) },
    });
    expect(afterRestart?.cursor).toBe('61');
    expect(requiresProviderBaseline(afterRestart)).toBe(false);
  });

  it('F. never reuses a checkpoint after the provider instance changes', async () => {
    await establishProviderBaseline(db, {
      sourceId: SOURCE_A,
      cursor: 3497,
      providerSnapshotAt: SNAPSHOT_AT,
    });

    const differentSource = await db.integrationCursor.findUnique({
      where: { integration: providerIntegrationKey(SOURCE_B) },
    });
    expect(differentSource).toBeNull();
    expect(requiresProviderBaseline(differentSource)).toBe(true);
    expect(await db.integrationCursor.findUnique({
      where: { integration: providerIntegrationKey(SOURCE_A) },
    })).toMatchObject({ cursor: '3497' });
  });
});
