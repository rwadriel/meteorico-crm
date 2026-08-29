import { describe, expect, it } from 'vitest';
import { toBullMqJobId } from '../queues/outbound-message.js';

describe('outbound BullMQ job ids', () => {
  it('derives a stable BullMQ-safe id from keys containing colons', () => {
    const key = 'manual:conversation-id:request-id';
    const jobId = toBullMqJobId(key);

    expect(jobId).toMatch(/^[a-f0-9]{64}$/);
    expect(jobId).toBe(toBullMqJobId(key));
    expect(jobId).not.toContain(':');
  });

  it('does not collapse distinct idempotency keys', () => {
    expect(toBullMqJobId('manual:a:b')).not.toBe(toBullMqJobId('manual:a-b'));
  });
});
