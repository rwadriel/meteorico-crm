import type { Segment } from '@meteorico/shared';

export interface ClassificationInput {
  isStudent: boolean;
  isOptedOut: boolean;
  isBlocked: boolean;
  hasExistingParticipation: boolean;
  existingSegment?: Segment;
  confirmedCampaignCount: number;
  hasUnresolvedHistory?: boolean;
}

export interface ClassificationResult {
  segment: Segment | null;
  action:
    | 'FLUXO_ALUNO'
    | 'MANTER_EXISTENTE'
    | 'GRUPO_NOVOS'
    | 'GRUPO_REPARTICIPANTES'
    | 'DIAGNOSTICO_VETERANO'
    | 'NEEDS_REVIEW'
    | 'BLOQUEADO';
  reason: string;
}

export function classifyContact(input: ClassificationInput): ClassificationResult {
  if (input.isOptedOut || input.isBlocked) {
    return { segment: 'NOVO', action: 'BLOQUEADO', reason: 'Contato bloqueado ou opt-out' };
  }
  if (input.isStudent) {
    return { segment: 'ALUNO', action: 'FLUXO_ALUNO', reason: 'Contato identificado como aluno' };
  }
  if (input.hasExistingParticipation && input.existingSegment) {
    return { segment: input.existingSegment, action: 'MANTER_EXISTENTE', reason: 'Participação já existente na campanha atual' };
  }
  if (input.confirmedCampaignCount === 0 && input.hasUnresolvedHistory) {
    return { segment: null, action: 'NEEDS_REVIEW', reason: 'Histórico indicado sem campanha confirmada' };
  }
  if (input.confirmedCampaignCount === 0) {
    return { segment: 'NOVO', action: 'GRUPO_NOVOS', reason: 'Primeira participação' };
  }
  if (input.confirmedCampaignCount === 1) {
    return { segment: 'REPARTICIPANTE', action: 'GRUPO_REPARTICIPANTES', reason: 'Segunda participação' };
  }
  return { segment: 'VETERANO', action: 'DIAGNOSTICO_VETERANO', reason: `Veterano com ${input.confirmedCampaignCount} participações anteriores` };
}
