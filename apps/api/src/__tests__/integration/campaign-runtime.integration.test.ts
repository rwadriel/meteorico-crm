import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@meteorico/database';
import { processInboundCampaign } from '../../services/campaign-runtime.js';

const TEST_DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';
const TEST_PHONE = '5591999990001';

async function cleanDb(db: PrismaClient) {
  await db.auditLog.deleteMany();
  await db.outboundRecord.deleteMany();
  await db.conversationMessage.deleteMany();
  await db.conversation.deleteMany();
  await db.contactPreference.deleteMany();
  await db.groupEvent.deleteMany();
  await db.groupMembership.deleteMany();
  await db.campaignParticipation.deleteMany();
  await db.group.deleteMany();
  await db.campaignVersion.deleteMany();
  await db.campaign.deleteMany();
  await db.flowButton.deleteMany();
  await db.flowStep.deleteMany();
  await db.flowVersion.deleteMany();
  await db.flowDefinition.deleteMany();
  await db.messageTemplateVersion.deleteMany();
  await db.messageTemplate.deleteMany();
  await db.contactIdentifier.deleteMany();
  await db.contact.deleteMany();
  await db.session.deleteMany();
  await db.adminUser.deleteMany();
  await db.permission.deleteMany();
  await db.role.deleteMany();
}

describe('Campaign inbound runtime', () => {
  const db = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  const originalEnv = {
    deployment: process.env.DEPLOYMENT_ENV,
    allowlist: process.env.WHATSAPP_STAGING_ALLOWLIST,
    provider: process.env.WHATSAPP_PRIVATE_PROVIDER,
    outboundEnabled: process.env.WHATSAPP_OUTBOUND_ENABLED,
  };

  beforeAll(() => {
    process.env.DEPLOYMENT_ENV = 'staging';
    process.env.WHATSAPP_STAGING_ALLOWLIST = TEST_PHONE;
    process.env.WHATSAPP_PRIVATE_PROVIDER = 'meta_cloud';
    process.env.WHATSAPP_OUTBOUND_ENABLED = 'true';
  });

  beforeEach(async () => {
    await cleanDb(db);
  });

  afterAll(async () => {
    await cleanDb(db);
    await db.$disconnect();
    restoreEnv('DEPLOYMENT_ENV', originalEnv.deployment);
    restoreEnv('WHATSAPP_STAGING_ALLOWLIST', originalEnv.allowlist);
    restoreEnv('WHATSAPP_PRIVATE_PROVIDER', originalEnv.provider);
    restoreEnv('WHATSAPP_OUTBOUND_ENABLED', originalEnv.outboundEnabled);
  });

  it('queues the published flow template once and waits for group join to confirm participation', async () => {
    const fixture = await createRuntimeFixture(db, TEST_PHONE);
    const enqueue = vi.fn().mockResolvedValue('job-e2e');

    const first = await processInboundCampaign(
      db,
      {
        contactId: fixture.contactId,
        conversationId: fixture.conversationId,
      },
      enqueue,
    );
    const repeated = await processInboundCampaign(
      db,
      {
        contactId: fixture.contactId,
        conversationId: fixture.conversationId,
      },
      enqueue,
    );

    expect(first).toMatchObject({
      campaignId: fixture.campaignId,
      classification: 'novo',
      groupId: fixture.groupId,
      outboundQueued: true,
      reason: 'queued',
    });
    expect(repeated).toMatchObject({
      duplicateOutbound: true,
      outboundQueued: false,
      reason: 'duplicate',
    });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      campaignId: fixture.campaignId,
      contactId: fixture.contactId,
      messageType: 'link',
      templateId: fixture.templateId,
    });
    expect(enqueue.mock.calls[0][0].content).toContain('https://chat.whatsapp.com/staging-only');
    expect(await db.outboundRecord.count()).toBe(1);
    expect(await db.campaignParticipation.count()).toBe(0);

    const actions = (await db.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map(
      (entry) => entry.action,
    );
    expect(actions).toContain('classification');
    expect(actions).toContain('group.assigned');
    expect(actions).toContain('outbound.queued');
  });

  it('blocks an outbound recipient outside the staging allowlist before BullMQ', async () => {
    const fixture = await createRuntimeFixture(db, '5591888880002');
    const enqueue = vi.fn().mockResolvedValue('should-not-run');

    const result = await processInboundCampaign(
      db,
      {
        contactId: fixture.contactId,
        conversationId: fixture.conversationId,
      },
      enqueue,
    );

    expect(result.reason).toBe('blocked');
    expect(result.outboundQueued).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
    expect(await db.outboundRecord.findFirst()).toMatchObject({ status: 'blocked' });
  });

  it('does not enqueue while the explicit outbound kill switch is disabled', async () => {
    const fixture = await createRuntimeFixture(db, TEST_PHONE);
    const enqueue = vi.fn().mockResolvedValue('should-not-run');
    process.env.WHATSAPP_OUTBOUND_ENABLED = 'false';

    try {
      const result = await processInboundCampaign(
        db,
        {
          contactId: fixture.contactId,
          conversationId: fixture.conversationId,
        },
        enqueue,
      );

      expect(result.reason).toBe('outbound_disabled');
      expect(result.outboundQueued).toBe(false);
      expect(enqueue).not.toHaveBeenCalled();
      expect(await db.outboundRecord.count()).toBe(0);
      expect(
        await db.auditLog.findFirst({ where: { action: 'outbound.disabled' } }),
      ).not.toBeNull();
    } finally {
      process.env.WHATSAPP_OUTBOUND_ENABLED = 'true';
    }
  });
});

async function createRuntimeFixture(db: PrismaClient, phone: string) {
  const role = await db.role.create({
    data: { name: `runtime-role-${crypto.randomUUID()}`, isSystem: true },
  });
  const admin = await db.adminUser.create({
    data: {
      email: `runtime-${crypto.randomUUID()}@test.dev`,
      passwordHash: 'test-hash',
      name: 'Runtime Test Admin',
      roleId: role.id,
    },
  });
  const campaign = await db.campaign.create({
    data: {
      name: 'Meteórico E2E Test',
      slug: `runtime-${crypto.randomUUID()}`,
      editionNumber: Math.floor(Math.random() * 1_000_000) + 10_000,
      status: 'active',
      createdBy: admin.id,
    },
  });
  const contact = await db.contact.create({
    data: { phone, normalizedPhone: phone, name: 'Contato Staging' },
  });
  const conversation = await db.conversation.create({
    data: { contactId: contact.id, status: 'active' },
  });
  const group = await db.group.create({
    data: {
      campaignId: campaign.id,
      name: 'Meteórico E2E Staging — Novo',
      category: 'novo',
      inviteLink: 'https://chat.whatsapp.com/staging-only',
      capacity: 5,
      currentCount: 1,
      priority: 1,
      isActive: true,
    },
  });
  const template = await db.messageTemplate.create({
    data: {
      name: 'Convite E2E Staging',
      category: 'group_invite',
      createdBy: admin.id,
      versions: {
        create: {
          version: 1,
          content: 'Olá {{nome}}! Entre no grupo {{grupo}}: {{link}}',
          variables: ['nome', 'grupo', 'link'],
          isCurrent: true,
        },
      },
    },
  });
  await db.flowDefinition.create({
    data: {
      name: `campaign:${campaign.slug}`,
      description: 'Fluxo controlado de staging',
      trigger: 'on_classification',
      createdBy: admin.id,
      versions: {
        create: {
          version: 1,
          isPublished: true,
          publishedAt: new Date(),
          steps: {
            create: {
              order: 1,
              stepType: 'message',
              config: { templateId: template.id },
            },
          },
        },
      },
    },
  });

  return {
    campaignId: campaign.id,
    contactId: contact.id,
    conversationId: conversation.id,
    groupId: group.id,
    templateId: template.id,
  };
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
