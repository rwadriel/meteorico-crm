import { describe, it, expect } from 'vitest';
import { classifyContact, type ClassificationInput } from '../classification.js';

function makeInput(overrides: Partial<ClassificationInput> = {}): ClassificationInput {
  return {
    isStudent: false,
    isOptedOut: false,
    isBlocked: false,
    hasExistingParticipation: false,
    confirmedCampaignCount: 0,
    ...overrides,
  };
}

describe('classifyContact', () => {
  it('returns BLOQUEADO when contact is blocked', () => {
    const result = classifyContact(makeInput({ isBlocked: true }));
    expect(result.action).toBe('BLOQUEADO');
    expect(result.segment).toBe('NOVO');
  });

  it('returns BLOQUEADO when contact has opted out', () => {
    const result = classifyContact(makeInput({ isOptedOut: true }));
    expect(result.action).toBe('BLOQUEADO');
  });

  it('returns BLOQUEADO even if contact is also a student', () => {
    const result = classifyContact(makeInput({ isOptedOut: true, isStudent: true }));
    expect(result.action).toBe('BLOQUEADO');
  });

  it('returns FLUXO_ALUNO for students', () => {
    const result = classifyContact(makeInput({ isStudent: true }));
    expect(result.action).toBe('FLUXO_ALUNO');
    expect(result.segment).toBe('ALUNO');
  });

  it('returns MANTER_EXISTENTE when contact has existing participation', () => {
    const result = classifyContact(
      makeInput({
        hasExistingParticipation: true,
        existingSegment: 'REPARTICIPANTE',
        confirmedCampaignCount: 1,
      }),
    );
    expect(result.action).toBe('MANTER_EXISTENTE');
    expect(result.segment).toBe('REPARTICIPANTE');
  });

  it('returns GRUPO_NOVOS for first-time participant (0 previous campaigns)', () => {
    const result = classifyContact(makeInput({ confirmedCampaignCount: 0 }));
    expect(result.action).toBe('GRUPO_NOVOS');
    expect(result.segment).toBe('NOVO');
  });

  it('returns NEEDS_REVIEW without a segment for unresolved historical evidence', () => {
    const result = classifyContact(
      makeInput({ confirmedCampaignCount: 0, hasUnresolvedHistory: true }),
    );
    expect(result.action).toBe('NEEDS_REVIEW');
    expect(result.segment).toBeNull();
  });

  it('keeps student precedence over unresolved historical evidence', () => {
    const result = classifyContact(
      makeInput({ isStudent: true, confirmedCampaignCount: 0, hasUnresolvedHistory: true }),
    );
    expect(result.action).toBe('FLUXO_ALUNO');
    expect(result.segment).toBe('ALUNO');
  });

  it('returns GRUPO_REPARTICIPANTES for second participation (1 previous)', () => {
    const result = classifyContact(makeInput({ confirmedCampaignCount: 1 }));
    expect(result.action).toBe('GRUPO_REPARTICIPANTES');
    expect(result.segment).toBe('REPARTICIPANTE');
  });

  it('returns DIAGNOSTICO_VETERANO for 2+ previous campaigns', () => {
    const result = classifyContact(makeInput({ confirmedCampaignCount: 2 }));
    expect(result.action).toBe('DIAGNOSTICO_VETERANO');
    expect(result.segment).toBe('VETERANO');
    expect(result.reason).toContain('2 participações');
  });

  it('returns DIAGNOSTICO_VETERANO for many previous campaigns', () => {
    const result = classifyContact(makeInput({ confirmedCampaignCount: 10 }));
    expect(result.action).toBe('DIAGNOSTICO_VETERANO');
    expect(result.segment).toBe('VETERANO');
    expect(result.reason).toContain('10 participações');
  });
});
