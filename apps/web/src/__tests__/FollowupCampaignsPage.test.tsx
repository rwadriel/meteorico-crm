import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FollowupCampaignsPage } from '../pages/FollowupCampaignsPage.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('FollowupCampaignsPage audiences', () => {
  it('lets the operator select the imported group for a new campaign', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ id: 'campaign-1' }) });
      }
      if (url.includes('/campaigns?')) return Promise.resolve({ ok: true, json: async () => ({ campaigns: [] }) });
      if (url.endsWith('/templates')) return Promise.resolve({ ok: true, json: async () => ({ templates: [{
        name: 'meteorico_acompanhamento', label: 'Acompanhamento', language: 'pt_BR',
        requiresUrl: false, preview: 'Oi!', parameterCount: 0, examples: [], category: 'MARKETING',
      }] }) });
      if (url.endsWith('/audiences')) return Promise.resolve({ ok: true, json: async () => ({ audiences: [
        { id: '11111111-1111-4111-8111-111111111111', name: 'Grupo 2', total: 3, eligible: 3, excluded: 0, invalidPhones: 0, buyers: 0, optOuts: 0, createdAt: new Date().toISOString() },
      ] }) });
      return Promise.resolve({ ok: true, json: async () => ({ total: 3, eligible: 3, excluded: 0, invalidPhones: 0, buyers: 0, optOuts: 0 }) });
    });
    globalThis.fetch = fetchMock;

    render(<FollowupCampaignsPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Nova campanha' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: '+ Nova campanha' }));

    await waitFor(() => expect(screen.getByText('Grupo 2 — 3 elegíveis de 3')).toBeDefined());
    fireEvent.change(screen.getByLabelText('Nome da campanha'), { target: { value: 'Teste Grupo 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar campanha' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
      expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
        name: 'Teste Grupo 2',
        audienceListId: '11111111-1111-4111-8111-111111111111',
      });
    });
  });
});
