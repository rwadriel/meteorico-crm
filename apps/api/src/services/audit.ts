import type { PrismaClient } from '@meteorico/database';

interface AuditEntry {
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

export async function writeAuditLog(db: PrismaClient, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId ?? null,
      oldValue: entry.oldValue ? JSON.parse(JSON.stringify(entry.oldValue)) : null,
      newValue: entry.newValue ? JSON.parse(JSON.stringify(entry.newValue)) : null,
      ipAddress: entry.ipAddress ?? '',
      userAgent: entry.userAgent ?? '',
    },
  });
}
