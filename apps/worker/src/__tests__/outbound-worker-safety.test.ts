import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Job } from 'bullmq';
import { PrismaClient } from '@meteorico/database';
import { processOutboundMessage } from '../queues/outbound-message-worker.js';

const TEST_DB_URL = process.env.DATABASE_URL
  ?? 'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';

describe('outbound worker safety', () => {
  const db = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  const originalOutbound = process.env.WHATSAPP_OUTBOUND_ENABLED;

  beforeEach(async () => {
    process.env.WHATSAPP_OUTBOUND_ENABLED = 'false';
    await db.outboundRecord.deleteMany();
    await db.conversationMessage.deleteMany();
    await db.conversation.deleteMany();
    await db.contact.deleteMany();
  });

  afterAll(async () => {
    if (originalOutbound === undefined) delete process.env.WHATSAPP_OUTBOUND_ENABLED;
    else process.env.WHATSAPP_OUTBOUND_ENABLED = originalOutbound;
    await db.outboundRecord.deleteMany();
    await db.conversationMessage.deleteMany();
    await db.conversation.deleteMany();
    await db.contact.deleteMany();
    await db.$disconnect();
  });

  it('blocks a claimed job when the worker kill switch is disabled', async () => {
    const contact = await db.contact.create({
      data: { phone: '5511999990001', normalizedPhone: '5511999990001' },
    });
    const conversation = await db.conversation.create({ data: { contactId: contact.id } });
    const idempotencyKey = `kill-switch-${crypto.randomUUID()}`;

    await processOutboundMessage({
      data: {
        conversationId: conversation.id,
        contactId: contact.id,
        content: 'must not be sent',
        messageType: 'text',
        idempotencyKey,
      },
    } as Job);

    expect(await db.outboundRecord.findUnique({ where: { idempotencyKey } })).toMatchObject({
      status: 'blocked',
      attempts: 0,
      lastError: 'outbound_disabled',
    });
    expect(await db.conversationMessage.count({ where: { direction: 'outbound' } })).toBe(0);
  });
});
