import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TemplatesPage } from '../pages/TemplatesPage.js';

const TEMPLATE = {
  id: 'template-1',
  name: 'meteorico_acompanhamento',
  label: 'Acompanhamento do grupo',
  language: 'pt_BR',
  requestedCategory: 'MARKETING',
  metaCategory: 'MARKETING',
  status: 'APPROVED',
  rejectionReason: null,
  qualityRating: 'GREEN',
  body: 'Oi! Mensagem aprovada.',
  footer: '',
  variableCount: 0,
  exampleValues: [],
  submittedAt: null,
  syncedAt: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('TemplatesPage', () => {
  it('lists Meta templates with final category and approval state', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ templates: [TEMPLATE] }) });
    render(<TemplatesPage />);

    await waitFor(() => expect(screen.getByText('Acompanhamento do grupo')).toBeDefined());
    expect(screen.getByText('meteorico_acompanhamento · pt_BR')).toBeDefined();
    expect(screen.getByText('Aprovado')).toBeDefined();
    expect(screen.getByText('Marketing')).toBeDefined();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/templates/meta', {
      credentials: 'include',
    });
  });

  it('opens the creation flow with category guidance', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ templates: [] }) });
    render(<TemplatesPage />);
    await waitFor(() => expect(screen.getByText('Nenhum template sincronizado.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: '+ Novo template' }));
    expect(screen.getByRole('dialog', { name: 'Novo template do WhatsApp' })).toBeDefined();
    expect(screen.getByLabelText('Categoria solicitada')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Enviar para aprovação' })).toBeDefined();
  });

  it('shows the reason returned for a rejected template', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        templates: [{ ...TEMPLATE, status: 'REJECTED', rejectionReason: 'CATEGORY_MISMATCH' }],
      }),
    });
    render(<TemplatesPage />);

    await waitFor(() => expect(screen.getByText('Rejeitado')).toBeDefined());
    expect(screen.getByText('Motivo: CATEGORY_MISMATCH')).toBeDefined();
  });
});
