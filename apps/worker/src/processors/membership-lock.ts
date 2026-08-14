import { Prisma } from '@meteorico/database';

type AdvisoryLockClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

/** Serializes membership evidence for one group inside the current transaction. */
export async function lockGroupMemberships(
  db: AdvisoryLockClient,
  groupId: string,
): Promise<void> {
  await db.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`meteorico:membership:${groupId}`}, 0))::text AS "lock"`,
  );
}
