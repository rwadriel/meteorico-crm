import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';

describe('Database Constraints', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  beforeEach(async () => {
    await db.outboundRecord.deleteMany();
    await db.groupEvent.deleteMany();
    await db.groupMembership.deleteMany();
    await db.campaignParticipation.deleteMany();
    await db.group.deleteMany();
    await db.campaign.deleteMany();
    await db.contact.deleteMany();
    await db.processedEvent.deleteMany();
    await db.session.deleteMany();
    await db.adminUser.deleteMany();
    await db.permission.deleteMany();
    await db.role.deleteMany();
  });

  it('enforces unique phone on contacts', async () => {
    await db.contact.create({ data: { phone: '+5511999990001', name: 'A' } });
    await expect(
      db.contact.create({ data: { phone: '+5511999990001', name: 'B' } }),
    ).rejects.toThrow();
  });

  it('allows null phone (no unique violation between nulls)', async () => {
    await db.contact.create({ data: { name: 'LID-1' } });
    await db.contact.create({ data: { name: 'LID-2' } });
    const count = await db.contact.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('enforces unique (contact_id, campaign_id) on participations', async () => {
    const role = await db.role.create({ data: { name: 'owner-test', isSystem: true } });
    const admin = await db.adminUser.create({
      data: { email: 'admin-c@test.dev', passwordHash: 'hash', name: 'A', roleId: role.id },
    });
    const contact = await db.contact.create({ data: { phone: '+5511999990010', name: 'C' } });
    const campaign = await db.campaign.create({
      data: { name: 'Test', slug: 'test-1', createdBy: admin.id },
    });

    await db.campaignParticipation.create({
      data: { contactId: contact.id, campaignId: campaign.id },
    });

    await expect(
      db.campaignParticipation.create({
        data: { contactId: contact.id, campaignId: campaign.id },
      }),
    ).rejects.toThrow();
  });

  it('enforces unique slug on campaigns', async () => {
    const role = await db.role.create({ data: { name: 'owner-slug', isSystem: true } });
    const admin = await db.adminUser.create({
      data: { email: 'admin-s@test.dev', passwordHash: 'hash', name: 'A', roleId: role.id },
    });

    await db.campaign.create({ data: { name: 'Camp 1', slug: 'same-slug', createdBy: admin.id } });
    await expect(
      db.campaign.create({ data: { name: 'Camp 2', slug: 'same-slug', createdBy: admin.id } }),
    ).rejects.toThrow();
  });

  it('enforces unique whatsapp_event_id on group events', async () => {
    const role = await db.role.create({ data: { name: 'owner-evt', isSystem: true } });
    const admin = await db.adminUser.create({
      data: { email: 'admin-e@test.dev', passwordHash: 'hash', name: 'A', roleId: role.id },
    });
    const campaign = await db.campaign.create({
      data: { name: 'Test', slug: 'evt-test', createdBy: admin.id },
    });
    const group = await db.group.create({
      data: { campaignId: campaign.id, name: 'Group', category: 'NOVO' },
    });

    await db.groupEvent.create({
      data: {
        groupId: group.id,
        eventType: 'join',
        whatsappEventId: 'evt-123',
        occurredAt: new Date(),
      },
    });

    await expect(
      db.groupEvent.create({
        data: {
          groupId: group.id,
          eventType: 'leave',
          whatsappEventId: 'evt-123',
          occurredAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces unique (event_source, external_event_id) on processed events', async () => {
    await db.processedEvent.create({
      data: { eventSource: 'whatsapp_manager', externalEventId: 'ext-1', eventType: 'join' },
    });

    await expect(
      db.processedEvent.create({
        data: { eventSource: 'whatsapp_manager', externalEventId: 'ext-1', eventType: 'leave' },
      }),
    ).rejects.toThrow();
  });

  it('allows membership history but enforces one active membership per contact and group', async () => {
    const role = await db.role.create({ data: { name: 'owner-membership', isSystem: true } });
    const admin = await db.adminUser.create({
      data: { email: 'admin-m@test.dev', passwordHash: 'hash', name: 'A', roleId: role.id },
    });
    const campaign = await db.campaign.create({
      data: { name: 'Membership Test', slug: 'membership-test', createdBy: admin.id },
    });
    const group = await db.group.create({
      data: { campaignId: campaign.id, name: 'Group', category: 'NOVO' },
    });
    const contact = await db.contact.create({
      data: { phone: '+5511999990020', name: 'Contact' },
    });

    await db.groupMembership.create({
      data: {
        groupId: group.id,
        contactId: contact.id,
        isActive: false,
        leftAt: new Date(),
      },
    });
    await db.groupMembership.create({
      data: { groupId: group.id, contactId: contact.id, isActive: true },
    });

    await expect(
      db.groupMembership.create({
        data: { groupId: group.id, contactId: contact.id, isActive: true },
      }),
    ).rejects.toThrow();
  });

  it('enforces unique provider message ids while allowing null values', async () => {
    await db.outboundRecord.create({
      data: { idempotencyKey: 'outbound-1', providerMessageId: 'provider-message-1' },
    });
    await db.outboundRecord.create({ data: { idempotencyKey: 'outbound-null-1' } });
    await db.outboundRecord.create({ data: { idempotencyKey: 'outbound-null-2' } });

    await expect(
      db.outboundRecord.create({
        data: { idempotencyKey: 'outbound-2', providerMessageId: 'provider-message-1' },
      }),
    ).rejects.toThrow();
  });

  it('enforces unique email on admin users', async () => {
    const role = await db.role.create({ data: { name: 'owner-email', isSystem: true } });

    await db.adminUser.create({
      data: { email: 'dup@test.dev', passwordHash: 'hash', name: 'A', roleId: role.id },
    });

    await expect(
      db.adminUser.create({
        data: { email: 'dup@test.dev', passwordHash: 'hash', name: 'B', roleId: role.id },
      }),
    ).rejects.toThrow();
  });

  it('cascade deletes sessions when admin user is deleted', async () => {
    const role = await db.role.create({ data: { name: 'owner-cascade', isSystem: true } });
    const user = await db.adminUser.create({
      data: { email: 'cascade@test.dev', passwordHash: 'hash', name: 'A', roleId: role.id },
    });
    await db.session.create({
      data: {
        userId: user.id,
        tokenHash: 'test-hash',
        ipAddress: '127.0.0.1',
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    await db.adminUser.delete({ where: { id: user.id } });
    const sessions = await db.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(0);
  });
});
