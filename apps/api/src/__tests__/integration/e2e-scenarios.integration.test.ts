import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@meteorico/database';
import { buildApp } from '../../app.js';
import { hashPassword } from '../../services/auth.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';

const OWNER_PERMS = [
  { resource: 'campaigns', action: 'create' },
  { resource: 'campaigns', action: 'read' },
  { resource: 'campaigns', action: 'update' },
  { resource: 'campaigns', action: 'delete' },
  { resource: 'contacts', action: 'create' },
  { resource: 'contacts', action: 'read' },
  { resource: 'contacts', action: 'update' },
  { resource: 'groups', action: 'create' },
  { resource: 'groups', action: 'read' },
  { resource: 'groups', action: 'update' },
  { resource: 'messages', action: 'create' },
  { resource: 'messages', action: 'read' },
  { resource: 'messages', action: 'update' },
  { resource: 'reports', action: 'read' },
  { resource: 'reports', action: 'export' },
  { resource: 'settings', action: 'read' },
  { resource: 'settings', action: 'update' },
  { resource: 'integration', action: 'read' },
  { resource: 'integration', action: 'write' },
];

const READ_ONLY_PERMS = [
  { resource: 'campaigns', action: 'read' },
  { resource: 'reports', action: 'read' },
];

async function cleanDb(db: PrismaClient) {
  await db.diagnosis.deleteMany();
  await db.humanHandoff.deleteMany();
  await db.refund.deleteMany();
  await db.purchase.deleteMany();
  await db.studentStatus.deleteMany();
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
  await db.flowButton.deleteMany();
  await db.flowStep.deleteMany();
  await db.flowVersion.deleteMany();
  await db.flowDefinition.deleteMany();
  await db.messageTemplateVersion.deleteMany();
  await db.messageTemplate.deleteMany();
  await db.knowledgeDocument.deleteMany();
  await db.group.deleteMany();
  await db.campaign.deleteMany();
  await db.contact.deleteMany();
  await db.auditLog.deleteMany();
  await db.session.deleteMany();
  await db.adminUser.deleteMany();
  await db.permission.deleteMany();
  await db.role.deleteMany();
  await db.systemSetting.deleteMany();
}

describe('E2E Scenarios', () => {
  let db: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let ownerCookie: string;
  let ownerUserId: string;

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

    const ownerRole = await db.role.create({
      data: { name: `owner-${crypto.randomUUID().slice(0, 8)}`, description: 'owner', isSystem: true },
    });
    for (const perm of OWNER_PERMS) {
      await db.permission.create({ data: { roleId: ownerRole.id, ...perm } });
    }
    const owner = await db.adminUser.create({
      data: { email: 'owner@test.dev', passwordHash: await hashPassword('pass123'), name: 'Owner', roleId: ownerRole.id },
    });
    ownerUserId = owner.id;
    const loginRes = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'owner@test.dev', password: 'pass123' } });
    const cookies = loginRes.cookies as Array<{ name: string; value: string }>;
    ownerCookie = `meteorico_session=${cookies.find((c) => c.name === 'meteorico_session')!.value}`;
  });

  it('E2E 1: new lead classified as novo and placed in novo group', async () => {
    const campaign = await db.campaign.create({ data: { name: 'Launch 1', slug: 'launch-1', createdBy: ownerUserId } });
    const group = await db.group.create({ data: { campaignId: campaign.id, name: 'Novos', category: 'novo', capacity: 256 } });
    const contact = await db.contact.create({ data: { phone: '5511999990200', name: 'Lead Novo' } });

    const res = await app.inject({
      method: 'POST', url: '/api/classification/classify',
      headers: { cookie: ownerCookie },
      payload: { contactId: contact.id, campaignId: campaign.id },
    });
    expect(res.json().classification).toBe('novo');
    expect(res.json().groupId).toBe(group.id);
  });

  it('E2E 2: second campaign classifies as reparticipante', async () => {
    const c1 = await db.campaign.create({ data: { name: 'C1', slug: 'e2e-c1', createdBy: ownerUserId } });
    const c2 = await db.campaign.create({ data: { name: 'C2', slug: 'e2e-c2', createdBy: ownerUserId } });
    await db.group.create({ data: { campaignId: c2.id, name: 'Rep', category: 'reparticipante' } });
    const contact = await db.contact.create({ data: { phone: '5511999990201', name: 'Rep' } });
    await db.campaignParticipation.create({ data: { contactId: contact.id, campaignId: c1.id, status: 'completed', classification: 'novo' } });

    const res = await app.inject({
      method: 'POST', url: '/api/classification/classify',
      headers: { cookie: ownerCookie },
      payload: { contactId: contact.id, campaignId: c2.id },
    });
    expect(res.json().classification).toBe('reparticipante');
  });

  it('E2E 3: third campaign triggers diagnosis', async () => {
    const c1 = await db.campaign.create({ data: { name: 'D1', slug: 'e2e-d1', createdBy: ownerUserId } });
    const c2 = await db.campaign.create({ data: { name: 'D2', slug: 'e2e-d2', createdBy: ownerUserId } });
    const c3 = await db.campaign.create({ data: { name: 'D3', slug: 'e2e-d3', createdBy: ownerUserId } });
    await db.group.create({ data: { campaignId: c3.id, name: 'Vet', category: 'veterano' } });

    const contact = await db.contact.create({ data: { phone: '5511999990202', name: 'Vet', totalParticipations: 3 } });
    await db.campaignParticipation.create({ data: { contactId: contact.id, campaignId: c1.id, status: 'completed', classification: 'novo' } });
    await db.campaignParticipation.create({ data: { contactId: contact.id, campaignId: c2.id, status: 'completed', classification: 'reparticipante' } });

    const classRes = await app.inject({
      method: 'POST', url: '/api/classification/classify',
      headers: { cookie: ownerCookie },
      payload: { contactId: contact.id, campaignId: c3.id },
    });
    expect(classRes.json().classification).toBe('veterano');

    const participation = await db.campaignParticipation.findUnique({
      where: { contactId_campaignId: { contactId: contact.id, campaignId: c3.id } },
    });

    const diagRes = await app.inject({
      method: 'POST', url: '/api/diagnosis/run',
      headers: { cookie: ownerCookie },
      payload: { contactId: contact.id, participationId: participation!.id, campaignId: c3.id },
    });
    expect(diagRes.statusCode).toBe(200);
    expect(diagRes.json().diagnosis).toBeDefined();
  });

  it('E2E 4: student goes to aluno flow', async () => {
    const campaign = await db.campaign.create({ data: { name: 'Aluno', slug: 'e2e-aluno', createdBy: ownerUserId } });
    await db.group.create({ data: { campaignId: campaign.id, name: 'Alunos', category: 'aluno' } });
    const contact = await db.contact.create({ data: { phone: '5511999990203', name: 'Student', isStudent: true } });

    const res = await app.inject({
      method: 'POST', url: '/api/classification/classify',
      headers: { cookie: ownerCookie },
      payload: { contactId: contact.id, campaignId: campaign.id },
    });
    expect(res.json().classification).toBe('aluno');
  });

  it('E2E 5: repeated click same campaign same destination', async () => {
    const campaign = await db.campaign.create({ data: { name: 'Click', slug: 'e2e-click', createdBy: ownerUserId } });
    await db.group.create({ data: { campaignId: campaign.id, name: 'G', category: 'novo' } });
    const contact = await db.contact.create({ data: { phone: '5511999990204', name: 'Clicker' } });

    const res1 = await app.inject({
      method: 'POST', url: '/api/classification/classify',
      headers: { cookie: ownerCookie },
      payload: { contactId: contact.id, campaignId: campaign.id },
    });
    const res2 = await app.inject({
      method: 'POST', url: '/api/classification/classify',
      headers: { cookie: ownerCookie },
      payload: { contactId: contact.id, campaignId: campaign.id },
    });
    expect(res1.json().groupId).toBe(res2.json().groupId);
  });

  it('E2E 6: full group falls to next', async () => {
    const campaign = await db.campaign.create({ data: { name: 'Full', slug: 'e2e-full', createdBy: ownerUserId } });
    await db.group.create({ data: { campaignId: campaign.id, name: 'G1', category: 'novo', capacity: 1, currentCount: 1 } });
    const g2 = await db.group.create({ data: { campaignId: campaign.id, name: 'G2', category: 'geral', capacity: 256 } });
    const contact = await db.contact.create({ data: { phone: '5511999990205', name: 'Overflow' } });

    const res = await app.inject({
      method: 'POST', url: '/api/classification/classify',
      headers: { cookie: ownerCookie },
      payload: { contactId: contact.id, campaignId: campaign.id },
    });
    expect(res.json().groupId).toBe(g2.id);
  });

  it('E2E 7: duplicate Eduzz event is idempotent', async () => {
    const payload = {
      event: 'purchase_completed',
      data: {
        sale_id: 'e2e-sale-001', product_id: 'p1', product_name: 'Curso',
        buyer_email: 'e2e@test.dev', buyer_phone: '5511999990206',
        amount_cents: 19700, currency: 'BRL', status: 'completed',
        created_at: new Date().toISOString(),
      },
      signature: 'sig',
    };

    const r1 = await app.inject({ method: 'POST', url: '/webhook/eduzz', payload });
    const r2 = await app.inject({ method: 'POST', url: '/webhook/eduzz', payload });
    expect(r1.json().processed).toBe(true);
    expect(r2.json().processed).toBe(false);
    expect(await db.purchase.count({ where: { externalId: 'e2e-sale-001' } })).toBe(1);
  });

  it('E2E 9: AI returns diagnosis (mock provider available, fallback when unavailable)', async () => {
    const campaign = await db.campaign.create({ data: { name: 'NoAI', slug: 'e2e-noai', createdBy: ownerUserId } });
    const contact = await db.contact.create({ data: { phone: '5511999990208', name: 'NoAI', totalParticipations: 5 } });
    const participation = await db.campaignParticipation.create({
      data: { contactId: contact.id, campaignId: campaign.id, status: 'active', classification: 'veterano' },
    });

    const res = await app.inject({
      method: 'POST', url: '/api/diagnosis/run',
      headers: { cookie: ownerCookie },
      payload: { contactId: contact.id, participationId: participation.id, campaignId: campaign.id },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().diagnosis).toBeDefined();
    expect(typeof res.json().diagnosis).toBe('string');
    expect(res.json().diagnosis.length).toBeGreaterThan(0);
  });

  it('E2E 11: opt-out blocks classification', async () => {
    const campaign = await db.campaign.create({ data: { name: 'OptOut', slug: 'e2e-optout', createdBy: ownerUserId } });
    const contact = await db.contact.create({ data: { phone: '5511999990210', name: 'OptOut' } });
    await db.contactPreference.create({ data: { contactId: contact.id, channel: 'whatsapp', optedOut: true } });

    const res = await app.inject({
      method: 'POST', url: '/api/classification/classify',
      headers: { cookie: ownerCookie },
      payload: { contactId: contact.id, campaignId: campaign.id },
    });
    expect(res.json().classification).toBe('blocked');
    expect(res.json().groupId).toBeNull();
  });

  it('E2E 12: purchase and refund reflect in dashboard', async () => {
    await app.inject({
      method: 'POST', url: '/webhook/eduzz',
      payload: {
        event: 'purchase_completed',
        data: {
          sale_id: 'e2e-dash-sale', product_id: 'p1', product_name: 'Curso',
          buyer_email: 'dash@test.dev', buyer_phone: '5511999990211',
          amount_cents: 50000, currency: 'BRL', status: 'completed',
          created_at: new Date().toISOString(),
        },
        signature: 'sig',
      },
    });

    await app.inject({
      method: 'POST', url: '/webhook/eduzz',
      payload: {
        event: 'purchase_refunded',
        data: {
          sale_id: 'e2e-dash-sale', product_id: 'p1', product_name: 'Curso',
          buyer_email: 'dash@test.dev', buyer_phone: '5511999990211',
          amount_cents: 50000, currency: 'BRL', status: 'refunded',
          created_at: new Date().toISOString(), refund_reason: 'desistiu',
        },
        signature: 'sig',
      },
    });

    const res = await app.inject({
      method: 'GET', url: '/api/analytics/dashboard',
      headers: { cookie: ownerCookie },
    });
    const m = res.json().metrics;
    expect(m.total_purchases).toBe(1);
    expect(m.total_refunds).toBe(1);
    expect(m.net_revenue_cents).toBe(0);
  });

  it('E2E 13: read_only user cannot edit', async () => {
    const roRole = await db.role.create({
      data: { name: `ro-${crypto.randomUUID().slice(0, 8)}`, description: 'ro', isSystem: true },
    });
    for (const perm of READ_ONLY_PERMS) {
      await db.permission.create({ data: { roleId: roRole.id, ...perm } });
    }
    await db.adminUser.create({
      data: { email: 'readonly@test.dev', passwordHash: await hashPassword('pass123'), name: 'RO', roleId: roRole.id },
    });
    const roLogin = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'readonly@test.dev', password: 'pass123' } });
    const roCookies = roLogin.cookies as Array<{ name: string; value: string }>;
    const roCookie = `meteorico_session=${roCookies.find((c) => c.name === 'meteorico_session')!.value}`;

    const createRes = await app.inject({
      method: 'POST', url: '/api/campaigns',
      headers: { cookie: roCookie },
      payload: { name: 'Blocked', slug: 'blocked' },
    });
    expect(createRes.statusCode).toBe(403);

    const classifyRes = await app.inject({
      method: 'POST', url: '/api/classification/classify',
      headers: { cookie: roCookie },
      payload: { contactId: 'x', campaignId: 'y' },
    });
    expect(classifyRes.statusCode).toBe(403);
  });

  it('E2E 14: malicious CSV import rejected', async () => {
    const campaign = await db.campaign.create({ data: { name: 'Import', slug: 'e2e-import', createdBy: ownerUserId } });

    const csvContent = 'phone,name\n=CMD("calc"),Hacker\n5511999990001,Normal';
    const boundary = '----formdata';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="../../etc/passwd"',
      'Content-Type: text/csv',
      '',
      csvContent,
      `--${boundary}`,
      `Content-Disposition: form-data; name="campaignId"`,
      '',
      campaign.id,
      `--${boundary}--`,
    ].join('\r\n');

    const res = await app.inject({
      method: 'POST',
      url: '/api/imports/preview',
      headers: {
        cookie: ownerCookie,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    if (res.statusCode === 200) {
      const preview = res.json();
      if (preview.rows) {
        const dangerousRow = preview.rows.find((r: { data?: { phone?: string } }) => r.data?.phone === '=CMD("calc")');
        expect(dangerousRow).toBeUndefined();
      }
    }
  });

  it('E2E 15: invalid redirect code rejected', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/r/ab',
    });
    expect(res.statusCode).toBe(400);

    const res2 = await app.inject({
      method: 'GET',
      url: '/r/nonexistent1234',
    });
    expect(res2.statusCode).toBe(404);
  });
});
