import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { App } from '../App.js';

function mockFetch(overrides: Partial<Response> = {}) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ message: 'Unauthorized' }),
    ...overrides,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('App', () => {
  it('exports App component', () => {
    expect(typeof App).toBe('function');
  });

  it('redirects unauthenticated users to login', async () => {
    globalThis.fetch = mockFetch();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Entrar no CRM')).toBeDefined();
    });
  });

  it('shows login form fields', async () => {
    globalThis.fetch = mockFetch();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeDefined();
      expect(screen.getByLabelText('Senha')).toBeDefined();
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeDefined();
    });
  });

  it('shows error on failed login', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid credentials' }),
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeDefined();
    });

    await user.type(screen.getByLabelText('Email'), 'test@test.com');
    await user.type(screen.getByLabelText('Senha'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });
  });

  it('navigates to dashboard after successful login', async () => {
    const user = userEvent.setup();

    const meUser = { id: '1', email: 'admin@test.com', name: 'Admin', role: 'owner' };

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ user: meUser }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ user: meUser }),
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeDefined();
    });

    await user.type(screen.getByLabelText('Email'), 'admin@test.com');
    await user.type(screen.getByLabelText('Senha'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(screen.getByText('Visao geral do CRM')).toBeDefined();
    });
  });
});
