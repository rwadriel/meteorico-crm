import type { PrismaClient } from '@meteorico/database';

export async function createDocument(
  db: PrismaClient,
  data: { title: string; content: string; category: string; createdBy: string },
) {
  return db.knowledgeDocument.create({ data });
}

export async function updateDocument(
  db: PrismaClient,
  documentId: string,
  data: { title?: string; content?: string; category?: string },
) {
  return db.knowledgeDocument.update({ where: { id: documentId }, data });
}

export async function listDocuments(
  db: PrismaClient,
  filters?: { category?: string; isActive?: boolean },
) {
  return db.knowledgeDocument.findMany({
    where: {
      ...(filters?.category ? { category: filters.category } : {}),
      ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}),
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getDocument(db: PrismaClient, documentId: string) {
  return db.knowledgeDocument.findUnique({ where: { id: documentId } });
}

export async function deactivateDocument(db: PrismaClient, documentId: string) {
  return db.knowledgeDocument.update({
    where: { id: documentId },
    data: { isActive: false },
  });
}

export async function buildKnowledgeContext(
  db: PrismaClient,
  category?: string,
): Promise<string> {
  const docs = await db.knowledgeDocument.findMany({
    where: {
      isActive: true,
      ...(category ? { category } : {}),
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (docs.length === 0) return '';

  return docs.map((d) => `### ${d.title}\n${d.content}`).join('\n\n');
}
