import { describe, expect, it } from 'vitest';
import {
  FOLLOWUP_TEMPLATES,
  getFollowupTemplate,
  isOptOutText,
  validateFollowupCampaignInput,
} from '../services/followup.js';

describe('follow-up campaign rules', () => {
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
