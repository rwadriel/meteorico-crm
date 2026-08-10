import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@meteorico/database';
import { buildApp } from '../../app.js';
import { hashPassword } from '../../services/auth.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';

const PERMS = [
  { resource: 'reports', action: 'read' },
  { resource: 'reports', action: 'export' },
  { resource: 'contacts', action: 'read' },
  { resource: 'campaigns', action: 'read' },
  { resource: 'campaigns', action: 'create' },
  { resource: 'groups', action: 'create' },
  { resource: 'groups', action: 'read' },
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

describe('Analytics & Eduzz Integration', () => {
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
      data: { email: 'analytics@test.dev', passwordHash: await hashPassword('pass123'), name: 'Analyst', roleId: role.id },
    });
    adminUserId = user.id;

    const loginRes = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'analytics@test.dev', password: 'pass123' } });
    const cookies = loginRes.cookies as Array<{ name: string; value: string }>;
    sessionCookie = `meteorico_session=${cookies.find((c) => c.name === 'meteorico_session')!.value}`;
  });

  it('returns global dashboard with zero metrics', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/analytics/dashboard',
      headers: { cookie: sessionCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.metrics.total_contacts).toBe(0);
    expect(body.metrics.total_campaigns).toBe(0);
    expect(body.metrics.total_purchases).toBe(0);
    expect(body.metrics.net_revenue_cents).toBe(0);
    expect(body.freshness.calculatedAt).toBeDefined();
  });

  it('returns global dashboard with real data', async () => {
    const campaign = await db.campaign.create({
      data: { name: 'Test', slug: 'test-dash', createdBy: adminUserId },
    });
    const contact = await db.contact.create({
      data: { phone: '5511999990100', name: 'Dash Contact' },
    });
    await db.campaignParticipation.create({
      data: { contactId: contact.id, campaignId: campaign.id, status: 'active', classification: 'novo' },
    });
    await db.purchase.create({
      data: {
        contactId: contact.id,
        externalId: 'ext-1',
        platform: 'eduzz',
        productId: 'p1',
        productName: 'Curso',
        amountCents: 19700,
        purchasedAt: new Date(),
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/dashboard',
      headers: { cookie: sessionCookie },
    });
    const body = res.json();
    expect(body.metrics.total_contacts).toBe(1);
    expect(body.metrics.total_campaigns).toBe(1);
    expect(body.metrics.total_participations).toBe(1);
    expect(body.metrics.total_purchases).toBe(1);
    expect(body.metrics.total_revenue_cents).toBe(19700);
  });

  it('returns 40 global contacts and all 17 campaigns across statuses', async () => {
    await db.contact.createMany({
      data: Array.from({ length: 40 }, (_, index) => ({
        phone: `55119888${String(index).padStart(5, '0')}`,
        name: `Contact ${index + 1}`,
      })),
    });
    await db.campaign.createMany({
      data: [
        ...Array.from({ length: 16 }, (_, index) => ({
          name: `Historical ${index + 24}`,
          slug: `historical-${index + 24}`,
          editionNumber: index + 24,
          status: 'historical',
          createdBy: adminUserId,
        })),
        {
          name: 'Draft campaign',
          slug: 'draft-campaign',
          editionNumber: 41,
          status: 'draft',
          createdBy: adminUserId,
        },
      ],
    });

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/dashboard',
      headers: { cookie: sessionCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.metrics.total_contacts).toBe(40);
    expect(body.metrics.total_campaigns).toBe(17);
  });

  it('returns campaign dashboard with classifications', async () => {
    const campaign = await db.campaign.create({
      data: { name: 'CampDash', slug: 'camp-dash', createdBy: adminUserId },
    });
    await db.group.create({
      data: { campaignId: campaign.id, name: 'G1', category: 'novo' },
    });
    const c1 = await db.contact.create({ data: { phone: '5511999990101', name: 'C1' } });
    const c2 = await db.contact.create({ data: { phone: '5511999990102', name: 'C2' } });
    await db.campaignParticipation.create({ data: { contactId: c1.id, campaignId: campaign.id, status: 'active', classification: 'novo' } });
    await db.campaignParticipation.create({ data: { contactId: c2.id, campaignId: campaign.id, status: 'active', classification: 'veterano' } });

    const res = await app.inject({
      method: 'GET',
      url: `/analytics/campaigns/${campaign.id}`,
      headers: { cookie: sessionCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.metrics.total_participations).toBe(2);
    expect(body.metrics.classifications.novo).toBe(1);
    expect(body.metrics.classifications.veterano).toBe(1);
    expect(body.groups).toHaveLength(1);
  });

  it('returns group dashboard with fill rate', async () => {
    const campaign = await db.campaign.create({
      data: { name: 'GrpDash', slug: 'grp-dash', createdBy: adminUserId },
    });
    const group = await db.group.create({
      data: { campaignId: campaign.id, name: 'Grupo', category: 'novo', capacity: 100, currentCount: 75 },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/analytics/groups/${group.id}`,
      headers: { cookie: sessionCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.metrics.fill_rate).toBe(75);
    expect(body.group.capacity).toBe(100);
  });

  it('returns contact timeline with masked phone', async () => {
    const contact = await db.contact.create({
      data: { phone: '5511999990110', name: 'Timeline' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/analytics/contacts/${contact.id}/timeline`,
      headers: { cookie: sessionCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.contact.phone).toMatch(/\*\*\*/);
    expect(body.contact.phone).not.toBe('5511999990110');
  });

  it('compares campaigns', async () => {
    const c1 = await db.campaign.create({ data: { name: 'Cmp1', slug: 'cmp1', createdBy: adminUserId } });
    const c2 = await db.campaign.create({ data: { name: 'Cmp2', slug: 'cmp2', createdBy: adminUserId } });
    const contact = await db.contact.create({ data: { phone: '5511999990120', name: 'Both' } });
    await db.campaignParticipation.create({ data: { contactId: contact.id, campaignId: c1.id, status: 'completed', classification: 'novo' } });
    await db.campaignParticipation.create({ data: { contactId: contact.id, campaignId: c2.id, status: 'active', classification: 'reparticipante' } });

    const res = await app.inject({
      method: 'POST',
      url: '/analytics/compare',
      headers: { cookie: sessionCookie },
      payload: { campaignIds: [c1.id, c2.id] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body[0].metrics.participations).toBe(1);
    expect(body[1].metrics.participations).toBe(1);
  });

  it('exports campaign CSV with masked phone and formula protection', async () => {
    const campaign = await db.campaign.create({
      data: { name: 'Export', slug: 'export', createdBy: adminUserId },
    });
    const contact = await db.contact.create({ data: { phone: '5511999990130', name: '=DANGEROUS' } });
    await db.campaignParticipation.create({
      data: { contactId: contact.id, campaignId: campaign.id, status: 'active', classification: 'novo' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/analytics/campaigns/${campaign.id}/export`,
      headers: { cookie: sessionCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const csv = res.body;
    expect(csv).toContain("'=DANGEROUS");
    expect(csv).toContain('5511***30');
    expect(csv).not.toContain('5511999990130');
  });

  it('returns metric definitions dictionary', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/analytics/metrics',
      headers: { cookie: sessionCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.metrics.length).toBeGreaterThan(5);
    expect(body.metrics[0]).toHaveProperty('key');
    expect(body.metrics[0]).toHaveProperty('description');
  });

  it('handles purchase and refund via Eduzz webhook', async () => {
    const purchaseRes = await app.inject({
      method: 'POST',
      url: '/webhook/eduzz',
      payload: {
        event: 'purchase_completed',
        data: {
          sale_id: 'sale-001',
          product_id: 'prod-1',
          product_name: 'Curso Teste',
          buyer_email: 'buyer@test.dev',
          buyer_phone: '5511999990140',
          amount_cents: 29700,
          currency: 'BRL',
          status: 'completed',
          created_at: new Date().toISOString(),
        },
        signature: 'mock-sig',
      },
    });
    expect(purchaseRes.statusCode).toBe(200);
    expect(purchaseRes.json().action).toBe('purchase_created');

    const contact = await db.contact.findUnique({ where: { phone: '5511999990140' } });
    expect(contact).not.toBeNull();
    expect(contact!.isStudent).toBe(true);

    const purchase = await db.purchase.findFirst({ where: { externalId: 'sale-001' } });
    expect(purchase).not.toBeNull();
    expect(purchase!.amountCents).toBe(29700);

    const refundRes = await app.inject({
      method: 'POST',
      url: '/webhook/eduzz',
      payload: {
        event: 'purchase_refunded',
        data: {
          sale_id: 'sale-001',
          product_id: 'prod-1',
          product_name: 'Curso Teste',
          buyer_email: 'buyer@test.dev',
          buyer_phone: '5511999990140',
          amount_cents: 29700,
          currency: 'BRL',
          status: 'refunded',
          created_at: new Date().toISOString(),
          refund_reason: 'desistencia',
        },
        signature: 'mock-sig',
      },
    });
    expect(refundRes.statusCode).toBe(200);
    expect(refundRes.json().action).toBe('refund_created');

    const purchaseStillExists = await db.purchase.findFirst({ where: { externalId: 'sale-001' } });
    expect(purchaseStillExists).not.toBeNull();

    const refund = await db.refund.findFirst({ where: { purchaseId: purchaseStillExists!.id } });
    expect(refund).not.toBeNull();
    expect(refund!.reason).toBe('desistencia');
  });

  it('Eduzz webhook is idempotent', async () => {
    const payload = {
      event: 'purchase_completed',
      data: {
        sale_id: 'sale-002',
        product_id: 'prod-2',
        product_name: 'Produto',
        buyer_email: 'idem@test.dev',
        buyer_phone: '5511999990141',
        amount_cents: 10000,
        currency: 'BRL',
        status: 'completed',
        created_at: new Date().toISOString(),
      },
      signature: 'mock-sig',
    };

    const res1 = await app.inject({ method: 'POST', url: '/webhook/eduzz', payload });
    expect(res1.json().processed).toBe(true);

    const res2 = await app.inject({ method: 'POST', url: '/webhook/eduzz', payload });
    expect(res2.json().processed).toBe(false);
    expect(res2.json().action).toBe('duplicate');

    const purchases = await db.purchase.findMany({ where: { externalId: 'sale-002' } });
    expect(purchases).toHaveLength(1);
  });

  it('net revenue reflects refunds', async () => {
    const contact = await db.contact.create({ data: { phone: '5511999990150', name: 'Net' } });

    const p1 = await db.purchase.create({
      data: { contactId: contact.id, externalId: 'p1', platform: 'eduzz', productId: 'x', amountCents: 20000, purchasedAt: new Date() },
    });
    await db.purchase.create({
      data: { contactId: contact.id, externalId: 'p2', platform: 'eduzz', productId: 'x', amountCents: 10000, purchasedAt: new Date() },
    });
    await db.refund.create({
      data: { purchaseId: p1.id, externalId: 'r1', reason: 'test', refundedAt: new Date() },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/dashboard',
      headers: { cookie: sessionCookie },
    });
    const body = res.json();
    expect(body.metrics.total_revenue_cents).toBe(30000);
    expect(body.metrics.total_refunds).toBe(1);
    expect(body.metrics.net_revenue_cents).toBe(10000);
  });

  it('filters dashboard by date range', async () => {
    const contact = await db.contact.create({ data: { phone: '5511999990160', name: 'Dated' } });
    await db.purchase.create({
      data: { contactId: contact.id, externalId: 'old', platform: 'eduzz', productId: 'x', amountCents: 5000, purchasedAt: new Date('2025-01-01') },
    });
    await db.purchase.create({
      data: { contactId: contact.id, externalId: 'new', platform: 'eduzz', productId: 'x', amountCents: 8000, purchasedAt: new Date('2026-08-01') },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/dashboard?from=2026-01-01&to=2026-12-31',
      headers: { cookie: sessionCookie },
    });
    const body = res.json();
    expect(body.metrics.total_purchases).toBe(1);
    expect(body.metrics.total_revenue_cents).toBe(8000);
  });

  it('requires auth on analytics endpoints', async () => {
    const endpoints = [
      { method: 'GET' as const, url: '/analytics/dashboard' },
      { method: 'GET' as const, url: '/analytics/metrics' },
    ];
    for (const ep of endpoints) {
      const res = await app.inject(ep);
      expect(res.statusCode).toBe(401);
    }
  });

  it('contact in multiple campaigns shows in both', async () => {
    const c1 = await db.campaign.create({ data: { name: 'Multi1', slug: 'multi1', createdBy: adminUserId } });
    const c2 = await db.campaign.create({ data: { name: 'Multi2', slug: 'multi2', createdBy: adminUserId } });
    const contact = await db.contact.create({ data: { phone: '5511999990170', name: 'Multi' } });
    await db.campaignParticipation.create({ data: { contactId: contact.id, campaignId: c1.id, status: 'active', classification: 'novo' } });
    await db.campaignParticipation.create({ data: { contactId: contact.id, campaignId: c2.id, status: 'active', classification: 'reparticipante' } });

    const res1 = await app.inject({
      method: 'GET',
      url: `/analytics/campaigns/${c1.id}`,
      headers: { cookie: sessionCookie },
    });
    expect(res1.json().metrics.total_participations).toBe(1);

    const res2 = await app.inject({
      method: 'GET',
      url: `/analytics/campaigns/${c2.id}`,
      headers: { cookie: sessionCookie },
    });
    expect(res2.json().metrics.total_participations).toBe(1);

    const globalRes = await app.inject({
      method: 'GET',
      url: '/analytics/dashboard',
      headers: { cookie: sessionCookie },
    });
    expect(globalRes.json().metrics.total_contacts).toBe(1);
    expect(globalRes.json().metrics.total_participations).toBe(2);
  });
});
