import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MetaCloudWhatsAppProvider,
  OutboundBlockedError,
  assertStagingRecipientAllowed,
  parseStagingAllowlist,
} from '../whatsapp.js';

const APP_SECRET = 'unit-test-app-secret';
const PHONE_NUMBER_ID = 'phone-number-id-test';
const WABA_ID = 'waba-id-test';

function createProvider(
  overrides: Partial<ConstructorParameters<typeof MetaCloudWhatsAppProvider>[0]> = {},
) {
  return new MetaCloudWhatsAppProvider({
    accessToken: 'unit-test-access-token',
    phoneNumberId: PHONE_NUMBER_ID,
    wabaId: WABA_ID,
    appSecret: APP_SECRET,
    graphApiVersion: 'v25.0',
    deploymentEnvironment: 'staging',
    stagingAllowlist: '5591999990001',
    ...overrides,
  });
}

function metaPayload(value: Record<string, unknown>) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: WABA_ID,
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: PHONE_NUMBER_ID },
              ...value,
            },
          },
        ],
      },
    ],
  };
}

describe('MetaCloudWhatsAppProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a valid webhook signature over the exact raw body', () => {
    const provider = createProvider();
    const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');
    const signature = createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');

    expect(provider.verifyWebhook({ 'x-hub-signature-256': `sha256=${signature}` }, rawBody)).toBe(
      true,
    );
  });

  it('rejects invalid and malformed webhook signatures', () => {
    const provider = createProvider();
    const rawBody = Buffer.from('{"ok":true}');

    expect(
      provider.verifyWebhook({ 'x-hub-signature-256': `sha256=${'0'.repeat(64)}` }, rawBody),
    ).toBe(false);
    expect(provider.verifyWebhook({ 'x-hub-signature-256': 'sha256=invalid' }, rawBody)).toBe(
      false,
    );
    expect(provider.verifyWebhook({}, rawBody)).toBe(false);
  });

  it('parses an inbound text message with normalized Meta fields', () => {
    const provider = createProvider();
    const result = provider.parseWebhook(
      {},
      metaPayload({
        messages: [
          {
            id: 'wamid.inbound-1',
            from: '5591999990001',
            timestamp: '1786400000',
            type: 'text',
            text: { body: 'Olá, Meteórico' },
          },
        ],
      }),
    );

    expect(result).toHaveLength(1);
    expect(result?.[0]).toMatchObject({
      provider: 'meta_cloud',
      type: 'message',
      wabaId: WABA_ID,
      message: {
        externalMessageId: 'wamid.inbound-1',
        from: '5591999990001',
        content: 'Olá, Meteórico',
        messageType: 'text',
        phoneNumberId: PHONE_NUMBER_ID,
      },
    });
  });

  it.each([
    {
      type: 'button',
      button: { text: 'SAIR', payload: 'SAIR' },
    },
    {
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'optout', title: 'SAIR' } },
    },
  ])('parses an inbound quick reply from a template', (reply) => {
    const provider = createProvider();
    const result = provider.parseWebhook(
      {},
      metaPayload({
        messages: [
          {
            id: 'wamid.quick-reply-1',
            from: '5591999990001',
            timestamp: '1786400000',
            ...reply,
          },
        ],
      }),
    );

    expect(result?.[0]).toMatchObject({
      type: 'message',
      message: { content: 'SAIR', messageType: 'interactive' },
    });
  });

  it.each(['sent', 'delivered', 'read', 'failed'] as const)(
    'parses the %s delivery status',
    (status) => {
      const provider = createProvider();
      const result = provider.parseWebhook(
        {},
        metaPayload({
          statuses: [
            {
              id: 'wamid.outbound-1',
              status,
              timestamp: '1786400001',
              ...(status === 'failed' ? { errors: [{ code: 131000 }] } : {}),
            },
          ],
        }),
      );

      expect(result?.[0]).toMatchObject({
        type: 'status',
        status: {
          externalMessageId: 'wamid.outbound-1',
          status,
          phoneNumberId: PHONE_NUMBER_ID,
        },
      });
    },
  );

  it('ignores a different WABA and accepts every phone number in the configured WABA', () => {
    const provider = createProvider();
    const wrongWaba = metaPayload({ messages: [] });
    wrongWaba.entry[0].id = 'other-waba';
    const secondPhone = metaPayload({
      messages: [
        {
          id: 'wamid.second-number',
          from: '5591999990002',
          timestamp: '1786400001',
          type: 'text',
          text: { body: 'SAIR' },
        },
      ],
    });
    secondPhone.entry[0].changes[0].value.metadata.phone_number_id = 'second-phone';

    expect(provider.parseWebhook({}, wrongWaba)).toEqual([]);
    expect(provider.parseWebhook({}, secondPhone)?.[0]).toMatchObject({
      type: 'message',
      message: { phoneNumberId: 'second-phone', content: 'SAIR' },
    });
  });

  it('sends through the configured phone number and returns the provider id', async () => {
    const provider = createProvider();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ id: 'wamid.sent-1' }] }), { status: 200 }),
      );

    await expect(
      provider.sendMessage({
        to: '+55 (91) 99999-0001',
        content: 'Mensagem controlada',
        messageType: 'text',
      }),
    ).resolves.toEqual({ externalMessageId: 'wamid.sent-1' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      messaging_product: 'whatsapp',
      to: '5591999990001',
      type: 'text',
    });
  });

  it('blocks staging outbound outside the allowlist before calling Meta', async () => {
    const provider = createProvider();
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(
      provider.sendMessage({
        to: '5591888877777',
        content: 'Não deve sair',
        messageType: 'text',
      }),
    ).rejects.toBeInstanceOf(OutboundBlockedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports provider errors without including the response body or token', async () => {
    const provider = createProvider();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 131000, message: 'sensitive upstream detail' },
        }),
        { status: 400 },
      ),
    );

    const error = await provider
      .sendMessage({
        to: '5591999990001',
        content: 'Teste',
        messageType: 'text',
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('code 131000');
    expect((error as Error).message).not.toContain('sensitive upstream detail');
    expect((error as Error).message).not.toContain('unit-test-access-token');
  });
});

describe('staging allowlist helpers', () => {
  it('normalizes and deduplicates allowed numbers', () => {
    expect([...parseStagingAllowlist('+55 (91) 99999-0001,91999990001')]).toEqual([
      '5591999990001',
    ]);
  });

  it('allows the configured staging recipient and blocks every other number', () => {
    expect(assertStagingRecipientAllowed('91999990001', 'staging', '5591999990001')).toBe(
      '5591999990001',
    );
    expect(() =>
      assertStagingRecipientAllowed('5591888877777', 'staging', '5591999990001'),
    ).toThrow(OutboundBlockedError);
  });

  it('matches the exact Meta wa_id alias of the same Brazilian mobile number', () => {
    expect(assertStagingRecipientAllowed('559199990001', 'staging', '5591999990001')).toBe(
      '5591999990001',
    );
  });

  it.each(['5591888890001', '5591999990002', '5592999990001'])(
    'blocks a non-equivalent recipient %s',
    (recipient) => {
      expect(() => assertStagingRecipientAllowed(recipient, 'staging', '5591999990001')).toThrow(
        OutboundBlockedError,
      );
    },
  );

  it('rejects a recipient from another country as non-equivalent', () => {
    expect(() => assertStagingRecipientAllowed('351919999001', 'staging', '5591999990001')).toThrow(
      'Invalid recipient phone',
    );
  });

  it('rejects an invalid recipient instead of falling back permissively', () => {
    expect(() => assertStagingRecipientAllowed('invalid', 'staging', '5591999990001')).toThrow(
      'Invalid recipient phone',
    );
  });
});
