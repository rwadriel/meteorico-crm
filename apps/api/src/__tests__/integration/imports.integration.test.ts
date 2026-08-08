import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@meteorico/database';
import { buildApp } from '../../app.js';
import { hashPassword } from '../../services/auth.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';

const PERMS = [
  { resource: 'imports', action: 'read' },
  { resource: 'imports', action: 'create' },
  { resource: 'imports', action: 'delete' },
];

async function cleanDb(db: PrismaClient) {
  await db.importRow.deleteMany();
  await db.import.deleteMany();
  await db.campaignParticipation.deleteMany();
  await db.campaignVersion.deleteMany();
  await db.group.deleteMany();
  await db.contact.deleteMany();
  await db.campaign.deleteMany();
  await db.auditLog.deleteMany();
  await db.session.deleteMany();
  await db.adminUser.deleteMany();
  await db.permission.deleteMany();
  await db.role.deleteMany();
}

const CONTACTS_CSV = [
  'telefone,nome,email,quantidade_participacoes,ultima_edicao,aluno,produto,origem,data_primeiro_contato,data_ultimo_contato,observacoes',
  '91999990001,Ana Ficticia,,1,40,nao,,csv,,,Teste',
  '91999990002,Carlos Ficticio,,0,,sim,ProdX,csv,,,Aluno teste',
].join('\n');

const PARTICIPATIONS_CSV = [
  'telefone,campanha,aluno_atual,status_na_campanha,marcado_saiu,rotulos_vcard,origem',
  '91999990001,40,nao,participou_nao_comprou,nao,ML Grupo 40,csv',
  '91999990002,40,sim,ativo,nao,ML Aluno 40,csv',
].join('\n');

describe('Imports Integration', () => {
  let db: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sessionCookie: string;

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
      data: { name: `admin-${crypto.randomUUID().slice(0, 8)}`, description: 'admin', isSystem: true },
    });
    for (const perm of PERMS) {
      await db.permission.create({ data: { roleId: role.id, ...perm } });
    }
    await db.adminUser.create({
      data: { email: 'imp@test.dev', passwordHash: await hashPassword('pass123'), name: 'Tester', roleId: role.id },
    });
    const loginRes = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'imp@test.dev', password: 'pass123' } });
    const cookies = loginRes.cookies as Array<{ name: string; value: string }>;
    sessionCookie = cookies.find((c) => c.name === 'meteorico_session')!.value;
  });

  it('previews contacts CSV', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/imports/preview',
      cookies: { meteorico_session: sessionCookie },
      headers: { 'content-type': 'application/json' },
      payload: { type: 'contacts', content: CONTACTS_CSV, filename: 'test.csv' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.validCount).toBe(2);
    expect(body.errorCount).toBe(0);
    expect(body.import.status).toBe('previewing');
    await app.close();
  });

  it('previews participations CSV', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/imports/preview',
      cookies: { meteorico_session: sessionCookie },
      headers: { 'content-type': 'application/json' },
      payload: { type: 'participations', content: PARTICIPATIONS_CSV, filename: 'part.csv' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.validCount).toBe(2);
    await app.close();
  });

  it('shows errors for invalid phone numbers', async () => {
    const csv = 'telefone,nome\n12345,Bad Phone\n91999990010,Valid';
    const res = await app.inject({
      method: 'POST', url: '/api/imports/preview',
      cookies: { meteorico_session: sessionCookie },
      headers: { 'content-type': 'application/json' },
      payload: { type: 'contacts', content: csv, filename: 'bad.csv' },
    });
    const body = JSON.parse(res.body);
    expect(body.errorCount).toBe(1);
    expect(body.validCount).toBe(1);
    await app.close();
  });

  it('sanitizes CSV formula injection', async () => {
    const csv = 'telefone,nome\n91999990011,=CMD("calc")';
    const res = await app.inject({
      method: 'POST', url: '/api/imports/preview',
      cookies: { meteorico_session: sessionCookie },
      headers: { 'content-type': 'application/json' },
      payload: { type: 'contacts', content: csv, filename: 'formula.csv' },
    });
    const body = JSON.parse(res.body);
    expect(body.validCount).toBe(1);
    const row = body.preview[0];
    const data = row.data as Record<string, unknown>;
    expect(data.name).not.toContain('=');
    await app.close();
  });

  it('confirms contacts import and creates contacts', async () => {
    const previewRes = await app.inject({
      method: 'POST', url: '/api/imports/preview',
      cookies: { meteorico_session: sessionCookie },
      headers: { 'content-type': 'application/json' },
      payload: { type: 'contacts', content: CONTACTS_CSV, filename: 'c.csv' },
    });
    const importId = JSON.parse(previewRes.body).import.id;

    const confirmRes = await app.inject({
      method: 'POST', url: `/api/imports/${importId}/confirm`,
      cookies: { meteorico_session: sessionCookie },
    });
    expect(confirmRes.statusCode).toBe(200);
    const result = JSON.parse(confirmRes.body);
    expect(result.processedRows).toBe(2);

    const contacts = await db.contact.findMany();
    expect(contacts.length).toBe(2);
    await app.close();
  });

  it('student status prevails in conflicts', async () => {
    await db.contact.create({
      data: { phone: '5591999990002', normalizedPhone: '5591999990002', isStudent: false },
    });

    const previewRes = await app.inject({
      method: 'POST', url: '/api/imports/preview',
      cookies: { meteorico_session: sessionCookie },
      headers: { 'content-type': 'application/json' },
      payload: { type: 'contacts', content: CONTACTS_CSV, filename: 'student.csv' },
    });
    const importId = JSON.parse(previewRes.body).import.id;

    await app.inject({
      method: 'POST', url: `/api/imports/${importId}/confirm`,
      cookies: { meteorico_session: sessionCookie },
    });

    const contact = await db.contact.findUnique({ where: { phone: '5591999990002' } });
    expect(contact!.isStudent).toBe(true);
    await app.close();
  });

  it('idempotent reimport does not duplicate contacts', async () => {
    const preview1 = await app.inject({
      method: 'POST', url: '/api/imports/preview',
      cookies: { meteorico_session: sessionCookie },
      headers: { 'content-type': 'application/json' },
      payload: { type: 'contacts', content: CONTACTS_CSV, filename: 'idem1.csv' },
    });
    await app.inject({ method: 'POST', url: `/api/imports/${JSON.parse(preview1.body).import.id}/confirm`, cookies: { meteorico_session: sessionCookie } });

    const preview2 = await app.inject({
      method: 'POST', url: '/api/imports/preview',
      cookies: { meteorico_session: sessionCookie },
      headers: { 'content-type': 'application/json' },
      payload: { type: 'contacts', content: CONTACTS_CSV, filename: 'idem2.csv' },
    });
    await app.inject({ method: 'POST', url: `/api/imports/${JSON.parse(preview2.body).import.id}/confirm`, cookies: { meteorico_session: sessionCookie } });

    const contacts = await db.contact.findMany();
    expect(contacts.length).toBe(2);
    await app.close();
  });

  it('rollback deletes created contacts', async () => {
    const previewRes = await app.inject({
      method: 'POST', url: '/api/imports/preview',
      cookies: { meteorico_session: sessionCookie },
      headers: { 'content-type': 'application/json' },
      payload: { type: 'contacts', content: CONTACTS_CSV, filename: 'roll.csv' },
    });
    const importId = JSON.parse(previewRes.body).import.id;

    await app.inject({ method: 'POST', url: `/api/imports/${importId}/confirm`, cookies: { meteorico_session: sessionCookie } });
    expect((await db.contact.findMany()).length).toBe(2);

    const rollbackRes = await app.inject({
      method: 'POST', url: `/api/imports/${importId}/rollback`,
      cookies: { meteorico_session: sessionCookie },
    });
    expect(rollbackRes.statusCode).toBe(200);
    expect((await db.contact.findMany()).length).toBe(0);
    await app.close();
  });

  it('historical campaigns from participations have no invented dates', async () => {
    const previewRes = await app.inject({
      method: 'POST', url: '/api/imports/preview',
      cookies: { meteorico_session: sessionCookie },
      headers: { 'content-type': 'application/json' },
      payload: { type: 'participations', content: PARTICIPATIONS_CSV, filename: 'hist.csv' },
    });
    const importId = JSON.parse(previewRes.body).import.id;

    await app.inject({ method: 'POST', url: `/api/imports/${importId}/confirm`, cookies: { meteorico_session: sessionCookie } });

    const campaign = await db.campaign.findFirst({ where: { editionNumber: 40 } });
    expect(campaign).toBeTruthy();
    expect(campaign!.status).toBe('historical');
    expect(campaign!.startsAt).toBeNull();
    expect(campaign!.endsAt).toBeNull();
    await app.close();
  });

  it('rotulos_vcard goes to metadata not contact name', async () => {
    const previewRes = await app.inject({
      method: 'POST', url: '/api/imports/preview',
      cookies: { meteorico_session: sessionCookie },
      headers: { 'content-type': 'application/json' },
      payload: { type: 'participations', content: PARTICIPATIONS_CSV, filename: 'vcard.csv' },
    });
    const importId = JSON.parse(previewRes.body).import.id;

    await app.inject({ method: 'POST', url: `/api/imports/${importId}/confirm`, cookies: { meteorico_session: sessionCookie } });

    const contact = await db.contact.findUnique({ where: { phone: '5591999990001' } });
    expect(contact).toBeTruthy();
    expect(contact!.name).not.toContain('ML Grupo');

    const participation = await db.campaignParticipation.findFirst({
      where: { contactId: contact!.id },
    });
    expect(participation).toBeTruthy();
    const meta = participation!.metadata as Record<string, unknown> | null;
    expect(meta?.rotulos_vcard).toBe('ML Grupo 40');
    await app.close();
  });

  it('rejects path traversal in filename', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/imports/preview',
      cookies: { meteorico_session: sessionCookie },
      headers: { 'content-type': 'application/json' },
      payload: { type: 'contacts', content: CONTACTS_CSV, filename: '../../../etc/passwd' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Invalid filename');
    await app.close();
  });

  it('lists imports with pagination', async () => {
    await app.inject({
      method: 'POST', url: '/api/imports/preview',
      cookies: { meteorico_session: sessionCookie },
      headers: { 'content-type': 'application/json' },
      payload: { type: 'contacts', content: CONTACTS_CSV, filename: 'list1.csv' },
    });
    await app.inject({
      method: 'POST', url: '/api/imports/preview',
      cookies: { meteorico_session: sessionCookie },
      headers: { 'content-type': 'application/json' },
      payload: { type: 'contacts', content: CONTACTS_CSV, filename: 'list2.csv' },
    });

    const res = await app.inject({ method: 'GET', url: '/api/imports', cookies: { meteorico_session: sessionCookie } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(2);
    expect(body.imports).toHaveLength(2);
    await app.close();
  });

  it('unauthenticated request returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/imports' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
