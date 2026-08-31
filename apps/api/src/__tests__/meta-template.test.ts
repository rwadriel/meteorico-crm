import { describe, expect, it } from 'vitest';
import {
  analyzeTemplateCategory,
  buildMetaTemplatePayload,
  validateMetaTemplateInput,
} from '../services/meta-template.js';

describe('Meta template management', () => {
  it('classifies promotional and mixed-intent content conservatively as marketing', () => {
    expect(
      analyzeTemplateCategory('Aproveite a oferta especial e acesse o link.').suggestedCategory,
    ).toBe('MARKETING');
    expect(
      analyzeTemplateCategory('Seu pedido foi enviado. Aproveite também nosso desconto.')
        .suggestedCategory,
    ).toBe('MARKETING');
  });

  it('suggests utility for a specific existing transaction update', () => {
    const result = analyzeTemplateCategory(
      'Confirmação: seu pedido {{1}} foi enviado. Código de rastreio: {{2}}.',
    );
    expect(result.suggestedCategory).toBe('UTILITY');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('builds the official Meta payload with positional examples', () => {
    const payload = buildMetaTemplatePayload({
      name: 'pedido_enviado',
      category: 'UTILITY',
      body: 'Seu pedido {{1}} foi enviado. Rastreio: {{2}}.',
      footer: 'Mensagem automática',
      exampleValues: ['1234', 'BR5678'],
      allowCategoryChange: true,
    });
    expect(payload).toMatchObject({
      name: 'pedido_enviado',
      language: 'pt_BR',
      category: 'UTILITY',
      allow_category_change: true,
      components: [
        { type: 'BODY', example: { body_text: [['1234', 'BR5678']] } },
        { type: 'FOOTER', text: 'Mensagem automática' },
      ],
    });
  });

  it('builds an image header with the Meta upload handle', () => {
    const payload = buildMetaTemplatePayload({
      name: 'oferta_com_imagem',
      category: 'MARKETING',
      body: 'A oferta está disponível em {{1}}.',
      exampleValues: ['https://example.com/oferta'],
      headerFormat: 'IMAGE',
      headerHandle: '4::meta-upload-handle',
    });
    expect(payload).toMatchObject({
      components: [
        {
          type: 'HEADER',
          format: 'IMAGE',
          example: { header_handle: ['4::meta-upload-handle'] },
        },
        { type: 'BODY' },
      ],
    });
  });

  it('rejects skipped variables and missing examples before calling Meta', () => {
    expect(() =>
      validateMetaTemplateInput({
        name: 'pedido_status',
        category: 'UTILITY',
        body: 'Pedido {{2}} atualizado.',
        exampleValues: ['1234'],
      }),
    ).toThrow(/sequenciais/);
    expect(() =>
      validateMetaTemplateInput({
        name: 'pedido_status',
        category: 'UTILITY',
        body: 'Pedido {{1}} atualizado.',
        exampleValues: [],
      }),
    ).toThrow(/exatamente 1/);
  });
});
