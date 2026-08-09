import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@meteorico/database';
import { buildApp } from '../../app.js';
import { hashPassword } from '../../services/auth.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';

const PERMS = [
  { resource: 'campaigns', action: 'read' },
  { resource: 'campaigns', action: 'create' },
  { resource: 'messages', action: 'read' },
  { resource: 'messages', action: 'create' },
  { resource: 'messages', action: 'update' },
  { resource: 'contacts', action: 'read' },
  { resource: 'contacts', action: 'update' },
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

describe('Messaging Integration', () => {
  let db: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sessionCookie: string;
  let adminUserId: string;
  let campaignId: string;

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
      data: { email: 'msg@test.dev', passwordHash: await hashPassword('pass123'), name: 'Tester', roleId: role.id },
    });
    adminUserId = user.id;

    const campaign = await db.campaign.create({
      data: { name: 'Test Campaign', slug: 'test-campaign', createdBy: adminUserId },
    });
    campaignId = campaign.id;

    const loginRes = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'msg@test.dev', password: 'pass123' } });
    const cookies = loginRes.cookies as Array<{ name: string; value: string }>;
    sessionCookie = `meteorico_session=${cookies.find((c) => c.name === 'meteorico_session')!.value}`;
  });

  it('creates a redirect link', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/messaging/redirect-links',
      headers: { cookie: sessionCookie },
      payload: {
        campaignId,
        destinationUrl: 'https://wa.me/5511999990001',
        utmSource: 'instagram',
        utmMedium: 'story',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.code).toHaveLength(8);
    expect(body.destinationUrl).toBe('https://wa.me/5511999990001');
    expect(body.utmSource).toBe('instagram');
  });

  it('rejects redirect link with disallowed destination', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/messaging/redirect-links',
      headers: { cookie: sessionCookie },
      payload: {
        campaignId,
        destinationUrl: 'https://evil.com/phishing',
      },
    });

    expect(res.statusCode).toBe(500);
  });

  it('resolves redirect link and tracks click', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/messaging/redirect-links',
      headers: { cookie: sessionCookie },
      payload: {
        campaignId,
        destinationUrl: 'https://wa.me/5511999990001',
      },
    });
    const { code } = createRes.json();

    const redirectRes = await app.inject({
      method: 'GET',
      url: `/r/${code}`,
    });

    expect(redirectRes.statusCode).toBe(302);
    expect(redirectRes.headers.location).toBe('https://wa.me/5511999990001');

    const clicks = await db.trackingClick.findMany();
    expect(clicks).toHaveLength(1);

    const link = await db.redirectLink.findUnique({ where: { code } });
    expect(link!.usedCount).toBe(1);
  });

  it('returns 404 for expired link', async () => {
    const link = await db.redirectLink.create({
      data: {
        code: 'expired1',
        campaignId,
        destinationUrl: 'https://wa.me/5511999990001',
        expiresAt: new Date(Date.now() - 60000),
        createdBy: adminUserId,
      },
    });

    const res = await app.inject({ method: 'GET', url: `/r/${link.code}` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for exhausted max uses', async () => {
    const link = await db.redirectLink.create({
      data: {
        code: 'maxused1',
        campaignId,
        destinationUrl: 'https://wa.me/5511999990001',
        maxUses: 1,
        usedCount: 1,
        createdBy: adminUserId,
      },
    });

    const res = await app.inject({ method: 'GET', url: `/r/${link.code}` });
    expect(res.statusCode).toBe(404);
  });

  it('rejects invalid code format (open redirect protection)', async () => {
    const res = await app.inject({ method: 'GET', url: '/r/ab' });
    expect(res.statusCode).toBe(400);
  });

  it('handles webhook message and creates conversation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/messaging',
      payload: {
        provider: 'mock',
        type: 'message',
        message: {
          externalMessageId: 'ext-msg-1',
          from: '5511999990001',
          content: 'Oi, quero participar',
          messageType: 'text',
          timestamp: new Date().toISOString(),
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.isNew).toBe(true);

    const contact = await db.contact.findUnique({ where: { phone: '5511999990001' } });
    expect(contact).not.toBeNull();

    const conversation = await db.conversation.findFirst({ where: { contactId: contact!.id } });
    expect(conversation).not.toBeNull();
    expect(conversation!.status).toBe('active');
  });

  it('does not duplicate conversation on repeated webhook', async () => {
    const payload = {
      provider: 'mock',
      type: 'message',
      message: {
        externalMessageId: 'ext-msg-dup',
        from: '5511999990002',
        content: 'Hello',
        messageType: 'text',
        timestamp: new Date().toISOString(),
      },
    };

    await app.inject({ method: 'POST', url: '/webhook/messaging', payload });
    const res2 = await app.inject({ method: 'POST', url: '/webhook/messaging', payload });

    expect(res2.json().isNew).toBe(false);

    const messages = await db.conversationMessage.findMany({
      where: { externalMessageId: 'ext-msg-dup' },
    });
    expect(messages).toHaveLength(1);
  });

  it('handles delivery status webhook', async () => {
    const contact = await db.contact.create({
      data: { phone: '5511999990010', name: 'Delivery Test' },
    });
    const conversation = await db.conversation.create({
      data: { contactId: contact.id, status: 'active' },
    });
    await db.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        direction: 'outbound',
        content: 'Test',
        externalMessageId: 'ext-status-1',
        provider: 'mock',
        deliveryStatus: 'sent',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/messaging',
      payload: {
        provider: 'mock',
        type: 'status',
        status: {
          externalMessageId: 'ext-status-1',
          status: 'delivered',
          timestamp: new Date().toISOString(),
        },
      },
    });

    expect(res.statusCode).toBe(200);

    const msg = await db.conversationMessage.findUnique({
      where: { externalMessageId: 'ext-status-1' },
    });
    expect(msg!.deliveryStatus).toBe('delivered');
    expect(msg!.deliveredAt).not.toBeNull();
  });

  it('opt-out prevents message sending', async () => {
    const contact = await db.contact.create({
      data: { phone: '5511999990020', name: 'OptOut Test' },
    });

    const optOutRes = await app.inject({
      method: 'POST',
      url: `/messaging/contacts/${contact.id}/opt-out`,
      headers: { cookie: sessionCookie },
    });
    expect(optOutRes.statusCode).toBe(200);

    const pref = await db.contactPreference.findFirst({
      where: { contactId: contact.id, channel: 'whatsapp' },
    });
    expect(pref!.optedOut).toBe(true);
  });

  it('deactivates redirect link', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/messaging/redirect-links',
      headers: { cookie: sessionCookie },
      payload: {
        campaignId,
        destinationUrl: 'https://wa.me/5511999990001',
      },
    });
    const { id, code } = createRes.json();

    await app.inject({
      method: 'POST',
      url: `/messaging/redirect-links/${id}/deactivate`,
      headers: { cookie: sessionCookie },
    });

    const redirectRes = await app.inject({ method: 'GET', url: `/r/${code}` });
    expect(redirectRes.statusCode).toBe(404);
  });

  it('lists redirect links filtered by campaign', async () => {
    await app.inject({
      method: 'POST',
      url: '/messaging/redirect-links',
      headers: { cookie: sessionCookie },
      payload: { campaignId, destinationUrl: 'https://wa.me/5511999990001' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/messaging/redirect-links?campaignId=${campaignId}`,
      headers: { cookie: sessionCookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().links).toHaveLength(1);
  });

  it('activates a deactivated link', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/messaging/redirect-links',
      headers: { cookie: sessionCookie },
      payload: { campaignId, destinationUrl: 'https://wa.me/5511999990001' },
    });
    const { id, code } = createRes.json();

    await app.inject({
      method: 'POST',
      url: `/messaging/redirect-links/${id}/deactivate`,
      headers: { cookie: sessionCookie },
    });

    const deactivatedRes = await app.inject({ method: 'GET', url: `/r/${code}` });
    expect(deactivatedRes.statusCode).toBe(404);

    await app.inject({
      method: 'POST',
      url: `/messaging/redirect-links/${id}/activate`,
      headers: { cookie: sessionCookie },
    });

    const reactivatedRes = await app.inject({ method: 'GET', url: `/r/${code}` });
    expect(reactivatedRes.statusCode).toBe(302);
  });

  it('records two separate clicks independently', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/messaging/redirect-links',
      headers: { cookie: sessionCookie },
      payload: { campaignId, destinationUrl: 'https://wa.me/5511999990001' },
    });
    const { code } = createRes.json();

    await app.inject({ method: 'GET', url: `/r/${code}` });
    await app.inject({ method: 'GET', url: `/r/${code}` });

    const clicks = await db.trackingClick.findMany();
    expect(clicks).toHaveLength(2);
    expect(clicks[0].id).not.toBe(clicks[1].id);

    const link = await db.redirectLink.findUnique({ where: { code } });
    expect(link!.usedCount).toBe(2);
  });

  it('generates code with no PII', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/messaging/redirect-links',
      headers: { cookie: sessionCookie },
      payload: { campaignId, destinationUrl: 'https://wa.me/5511999990001' },
    });
    const { code } = createRes.json();

    expect(code).not.toContain(campaignId);
    expect(code).not.toContain(adminUserId);
    expect(code).not.toContain('msg@test.dev');
    expect(code).toMatch(/^[a-zA-Z0-9_-]{4,16}$/);
  });

  it('creates link with Meta attribution fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/messaging/redirect-links',
      headers: { cookie: sessionCookie },
      payload: {
        campaignId,
        destinationUrl: 'https://wa.me/5511999990001',
        utmSource: 'facebook',
        utmMedium: 'cpc',
        utmCampaign: 'lancamento-s33',
        utmContent: 'banner-topo',
        fbclid: 'abc123def456',
        metaCampaignId: 'mc_001',
        metaAdsetId: 'mas_001',
        metaAdId: 'mad_001',
        creativeId: 'cr_001',
        placement: 'feed',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.utmSource).toBe('facebook');
    expect(body.utmCampaign).toBe('lancamento-s33');
    expect(body.metaCampaignId).toBe('mc_001');
    expect(body.metaAdsetId).toBe('mas_001');
    expect(body.metaAdId).toBe('mad_001');
    expect(body.creativeId).toBe('cr_001');
    expect(body.placement).toBe('feed');
  });

  it('links click to redirect link via linkId', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/messaging/redirect-links',
      headers: { cookie: sessionCookie },
      payload: { campaignId, destinationUrl: 'https://wa.me/5511999990001' },
    });
    const { id, code } = createRes.json();

    await app.inject({ method: 'GET', url: `/r/${code}` });

    const click = await db.trackingClick.findFirst({ where: { linkId: id } });
    expect(click).not.toBeNull();
    expect(click!.url).toBe('https://wa.me/5511999990001');
  });

  it('includes click count in list response', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/messaging/redirect-links',
      headers: { cookie: sessionCookie },
      payload: { campaignId, destinationUrl: 'https://wa.me/5511999990001' },
    });
    const { code } = createRes.json();

    await app.inject({ method: 'GET', url: `/r/${code}` });
    await app.inject({ method: 'GET', url: `/r/${code}` });

    const listRes = await app.inject({
      method: 'GET',
      url: '/messaging/redirect-links',
      headers: { cookie: sessionCookie },
    });
    const links = listRes.json().links;
    expect(links[0]._count.clicks).toBe(2);
  });

  it('requires auth for messaging endpoints', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/messaging/redirect-links',
    });
    expect(res.statusCode).toBe(401);
  });
});
