import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@meteorico/database';
import { buildApp } from '../../app.js';
import { hashPassword } from '../../services/auth.js';
import {
  validateVariables,
  renderTemplate,
  extractVariables,
} from '../../services/template.js';
import { containsProhibitedContent } from '../../services/diagnosis.js';
import { detectLoop } from '../../services/flow.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';

const PERMS = [
  { resource: 'messages', action: 'create' },
  { resource: 'messages', action: 'read' },
  { resource: 'messages', action: 'update' },
  { resource: 'messages', action: 'delete' },
  { resource: 'contacts', action: 'read' },
  { resource: 'contacts', action: 'update' },
  { resource: 'campaigns', action: 'read' },
  { resource: 'campaigns', action: 'create' },
  { resource: 'settings', action: 'read' },
  { resource: 'settings', action: 'update' },
  { resource: 'groups', action: 'create' },
  { resource: 'groups', action: 'read' },
];

async function cleanDb(db: PrismaClient) {
  await db.diagnosis.deleteMany();
  await db.humanHandoff.deleteMany();
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
  await db.aiConfig.deleteMany();
}

describe('Flows & AI Integration', () => {
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
      data: { email: 'flow@test.dev', passwordHash: await hashPassword('pass123'), name: 'Tester', roleId: role.id },
    });
    adminUserId = user.id;

    const loginRes = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'flow@test.dev', password: 'pass123' } });
    const cookies = loginRes.cookies as Array<{ name: string; value: string }>;
    sessionCookie = `meteorico_session=${cookies.find((c) => c.name === 'meteorico_session')!.value}`;
  });

  // --- Template tests ---

  it('validates known variables', () => {
    expect(validateVariables('Ola {{nome}}, campanha {{campanha}}').valid).toBe(true);
  });

  it('rejects unknown variables', () => {
    const result = validateVariables('Ola {{nome}}, {{desconhecida}}');
    expect(result.valid).toBe(false);
    expect(result.unknown).toContain('desconhecida');
  });

  it('renders template with variables', () => {
    const result = renderTemplate('Ola {{nome}}, sua classificacao e {{classificacao}}', {
      nome: 'Maria',
      classificacao: 'veterano',
    });
    expect(result).toBe('Ola Maria, sua classificacao e veterano');
  });

  it('keeps unresolved variables in render', () => {
    const result = renderTemplate('Ola {{nome}}, link: {{link}}', { nome: 'Ana' });
    expect(result).toBe('Ola Ana, link: {{link}}');
  });

  it('creates template via API and versions it', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/templates',
      headers: { cookie: sessionCookie },
      payload: { name: 'Boas vindas', category: 'onboarding', content: 'Ola {{nome}}, bem-vindo!' },
    });
    expect(createRes.statusCode).toBe(201);
    const template = createRes.json();
    expect(template.versions).toHaveLength(1);

    const updateRes = await app.inject({
      method: 'PUT',
      url: `/templates/${template.id}`,
      headers: { cookie: sessionCookie },
      payload: { content: 'Ola {{nome}}, campanha {{campanha}} comecou!' },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().version).toBe(2);

    const getRes = await app.inject({
      method: 'GET',
      url: `/templates/${template.id}`,
      headers: { cookie: sessionCookie },
    });
    expect(getRes.json().versions).toHaveLength(2);
  });

  it('rejects template with unknown variable', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/templates',
      headers: { cookie: sessionCookie },
      payload: { name: 'Bad', category: 'test', content: 'Ola {{invalida}}' },
    });
    expect(res.statusCode).toBe(500);
  });

  it('previews template rendering', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/templates/preview',
      headers: { cookie: sessionCookie },
      payload: {
        content: 'Ola {{nome}}, grupo {{grupo}}',
        variables: { nome: 'Joao', grupo: 'VIP' },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rendered).toBe('Ola Joao, grupo VIP');
    expect(res.json().validation.valid).toBe(true);
  });

  // --- Flow tests ---

  it('creates flow with steps and publishes', async () => {
    const flowRes = await app.inject({
      method: 'POST',
      url: '/flows',
      headers: { cookie: sessionCookie },
      payload: { name: 'Onboarding', description: 'Fluxo de boas vindas', trigger: 'on_join' },
    });
    expect(flowRes.statusCode).toBe(201);
    const flow = flowRes.json();
    const versionId = flow.versions[0].id;

    const stepRes = await app.inject({
      method: 'POST',
      url: `/flows/versions/${versionId}/steps`,
      headers: { cookie: sessionCookie },
      payload: {
        stepType: 'message',
        config: { content: 'Bem vindo!' },
        order: 1,
      },
    });
    expect(stepRes.statusCode).toBe(201);

    const publishRes = await app.inject({
      method: 'POST',
      url: `/flows/${flow.id}/publish`,
      headers: { cookie: sessionCookie },
    });
    expect(publishRes.statusCode).toBe(200);
    expect(publishRes.json().isPublished).toBe(true);
  });

  it('rejects invalid trigger', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/flows',
      headers: { cookie: sessionCookie },
      payload: { name: 'Bad', description: '', trigger: 'eval_code' },
    });
    expect(res.statusCode).toBe(500);
  });

  it('creates flow with buttons and numbered fallback', async () => {
    const flowRes = await app.inject({
      method: 'POST',
      url: '/flows',
      headers: { cookie: sessionCookie },
      payload: { name: 'Choice', description: 'Escolha', trigger: 'on_message' },
    });
    const flow = flowRes.json();
    const versionId = flow.versions[0].id;

    const stepRes = await app.inject({
      method: 'POST',
      url: `/flows/versions/${versionId}/steps`,
      headers: { cookie: sessionCookie },
      payload: {
        stepType: 'buttons',
        config: {
          content: 'Escolha uma opcao:',
          buttons: [
            { label: 'Sim', value: 'yes' },
            { label: 'Nao', value: 'no' },
            { label: 'Talvez', value: 'maybe' },
          ],
        },
        order: 1,
      },
    });
    expect(stepRes.statusCode).toBe(201);
    const step = stepRes.json();
    expect(step.buttons).toHaveLength(3);
    expect(step.buttons[0].label).toBe('Sim');
  });

  it('detects loops in flow', () => {
    const steps = [
      { id: 'a', nextStepId: 'b' },
      { id: 'b', nextStepId: 'c' },
      { id: 'c', nextStepId: 'a' },
    ];
    expect(detectLoop(steps)).toBe(true);
  });

  it('allows acyclic flow', () => {
    const steps = [
      { id: 'a', nextStepId: 'b' },
      { id: 'b', nextStepId: 'c' },
      { id: 'c', nextStepId: null },
    ];
    expect(detectLoop(steps)).toBe(false);
  });

  it('rejects publishing empty flow', async () => {
    const flowRes = await app.inject({
      method: 'POST',
      url: '/flows',
      headers: { cookie: sessionCookie },
      payload: { name: 'Empty', description: '', trigger: 'manual' },
    });
    const flow = flowRes.json();

    const publishRes = await app.inject({
      method: 'POST',
      url: `/flows/${flow.id}/publish`,
      headers: { cookie: sessionCookie },
    });
    expect(publishRes.statusCode).toBe(500);
  });

  // --- Knowledge base tests ---

  it('CRUD knowledge documents', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/knowledge',
      headers: { cookie: sessionCookie },
      payload: { title: 'FAQ', content: 'Pergunta: O que e?\nResposta: Um CRM.', category: 'faq' },
    });
    expect(createRes.statusCode).toBe(201);
    const doc = createRes.json();

    const updateRes = await app.inject({
      method: 'PUT',
      url: `/knowledge/${doc.id}`,
      headers: { cookie: sessionCookie },
      payload: { content: 'Pergunta: O que e?\nResposta: Um CRM de lancamentos.' },
    });
    expect(updateRes.statusCode).toBe(200);

    const listRes = await app.inject({
      method: 'GET',
      url: '/knowledge?category=faq',
      headers: { cookie: sessionCookie },
    });
    expect(listRes.json()).toHaveLength(1);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/knowledge/${doc.id}`,
      headers: { cookie: sessionCookie },
    });
    expect(deleteRes.statusCode).toBe(204);
  });

  // --- Prohibited content filter ---

  it('detects prohibited monetization promises', () => {
    expect(containsProhibitedContent('Voce vai ganhar muito dinheiro')).toBe(true);
    expect(containsProhibitedContent('Garantimos lucro certo')).toBe(true);
    expect(containsProhibitedContent('Resultado garantido para todos')).toBe(true);
    expect(containsProhibitedContent('Bem-vindo ao lancamento!')).toBe(false);
  });

  // --- Diagnosis tests ---

  it('requires 3+ participations for diagnosis', async () => {
    const campaign = await db.campaign.create({
      data: { name: 'Diag', slug: 'diag', createdBy: adminUserId },
    });
    const contact = await db.contact.create({
      data: { phone: '5511999990050', name: 'Test', totalParticipations: 1 },
    });
    const participation = await db.campaignParticipation.create({
      data: { contactId: contact.id, campaignId: campaign.id, status: 'active', classification: 'novo' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/diagnosis/run',
      headers: { cookie: sessionCookie },
      payload: { contactId: contact.id, participationId: participation.id, campaignId: campaign.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('3+');
  });

  it('runs diagnosis for veteran with mock AI', async () => {
    const campaign = await db.campaign.create({
      data: { name: 'Diag2', slug: 'diag2', createdBy: adminUserId },
    });
    const contact = await db.contact.create({
      data: { phone: '5511999990051', name: 'Veterano', totalParticipations: 5 },
    });
    const participation = await db.campaignParticipation.create({
      data: { contactId: contact.id, campaignId: campaign.id, status: 'active', classification: 'veterano' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/diagnosis/run',
      headers: { cookie: sessionCookie },
      payload: { contactId: contact.id, participationId: participation.id, campaignId: campaign.id },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().diagnosis).toBeDefined();
    expect(res.json().tokensUsed).toBeGreaterThanOrEqual(0);

    const diagnoses = await db.diagnosis.findMany({ where: { contactId: contact.id } });
    expect(diagnoses).toHaveLength(1);
  });

  it('playground does not persist diagnosis', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/diagnosis/playground',
      headers: { cookie: sessionCookie },
      payload: {
        classification: 'veterano',
        totalParticipations: 5,
        isStudent: false,
        conversationHistory: ['[inbound] Ola', '[outbound] Bem-vindo!'],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().diagnosis).toBeDefined();

    const count = await db.diagnosis.count();
    expect(count).toBe(0);
  });

  it('playground rejects low participation count', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/diagnosis/playground',
      headers: { cookie: sessionCookie },
      payload: {
        classification: 'novo',
        totalParticipations: 1,
        isStudent: false,
        conversationHistory: [],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  // --- Handoff tests ---

  it('creates and resolves handoff', async () => {
    const contact = await db.contact.create({
      data: { phone: '5511999990060', name: 'Handoff' },
    });
    const conversation = await db.conversation.create({
      data: { contactId: contact.id, status: 'active' },
    });

    const createRes = await app.inject({
      method: 'POST',
      url: '/handoffs',
      headers: { cookie: sessionCookie },
      payload: { conversationId: conversation.id, assignedTo: adminUserId, reason: 'Caso complexo' },
    });
    expect(createRes.statusCode).toBe(201);
    const handoff = createRes.json();
    expect(handoff.status).toBe('pending');

    const updatedConv = await db.conversation.findUnique({ where: { id: conversation.id } });
    expect(updatedConv!.status).toBe('handoff');

    const resolveRes = await app.inject({
      method: 'POST',
      url: `/handoffs/${handoff.id}/resolve`,
      headers: { cookie: sessionCookie },
    });
    expect(resolveRes.statusCode).toBe(200);
    expect(resolveRes.json().status).toBe('resolved');

    const finalConv = await db.conversation.findUnique({ where: { id: conversation.id } });
    expect(finalConv!.status).toBe('active');
  });

  // --- Auth required ---

  it('requires auth on all endpoints', async () => {
    const endpoints = [
      { method: 'GET' as const, url: '/templates' },
      { method: 'POST' as const, url: '/flows', payload: {} },
      { method: 'GET' as const, url: '/knowledge' },
      { method: 'POST' as const, url: '/diagnosis/run', payload: {} },
      { method: 'GET' as const, url: '/handoffs' },
    ];

    for (const ep of endpoints) {
      const res = await app.inject({ method: ep.method, url: ep.url, payload: ep.payload });
      expect(res.statusCode).toBe(401);
    }
  });

  // --- Variable extraction ---

  it('extracts unique variables from content', () => {
    const vars = extractVariables('{{nome}} e {{campanha}} e {{nome}} de novo');
    expect(vars).toEqual(['nome', 'campanha']);
  });

  // --- Flow version management ---

  it('creates new flow version copying steps', async () => {
    const flowRes = await app.inject({
      method: 'POST',
      url: '/flows',
      headers: { cookie: sessionCookie },
      payload: { name: 'Versioned', description: 'Test versions', trigger: 'manual' },
    });
    const flow = flowRes.json();
    const v1Id = flow.versions[0].id;

    await app.inject({
      method: 'POST',
      url: `/flows/versions/${v1Id}/steps`,
      headers: { cookie: sessionCookie },
      payload: { stepType: 'message', config: { content: 'V1 message' }, order: 1 },
    });

    await app.inject({
      method: 'POST',
      url: `/flows/${flow.id}/publish`,
      headers: { cookie: sessionCookie },
    });

    const v2Res = await app.inject({
      method: 'POST',
      url: `/flows/${flow.id}/versions`,
      headers: { cookie: sessionCookie },
    });
    expect(v2Res.statusCode).toBe(201);
    const v2 = v2Res.json();
    expect(v2.version).toBe(2);
    expect(v2.steps).toHaveLength(1);
    expect(v2.isPublished).toBe(false);
  });
});
