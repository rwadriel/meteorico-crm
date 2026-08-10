import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@meteorico/database';
import { buildApp } from '../../app.js';
import { hashPassword } from '../../services/auth.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';

const OWNER_PERMS = [
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
  '91999990001,Ana Ficticia,ana@ficticio.dev,1,40,nao,,csv,,,Teste',
  '91999990002,Carlos Ficticio,carlos@ficticio.dev,0,,sim,ProdX,csv,,,Aluno teste',
].join('\n');

const CONTACTS_CSV_REORDERED = [
  'nome,telefone,email,aluno,quantidade_participacoes,ultima_edicao',
  'Ana Reordenada,91999990001,ana@ficticio.dev,nao,1,40',
  'Carlos Reordenado,91999990002,carlos@ficticio.dev,sim,0,',
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

  async function setupSession(perms: { resource: string; action: string }[]) {
    app = await buildApp();
    const role = await db.role.create({
      data: { name: `role-${crypto.randomUUID().slice(0, 8)}`, description: 'test', isSystem: true },
    });
    for (const perm of perms) {
      await db.permission.create({ data: { roleId: role.id, ...perm } });
    }
    await db.adminUser.create({
      data: { email: 'imp@test.dev', passwordHash: await hashPassword('pass123'), name: 'Tester', roleId: role.id },
    });
    const loginRes = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'imp@test.dev', password: 'pass123' } });
    const cookies = loginRes.cookies as Array<{ name: string; value: string }>;
    sessionCookie = cookies.find((c) => c.name === 'meteorico_session')!.value;
  }

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  });

  afterAll(async () => {
    await cleanDb(db);
    await db.$disconnect();
  });

  beforeEach(async () => {
    await cleanDb(db);
    await setupSession(OWNER_PERMS);
  });

  async function preview(type: string, content: string, filename = 'test.csv') {
    return app.inject({
      method: 'POST', url: '/imports/preview',
      cookies: { meteorico_session: sessionCookie },
      headers: { 'content-type': 'application/json' },
      payload: { type, content, filename },
    });
  }

  async function confirm(importId: string) {
    return app.inject({
      method: 'POST', url: `/imports/${importId}/confirm`,
      cookies: { meteorico_session: sessionCookie },
    });
  }

  async function rollback(importId: string) {
    return app.inject({
      method: 'POST', url: `/imports/${importId}/rollback`,
      cookies: { meteorico_session: sessionCookie },
    });
  }

  // ─── Test 1: Columns in standard order ─────────────────────────────

  it('1. parses contacts in standard column order', async () => {
    const res = await preview('contacts', CONTACTS_CSV);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.validCount).toBe(2);
    expect(body.errorCount).toBe(0);
    expect(body.stats).toBeDefined();
    expect(body.stats.totalLines).toBe(2);
    await app.close();
  });

  // ─── Test 2: Columns in different order ────────────────────────────

  it('2. parses contacts in different column order', async () => {
    const res = await preview('contacts', CONTACTS_CSV_REORDERED);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.validCount).toBe(2);
    expect(body.errorCount).toBe(0);
    await app.close();
  });

  // ─── Test 3: Required column missing ───────────────────────────────

  it('3. rejects CSV with missing required column', async () => {
    const csv = 'nome,email,aluno\nAna,ana@test.dev,sim';
    const res = await preview('contacts', csv);
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.message).toContain('headers');
    await app.close();
  });

  // ─── Test 4: Unrecognized headers ──────────────────────────────────

  it('4. rejects CSV with no recognized headers', async () => {
    const csv = 'foo,bar,baz\n1,2,3';
    const res = await preview('contacts', csv);
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  // ─── Test 5: Email persisted in Contact.email ──────────────────────

  it('5. email persisted in Contact.email column', async () => {
    const res = await preview('contacts', CONTACTS_CSV);
    const importId = JSON.parse(res.body).import.id;
    await confirm(importId);

    const contact = await db.contact.findUnique({ where: { phone: '5591999990001' } });
    expect(contact!.email).toBe('ana@ficticio.dev');
    await app.close();
  });

  // ─── Test 6: Empty email does not erase existing ───────────────────

  it('6. empty email does not erase existing email', async () => {
    await db.contact.create({
      data: { phone: '5591999990001', normalizedPhone: '5591999990001', email: 'existing@test.dev' },
    });

    const csv = 'telefone,nome\n91999990001,Updated Name';
    const res = await preview('contacts', csv);
    const importId = JSON.parse(res.body).import.id;
    await confirm(importId);

    const contact = await db.contact.findUnique({ where: { phone: '5591999990001' } });
    expect(contact!.email).toBe('existing@test.dev');
    expect(contact!.name).toBe('Updated Name');
    await app.close();
  });

  // ─── Test 7: aluno true never becomes false ────────────────────────

  it('7. aluno=true never downgraded to false by import', async () => {
    await db.contact.create({
      data: { phone: '5591999990001', normalizedPhone: '5591999990001', isStudent: true },
    });

    const csv = 'telefone,aluno\n91999990001,nao';
    const res = await preview('contacts', csv);
    const importId = JSON.parse(res.body).import.id;
    await confirm(importId);

    const contact = await db.contact.findUnique({ where: { phone: '5591999990001' } });
    expect(contact!.isStudent).toBe(true);
    await app.close();
  });

  // ─── Test 8: aluno false becomes true when import says so ──────────

  it('8. aluno=false becomes true when CSV says sim', async () => {
    await db.contact.create({
      data: { phone: '5591999990002', normalizedPhone: '5591999990002', isStudent: false },
    });

    const csv = 'telefone,aluno\n91999990002,sim';
    const res = await preview('contacts', csv);
    const importId = JSON.parse(res.body).import.id;
    await confirm(importId);

    const contact = await db.contact.findUnique({ where: { phone: '5591999990002' } });
    expect(contact!.isStudent).toBe(true);
    await app.close();
  });

  // ─── Test 9: Duplicate phone in same CSV ───────────────────────────

  it('9. duplicate phone in CSV detected in stats', async () => {
    const csv = [
      'telefone,nome',
      '91999990001,Primeira',
      '91999990001,Segunda',
    ].join('\n');
    const res = await preview('contacts', csv);
    const body = JSON.parse(res.body);
    expect(body.stats.duplicatesInFile).toBe(1);
    await app.close();
  });

  // ─── Test 10: Same contact imported twice (idempotent) ─────────────

  it('10. same contact imported twice does not duplicate', async () => {
    const preview1 = await preview('contacts', CONTACTS_CSV, 'idem1.csv');
    await confirm(JSON.parse(preview1.body).import.id);

    const preview2 = await preview('contacts', CONTACTS_CSV, 'idem2.csv');
    await confirm(JSON.parse(preview2.body).import.id);

    const contacts = await db.contact.findMany();
    expect(contacts.length).toBe(2);
    await app.close();
  });

  // ─── Test 11: Same phone + same campaign twice ─────────────────────

  it('11. same phone+campaign imported twice does not duplicate participation', async () => {
    const p1 = await preview('participations', PARTICIPATIONS_CSV, 'p1.csv');
    await confirm(JSON.parse(p1.body).import.id);

    const p2 = await preview('participations', PARTICIPATIONS_CSV, 'p2.csv');
    await confirm(JSON.parse(p2.body).import.id);

    const participations = await db.campaignParticipation.findMany();
    expect(participations.length).toBe(2);
    await app.close();
  });

  // ─── Test 12: Same phone in different campaigns ────────────────────

  it('12. same phone in different campaigns creates multiple participations', async () => {
    const csv = [
      'telefone,campanha,aluno_atual,status_na_campanha,marcado_saiu,rotulos_vcard,origem',
      '91999990001,27,nao,ativo,nao,,csv',
      '91999990001,39,nao,ativo,nao,,csv',
      '91999990001,40,nao,ativo,nao,,csv',
    ].join('\n');

    const res = await preview('participations', csv);
    await confirm(JSON.parse(res.body).import.id);

    const contact = await db.contact.findUnique({ where: { phone: '5591999990001' } });
    const participations = await db.campaignParticipation.findMany({ where: { contactId: contact!.id } });
    expect(participations.length).toBe(3);
    await app.close();
  });

  // ─── Test 17: Rollback of contact created ──────────────────────────

  it('17. rollback removes created contacts', async () => {
    const res = await preview('contacts', CONTACTS_CSV, 'roll.csv');
    const importId = JSON.parse(res.body).import.id;
    await confirm(importId);
    expect((await db.contact.findMany()).length).toBe(2);

    const rollbackRes = await rollback(importId);
    expect(rollbackRes.statusCode).toBe(200);
    expect((await db.contact.findMany()).length).toBe(0);
    await app.close();
  });

  // ─── Test 18: Rollback of contact updated (restores before state) ──

  it('18. rollback restores updated contact to before state', async () => {
    await db.contact.create({
      data: {
        phone: '5591999990001',
        normalizedPhone: '5591999990001',
        name: 'Original Name',
        email: 'original@test.dev',
        isStudent: false,
      },
    });

    const csv = 'telefone,nome,email,aluno\n91999990001,Updated Name,updated@test.dev,sim';
    const res = await preview('contacts', csv);
    const importId = JSON.parse(res.body).import.id;
    await confirm(importId);

    let contact = await db.contact.findUnique({ where: { phone: '5591999990001' } });
    expect(contact!.name).toBe('Updated Name');
    expect(contact!.email).toBe('updated@test.dev');
    expect(contact!.isStudent).toBe(true);

    await rollback(importId);

    contact = await db.contact.findUnique({ where: { phone: '5591999990001' } });
    expect(contact!.name).toBe('Original Name');
    expect(contact!.email).toBe('original@test.dev');
    expect(contact!.isStudent).toBe(false);
    await app.close();
  });

  // ─── Test 19: Rollback of participation created ────────────────────

  it('19. rollback removes created participations', async () => {
    const res = await preview('participations', PARTICIPATIONS_CSV, 'proll.csv');
    const importId = JSON.parse(res.body).import.id;
    await confirm(importId);
    expect((await db.campaignParticipation.findMany()).length).toBe(2);

    await rollback(importId);
    expect((await db.campaignParticipation.findMany()).length).toBe(0);
    await app.close();
  });

  // ─── Test 20: Rollback does not delete pre-existing participation ──

  it('20. rollback does not delete pre-existing participation', async () => {
    const campaign = await db.campaign.create({
      data: {
        name: 'Meteórico 40', slug: 'meteorico-40', editionNumber: 40,
        status: 'historical', createdBy: (await db.adminUser.findFirst())!.id,
      },
    });
    const contact = await db.contact.create({
      data: { phone: '5591999990001', normalizedPhone: '5591999990001' },
    });
    await db.campaignParticipation.create({
      data: { contactId: contact.id, campaignId: campaign.id, status: 'active' },
    });

    const csv = [
      'telefone,campanha,aluno_atual,status_na_campanha,marcado_saiu,rotulos_vcard,origem',
      '91999990002,40,sim,ativo,nao,,csv',
    ].join('\n');
    const res = await preview('participations', csv);
    const importId = JSON.parse(res.body).import.id;
    await confirm(importId);

    expect((await db.campaignParticipation.findMany()).length).toBe(2);

    await rollback(importId);

    const remaining = await db.campaignParticipation.findMany();
    expect(remaining.length).toBe(1);
    expect(remaining[0].contactId).toBe(contact.id);
    await app.close();
  });

  // ─── Test 21: Preview does not alter database ──────────────────────

  it('21. preview does not create contacts in database', async () => {
    await preview('contacts', CONTACTS_CSV);
    const contacts = await db.contact.findMany();
    expect(contacts.length).toBe(0);
    await app.close();
  });

  // ─── Test 22: Role without imports permission receives 403 ─────────

  it('22. role without imports permission receives 403', async () => {
    await app.close();
    await cleanDb(db);
    app = await buildApp();

    const role = await db.role.create({
      data: { name: 'read_only_test', description: 'readonly', isSystem: true },
    });
    await db.permission.create({ data: { roleId: role.id, resource: 'campaigns', action: 'read' } });
    await db.adminUser.create({
      data: { email: 'readonly@test.dev', passwordHash: await hashPassword('pass123'), name: 'Reader', roleId: role.id },
    });
    const loginRes = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'readonly@test.dev', password: 'pass123' } });
    const cookies = loginRes.cookies as Array<{ name: string; value: string }>;
    const readonlyCookie = cookies.find((c) => c.name === 'meteorico_session')!.value;

    const res = await app.inject({
      method: 'GET', url: '/imports',
      cookies: { meteorico_session: readonlyCookie },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  // ─── Test 23: Owner can import ─────────────────────────────────────

  it('23. owner with imports permissions can import', async () => {
    const res = await preview('contacts', CONTACTS_CSV);
    expect(res.statusCode).toBe(201);
    const importId = JSON.parse(res.body).import.id;
    const confirmRes = await confirm(importId);
    expect(confirmRes.statusCode).toBe(200);
    await app.close();
  });

  // ─── Test 24: Admin can import ─────────────────────────────────────

  it('24. admin with imports permissions can import', async () => {
    await app.close();
    await cleanDb(db);
    await setupSession([
      ...OWNER_PERMS,
      { resource: 'campaigns', action: 'read' },
    ]);

    const res = await preview('contacts', CONTACTS_CSV);
    expect(res.statusCode).toBe(201);
    const importId = JSON.parse(res.body).import.id;
    const confirmRes = await confirm(importId);
    expect(confirmRes.statusCode).toBe(200);
    await app.close();
  });

  // ─── Historical campaigns ─────────────────────────────────────────

  it('historical campaigns named "Meteórico N" with status historical', async () => {
    const res = await preview('participations', PARTICIPATIONS_CSV, 'hist.csv');
    const importId = JSON.parse(res.body).import.id;
    await confirm(importId);

    const campaign = await db.campaign.findFirst({ where: { editionNumber: 40 } });
    expect(campaign).toBeTruthy();
    expect(campaign!.name).toBe('Meteórico 40');
    expect(campaign!.status).toBe('historical');
    expect(campaign!.startsAt).toBeNull();
    expect(campaign!.endsAt).toBeNull();
    await app.close();
  });

  it('rotulos_vcard goes to metadata not contact name', async () => {
    const res = await preview('participations', PARTICIPATIONS_CSV, 'vcard.csv');
    const importId = JSON.parse(res.body).import.id;
    await confirm(importId);

    const contact = await db.contact.findUnique({ where: { phone: '5591999990001' } });
    expect(contact!.name).not.toContain('ML Grupo');

    const participation = await db.campaignParticipation.findFirst({
      where: { contactId: contact!.id },
    });
    const meta = participation!.metadata as Record<string, unknown> | null;
    expect(meta?.rotulos_vcard).toBe('ML Grupo 40');
    await app.close();
  });

  // ─── Preview stats ────────────────────────────────────────────────

  it('preview shows full statistics', async () => {
    const res = await preview('contacts', CONTACTS_CSV);
    const body = JSON.parse(res.body);
    expect(body.stats).toBeDefined();
    expect(body.stats.totalLines).toBe(2);
    expect(body.stats.validLines).toBe(2);
    expect(body.stats.invalidLines).toBe(0);
    expect(body.stats.newContacts).toBe(2);
    expect(body.stats.existingContacts).toBe(0);
    expect(body.stats.studentsDetected).toBe(1);
    await app.close();
  });

  it('preview stats for participations shows historical campaigns to create', async () => {
    const res = await preview('participations', PARTICIPATIONS_CSV);
    const body = JSON.parse(res.body);
    expect(body.stats.historicalCampaignsToCreate).toBe(1);
    expect(body.stats.participationsToCreate).toBe(2);
    await app.close();
  });

  // ─── Other validations ────────────────────────────────────────────

  it('rejects path traversal in filename', async () => {
    const res = await preview('contacts', CONTACTS_CSV, '../../../etc/passwd');
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Invalid filename');
    await app.close();
  });

  it('lists imports with pagination', async () => {
    await preview('contacts', CONTACTS_CSV, 'list1.csv');
    await preview('contacts', CONTACTS_CSV, 'list2.csv');

    const res = await app.inject({ method: 'GET', url: '/imports', cookies: { meteorico_session: sessionCookie } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(2);
    expect(body.imports).toHaveLength(2);
    await app.close();
  });

  it('unauthenticated request returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/imports' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('sanitizes CSV formula injection', async () => {
    const csv = 'telefone,nome\n91999990011,=CMD("calc")';
    const res = await preview('contacts', csv, 'formula.csv');
    const body = JSON.parse(res.body);
    expect(body.validCount).toBe(1);
    const row = body.preview[0];
    const data = row.data as Record<string, unknown>;
    expect(data.name).not.toContain('=');
    await app.close();
  });

  // ─── Divergence report ────────────────────────────────────────────

  it('divergence report shows quantidade mismatch', async () => {
    const contactsCsv = [
      'telefone,nome,quantidade_participacoes,ultima_edicao',
      '91999990001,Ana,2,39',
    ].join('\n');
    const cRes = await preview('contacts', contactsCsv, 'c.csv');
    await confirm(JSON.parse(cRes.body).import.id);

    const participationsCsv = [
      'telefone,campanha',
      '91999990001,27',
      '91999990001,39',
      '91999990001,40',
    ].join('\n');
    const pRes = await preview('participations', participationsCsv, 'p.csv');
    const pBody = JSON.parse((await confirm(JSON.parse(pRes.body).import.id)).body);

    expect(pBody.divergences).toBeDefined();
    await app.close();
  });
});
