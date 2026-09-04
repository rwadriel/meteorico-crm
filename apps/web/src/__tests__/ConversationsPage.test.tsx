import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ConversationsPage } from '../pages/ConversationsPage.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ConversationsPage', () => {
  it('lists an inbound conversation and sends a manual reply', async () => {
    const now = new Date().toISOString();
    const inbound = {
      id: 'message-1',
      direction: 'inbound',
      content: 'Tenho uma dúvida',
      messageType: 'text',
      deliveryStatus: 'delivered',
      sentAt: now,
    };
    const conversation = {
      id: 'conversation-1',
      status: 'active',
      startedAt: now,
      contact: {
        id: 'contact-1',
        name: '',
        phone: '5591991585400',
        optedOut: false,
      },
      campaign: { id: 'campaign-1', name: 'Grupo 44' },
      lastMessage: inbound,
      messageCount: 1,
      awaitingReply: true,
      lastInboundAt: now,
      serviceWindowOpen: true,
      serviceWindowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 202,
          json: async () => ({ status: 'pending' }),
        });
      }
      if (url.includes('/messaging/conversations?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            conversations: [conversation],
            summary: { total: 1, awaitingReply: 1 },
          }),
        });
      }
      if (url.endsWith('/messaging/conversations/conversation-1')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...conversation,
            lastMessage: undefined,
            messageCount: undefined,
            awaitingReply: undefined,
            messages: [inbound],
            assignee: null,
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock;

    const user = userEvent.setup();
    render(<ConversationsPage />);

    expect(await screen.findByText('Tenho uma dúvida')).toBeDefined();
    expect(screen.getAllByText('+55 (91) 99158-5400')).toHaveLength(3);

    await user.type(screen.getByLabelText('Resposta'), 'Olá! Como posso ajudar?');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
      expect(post?.[0]).toContain('/messaging/conversations/conversation-1/messages');
      expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
        content: 'Olá! Como posso ajudar?',
        messageType: 'text',
      });
    });
  });
});
