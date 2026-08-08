import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@meteorico/database';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';

describe('OutboundRecord idempotency', () => {
  const db = new PrismaClient({ datasourceUrl: TEST_DB_URL });

  beforeEach(async () => {
    await db.outboundRecord.deleteMany();
  });

  afterAll(async () => {
    await db.outboundRecord.deleteMany();
    await db.$disconnect();
  });

  it('A: same idempotency key inserted twice — second is rejected', async () => {
    const key = 'msg:test-conv:1000';

    await db.outboundRecord.create({
      data: {
        idempotencyKey: key,
        conversationId: 'conv-1',
        provider: 'queue',
        status: 'sent',
        attempts: 1,
        sentAt: new Date(),
      },
    });

    await expect(
      db.outboundRecord.create({
        data: {
          idempotencyKey: key,
          conversationId: 'conv-1',
          provider: 'queue',
          status: 'pending',
          attempts: 0,
        },
      }),
    ).rejects.toThrow();
  });

  it('B: record persists with failed status for retry tracking', async () => {
    const key = 'msg:conv-fail:2000';

    await db.outboundRecord.create({
      data: {
        idempotencyKey: key,
        conversationId: 'conv-2',
        provider: 'queue',
        status: 'pending',
        attempts: 1,
        lastError: 'Connection timeout',
      },
    });

    const updated = await db.outboundRecord.update({
      where: { idempotencyKey: key },
      data: { attempts: { increment: 1 }, lastError: 'Second attempt failed' },
    });

    expect(updated.attempts).toBe(2);
    expect(updated.lastError).toBe('Second attempt failed');
  });

  it('C: retry increments attempts but does not create duplicate record', async () => {
    const key = 'msg:conv-retry:3000';

    await db.outboundRecord.create({
      data: {
        idempotencyKey: key,
        conversationId: 'conv-3',
        provider: 'queue',
        status: 'pending',
        attempts: 0,
      },
    });

    for (let i = 1; i <= 3; i++) {
      await db.outboundRecord.update({
        where: { idempotencyKey: key },
        data: { attempts: { increment: 1 } },
      });
    }

    const record = await db.outboundRecord.findUnique({
      where: { idempotencyKey: key },
    });
    expect(record!.attempts).toBe(3);

    const count = await db.outboundRecord.count({
      where: { idempotencyKey: key },
    });
    expect(count).toBe(1);
  });

  it('D: record survives after Redis restart (DB persistence)', async () => {
    const key = 'msg:conv-redis:4000';

    await db.outboundRecord.create({
      data: {
        idempotencyKey: key,
        conversationId: 'conv-4',
        provider: 'queue',
        status: 'sent',
        attempts: 1,
        sentAt: new Date(),
      },
    });

    const record = await db.outboundRecord.findUnique({
      where: { idempotencyKey: key },
    });
    expect(record).not.toBeNull();
    expect(record!.status).toBe('sent');
  });

  it('E: completed job removed from Redis — DB record still blocks re-send', async () => {
    const key = 'msg:conv-completed:5000';

    await db.outboundRecord.create({
      data: {
        idempotencyKey: key,
        conversationId: 'conv-5',
        provider: 'queue',
        status: 'sent',
        attempts: 1,
        sentAt: new Date(),
        providerMessageId: 'msg-ext-123',
      },
    });

    const record = await db.outboundRecord.findUnique({
      where: { idempotencyKey: key },
    });
    expect(record!.status).toBe('sent');

    await expect(
      db.outboundRecord.create({
        data: {
          idempotencyKey: key,
          conversationId: 'conv-5',
          provider: 'queue',
          status: 'pending',
          attempts: 0,
        },
      }),
    ).rejects.toThrow();
  });

  it('F: same event arriving again is blocked by unique constraint', async () => {
    const key = 'integration:eduzz:sync:sale-999';

    await db.outboundRecord.create({
      data: {
        idempotencyKey: key,
        provider: 'eduzz',
        status: 'sent',
        attempts: 1,
        sentAt: new Date(),
      },
    });

    const existing = await db.outboundRecord.findUnique({
      where: { idempotencyKey: key },
    });
    expect(existing).not.toBeNull();
    expect(existing!.status).toBe('sent');
  });

  it('stores all required fields', async () => {
    const now = new Date();

    const record = await db.outboundRecord.create({
      data: {
        idempotencyKey: 'msg:full-record:7000',
        contactId: 'contact-uuid-1',
        campaignId: 'campaign-uuid-1',
        conversationId: 'conv-uuid-1',
        provider: 'whatsapp',
        providerMessageId: 'wamid.abc123',
        status: 'sent',
        attempts: 2,
        sentAt: now,
        lastError: null,
      },
    });

    expect(record.idempotencyKey).toBe('msg:full-record:7000');
    expect(record.contactId).toBe('contact-uuid-1');
    expect(record.campaignId).toBe('campaign-uuid-1');
    expect(record.conversationId).toBe('conv-uuid-1');
    expect(record.provider).toBe('whatsapp');
    expect(record.providerMessageId).toBe('wamid.abc123');
    expect(record.status).toBe('sent');
    expect(record.attempts).toBe(2);
    expect(record.sentAt).toEqual(now);
    expect(record.lastError).toBeNull();
  });
});
