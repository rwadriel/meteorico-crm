import type { PrismaClient } from '@meteorico/database';
import { Prisma } from '@meteorico/database';
import type { AiProvider, AiMessage, AiCostLimits } from '../providers/ai.js';
import { getDefaultLimits } from '../providers/ai.js';
import { buildKnowledgeContext } from './knowledge.js';

const PROHIBITED_PATTERNS = [
  /garant(?:ia|ido|imos)/i,
  /vai ganhar/i,
  /lucro certo/i,
  /renda garantida/i,
  /resultado garantido/i,
  /retorno financeiro/i,
  /ficar[á ]?ric[oa]/i,
];

export function containsProhibitedContent(text: string): boolean {
  return PROHIBITED_PATTERNS.some((p) => p.test(text));
}

export interface DiagnosisInput {
  contactId: string;
  participationId: string;
  campaignId: string;
  contactSummary: {
    name: string;
    classification: string;
    totalParticipations: number;
    isStudent: boolean;
  };
  conversationHistory: string[];
}

export interface DiagnosisResult {
  diagnosis: string;
  recommendations: string[];
  suggestedObjection?: string;
  tokensUsed: number;
  latencyMs: number;
  promptHash: string;
}

export async function runDiagnosis(
  db: PrismaClient,
  aiProvider: AiProvider,
  input: DiagnosisInput,
  limits?: Partial<AiCostLimits>,
): Promise<DiagnosisResult> {
  const effectiveLimits = { ...getDefaultLimits(), ...limits };

  if (!aiProvider.isAvailable()) {
    return fallbackDiagnosis(input);
  }

  if (input.contactSummary.totalParticipations < 3) {
    throw new Error('Diagnosis requires 3+ participations');
  }

  const knowledgeContext = await buildKnowledgeContext(db);
  const businessPrompt = await getBusinessPrompt(db, input.campaignId);

  const systemMessage = buildSystemPrompt(knowledgeContext, businessPrompt);
  const userMessage = buildUserPrompt(input);

  const messages: AiMessage[] = [
    { role: 'system', content: systemMessage },
    { role: 'user', content: userMessage },
  ];

  const result = await aiProvider.complete(messages, {
    maxTokens: effectiveLimits.maxTokensPerRequest,
    temperature: 0.3,
    timeoutMs: 30000,
  });

  if (containsProhibitedContent(result.content)) {
    return fallbackDiagnosis(input);
  }

  const parsed = parseDiagnosisResponse(result.content);

  return {
    diagnosis: parsed.diagnosis,
    recommendations: parsed.recommendations,
    suggestedObjection: parsed.suggestedObjection,
    tokensUsed: result.tokensUsed,
    latencyMs: result.latencyMs,
    promptHash: result.promptHash,
  };
}

export async function persistDiagnosis(
  db: PrismaClient,
  input: DiagnosisInput,
  result: DiagnosisResult,
  provider: string,
) {
  await db.diagnosis.create({
    data: {
      participationId: input.participationId,
      contactId: input.contactId,
      provider,
      promptHash: result.promptHash,
      inputSummary: {
        classification: input.contactSummary.classification,
        totalParticipations: input.contactSummary.totalParticipations,
        historyLength: input.conversationHistory.length,
      } as unknown as Prisma.InputJsonValue,
      diagnosis: result.diagnosis,
      recommendations: result.recommendations as unknown as Prisma.InputJsonValue,
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs,
    },
  });

  await db.campaignParticipation.update({
    where: { id: input.participationId },
    data: { diagnosedAt: new Date() },
  });
}

function fallbackDiagnosis(input: DiagnosisInput): DiagnosisResult {
  const classification = input.contactSummary.classification;
  return {
    diagnosis: `Contato ${classification} com ${input.contactSummary.totalParticipations} participacoes. Diagnostico automatico indisponivel.`,
    recommendations: [
      'Verificar historico de participacoes manualmente',
      'Considerar contato direto para entender necessidade',
    ],
    tokensUsed: 0,
    latencyMs: 0,
    promptHash: 'fallback',
  };
}

function buildSystemPrompt(knowledgeContext: string, businessPrompt: string): string {
  const parts = [
    'Voce e um assistente de diagnostico para lancamentos digitais.',
    'Responda APENAS com base na base de conhecimento fornecida.',
    'NAO faca promessas de ganhos financeiros, resultados garantidos ou monetizacao.',
    'NAO invente precos, garantias ou dados nao fornecidos.',
    'NAO modifique links fornecidos.',
    'Se nao souber, diga que nao tem informacao suficiente.',
    '',
    'FORMATO DE RESPOSTA:',
    'DIAGNOSTICO: <texto>',
    'RECOMENDACOES: <item1> | <item2> | <item3>',
    'OBJECAO: <texto opcional>',
  ];

  if (businessPrompt) {
    parts.push('', '--- CONTEXTO DO NEGOCIO ---', businessPrompt);
  }

  if (knowledgeContext) {
    parts.push('', '--- BASE DE CONHECIMENTO ---', knowledgeContext);
  }

  return parts.join('\n');
}

function buildUserPrompt(input: DiagnosisInput): string {
  const lines = [
    `Classificacao: ${input.contactSummary.classification}`,
    `Participacoes: ${input.contactSummary.totalParticipations}`,
    `Aluno: ${input.contactSummary.isStudent ? 'sim' : 'nao'}`,
  ];

  if (input.conversationHistory.length > 0) {
    lines.push('', 'Historico recente:');
    for (const msg of input.conversationHistory.slice(-10)) {
      lines.push(`- ${msg}`);
    }
  }

  lines.push('', 'Faca o diagnostico deste contato e sugira proximos passos.');

  return lines.join('\n');
}

function parseDiagnosisResponse(content: string): {
  diagnosis: string;
  recommendations: string[];
  suggestedObjection?: string;
} {
  const diagMatch = content.match(/DIAGNOSTICO:\s*(.+?)(?=\n(?:RECOMENDACOES|OBJECAO)|$)/s);
  const recMatch = content.match(/RECOMENDACOES:\s*(.+?)(?=\n(?:OBJECAO)|$)/s);
  const objMatch = content.match(/OBJECAO:\s*(.+?)$/s);

  const diagnosis = diagMatch?.[1]?.trim() ?? content.trim();
  const recommendations = recMatch
    ? recMatch[1].split('|').map((r) => r.trim()).filter(Boolean)
    : [];
  const suggestedObjection = objMatch?.[1]?.trim() || undefined;

  return { diagnosis, recommendations, suggestedObjection };
}

async function getBusinessPrompt(db: PrismaClient, campaignId: string): Promise<string> {
  const setting = await db.systemSetting.findUnique({
    where: { key: `business_prompt_${campaignId}` },
  });

  if (setting && typeof setting.value === 'string') {
    return setting.value;
  }

  const globalSetting = await db.systemSetting.findUnique({
    where: { key: 'business_prompt' },
  });

  if (globalSetting && typeof globalSetting.value === 'string') {
    return globalSetting.value;
  }

  return '';
}

export async function listDiagnoses(
  db: PrismaClient,
  filters?: { contactId?: string; participationId?: string },
) {
  return db.diagnosis.findMany({
    where: {
      ...(filters?.contactId ? { contactId: filters.contactId } : {}),
      ...(filters?.participationId ? { participationId: filters.participationId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
}
