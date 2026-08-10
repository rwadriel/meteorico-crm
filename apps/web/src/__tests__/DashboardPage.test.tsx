import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

    expect(screen.getByText('Total de contatos').parentElement?.textContent).toContain('40');
    expect(screen.getByText('Todas as campanhas').parentElement?.textContent).toContain('17');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/analytics/dashboard', {
      credentials: 'include',
    });
  });

  it('renders real zero values for an empty database', async () => {
    mockDashboard(0, 0);
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Total de contatos').parentElement?.textContent).toContain('0');
      expect(screen.getByText('Todas as campanhas').parentElement?.textContent).toContain('0');
    });
  });

  it('renders unresolved history and needs review separately', async () => {
    mockDashboard(7284, 17, 43, 43);
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Historico nao resolvido').parentElement?.textContent).toContain('43');
      expect(screen.getByText('Em revisao').parentElement?.textContent).toContain('43');
    });
  });
});
