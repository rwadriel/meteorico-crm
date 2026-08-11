import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@meteorico/database';
import { processEvent, processEventBatch } from '../processors/group-events.js';
import { reconcileSnapshots } from '../processors/snapshot-reconciliation.js';
import type { WhatsAppManagerProvider, WmEvent } from '../adapters/whatsapp-manager.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';

function makeEvent(overrides: Partial<WmEvent> = {}): WmEvent {
  return {
    seq: 1,
    event_id: `evt-${crypto.randomUUID().slice(0, 8)}`,
    ts: new Date().toISOString(),
    event: 'entrou',
    groupId: 'wid-group-1',
    groupName: 'Grupo Teste',
    participants: [
      { id: 'p1', number: '5511999990001', name: 'Test User', isSaved: false },
    ],
    author: 'system',
    detail: '',
    ...overrides,
  };
}

async function cleanDb(db: PrismaClient) {
  await db.auditLog.deleteMany();
  await db.groupEvent.deleteMany();
  await db.processedEvent.deleteMany();
  await db.groupMembership.deleteMany();
  await db.campaignParticipation.deleteMany();
  await db.contact.deleteMany();
  await db.group.deleteMany();
  await db.campaign.deleteMany();
  await db.integrationCursor.deleteMany();
  await db.session.deleteMany();
  await db.adminUser.deleteMany();
  await db.permission.deleteMany();
  await db.role.deleteMany();
}

describe('Group Events Processor', () => {
  let db: PrismaClient;
  let campaignId: string;
  let groupId: string;
  let adminUserId: string;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  });

  afterAll(async () => {
    await cleanDb(db);
    await db.$disconnect();
  });

  beforeEach(async () => {
    await cleanDb(db);

    const role = await db.role.create({
      data: { name: `role-${crypto.randomUUID().slice(0, 8)}`, description: 'system' },
    });
    const user = await db.adminUser.create({
      data: { email: 'sys@test.dev', passwordHash: 'x', name: 'System', roleId: role.id },
    });
    adminUserId = user.id;

    const campaign = await db.campaign.create({
      data: { name: 'Campaign 1', slug: `camp-${crypto.randomUUID().slice(0, 8)}`, createdBy: adminUserId },
    });
    campaignId = campaign.id;

    const group = await db.group.create({
      data: {
        campaignId,
        whatsappId: 'wid-group-1',
        name: 'Grupo Teste',
        category: 'novo',
      },
    });
    groupId = group.id;
  });

  it('processes entry event, creates contact and membership', async () => {
    const event = makeEvent();
    const result = await processEvent(db, event);

    expect(result.success).toBe(true);

    const contact = await db.contact.findUnique({ where: { phone: '5511999990001' } });
    expect(contact).not.toBeNull();
    expect(contact!.name).toBe('Test User');

    const membership = await db.groupMembership.findFirst({
      where: { groupId, contactId: contact!.id, isActive: true },
    });
    expect(membership).not.toBeNull();

    const participation = await db.campaignParticipation.findFirst({
      where: { contactId: contact!.id, campaignId },
    });
    expect(participation).not.toBeNull();
    expect(participation!.status).toBe('active');
    expect(participation!.classification).toBe('novo');
    expect(participation!.metadata).toMatchObject({
      confirmationSource: 'whatsapp-manager',
    });

    const group = await db.group.findUnique({ where: { id: groupId } });
    expect(group!.currentCount).toBe(1);

    expect(contact!.totalParticipations).toBe(1);
  });

  it('processes exit event, deactivates membership', async () => {
    const enterEvent = makeEvent({ event_id: 'enter-1' });
    await processEvent(db, enterEvent);

    const exitEvent = makeEvent({ event_id: 'exit-1', event: 'saiu' });
    await processEvent(db, exitEvent);

    const contact = await db.contact.findUnique({ where: { phone: '5511999990001' } });
    const membership = await db.groupMembership.findFirst({
      where: { groupId, contactId: contact!.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(membership!.isActive).toBe(false);
    expect(membership!.leftAt).not.toBeNull();

    const participation = await db.campaignParticipation.findFirst({
      where: { contactId: contact!.id, campaignId },
    });
    expect(participation!.status).toBe('left');

    const group = await db.group.findUnique({ where: { id: groupId } });
    expect(group!.currentCount).toBe(0);
  });

  it('handles re-entry after exit', async () => {
    await processEvent(db, makeEvent({ event_id: 'e1' }));
    await processEvent(db, makeEvent({ event_id: 'e2', event: 'saiu' }));
    await processEvent(db, makeEvent({ event_id: 'e3' }));

    const contact = await db.contact.findUnique({ where: { phone: '5511999990001' } });
    const memberships = await db.groupMembership.findMany({
      where: { groupId, contactId: contact!.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(memberships).toHaveLength(2);
    expect(memberships[0].isActive).toBe(false);
    expect(memberships[1].isActive).toBe(true);

    const participation = await db.campaignParticipation.findFirst({
      where: { contactId: contact!.id, campaignId },
    });
    expect(participation!.status).toBe('active');

    const updatedContact = await db.contact.findUnique({ where: { phone: '5511999990001' } });
    expect(updatedContact!.totalParticipations).toBe(1);
  });

  it('skips duplicate events (idempotency)', async () => {
    const event = makeEvent({ event_id: 'dup-1' });
    await processEvent(db, event);
    await processEvent(db, event);

    const processed = await db.processedEvent.findMany({
      where: { externalEventId: 'dup-1' },
    });
    expect(processed).toHaveLength(1);

    const memberships = await db.groupMembership.findMany({ where: { groupId } });
    expect(memberships).toHaveLength(1);
  });

  it('handles two participants in the same event', async () => {
    const event = makeEvent({
      event_id: 'multi-1',
      participants: [
        { id: 'p1', number: '5511999990001', name: 'User 1', isSaved: false },
        { id: 'p2', number: '5511999990002', name: 'User 2', isSaved: false },
      ],
    });

    await processEvent(db, event);

    const contact1 = await db.contact.findUnique({ where: { phone: '5511999990001' } });
    const contact2 = await db.contact.findUnique({ where: { phone: '5511999990002' } });
    expect(contact1).not.toBeNull();
    expect(contact2).not.toBeNull();

    const memberships = await db.groupMembership.findMany({ where: { groupId } });
    expect(memberships).toHaveLength(2);

    const group = await db.group.findUnique({ where: { id: groupId } });
    expect(group!.currentCount).toBe(2);

    const events = await db.groupEvent.findMany({ where: { groupId } });
    expect(events).toHaveLength(2);
    const eventIds = events.map((e) => e.whatsappEventId);
    expect(eventIds).toContain('multi-1:0');
    expect(eventIds).toContain('multi-1:1');
  });

  it('skips participants with null number', async () => {
    const event = makeEvent({
      event_id: 'null-num',
      participants: [
        { id: 'p1', number: null, name: 'Anonymous', isSaved: false },
        { id: 'p2', number: '5511999990003', name: 'Named', isSaved: false },
      ],
    });

    await processEvent(db, event);

    const contacts = await db.contact.findMany();
    expect(contacts).toHaveLength(1);
    expect(contacts[0].phone).toBe('5511999990003');
  });

  it('dead-letters events for unknown groupId', async () => {
    const event = makeEvent({
      event_id: 'unknown-grp',
      groupId: 'wid-unknown',
      groupName: 'Unknown Group',
    });

    const result = await processEvent(db, event);
    expect(result.success).toBe(true);

    const processed = await db.processedEvent.findFirst({
      where: { externalEventId: 'unknown-grp' },
    });
    expect(processed!.result).toBe('dead-letter:unknown-group');

    const orphanGroup = await db.group.findFirst({
      where: { whatsappId: 'wid-unknown' },
    });
    expect(orphanGroup).toBeNull();

    const orphanCampaign = await db.campaign.findFirst({
      where: { slug: '_orphan-events' },
    });
    expect(orphanCampaign).toBeNull();
    expect(await db.contact.count()).toBe(0);
  });

  it('normalizes manager phone formatting and reuses the inbound contact', async () => {
    const contact = await db.contact.create({
      data: {
        phone: '5591999990001',
        normalizedPhone: '5591999990001',
        name: 'Inbound Contact',
      },
    });

    await processEvent(db, makeEvent({
      event_id: 'normalized-phone',
      participants: [
        { id: 'p1', number: '+55 (91) 99999-0001', name: 'Manager Name', isSaved: false },
      ],
    }));

    expect(await db.contact.count()).toBe(1);
    const membership = await db.groupMembership.findFirst({ where: { contactId: contact.id } });
    expect(membership).not.toBeNull();
  });

  it('ignores every Manager participant outside the staging allowlist', async () => {
    const previousDeployment = process.env.DEPLOYMENT_ENV;
    const previousAllowlist = process.env.WHATSAPP_STAGING_ALLOWLIST;
    process.env.DEPLOYMENT_ENV = 'staging';
    process.env.WHATSAPP_STAGING_ALLOWLIST = '5591999990001';

    try {
      await processEvent(db, makeEvent({
        event_id: 'staging-scope',
        participants: [
          { id: 'owner', number: '5591888880002', name: 'Group owner', isSaved: true },
          { id: 'controlled', number: '+55 (91) 99999-0001', name: 'Controlled', isSaved: false },
        ],
      }));

      expect(await db.contact.count()).toBe(1);
      expect(await db.contact.findUnique({ where: { phone: '5591999990001' } })).not.toBeNull();
      expect(await db.contact.findUnique({ where: { phone: '5591888880002' } })).toBeNull();
      expect(await db.groupMembership.count()).toBe(1);
      const recordedEvent = await db.groupEvent.findFirst({ where: { groupId } });
      expect(recordedEvent?.rawPayload).toMatchObject({
        participants: [{ number: '+55 (91) 99999-0001' }],
      });
    } finally {
      restoreEnv('DEPLOYMENT_ENV', previousDeployment);
      restoreEnv('WHATSAPP_STAGING_ALLOWLIST', previousAllowlist);
    }
  });

  it('reconciles only the controlled snapshot participant and ignores the group owner', async () => {
    const previousDeployment = process.env.DEPLOYMENT_ENV;
    const previousAllowlist = process.env.WHATSAPP_STAGING_ALLOWLIST;
    process.env.DEPLOYMENT_ENV = 'staging';
    process.env.WHATSAPP_STAGING_ALLOWLIST = '5591999990001';
    const provider: WhatsAppManagerProvider = {
      health: async () => ({ ok: true, lastSeq: 0, events: 0 }),
      events: async () => ({ events: [], nextSince: 0, hasMore: false, lastSeq: 0 }),
      snapshots: async () => ({
        groups: [{
          groupId: 'wid-group-1',
          groupName: 'Grupo Teste',
          updatedAt: new Date().toISOString(),
          members: [
            { id: 'owner', number: '5591888880002', name: 'Group owner', isSaved: true },
            { id: 'controlled', number: '+55 (91) 99999-0001', name: 'Controlled', isSaved: false },
          ],
        }],
      }),
    };

    try {
      const result = await reconcileSnapshots(db, provider);

      expect(result).toMatchObject({
        groupsReconciled: 1,
        contactsCreated: 1,
        membershipsAdded: 1,
      });
      expect(await db.contact.count()).toBe(1);
      expect(await db.contact.findUnique({ where: { phone: '5591999990001' } })).not.toBeNull();
      expect(await db.contact.findUnique({ where: { phone: '5591888880002' } })).toBeNull();
      expect(await db.campaignParticipation.count({ where: { campaignId } })).toBe(1);
      expect(await db.group.findUnique({ where: { id: groupId } })).toMatchObject({
        currentCount: 1,
      });
    } finally {
      restoreEnv('DEPLOYMENT_ENV', previousDeployment);
      restoreEnv('WHATSAPP_STAGING_ALLOWLIST', previousAllowlist);
    }
  });

  it('skips non-membership events (baseline, grupo_criado, alteracao)', async () => {
    for (const eventType of ['baseline', 'grupo_criado', 'alteracao'] as const) {
      const event = makeEvent({
        event_id: `skip-${eventType}`,
        event: eventType,
      });

      await processEvent(db, event);
    }

    const processed = await db.processedEvent.findMany({
      where: { result: { startsWith: 'skipped:' } },
    });
    expect(processed).toHaveLength(3);

    const memberships = await db.groupMembership.findMany();
    expect(memberships).toHaveLength(0);
  });

  it('processEventBatch handles mixed success and failure', async () => {
    const events = [
      makeEvent({ event_id: 'batch-1' }),
      makeEvent({ event_id: 'batch-2' }),
    ];

    const result = await processEventBatch(db, events);
    expect(result.processed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('does not increment totalParticipations on re-entry to same campaign', async () => {
    await processEvent(db, makeEvent({ event_id: 're1' }));
    await processEvent(db, makeEvent({ event_id: 're2', event: 'saiu' }));
    await processEvent(db, makeEvent({ event_id: 're3' }));

    const contact = await db.contact.findUnique({ where: { phone: '5511999990001' } });
    expect(contact!.totalParticipations).toBe(1);
  });

  it('handles adicionado as entry and removido as exit', async () => {
    await processEvent(db, makeEvent({ event_id: 'add-1', event: 'adicionado' }));

    const contact = await db.contact.findUnique({ where: { phone: '5511999990001' } });
    const membership = await db.groupMembership.findFirst({
      where: { contactId: contact!.id, isActive: true },
    });
    expect(membership).not.toBeNull();

    await processEvent(db, makeEvent({ event_id: 'rem-1', event: 'removido' }));

    const updated = await db.groupMembership.findFirst({
      where: { contactId: contact!.id, id: membership!.id },
    });
    expect(updated!.isActive).toBe(false);
  });

  it('updates contact name only when currently empty', async () => {
    await processEvent(db, makeEvent({
      event_id: 'name-1',
      participants: [{ id: 'p1', number: '5511999990001', name: 'First Name', isSaved: false }],
    }));

    let contact = await db.contact.findUnique({ where: { phone: '5511999990001' } });
    expect(contact!.name).toBe('First Name');

    await processEvent(db, makeEvent({
      event_id: 'name-2', event: 'saiu',
      participants: [{ id: 'p1', number: '5511999990001', name: 'Changed Name', isSaved: false }],
    }));

    contact = await db.contact.findUnique({ where: { phone: '5511999990001' } });
    expect(contact!.name).toBe('First Name');
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
