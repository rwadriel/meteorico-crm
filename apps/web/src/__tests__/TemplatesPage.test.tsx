import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TemplatesPage } from '../pages/TemplatesPage.js';

const TEMPLATE = {
  name: 'meteorico_acompanhamento',
  label: 'Acompanhamento do grupo',
  language: 'pt_BR',
  preview: 'Oi! Mensagem aprovada.',
  requiresUrl: false,
  status: 'approved',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('TemplatesPage', () => {
  it('lists the controlled Meta templates and their approval state', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ templates: [TEMPLATE] }),
    });
    render(<TemplatesPage />);

    await waitFor(() => expect(screen.getByText('Acompanhamento do grupo')).toBeDefined());
    expect(screen.getByText('meteorico_acompanhamento · pt_BR')).toBeDefined();
    expect(screen.getByText('Aprovado')).toBeDefined();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/followup/templates', { credentials: 'include' });
  });

  it('shows a pending state without exposing an editing control', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ templates: [{ ...TEMPLATE, status: 'pending' }] }),
    });
    render(<TemplatesPage />);

    await waitFor(() => expect(screen.getByText('Pendente na Meta')).toBeDefined());
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders a useful error when the endpoint fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });
    render(<TemplatesPage />);

    await waitFor(() => expect(screen.getByText('Falha ao carregar os templates')).toBeDefined());
  });
});
