import type { PrismaClient } from '@meteorico/database';
import { Prisma } from '@meteorico/database';

const ALLOWED_VARIABLES = new Set([
  'nome',
  'telefone',
  'classificacao',
  'campanha',
  'grupo',
  'edicao',
  'link',
  'data_abertura',
  'data_fechamento',
]);

const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

export function validateVariables(content: string): { valid: boolean; unknown: string[] } {
  const unknown: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(VARIABLE_REGEX.source, 'g');
  while ((match = regex.exec(content)) !== null) {
    if (!ALLOWED_VARIABLES.has(match[1])) {
      unknown.push(match[1]);
    }
  }
  return { valid: unknown.length === 0, unknown };
}

export function renderTemplate(
  content: string,
  variables: Record<string, string>,
): string {
  return content.replace(VARIABLE_REGEX, (full, name: string) => {
    if (name in variables) return variables[name];
    return full;
  });
}

export function extractVariables(content: string): string[] {
  const vars: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(VARIABLE_REGEX.source, 'g');
  while ((match = regex.exec(content)) !== null) {
    if (!vars.includes(match[1])) vars.push(match[1]);
  }
  return vars;
}

export async function createTemplate(
  db: PrismaClient,
  data: { name: string; category: string; content: string; createdBy: string },
) {
  const validation = validateVariables(data.content);
  if (!validation.valid) {
    throw new Error(`Unknown variables: ${validation.unknown.join(', ')}`);
  }

  const variables = extractVariables(data.content);

  const template = await db.messageTemplate.create({
    data: {
      name: data.name,
      category: data.category,
      createdBy: data.createdBy,
      versions: {
        create: {
          version: 1,
          content: data.content,
          variables: variables as unknown as Prisma.InputJsonValue,
          isCurrent: true,
        },
      },
    },
    include: { versions: true },
  });

  return template;
}

export async function updateTemplate(
  db: PrismaClient,
  templateId: string,
  data: { content: string },
) {
  const validation = validateVariables(data.content);
  if (!validation.valid) {
    throw new Error(`Unknown variables: ${validation.unknown.join(', ')}`);
  }

  const currentVersion = await db.messageTemplateVersion.findFirst({
    where: { templateId, isCurrent: true },
  });

  const nextVersion = currentVersion ? currentVersion.version + 1 : 1;
  const variables = extractVariables(data.content);

  await db.messageTemplateVersion.updateMany({
    where: { templateId, isCurrent: true },
    data: { isCurrent: false },
  });

  return db.messageTemplateVersion.create({
    data: {
      templateId,
      version: nextVersion,
      content: data.content,
      variables: variables as unknown as Prisma.InputJsonValue,
      isCurrent: true,
    },
  });
}

export async function publishTemplate(db: PrismaClient, templateId: string) {
  const current = await db.messageTemplateVersion.findFirst({
    where: { templateId, isCurrent: true },
  });

  if (!current) throw new Error('No current version found');

  return current;
}

export async function listTemplates(
  db: PrismaClient,
  filters?: { category?: string; isActive?: boolean },
) {
  return db.messageTemplate.findMany({
    where: {
      ...(filters?.category ? { category: filters.category } : {}),
      ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}),
    },
    include: {
      versions: {
        where: { isCurrent: true },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getTemplate(db: PrismaClient, templateId: string) {
  return db.messageTemplate.findUnique({
    where: { id: templateId },
    include: {
      versions: { orderBy: { version: 'desc' } },
    },
  });
}

export async function deactivateTemplate(db: PrismaClient, templateId: string) {
  return db.messageTemplate.update({
    where: { id: templateId },
    data: { isActive: false },
  });
}

export function getAllowedVariables(): string[] {
  return [...ALLOWED_VARIABLES];
}
