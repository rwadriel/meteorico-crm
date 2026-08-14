import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@meteorico/database';
import { buildApp } from '../../app.js';
import { hashPassword } from '../../services/auth.js';

const TEST_DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';
const APP_SECRET = 'meta-webhook-test-secret';
const VERIFY_TOKEN = 'meta-verify-test-token';
const PHONE_NUMBER_ID = '123456789012345';
const WABA_ID = '987654321098765';
const TEST_PHONE = '5591999990001';

async function cleanDb(db: PrismaClient) {
  await db.auditLog.deleteMany();
  await db.leadAttribution.deleteMany();
  await db.diagnosis.deleteMany();
  await db.humanHandoff.deleteMany();
  await db.outboundRecord.deleteMany();
  await db.conversationMessage.deleteMany();
  await db.conversation.deleteMany();
  await db.contactPreference.deleteMany();
  await db.processedEvent.deleteMany();
  await db.groupEvent.deleteMany();
  await db.groupMembership.deleteMany();
  await db.campaignParticipation.deleteMany();
  await db.group.deleteMany();
  await db.campaignVersion.deleteMany();
  await db.campaign.deleteMany();
  await db.contactIdentifier.deleteMany();
  await db.contact.deleteMany();
  await db.session.deleteMany();
  await db.adminUser.deleteMany();
  await db.permission.deleteMany();
  await db.role.deleteMany();
}

function metaPayload(value: Record<string, unknown>) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: WABA_ID,
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: PHONE_NUMBER_ID },
              ...value,
            },
          },
        ],
      },
    ],
  };
}

describe('Meta WhatsApp webhook integration', () => {
  const db = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  const originalEnv = {
    accessToken: process.env.META_WHATSAPP_ACCESS_TOKEN,
    appSecret: process.env.META_APP_SECRET,
    phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID,
    wabaId: process.env.META_WHATSAPP_WABA_ID,
    verifyToken: process.env.META_WHATSAPP_VERIFY_TOKEN,
  };
  let app: Awaited<ReturnType<typeof buildApp>>;
  let adminUserId: string;
  let currentCampaignId: string;

  beforeAll(async () => {
    process.env.META_WHATSAPP_ACCESS_TOKEN = 'meta-test-access-token';
    process.env.META_APP_SECRET = APP_SECRET;
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = PHONE_NUMBER_ID;
    process.env.META_WHATSAPP_WABA_ID = WABA_ID;
    process.env.META_WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;
    app = await buildApp();
  });

  afterAll(async () => {
    await cleanDb(db);
    await app.close();
    await db.$disconnect();
    restoreEnv('META_WHATSAPP_ACCESS_TOKEN', originalEnv.accessToken);
    restoreEnv('META_APP_SECRET', originalEnv.appSecret);
    restoreEnv('META_WHATSAPP_PHONE_NUMBER_ID', originalEnv.phoneNumberId);
    restoreEnv('META_WHATSAPP_WABA_ID', originalEnv.wabaId);
    restoreEnv('META_WHATSAPP_VERIFY_TOKEN', originalEnv.verifyToken);
  });

  beforeEach(async () => {
    await cleanDb(db);
    const role = await db.role.create({
      data: { name: `meta-role-${crypto.randomUUID()}`, isSystem: true },
    });
    const admin = await db.adminUser.create({
      data: {
        email: `meta-${crypto.randomUUID()}@test.dev`,
        passwordHash: await hashPassword('test-password'),
        name: 'Meta Test Admin',
        roleId: role.id,
      },
    });
    adminUserId = admin.id;
    const campaign = await db.campaign.create({
      data: {
        name: 'Meta Active Campaign',
        slug: `meta-active-${crypto.randomUUID()}`,
        status: 'active',
        createdBy: admin.id,
      },
    });
    currentCampaignId = campaign.id;
  });

  it('returns the challenge for a valid verification token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/webhooks/whatsapp/meta?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=challenge-123`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('challenge-123');
  });

  it('rejects an invalid verification token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/webhooks/whatsapp/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x',
    });

    expect(response.statusCode).toBe(403);
  });

  it('rejects a webhook with an invalid signature', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp/meta',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': `sha256=${'0'.repeat(64)}`,
      },
      payload: JSON.stringify(metaPayload({ messages: [] })),
    });

    expect(response.statusCode).toBe(403);
  });

  it('creates a normalized contact and message without confirming participation before join', async () => {
    const response = await postMeta(
      metaPayload({
        messages: [
          {
            id: 'wamid.new-contact',
            from: TEST_PHONE,
            timestamp: '1786400000',
            type: 'text',
            text: { body: 'Olá, quero participar' },
          },
        ],
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      processed: 1,
      duplicates: 0,
      classifications: ['novo'],
    });

    const contact = await db.contact.findFirst({ where: { normalizedPhone: TEST_PHONE } });
    expect(contact).not.toBeNull();
    expect(contact?.phone).toBe(TEST_PHONE);
    const message = await db.conversationMessage.findUnique({
      where: { externalMessageId: 'wamid.new-contact' },
    });
    expect(message).toMatchObject({
      direction: 'inbound',
      provider: 'meta_cloud',
      messageType: 'text',
    });
    const participation = await db.campaignParticipation.findUnique({
      where: {
        contactId_campaignId: {
          contactId: contact!.id,
          campaignId: currentCampaignId,
        },
      },
    });
    expect(participation).toBeNull();
  });

  it('reuses an existing contact regardless of phone formatting source', async () => {
    const existing = await db.contact.create({
      data: {
        phone: TEST_PHONE,
        normalizedPhone: TEST_PHONE,
        name: 'Contato Existente',
      },
    });

    await postMeta(
      metaPayload({
        messages: [
          {
            id: 'wamid.existing-contact',
            from: TEST_PHONE,
            timestamp: '1786400001',
            type: 'text',
            text: { body: 'Mensagem existente' },
          },
        ],
      }),
    );

    expect(await db.contact.count({ where: { normalizedPhone: TEST_PHONE } })).toBe(1);
    const conversation = await db.conversation.findFirst({ where: { contactId: existing.id } });
    expect(conversation).not.toBeNull();
  });

  it('processes the same inbound message and classification only once', async () => {
    const payload = metaPayload({
      messages: [
        {
          id: 'wamid.duplicate',
          from: TEST_PHONE,
          timestamp: '1786400002',
          type: 'text',
          text: { body: 'Mensagem duplicada' },
        },
      ],
    });

    const first = await postMeta(payload);
    const repeated = await postMeta(payload);

    expect(first.json()).toMatchObject({ processed: 1, duplicates: 0 });
    expect(repeated.json()).toMatchObject({ processed: 0, duplicates: 1 });
    expect(
      await db.conversationMessage.count({
        where: { externalMessageId: 'wamid.duplicate' },
      }),
    ).toBe(1);
    expect(
      await db.processedEvent.count({
        where: { eventSource: 'meta_cloud', externalEventId: 'wamid.duplicate' },
      }),
    ).toBe(1);
    expect(await db.campaignParticipation.count({ where: { campaignId: currentCampaignId } })).toBe(
      0,
    );
    expect(await db.outboundRecord.count()).toBe(0);
  });

  it('claims two simultaneous copies of the same webhook only once', async () => {
    const payload = metaPayload({
      messages: [
        {
          id: 'wamid.concurrent-duplicate',
          from: TEST_PHONE,
          timestamp: '1786400002',
          type: 'text',
          text: { body: 'Mensagem concorrente' },
        },
      ],
    });

    const responses = await Promise.all([postMeta(payload), postMeta(payload)]);
    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    expect(responses.reduce((sum, response) => sum + response.json().processed, 0)).toBe(1);
    expect(responses.reduce((sum, response) => sum + response.json().duplicates, 0)).toBe(1);
    expect(await db.conversationMessage.count({
      where: { externalMessageId: 'wamid.concurrent-duplicate' },
    })).toBe(1);
    expect(await db.processedEvent.count({
      where: { eventSource: 'meta_cloud', externalEventId: 'wamid.concurrent-duplicate' },
    })).toBe(1);
  });

  it('classifies a student as aluno without assigning a commercial group', async () => {
    const contact = await db.contact.create({
      data: {
        phone: TEST_PHONE,
        normalizedPhone: TEST_PHONE,
        name: 'Aluno',
        isStudent: true,
      },
    });
    await db.group.create({
      data: {
        campaignId: currentCampaignId,
        name: 'Grupo comercial que não deve ser usado',
        category: 'aluno',
      },
    });

    const response = await postMeta(
      metaPayload({
        messages: [
          {
            id: 'wamid.student',
            from: TEST_PHONE,
            timestamp: '1786400003',
            type: 'text',
            text: { body: 'Sou aluno' },
          },
        ],
      }),
    );

    expect(response.json().classifications).toEqual(['aluno']);
    const participation = await db.campaignParticipation.findUnique({
      where: { contactId_campaignId: { contactId: contact.id, campaignId: currentCampaignId } },
    });
    expect(participation).toBeNull();
  });

  it('classifies one confirmed prior campaign as reparticipante', async () => {
    const contact = await db.contact.create({
      data: { phone: TEST_PHONE, normalizedPhone: TEST_PHONE, name: 'Reparticipante' },
    });
    const previous = await db.campaign.create({
      data: {
        name: 'Previous Campaign',
        slug: `previous-${crypto.randomUUID()}`,
        status: 'completed',
        createdBy: adminUserId,
      },
    });
    await db.campaignParticipation.create({
      data: {
        contactId: contact.id,
        campaignId: previous.id,
        status: 'completed',
        classification: 'novo',
      },
    });

    const response = await postMeta(
      metaPayload({
        messages: [
          {
            id: 'wamid.reparticipant',
            from: TEST_PHONE,
            timestamp: '1786400004',
            type: 'text',
            text: { body: 'Quero voltar' },
          },
        ],
      }),
    );

    expect(response.json().classifications).toEqual(['reparticipante']);
  });

  it('classifies unresolved legacy evidence as needs_review without group allocation', async () => {
    await db.contact.create({
      data: {
        phone: TEST_PHONE,
        normalizedPhone: TEST_PHONE,
        name: 'Histórico externo',
        metadata: { quantidade_participacoes_csv: '1' },
      },
    });

    const response = await postMeta(
      metaPayload({
        messages: [
          {
            id: 'wamid.needs-review',
            from: TEST_PHONE,
            timestamp: '1786400005',
            type: 'text',
            text: { body: 'Tenho histórico' },
          },
        ],
      }),
    );

    expect(response.json().classifications).toEqual(['needs_review']);
    expect(await db.campaignParticipation.count({ where: { campaignId: currentCampaignId } })).toBe(
      0,
    );
  });

  it.each(['sent', 'delivered', 'read', 'failed'] as const)(
    'updates Message and OutboundRecord for status %s',
    async (status) => {
      const contact = await db.contact.create({
        data: { phone: TEST_PHONE, normalizedPhone: TEST_PHONE, name: 'Status' },
      });
      const conversation = await db.conversation.create({ data: { contactId: contact.id } });
      await db.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          direction: 'outbound',
          content: 'Status test',
          provider: 'meta_cloud',
          externalMessageId: 'wamid.status-target',
          deliveryStatus: 'pending',
        },
      });
      await db.outboundRecord.create({
        data: {
          idempotencyKey: `status-${status}`,
          contactId: contact.id,
          conversationId: conversation.id,
          provider: 'meta_cloud',
          providerMessageId: 'wamid.status-target',
          status: 'pending',
        },
      });

      const response = await postMeta(
        metaPayload({
          statuses: [
            {
              id: 'wamid.status-target',
              status,
              timestamp: '1786400010',
              ...(status === 'failed' ? { errors: [{ code: 131000 }] } : {}),
            },
          ],
        }),
      );

      expect(response.statusCode).toBe(200);
      const message = await db.conversationMessage.findUnique({
        where: { externalMessageId: 'wamid.status-target' },
      });
      const record = await db.outboundRecord.findUnique({
        where: { idempotencyKey: `status-${status}` },
      });
      expect(message?.deliveryStatus).toBe(status);
      expect(record?.status).toBe(status);
      if (status === 'failed') expect(record?.lastError).toBe('meta_error_code_131000');
    },
  );

  async function postMeta(payload: unknown) {
    const raw = JSON.stringify(payload);
    const signature = createHmac('sha256', APP_SECRET).update(raw).digest('hex');
    return app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp/meta',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': `sha256=${signature}`,
      },
      payload: raw,
    });
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
