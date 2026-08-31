import { describe, expect, it, vi } from 'vitest';
import { getAudienceStats, prepareFollowupCampaign } from '../services/followup.js';

describe('follow-up audiences', () => {
  it('scopes audience counts to the selected contact list', async () => {
    const count = vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(3);
    const db = { contact: { count } };

    const stats = await getAudienceStats(db as never, 'list-1');

    expect(stats).toEqual({ total: 3, eligible: 3, excluded: 0, invalidPhones: 0, buyers: 0, optOuts: 0 });
    expect(JSON.stringify(count.mock.calls)).toContain('list-1');
  });

  it('creates the campaign snapshot only from the selected list', async () => {
    const db = {
      followupCampaign: {
        findUnique: vi.fn().mockResolvedValue({ id: 'campaign-1', status: 'draft', audienceListId: 'list-2' }),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      },
      contact: {
        count: vi.fn().mockResolvedValue(2),
        findMany: vi.fn().mockResolvedValue([{ id: 'contact-1' }, { id: 'contact-2' }]),
      },
      followupCampaignMessage: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
        count: vi.fn().mockResolvedValue(2),
      },
    };

    await prepareFollowupCampaign(db as never, 'campaign-1');

    expect(JSON.stringify(db.contact.findMany.mock.calls[0][0].where)).toContain('list-2');
    expect(db.followupCampaignMessage.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [
        { campaignId: 'campaign-1', contactId: 'contact-1', status: 'queued' },
        { campaignId: 'campaign-1', contactId: 'contact-2', status: 'queued' },
      ],
      skipDuplicates: true,
    }));
  });

  it('creates a unique tracking code for each contact when the campaign has a link', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const db = {
      followupCampaign: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'campaign-2',
          status: 'draft',
          audienceListId: 'list-2',
          offerUrl: 'https://example.com/oferta',
        }),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      },
      contact: {
        count: vi.fn().mockResolvedValue(2),
        findMany: vi.fn().mockResolvedValue([{ id: 'contact-1' }, { id: 'contact-2' }]),
      },
      followupCampaignMessage: {
        createMany,
        count: vi.fn().mockResolvedValue(2),
      },
    };

    await prepareFollowupCampaign(db as never, 'campaign-2');

    const rows = createMany.mock.calls[0][0].data as Array<{ trackingCode: string }>;
    expect(rows[0].trackingCode).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(rows[1].trackingCode).not.toBe(rows[0].trackingCode);
  });
});
