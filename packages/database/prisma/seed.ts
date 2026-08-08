import { PrismaClient } from '@prisma/client';
import { randomBytes, createHash } from 'node:crypto';

const ROLES_CONFIG = [
  {
    name: 'owner',
    description: 'Acesso total ao sistema',
    isSystem: true,
    permissions: [
      { resource: 'campaigns', actions: ['create', 'read', 'update', 'delete', 'export'] },
      { resource: 'contacts', actions: ['create', 'read', 'update', 'delete', 'export'] },
      { resource: 'groups', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'messages', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'settings', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'users', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'reports', actions: ['read', 'export'] },
      { resource: 'integration', actions: ['read', 'write'] },
    ],
  },
  {
    name: 'admin',
    description: 'Gerencia campanhas, contatos e configuracoes',
    isSystem: true,
    permissions: [
      { resource: 'campaigns', actions: ['create', 'read', 'update', 'delete', 'export'] },
      { resource: 'contacts', actions: ['create', 'read', 'update', 'delete', 'export'] },
      { resource: 'groups', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'messages', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'settings', actions: ['read', 'update'] },
      { resource: 'users', actions: ['read'] },
      { resource: 'reports', actions: ['read', 'export'] },
      { resource: 'integration', actions: ['read', 'write'] },
    ],
  },
  {
    name: 'operator',
    description: 'Opera campanhas e envia mensagens',
    isSystem: true,
    permissions: [
      { resource: 'campaigns', actions: ['read', 'update'] },
      { resource: 'contacts', actions: ['read', 'update'] },
      { resource: 'groups', actions: ['read'] },
      { resource: 'messages', actions: ['create', 'read'] },
      { resource: 'reports', actions: ['read'] },
    ],
  },
  {
    name: 'analyst',
    description: 'Somente leitura em dados e relatorios',
    isSystem: true,
    permissions: [
      { resource: 'campaigns', actions: ['read'] },
      { resource: 'contacts', actions: ['read'] },
      { resource: 'groups', actions: ['read'] },
      { resource: 'messages', actions: ['read'] },
      { resource: 'reports', actions: ['read', 'export'] },
    ],
  },
  {
    name: 'read_only',
    description: 'Somente leitura em dashboard',
    isSystem: true,
    permissions: [
      { resource: 'campaigns', actions: ['read'] },
      { resource: 'reports', actions: ['read'] },
    ],
  },
];

async function hashPassword(password: string): Promise<string> {
  // Dynamic import since argon2 is in the api package
  // For seed, use a simple approach - we'll hash inline
  const argon2 = await import('argon2');
  return argon2.default.hash(password, {
    type: 2, // argon2id
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

async function main() {
  const prisma = new PrismaClient();

  console.log('Seeding roles and permissions...');

  for (const roleConfig of ROLES_CONFIG) {
    const role = await prisma.role.upsert({
      where: { name: roleConfig.name },
      update: { description: roleConfig.description },
      create: {
        name: roleConfig.name,
        description: roleConfig.description,
        isSystem: roleConfig.isSystem,
      },
    });

    for (const perm of roleConfig.permissions) {
      for (const action of perm.actions) {
        await prisma.permission.upsert({
          where: {
            roleId_resource_action: {
              roleId: role.id,
              resource: perm.resource,
              action,
            },
          },
          update: {},
          create: { roleId: role.id, resource: perm.resource, action },
        });
      }
    }

    console.log(`  Role "${roleConfig.name}" seeded with ${roleConfig.permissions.reduce((sum, p) => sum + p.actions.length, 0)} permissions`);
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@meteorico.dev';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'meteorico-dev-2026';
  const adminName = process.env.SEED_ADMIN_NAME ?? 'Admin Dev';

  const ownerRole = await prisma.role.findUnique({ where: { name: 'owner' } });
  if (!ownerRole) throw new Error('Owner role not found');

  const passwordHash = await hashPassword(adminPassword);

  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: { name: adminName, passwordHash },
    create: {
      email: adminEmail,
      passwordHash,
      name: adminName,
      roleId: ownerRole.id,
    },
  });

  console.log(`  Admin user seeded: ${adminEmail}`);

  await prisma.systemSetting.upsert({
    where: { key: 'timezone' },
    update: {},
    create: { key: 'timezone', value: '"America/Belem"', description: 'Timezone padrao do sistema' },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'session_duration_hours' },
    update: {},
    create: { key: 'session_duration_hours', value: '24', description: 'Duracao da sessao em horas' },
  });

  console.log('  System settings seeded');
  console.log('Seed complete!');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
