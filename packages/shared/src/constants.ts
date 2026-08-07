export const SEGMENTS = ['NOVO', 'REPARTICIPANTE', 'VETERANO', 'ALUNO'] as const;
export type Segment = typeof SEGMENTS[number];

export const CAMPAIGN_STATUSES = ['RASCUNHO', 'ATIVA', 'ENCERRADA', 'ARQUIVADA'] as const;
export type CampaignStatus = typeof CAMPAIGN_STATUSES[number];

export const GROUP_STATUSES = ['ATIVO', 'INATIVO', 'LOTADO', 'ARQUIVADO'] as const;
export type GroupStatus = typeof GROUP_STATUSES[number];

export const ROLES = ['owner', 'admin', 'operator', 'analyst', 'read_only'] as const;
export type Role = typeof ROLES[number];

export const ATTRIBUTION_CONFIDENCE = ['alta', 'media', 'baixa'] as const;
export type AttributionConfidence = typeof ATTRIBUTION_CONFIDENCE[number];

export const GROUP_EVENT_TYPES = ['entrou', 'adicionado', 'saiu', 'removido', 'baseline', 'grupo_criado', 'alteracao'] as const;
export type GroupEventType = typeof GROUP_EVENT_TYPES[number];

export const DEFAULT_TIMEZONE = 'America/Belem';
