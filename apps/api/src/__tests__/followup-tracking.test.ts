import { describe, expect, it, vi } from 'vitest';
import { recordFollowupClick } from '../services/followup.js';

describe('follow-up click tracking', () => {
  it('records total clicks and increments unique contacts only on the first click', async () => {
    const messageUpdate = vi.fn();
    const campaignUpdate = vi.fn();
    const trackingCreate = vi.fn();
    const tx = {
      followupCampaignMessage: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'message-1',
          contactId: 'contact-1',
          campaign: { id: 'campaign-1', offerUrl: 'https://example.com/oferta' },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: messageUpdate,
      },
      followupCampaign: { update: campaignUpdate },
      trackingClick: { create: trackingCreate },
    };
    const db = { $transaction: vi.fn((callback) => callback(tx)) };

    const destination = await recordFollowupClick(db as never, 'tracking-code', {
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      referer: '',
    });

    expect(destination).toBe('https://example.com/oferta');
    expect(messageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { clickCount: { increment: 1 } } }),
    );
    expect(campaignUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          clickCount: { increment: 1 },
          uniqueClickCount: { increment: 1 },
        },
      }),
    );
    expect(trackingCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contactId: 'contact-1' }) }),
    );
  });
});
