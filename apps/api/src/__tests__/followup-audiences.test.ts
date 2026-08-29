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
});
