import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

vi.mock('../context/AuthContext.js', () => ({
  useAuth: () => ({
    user: { id: 'owner-1', name: 'Administrador', email: 'admin@test.dev', role: 'owner' },
  }),
}));

import { SettingsPage } from '../pages/SettingsPage.js';

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/settings')) return response([]);
    if (url.endsWith('/api/followup/system-status')) {
      return response({ provider: 'meta', outboundEnabled: true, graphVersion: 'v25.0', metaConfigured: true, n8nConfigured: true, approvedTemplates: 2, requiredTemplates: 2 });
    }
    if (url.endsWith('/api/users/roles')) {
      return response({ roles: [{ id: 'role-1', name: 'operator', description: 'Opera campanhas' }] });
    }
    if (url.endsWith('/api/users')) {
      return response({ users: [{ id: 'owner-1', name: 'Administrador', email: 'admin@test.dev', isActive: true, lastLoginAt: null, createdAt: '2026-08-31T00:00:00Z', role: { id: 'owner-role', name: 'owner', description: '' } }] });
    }
    return response({});
  }) as typeof fetch;
});

describe('SettingsPage user management', () => {
  it('shows existing users and opens the add-user form for the owner', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText('Usuários com acesso')).toBeDefined());
    expect(screen.getByText('admin@test.dev')).toBeDefined();

    await user.click(screen.getByRole('button', { name: '+ Adicionar usuário' }));
    expect(screen.getByRole('dialog', { name: 'Adicionar usuário' })).toBeDefined();
    expect(screen.getByLabelText('Perfil de acesso')).toBeDefined();
  });
});

function response(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}
