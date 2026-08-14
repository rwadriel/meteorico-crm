import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { IntegrationsPage } from '../pages/IntegrationsPage.js';

function mockIntegrationHealth(overrides: Record<string, unknown> = {}) {
  const health = {
    integration: 'whatsapp-manager',
    status: 'healthy',
    connected: true,
    connectionSource: 'inferred',
    snapshotFresh: true,
    pollFresh: true,
    snapshotAgeSeconds: 120,
    pollAgeSeconds: 5,
    cursorStatus: 'current',
    reasons: [],
    lastPolledAt: new Date().toISOString(),
    lastSuccessfulPollAt: new Date().toISOString(),
    lastSuccessfulSnapshotAt: new Date().toISOString(),
    providerSnapshotAt: new Date().toISOString(),
    lastSuccessfulEventAt: null,
    lastCursorAdvanceAt: null,
    cursor: '3432',
    providerLastSeq: 3432,
    consecutiveFailures: 0,
    lastProviderError: null,
    lastProviderErrorScope: null,
    lastEventProcessedAt: null,
    lastEventType: null,
    totalProcessed: 1,
    totalDeadLettered: 0,
    totalSkipped: 0,
    recentErrors: [],
    ...overrides,
  };

  globalThis.fetch = vi.fn().mockImplementation(async (input: string | URL | Request) => {
    const url = String(input);
    return {
      ok: true,
      json: async () => url.includes('orphan-groups') ? { groups: [] } : health,
    };
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('IntegrationsPage Group Manager health', () => {
  it('shows healthy provider, fresh snapshot and current cursor', async () => {
    mockIntegrationHealth();
    render(<IntegrationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Group Manager: Saudavel/)).toBeDefined();
    });
    expect(screen.getByText(/conexao: Sim; snapshot: atual; cursor: Atual/)).toBeDefined();
    expect(screen.getByText('2min')).toBeDefined();
    expect(screen.getByText(/Atual \/ provedor 3432/)).toBeDefined();
  });

  it('prominently warns about stale state without rendering credentials', async () => {
    mockIntegrationHealth({
      status: 'stale',
      connected: null,
      connectionSource: 'unknown',
      snapshotFresh: false,
      snapshotAgeSeconds: 10800,
      cursorStatus: 'current',
      lastProviderError: 'WhatsApp Manager: HTTP 503',
    });
    render(<IntegrationsPage />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Group Manager: Snapshot obsoleto');
    expect(alert.textContent).toContain('conexao: Indeterminado');
    expect(alert.textContent).toContain('Ultimo erro do provedor: WhatsApp Manager: HTTP 503');
    expect(document.body.textContent).not.toContain('Bearer');
    expect(document.body.textContent).not.toContain('SESSION_SECRET');
  });
});
