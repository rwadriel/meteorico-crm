import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@meteorico/database';
import { buildApp } from '../../app.js';
import { hashPassword } from '../../services/auth.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';

const PERMS = [
  { resource: 'contacts', action: 'read' },
  { resource: 'contacts', action: 'update' },
  { resource: 'campaigns', action: 'read' },
  { resource: 'campaigns', action: 'create' },
  { resource: 'groups', action: 'create' },
  { resource: 'groups', action: 'read' },
];

async function cleanDb(db: PrismaClient) {
  await db.leadAttribution.deleteMany();
  await db.conversationMessage.deleteMany();
  await db.conversation.deleteMany();
  await db.trackingClick.deleteMany();
  await db.redirectLink.deleteMany();
  await db.contactPreference.deleteMany();
  await db.groupEvent.deleteMany();
  await db.processedEvent.deleteMany();
  await db.groupMembership.deleteMany();
  await db.campaignParticipation.deleteMany();
  await db.importRow.deleteMany();
  await db.import.deleteMany();
  await db.campaignVersion.deleteMany();
  await db.group.deleteMany();
  await db.campaign.deleteMany();
  await db.contact.deleteMany();
  await db.auditLog.deleteMany();
  await db.session.deleteMany();
  await db.adminUser.deleteMany();
  await db.permission.deleteMany();
  await db.role.deleteMany();
}

describe('Classification Integration', () => {
  let db: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sessionCookie: string;
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
    app = await buildApp();

    const role = await db.role.create({
      data: { name: `role-${crypto.randomUUID().slice(0, 8)}`, description: 'admin', isSystem: true },
    });
    for (const perm of PERMS) {
      await db.permission.create({ data: { roleId: role.id, ...perm } });
    }
    const user = await db.adminUser.create({
      data: { email: 'cls@test.dev', passwordHash: await hashPassword('pass123'), name: 'Tester', roleId: role.id },
    });
    adminUserId = user.id;

    const loginRes = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'cls@test.dev', password: 'pass123' } });
    const cookies = loginRes.cookies as Array<{ name: string; value: string }>;
    sessionCookie = `meteorico_session=${cookies.find((c) => c.name === 'meteorico_session')!.value}`;
  });

  it('classifies new contact with 0 participations as novo', async () => {
    const campaign = await db.campaign.create({
      data: { name: 'Camp A', slug: 'camp-a', createdBy: adminUserId },
    });
    await db.group.create({
      data: { campaignId: campaign.id, name: 'Grupo Novo', category: 'novo', whatsappId: 'wid-novo' },
    });
    const contact = await db.contact.create({
      data: { phone: '5511999990001', name: 'Novo' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/classification/classify',
      headers: { cookie: sessionCookie },
      payload: { contactId: contact.id, campaignId: campaign.id },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.classification).toBe('novo');
    expect(body.groupId).not.toBeNull();
    expect(body.facts).toBeInstanceOf(Array);
  });

  it('classifies contact with 1 prior participation as reparticipante', async () => {
    const oldCampaign = await db.campaign.create({
      data: { name: 'Old', slug: 'old', createdBy: adminUserId },
    });
    const newCampaign = await db.campaign.create({
      data: { name: 'New', slug: 'new', createdBy: adminUserId },
    });
    await db.group.create({
      data: { campaignId: newCampaign.id, name: 'Grupo Rep', category: 'reparticipante' },
    });
    const contact = await db.contact.create({
      data: { phone: '5511999990002', name: 'Rep' },
    });
    await db.campaignParticipation.create({
      data: { contactId: contact.id, campaignId: oldCampaign.id, status: 'completed', classification: 'novo' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/classification/classify',
      headers: { cookie: sessionCookie },
      payload: { contactId: contact.id, campaignId: newCampaign.id },
    });

    expect(res.json().classification).toBe('reparticipante');
  });

  it('classifies contact with 2+ prior participations as veterano', async () => {
    const c1 = await db.campaign.create({ data: { name: 'C1', slug: 'c1', createdBy: adminUserId } });
    const c2 = await db.campaign.create({ data: { name: 'C2', slug: 'c2', createdBy: adminUserId } });
    const current = await db.campaign.create({ data: { name: 'Current', slug: 'current', createdBy: adminUserId } });
    await db.group.create({ data: { campaignId: current.id, name: 'Grupo Vet', category: 'veterano' } });

    const contact = await db.contact.create({ data: { phone: '5511999990003', name: 'Vet' } });
    await db.campaignParticipation.create({ data: { contactId: contact.id, campaignId: c1.id, status: 'completed', classification: 'novo' } });
    await db.campaignParticipation.create({ data: { contactId: contact.id, campaignId: c2.id, status: 'completed', classification: 'reparticipante' } });

    const res = await app.inject({
      method: 'POST',
      url: '/classification/classify',
      headers: { cookie: sessionCookie },
      payload: { contactId: contact.id, campaignId: current.id },
    });

    expect(res.json().classification).toBe('veterano');
  });

  it('classifies student as aluno regardless of history', async () => {
    const c1 = await db.campaign.create({ data: { name: 'C1', slug: 'c1-s', createdBy: adminUserId } });
    const current = await db.campaign.create({ data: { name: 'Current', slug: 'current-s', createdBy: adminUserId } });
    await db.group.create({ data: { campaignId: current.id, name: 'Grupo Aluno', category: 'aluno' } });

    const contact = await db.contact.create({ data: { phone: '5511999990004', name: 'Student', isStudent: true } });
    await db.campaignParticipation.create({ data: { contactId: contact.id, campaignId: c1.id, status: 'completed', classification: 'novo' } });

    const res = await app.inject({
      method: 'POST',
      url: '/classification/classify',
      headers: { cookie: sessionCookie },
      payload: { contactId: contact.id, campaignId: current.id },
    });

    expect(res.json().classification).toBe('aluno');
  });

  it('returns blocked for opted-out contact', async () => {
    const campaign = await db.campaign.create({ data: { name: 'Camp', slug: 'camp-opt', createdBy: adminUserId } });
    const contact = await db.contact.create({ data: { phone: '5511999990005', name: 'OptOut' } });
    await db.contactPreference.create({ data: { contactId: contact.id, channel: 'whatsapp', optedOut: true } });

    const res = await app.inject({
      method: 'POST',
      url: '/classification/classify',
      headers: { cookie: sessionCookie },
      payload: { contactId: contact.id, campaignId: campaign.id },
    });

    expect(res.json().classification).toBe('blocked');
  });

  it('keeps existing classification in same campaign', async () => {
    const campaign = await db.campaign.create({ data: { name: 'Camp', slug: 'camp-keep', createdBy: adminUserId } });
    const contact = await db.contact.create({ data: { phone: '5511999990006', name: 'Keep' } });
    await db.campaignParticipation.create({
      data: { contactId: contact.id, campaignId: campaign.id, classification: 'veterano', status: 'active' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/classification/classify',
      headers: { cookie: sessionCookie },
      payload: { contactId: contact.id, campaignId: campaign.id },
    });

    expect(res.json().classification).toBe('veterano');
  });

  it('simulation does not persist', async () => {
    const campaign = await db.campaign.create({ data: { name: 'Sim', slug: 'camp-sim', createdBy: adminUserId } });
    const contact = await db.contact.create({ data: { phone: '5511999990007', name: 'Sim' } });

    const res = await app.inject({
      method: 'POST',
      url: '/classification/simulate',
      headers: { cookie: sessionCookie },
      payload: { contactId: contact.id, campaignId: campaign.id },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().classification).toBe('novo');
    expect(res.json().isSimulation).toBe(true);

    const participation = await db.campaignParticipation.findUnique({
      where: { contactId_campaignId: { contactId: contact.id, campaignId: campaign.id } },
    });
    expect(participation).toBeNull();
  });

  it('override changes classification', async () => {
    const campaign = await db.campaign.create({ data: { name: 'Over', slug: 'camp-over', createdBy: adminUserId } });
    const contact = await db.contact.create({ data: { phone: '5511999990008', name: 'Over' } });
    await db.campaignParticipation.create({
      data: { contactId: contact.id, campaignId: campaign.id, classification: 'novo', status: 'active' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/classification/override',
      headers: { cookie: sessionCookie },
      payload: { contactId: contact.id, campaignId: campaign.id, classification: 'veterano' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().classification).toBe('veterano');

    const participation = await db.campaignParticipation.findUnique({
      where: { contactId_campaignId: { contactId: contact.id, campaignId: campaign.id } },
    });
    expect(participation!.classification).toBe('veterano');
  });

  it('allocates to correct group category', async () => {
    const campaign = await db.campaign.create({ data: { name: 'Alloc', slug: 'camp-alloc', createdBy: adminUserId } });
    const novoGroup = await db.group.create({ data: { campaignId: campaign.id, name: 'Grupo Novo', category: 'novo', capacity: 256 } });
    await db.group.create({ data: { campaignId: campaign.id, name: 'Grupo Vet', category: 'veterano', capacity: 256 } });

    const contact = await db.contact.create({ data: { phone: '5511999990009', name: 'Alloc' } });

    const res = await app.inject({
      method: 'POST',
      url: '/classification/classify',
      headers: { cookie: sessionCookie },
      payload: { contactId: contact.id, campaignId: campaign.id },
    });

    expect(res.json().groupId).toBe(novoGroup.id);
  });

  it('falls back to geral group when specific category is full', async () => {
    const campaign = await db.campaign.create({ data: { name: 'Full', slug: 'camp-full', createdBy: adminUserId } });
    await db.group.create({ data: { campaignId: campaign.id, name: 'Grupo Novo', category: 'novo', capacity: 1, currentCount: 1 } });
    const geralGroup = await db.group.create({ data: { campaignId: campaign.id, name: 'Grupo Geral', category: 'geral', capacity: 256 } });

    const contact = await db.contact.create({ data: { phone: '5511999990010', name: 'Full' } });

    const res = await app.inject({
      method: 'POST',
      url: '/classification/classify',
      headers: { cookie: sessionCookie },
      payload: { contactId: contact.id, campaignId: campaign.id },
    });

    expect(res.json().groupId).toBe(geralGroup.id);
  });

  it('returns null group when all groups are full', async () => {
    const campaign = await db.campaign.create({ data: { name: 'AllFull', slug: 'camp-allfull', createdBy: adminUserId } });
    await db.group.create({ data: { campaignId: campaign.id, name: 'G1', category: 'novo', capacity: 1, currentCount: 1 } });

    const contact = await db.contact.create({ data: { phone: '5511999990011', name: 'NoGroup' } });

    const res = await app.inject({
      method: 'POST',
      url: '/classification/classify',
      headers: { cookie: sessionCookie },
      payload: { contactId: contact.id, campaignId: campaign.id },
    });

    expect(res.json().groupId).toBeNull();
  });

  it('rejects invalid classification in override', async () => {
    const campaign = await db.campaign.create({ data: { name: 'Bad', slug: 'camp-bad', createdBy: adminUserId } });
    const contact = await db.contact.create({ data: { phone: '5511999990012', name: 'Bad' } });

    const res = await app.inject({
      method: 'POST',
      url: '/classification/override',
      headers: { cookie: sessionCookie },
      payload: { contactId: contact.id, campaignId: campaign.id, classification: 'invalid' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('requires auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/classification/classify',
      payload: { contactId: 'x', campaignId: 'y' },
    });
    expect(res.statusCode).toBe(401);
  });
});
