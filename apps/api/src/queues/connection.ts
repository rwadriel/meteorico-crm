import { Redis } from 'ioredis';

let connection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!connection) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    connection = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      connectTimeout: 5000,
    });
  }
  return connection;
}

export async function closeRedisConnection(): Promise<void> {
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
