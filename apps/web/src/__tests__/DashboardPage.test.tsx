import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { DashboardPage } from '../pages/DashboardPage.js';

function mockDashboard(
  totalContacts: number,
  totalCampaigns: number,
  historicalUnresolved = 0,
  needsReview = 0,
) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      metrics: {
        total_contacts: totalContacts,
        total_campaigns: totalCampaigns,
        historical_unresolved: historicalUnresolved,
        needs_review: needsReview,
      },
    }),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('DashboardPage', () => {
  it('maps the global analytics response to the contact and campaign cards', async () => {
    mockDashboard(40, 17);
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('40')).toBeDefined();
      expect(screen.getByText('17')).toBeDefined();
    });

    const indicators = within(screen.getByLabelText('Indicadores principais'));
    expect(indicators.getByText('Contatos').parentElement?.parentElement?.textContent).toContain('40');
    expect(indicators.getByText('Campanhas').parentElement?.parentElement?.textContent).toContain('17');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/analytics/dashboard', {
      credentials: 'include',
    });
  });

  it('renders real zero values for an empty database', async () => {
    mockDashboard(0, 0);
    render(<DashboardPage />);

    await waitFor(() => {
      const indicators = within(screen.getByLabelText('Indicadores principais'));
      expect(indicators.getByText('Contatos').parentElement?.parentElement?.textContent).toContain('0');
      expect(indicators.getByText('Campanhas').parentElement?.parentElement?.textContent).toContain('0');
    });
  });

  it('keeps the follow-up audience empty when the optional response is unavailable', async () => {
    mockDashboard(7284, 17);
    render(<DashboardPage />);

    await waitFor(() => {
      const indicators = within(screen.getByLabelText('Indicadores principais'));
      expect(indicators.getByText('Elegíveis').parentElement?.parentElement?.textContent).toContain('0');
      expect(indicators.getByText('Campanhas').parentElement?.parentElement?.textContent).toContain('17');
    });
  });
});
