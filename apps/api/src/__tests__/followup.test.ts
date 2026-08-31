import { describe, expect, it, vi } from 'vitest';
import {
  FOLLOWUP_TEMPLATES,
  buildFollowupTemplateComponents,
  getFollowupTemplate,
  isOptOutText,
  validateFollowupCampaignInput,
  validateFollowupCampaignWithDb,
} from '../services/followup.js';

describe('follow-up campaign rules', () => {
  it('builds Meta delivery components for tracked and quick-reply buttons', () => {
    expect(
      buildFollowupTemplateComponents({
        parameters: [],
        trackingCode: 'codigo-unico-123',
        buttons: [
          { type: 'URL', text: 'Acessar', url: 'https://crm.example/api/t/{{1}}' },
          { type: 'QUICK_REPLY', text: 'SAIR' },
        ],
      }),
    ).toEqual([
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: 'codigo-unico-123' }],
      },
      {
        type: 'button',
        sub_type: 'quick_reply',
        index: '1',
        parameters: [{ type: 'payload', payload: 'SAIR' }],
      },
    ]);
  });

  it('accepts the campaign destination separately from body variables for a URL button', async () => {
    const db = {
      messageTemplate: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'template-1',
            name: 'conteudo_com_botao',
            label: 'Conteúdo com botão',
            language: 'pt_BR',
            category: 'MARKETING',
            requestedCategory: 'MARKETING',
            metaCategory: 'MARKETING',
            versions: [
              {
                content: 'O conteúdo está disponível.',
                variables: [],
                exampleValues: [],
                headerFormat: 'NONE',
                headerData: null,
                components: [
                  { type: 'BODY', text: 'O conteúdo está disponível.' },
                  {
                    type: 'BUTTONS',
                    buttons: [
                      {
                        type: 'URL',
                        text: 'Acessar',
                        url: 'https://crm.example/api/t/{{1}}',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ]),
      },
    };

    await expect(
      validateFollowupCampaignWithDb(db as never, {
        name: 'Campanha com CTA',
        templateName: 'conteudo_com_botao',
        offerUrl: 'https://example.com/conteudo',
        templateParameters: [],
      }),
    ).resolves.toMatchObject({
      parameters: [],
      offerUrl: 'https://example.com/conteudo',
      template: { urlMode: 'button', requiresUrl: true },
    });
  });
  it('exposes only the three approved CRM template definitions', () => {
    expect(FOLLOWUP_TEMPLATES.map((template) => template.name)).toEqual([
      'meteorico_acompanhamento',
      'meteorico_oferta',
      'meteorico_ultimo_aviso',
    ]);
    expect(FOLLOWUP_TEMPLATES.every((template) => !template.preview.includes('{{nome}}'))).toBe(
      true,
    );
  });

  it('requires an HTTPS URL for offer templates', () => {
    expect(() =>
      validateFollowupCampaignInput({
        name: 'Oferta',
        templateName: 'meteorico_oferta',
        offerUrl: 'http://example.com',
      }),
    ).toThrow(/HTTPS/);
    expect(() =>
      validateFollowupCampaignInput({
        name: 'Oferta',
        templateName: 'meteorico_oferta',
        offerUrl: 'https://example.com/oferta',
      }),
    ).not.toThrow();
  });

  it('does not require an URL for the group follow-up template', () => {
    expect(getFollowupTemplate('meteorico_acompanhamento')?.requiresUrl).toBe(false);
    expect(() =>
      validateFollowupCampaignInput({
        name: 'Acompanhamento',
        templateName: 'meteorico_acompanhamento',
      }),
    ).not.toThrow();
  });

  it('recognizes direct opt-out replies without blocking ordinary objections', () => {
    expect(isOptOutText('SAIR')).toBe(true);
    expect(isOptOutText('sair.')).toBe(true);
    expect(isOptOutText('Quero sair')).toBe(true);
    expect(isOptOutText('Pare de me enviar mensagens')).toBe(true);
    expect(isOptOutText('não quero mais receber mensagens')).toBe(true);
    expect(isOptOutText('não quero perder a aula')).toBe(false);
  });
});
