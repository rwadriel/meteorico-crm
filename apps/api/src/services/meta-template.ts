import type { PrismaClient } from '@meteorico/database';
import { Prisma } from '@meteorico/database';

export type MetaTemplateCategory = 'MARKETING' | 'UTILITY';
export type TemplateCategorySuggestion = MetaTemplateCategory | 'AUTHENTICATION';

export interface MetaTemplateInput {
  name: string;
  label?: string;
  language?: string;
  category: MetaTemplateCategory;
  body: string;
  footer?: string;
  exampleValues?: string[];
  allowCategoryChange?: boolean;
}

interface MetaTemplateRecord {
  id?: string;
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  rejected_reason?: string;
  quality_score?: string | { score?: string };
  components?: unknown[];
}

interface MetaListResponse {
  data?: MetaTemplateRecord[];
  paging?: { next?: string; cursors?: { after?: string } };
  error?: MetaErrorRecord;
}

interface MetaErrorRecord {
  message?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
}

export class MetaTemplateError extends Error {
  constructor(
    message: string,
    readonly httpStatus = 400,
    readonly metaCode?: number,
  ) {
    super(message);
  }
}

const TECHNICAL_NAME = /^[a-z][a-z0-9_]{2,119}$/;
const POSITIONAL_VARIABLE = /\{\{(\d+)\}\}/g;

export function analyzeTemplateCategory(body: string): {
  suggestedCategory: TemplateCategorySuggestion;
  confidence: 'high' | 'medium';
  reasons: string[];
} {
  const text = normalizeForAnalysis(body);
  const authenticationSignals = collectSignals(text, [
    [
      /\b(otp|codigo (?:de )?(?:acesso|verificacao|seguranca|autenticacao)|senha temporaria)\b/,
      'O texto parece enviar um código de autenticação.',
    ],
    [
      /\b(login|acesso a conta|confirmar identidade)\b/,
      'Há linguagem de acesso ou confirmação de identidade.',
    ],
  ]);
  if (authenticationSignals.length > 0) {
    return {
      suggestedCategory: 'AUTHENTICATION',
      confidence: 'high',
      reasons: [
        ...authenticationSignals,
        'Templates de autenticação usam o formato específico definido pela Meta.',
      ],
    };
  }

  const marketingSignals = collectSignals(text, [
    [
      /\b(oferta|promocao|desconto|condicao especial|cupom|bonus)\b/,
      'Há oferta, desconto ou benefício promocional.',
    ],
    [
      /\b(compre|aproveite|garanta|inscreva)\b/,
      'O texto convida o destinatário a realizar uma nova ação comercial.',
    ],
    [
      /\b(ultimas vagas|ultima chance|encerra|so hoje|imperdivel|lancamento)\b/,
      'Há urgência, escassez ou divulgação.',
    ],
    [/\b(conteudo|novidade|grupo|comunidade)\b/, 'Há divulgação ou estímulo de engajamento.'],
  ]);
  if (marketingSignals.length > 0) {
    return {
      suggestedCategory: 'MARKETING',
      confidence: marketingSignals.length > 1 ? 'high' : 'medium',
      reasons: marketingSignals,
    };
  }

  const utilitySignals = collectSignals(text, [
    [
      /\b(pedido|compra|pagamento|fatura|entrega|envio|rastreio|reembolso)\b/,
      'O texto trata de uma transação já existente.',
    ],
    [
      /\b(agendamento|consulta|reserva|compromisso|lembrete)\b/,
      'O texto trata de um compromisso solicitado pelo cliente.',
    ],
    [
      /\b(conta|assinatura|cadastro|solicitacao|protocolo|status|confirmacao)\b/,
      'O texto informa o estado de uma conta ou solicitação existente.',
    ],
  ]);
  if (utilitySignals.length > 0) {
    return {
      suggestedCategory: 'UTILITY',
      confidence: utilitySignals.length > 1 ? 'high' : 'medium',
      reasons: utilitySignals,
    };
  }

  const actionSignals = collectSignals(text, [
    [
      /\b(clique|acesse|saiba mais)\b/,
      'O texto convida o destinatário a iniciar uma nova ação sem contexto transacional claro.',
    ],
  ]);
  if (actionSignals.length > 0) {
    return { suggestedCategory: 'MARKETING', confidence: 'medium', reasons: actionSignals };
  }

  return {
    suggestedCategory: 'MARKETING',
    confidence: 'medium',
    reasons: [
      'O texto não comprova uma transação ou solicitação anterior; a opção conservadora é Marketing.',
    ],
  };
}

export function validateMetaTemplateInput(input: MetaTemplateInput): {
  name: string;
  label: string;
  language: string;
  category: MetaTemplateCategory;
  body: string;
  footer: string;
  exampleValues: string[];
  allowCategoryChange: boolean;
  variableCount: number;
} {
  const name = input.name.trim().toLowerCase();
  const body = input.body.trim();
  const footer = input.footer?.trim() ?? '';
  const language = input.language?.trim() || 'pt_BR';
  const exampleValues = input.exampleValues?.map((value) => value.trim()) ?? [];

  if (!TECHNICAL_NAME.test(name)) {
    throw new MetaTemplateError(
      'O nome técnico deve começar com letra minúscula e usar apenas letras, números e sublinhados.',
    );
  }
  if (!/^\w{2,3}(?:_[A-Z]{2})?$/.test(language)) {
    throw new MetaTemplateError('Idioma inválido. Use um código como pt_BR.');
  }
  if (!body || body.length > 1024) {
    throw new MetaTemplateError('O corpo deve ter entre 1 e 1024 caracteres.');
  }
  if (footer.length > 60) throw new MetaTemplateError('O rodapé pode ter no máximo 60 caracteres.');
  if (/\{\{[^}\d]/.test(body) || /\{\{\d+\}\}/.test(footer)) {
    throw new MetaTemplateError(
      'Use somente variáveis posicionais no corpo: {{1}}, {{2}}, em sequência.',
    );
  }

  const indexes = extractPositionalVariables(body);
  for (let index = 0; index < indexes.length; index += 1) {
    if (indexes[index] !== index + 1) {
      throw new MetaTemplateError(
        'As variáveis devem ser sequenciais, começando em {{1}}, sem pular números.',
      );
    }
  }
  if (indexes.length !== exampleValues.length) {
    throw new MetaTemplateError(
      `Informe exatamente ${indexes.length} valor(es) de exemplo para as variáveis.`,
    );
  }
  if (exampleValues.some((value) => !value || value.length > 1024)) {
    throw new MetaTemplateError(
      'Cada valor de exemplo deve estar preenchido e ter até 1024 caracteres.',
    );
  }

  return {
    name,
    label: input.label?.trim() || humanizeTemplateName(name),
    language,
    category: input.category,
    body,
    footer,
    exampleValues,
    allowCategoryChange: input.allowCategoryChange !== false,
    variableCount: indexes.length,
  };
}

export function buildMetaTemplatePayload(input: MetaTemplateInput): Record<string, unknown> {
  const value = validateMetaTemplateInput(input);
  const body: Record<string, unknown> = { type: 'BODY', text: value.body };
  if (value.variableCount > 0) {
    body.example = { body_text: [value.exampleValues] };
  }
  const components: Record<string, unknown>[] = [body];
  if (value.footer) components.push({ type: 'FOOTER', text: value.footer });

  return {
    name: value.name,
    language: value.language,
    category: value.category,
    allow_category_change: value.allowCategoryChange,
    components,
  };
}

export async function createAndSubmitMetaTemplate(
  db: PrismaClient,
  createdBy: string,
  input: MetaTemplateInput,
) {
  const value = validateMetaTemplateInput(input);
  const existing = await db.messageTemplate.findFirst({
    where: { name: value.name, language: value.language, isActive: true },
  });
  if (existing?.metaTemplateId) {
    throw new MetaTemplateError(
      'Já existe um template enviado à Meta com esse nome e idioma.',
      409,
    );
  }

  const response = await metaRequest<MetaTemplateRecord>('/message_templates', {
    method: 'POST',
    body: JSON.stringify(buildMetaTemplatePayload(input)),
  });
  if (!response.id)
    throw new MetaTemplateError('A Meta não retornou o identificador do template.', 502);

  const templateData = {
    name: value.name,
    label: value.label,
    language: value.language,
    category: value.category,
    requestedCategory: value.category,
    metaCategory: response.category ?? value.category,
    metaStatus: response.status ?? 'PENDING',
    metaTemplateId: response.id,
    allowCategoryChange: value.allowCategoryChange,
    submittedAt: new Date(),
    metaSyncedAt: new Date(),
    isActive: true,
  };

  if (existing) {
    await db.messageTemplateVersion.updateMany({
      where: { templateId: existing.id, isCurrent: true },
      data: { isCurrent: false },
    });
    const latest = await db.messageTemplateVersion.findFirst({
      where: { templateId: existing.id },
      orderBy: { version: 'desc' },
    });
    return db.messageTemplate.update({
      where: { id: existing.id },
      data: {
        ...templateData,
        versions: {
          create: versionCreateData(
            value,
            (latest?.version ?? 0) + 1,
            buildMetaTemplatePayload(input).components,
          ),
        },
      },
      include: { versions: { where: { isCurrent: true }, take: 1 } },
    });
  }

  return db.messageTemplate.create({
    data: {
      ...templateData,
      createdBy,
      versions: { create: versionCreateData(value, 1, buildMetaTemplatePayload(input).components) },
    },
    include: { versions: { where: { isCurrent: true }, take: 1 } },
  });
}

export async function syncMetaTemplates(db: PrismaClient, createdBy: string) {
  const records = await fetchAllMetaTemplates();
  let created = 0;
  let updated = 0;
  let archived = 0;
  const remoteTemplateIds = new Set(
    records.map((record) => record.id).filter((id): id is string => Boolean(id)),
  );

  for (const record of records) {
    if (!record.id || !record.name || !record.language) continue;
    const components = Array.isArray(record.components) ? record.components : [];
    const body = componentText(components, 'BODY');
    const footer = componentText(components, 'FOOTER');
    const examples = componentExamples(components);
    const existing = await db.messageTemplate.findFirst({
      where: {
        OR: [{ metaTemplateId: record.id }, { name: record.name, language: record.language }],
      },
      include: { versions: { where: { isCurrent: true }, take: 1 } },
    });
    const category = record.category ?? existing?.category ?? '';
    const baseData = {
      name: record.name,
      label: existing?.label || humanizeTemplateName(record.name),
      language: record.language,
      category: existing?.category || category,
      requestedCategory: existing?.requestedCategory || category,
      metaCategory: category || null,
      metaStatus: record.status ?? 'PENDING',
      metaTemplateId: record.id,
      metaRejectedReason: record.rejected_reason ?? null,
      metaQualityRating: qualityScore(record.quality_score),
      metaSyncedAt: new Date(),
      isActive: true,
    };

    if (!existing) {
      await db.messageTemplate.create({
        data: {
          ...baseData,
          createdBy,
          versions: {
            create: {
              version: 1,
              content: body,
              footer,
              variables: extractPositionalVariables(body) as unknown as Prisma.InputJsonValue,
              components: components as Prisma.InputJsonValue,
              exampleValues: examples as unknown as Prisma.InputJsonValue,
              isCurrent: true,
            },
          },
        },
      });
      created += 1;
      continue;
    }

    await db.messageTemplate.update({ where: { id: existing.id }, data: baseData });
    const current = existing.versions[0];
    if (!current || current.content !== body || current.footer !== footer) {
      await db.messageTemplateVersion.updateMany({
        where: { templateId: existing.id, isCurrent: true },
        data: { isCurrent: false },
      });
      const latest = await db.messageTemplateVersion.findFirst({
        where: { templateId: existing.id },
        orderBy: { version: 'desc' },
      });
      await db.messageTemplateVersion.create({
        data: {
          templateId: existing.id,
          version: (latest?.version ?? 0) + 1,
          content: body,
          footer,
          variables: extractPositionalVariables(body) as unknown as Prisma.InputJsonValue,
          components: components as Prisma.InputJsonValue,
          exampleValues: examples as unknown as Prisma.InputJsonValue,
          isCurrent: true,
        },
      });
    } else {
      await db.messageTemplateVersion.update({
        where: { id: current.id },
        data: {
          components: components as Prisma.InputJsonValue,
          exampleValues: examples as unknown as Prisma.InputJsonValue,
        },
      });
    }
    updated += 1;
  }

  const missing = await db.messageTemplate.findMany({
    where: {
      isActive: true,
      metaTemplateId: { not: null },
      ...(remoteTemplateIds.size > 0 ? { metaTemplateId: { notIn: [...remoteTemplateIds] } } : {}),
    },
    select: { id: true },
  });
  if (missing.length > 0) {
    const result = await db.messageTemplate.updateMany({
      where: { id: { in: missing.map((template) => template.id) } },
      data: { isActive: false, metaStatus: 'DELETED', metaSyncedAt: new Date() },
    });
    archived = result.count;
  }

  return { total: records.length, created, updated, archived };
}

export async function deleteMetaTemplate(db: PrismaClient, templateId: string) {
  const template = await db.messageTemplate.findUnique({ where: { id: templateId } });
  if (!template || !template.isActive) {
    throw new MetaTemplateError('Template não encontrado.', 404);
  }
  if (template.metaTemplateId) {
    await metaRequest(`/message_templates?name=${encodeURIComponent(template.name)}`, {
      method: 'DELETE',
    });
  }
  return db.messageTemplate.update({
    where: { id: template.id },
    data: { isActive: false, metaStatus: 'DELETED', metaSyncedAt: new Date() },
  });
}

export async function listManagedMetaTemplates(db: PrismaClient) {
  return db.messageTemplate.findMany({
    where: { isActive: true },
    include: { versions: { where: { isCurrent: true }, take: 1 } },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function applyMetaTemplateWebhook(db: PrismaClient, body: unknown): Promise<number> {
  const root = asRecord(body);
  if (root?.object !== 'whatsapp_business_account' || !Array.isArray(root.entry)) return 0;
  let processed = 0;
  for (const rawEntry of root.entry) {
    const entry = asRecord(rawEntry);
    if (!Array.isArray(entry?.changes)) continue;
    for (const rawChange of entry.changes) {
      const change = asRecord(rawChange);
      if (
        !change ||
        !['message_template_status_update', 'template_category_update'].includes(
          String(change.field),
        )
      )
        continue;
      const value = asRecord(change.value);
      if (!value) continue;
      const metaTemplateId = stringValue(value.message_template_id);
      const name = stringValue(value.message_template_name);
      const language = stringValue(value.message_template_language);
      const existing = await db.messageTemplate.findFirst({
        where: metaTemplateId
          ? { metaTemplateId }
          : { name: name ?? '', ...(language ? { language } : {}) },
      });
      if (!existing) continue;
      if (change.field === 'template_category_update') {
        await db.messageTemplate.update({
          where: { id: existing.id },
          data: {
            metaCategory: stringValue(value.new_category) ?? existing.metaCategory,
            metaSyncedAt: new Date(),
          },
        });
      } else {
        await db.messageTemplate.update({
          where: { id: existing.id },
          data: {
            metaStatus: (stringValue(value.event) ?? existing.metaStatus).toUpperCase(),
            metaRejectedReason: stringValue(value.reason),
            metaSyncedAt: new Date(),
          },
        });
      }
      processed += 1;
    }
  }
  return processed;
}

function versionCreateData(
  value: ReturnType<typeof validateMetaTemplateInput>,
  version: number,
  components: unknown,
) {
  return {
    version,
    content: value.body,
    footer: value.footer,
    variables: extractPositionalVariables(value.body) as unknown as Prisma.InputJsonValue,
    components: components as Prisma.InputJsonValue,
    exampleValues: value.exampleValues as unknown as Prisma.InputJsonValue,
    isCurrent: true,
  };
}

async function fetchAllMetaTemplates(): Promise<MetaTemplateRecord[]> {
  const fields = 'id,name,status,category,language,components,rejected_reason,quality_score';
  const basePath = `/message_templates?fields=${encodeURIComponent(fields)}&limit=250`;
  const fallbackPath = '/message_templates?limit=250';
  let activeBasePath = basePath;
  let path = basePath;
  const records: MetaTemplateRecord[] = [];
  for (let page = 0; page < 10 && path; page += 1) {
    let response: MetaListResponse;
    try {
      response = await metaRequest<MetaListResponse>(path);
    } catch (error) {
      if (page !== 0 || !(error instanceof MetaTemplateError)) throw error;
      activeBasePath = fallbackPath;
      response = await metaRequest<MetaListResponse>(fallbackPath);
    }
    records.push(...(response.data ?? []));
    const after = response.paging?.cursors?.after;
    path = after ? `${activeBasePath}&after=${encodeURIComponent(after)}` : '';
  }
  return records;
}

async function metaRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN?.trim();
  const wabaId = process.env.META_WHATSAPP_WABA_ID?.trim();
  const version = process.env.META_GRAPH_API_VERSION?.trim() || 'v25.0';
  if (!token || !wabaId)
    throw new MetaTemplateError('A integração com a Meta não está configurada.', 503);
  const url = path.startsWith('https://graph.facebook.com/')
    ? path
    : `https://graph.facebook.com/${version}/${wabaId}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json().catch(() => null)) as
    (T & { error?: MetaErrorRecord }) | null;
  if (!response.ok) {
    const error = data?.error;
    const message =
      error?.error_user_msg || error?.message || 'A Meta recusou a operação do template.';
    throw new MetaTemplateError(message, response.status, error?.code);
  }
  if (!data) throw new MetaTemplateError('Resposta inválida da Meta.', 502);
  return data;
}

function extractPositionalVariables(content: string): number[] {
  const found = new Set<number>();
  for (const match of content.matchAll(POSITIONAL_VARIABLE)) found.add(Number(match[1]));
  return [...found].sort((a, b) => a - b);
}

function componentText(components: unknown[], type: string): string {
  for (const component of components) {
    const record = asRecord(component);
    if (String(record?.type).toUpperCase() === type && typeof record?.text === 'string')
      return record.text;
  }
  return '';
}

function componentExamples(components: unknown[]): string[] {
  for (const component of components) {
    const record = asRecord(component);
    if (String(record?.type).toUpperCase() !== 'BODY') continue;
    const example = asRecord(record?.example);
    const rows = example?.body_text;
    if (Array.isArray(rows) && Array.isArray(rows[0])) {
      return rows[0].map((value) => String(value));
    }
  }
  return [];
}

function qualityScore(value: MetaTemplateRecord['quality_score']): string | null {
  if (typeof value === 'string') return value;
  return typeof value?.score === 'string' ? value.score : null;
}

function humanizeTemplateName(name: string): string {
  return name
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeForAnalysis(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function collectSignals(text: string, patterns: Array<[RegExp, string]>): string[] {
  return patterns.filter(([pattern]) => pattern.test(text)).map(([, reason]) => reason);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}
