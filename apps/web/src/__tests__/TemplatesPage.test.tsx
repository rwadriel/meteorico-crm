import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { TemplatesPage } from '../pages/TemplatesPage.js';
import { usePermission } from '../hooks/usePermission.js';

vi.mock('../hooks/usePermission.js', () => ({ usePermission: vi.fn() }));

const mockedUsePermission = vi.mocked(usePermission);

const template = {
  id: 'template-1',
  name: 'Boas-vindas',
  category: 'onboarding',
  isActive: true,
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-10T12:00:00.000Z',
  versions: [{
    id: 'version-1',
    version: 3,
    content: 'Ola, {{nome}}',
    variables: ['nome'],
    isCurrent: true,
    createdAt: '2026-08-10T12:00:00.000Z',
  }],
};

function allowAll() {
  mockedUsePermission.mockImplementation(() => true);
}

function response(data: unknown, ok = true) {
  return { ok, json: async () => data } as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockedUsePermission.mockReset();
  allowAll();
});

describe('TemplatesPage', () => {
  it('renders real template fields returned by the API', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(response([template]));

    render(<TemplatesPage />);

    expect(await screen.findByText('Boas-vindas')).toBeDefined();
    expect(screen.getByText('onboarding')).toBeDefined();
    expect(screen.getByText('Ativo')).toBeDefined();
    expect(screen.getByText('v3')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeDefined();
  });

  it('shows the empty state', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(response([]));

    render(<TemplatesPage />);

    expect(await screen.findByText('Nenhum template criado')).toBeDefined();
  });

  it('shows an API failure without crashing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      response({ message: 'Servico indisponivel' }, false),
    );

    render(<TemplatesPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Servico indisponivel');
    expect(screen.getByRole('heading', { name: 'Templates' })).toBeDefined();
  });

  it('denies access and does not call the API without read permission', () => {
    mockedUsePermission.mockImplementation(() => false);
    globalThis.fetch = vi.fn();

    render(<TemplatesPage />);

    expect(screen.getByRole('alert').textContent).toContain('nao tem permissao');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('creates a template through the existing API', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response(template))
      .mockResolvedValueOnce(response([template]));

    render(<TemplatesPage />);

    await user.click(await screen.findByRole('button', { name: 'Novo Template' }));
    await user.type(screen.getByLabelText('Nome'), 'Boas-vindas');
    await user.type(screen.getByLabelText('Categoria'), 'onboarding');
    await user.type(screen.getByLabelText('Conteudo'), 'Ola, Wagner');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(3));
    const createCall = vi.mocked(globalThis.fetch).mock.calls[1];
    expect(createCall[0]).toBe('/api/templates');
    expect(createCall[1]).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(String(createCall[1]?.body))).toEqual({
      name: 'Boas-vindas',
      category: 'onboarding',
      content: 'Ola, Wagner',
    });
  });

  it('creates a new version through the existing edit API', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(response([template]))
      .mockResolvedValueOnce(response({ ...template.versions[0], version: 4 }))
      .mockResolvedValueOnce(response([template]));

    render(<TemplatesPage />);

    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const content = screen.getByLabelText('Conteudo');
    await user.clear(content);
    await user.type(content, 'Nova versao aprovada');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(3));
    const updateCall = vi.mocked(globalThis.fetch).mock.calls[1];
    expect(updateCall[0]).toBe('/api/templates/template-1');
    expect(updateCall[1]).toMatchObject({ method: 'PUT', credentials: 'include' });
    expect(JSON.parse(String(updateCall[1]?.body))).toEqual({
      content: 'Nova versao aprovada',
    });
  });

  it('hides create and edit actions without write permissions', async () => {
    mockedUsePermission.mockImplementation((_resource, action) => action === 'read');
    globalThis.fetch = vi.fn().mockResolvedValue(response([template]));

    render(<TemplatesPage />);

    expect(await screen.findByText('Boas-vindas')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Novo Template' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  });
});
