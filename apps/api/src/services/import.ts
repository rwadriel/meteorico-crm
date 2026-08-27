import { Prisma } from '@meteorico/database';
import type { PrismaClient } from '@meteorico/database';

// ─── Interfaces ──────────────────────────────────────────────────────

interface ParsedContactRow {
  phone: string;
  phoneRaw: string;
  name: string;
  email: string;
  totalParticipations: number;
  lastEdition: number | null;
  isStudent: boolean;
  product: string;
  origin: string;
  firstContactDate: string;
  lastContactDate: string;
  notes: string;
  purchaseStatus: 'unknown' | 'not_purchased' | 'purchased';
  campaignSource: string;
}

interface ParsedParticipationRow {
  phone: string;
  campaignNumber: number;
  isCurrentStudent: boolean;
  campaignStatus: string;
  markedLeft: boolean;
  vcardLabels: string;
  origin: string;
}

interface ParseError {
  row: number;
  field: string;
  message: string;
}

interface Divergence {
  phone: string;
  type: string;
  csvValue: number;
  calculatedValue: number;
  action: string;
}

interface PreviewStats {
  totalLines: number;
  validLines: number;
  invalidLines: number;
  newContacts: number;
  existingContacts: number;
  updatingContacts: number;
  studentsDetected: number;
  historicalCampaignsToCreate: number;
  participationsToCreate: number;
  duplicatesInFile: number;
  invalidPhones: number;
  divergences: Divergence[];
  warnings: string[];
}

// ─── Header mapping ──────────────────────────────────────────────────

const CONTACT_HEADER_MAP: Record<string, string> = {
  telefone: 'telefone',
  phone: 'telefone',
  whatsapp: 'telefone',
  celular: 'telefone',
  numero: 'telefone',
  number: 'telefone',
  nome: 'nome',
  name: 'nome',
  email: 'email',
  quantidade_participacoes: 'quantidade_participacoes',
  participacoes: 'quantidade_participacoes',
  ultima_edicao: 'ultima_edicao',
  aluno: 'aluno',
  produto: 'produto',
  product: 'produto',
  origem: 'origem',
  origin: 'origem',
  data_primeiro_contato: 'data_primeiro_contato',
  primeiro_contato: 'data_primeiro_contato',
  data_ultimo_contato: 'data_ultimo_contato',
  ultimo_contato: 'data_ultimo_contato',
  observacoes: 'observacoes',
  notes: 'observacoes',
  comprou: 'comprou',
  purchase: 'comprou',
  cliente: 'comprou',
  status_compra: 'comprou',
  origem_campanha: 'origem_campanha',
  campaign_source: 'origem_campanha',
};

const CONTACT_REQUIRED_HEADERS = ['telefone'];

const PARTICIPATION_HEADER_MAP: Record<string, string> = {
  telefone: 'telefone',
  phone: 'telefone',
  campanha: 'campanha',
  campaign: 'campanha',
  aluno_atual: 'aluno_atual',
  aluno: 'aluno_atual',
  status_na_campanha: 'status_na_campanha',
  status: 'status_na_campanha',
  marcado_saiu: 'marcado_saiu',
  rotulos_vcard: 'rotulos_vcard',
  vcard: 'rotulos_vcard',
  origem: 'origem',
  origin: 'origem',
};

const PARTICIPATION_REQUIRED_HEADERS = ['telefone', 'campanha'];

// ─── CSV Utilities ───────────────────────────────────────────────────

function parseCsvLine(line: string, delimiter: string = ','): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === delimiter) {
        fields.push(current);
        current = '';
        i++;
        continue;
      }
      current += ch;
      i++;
    }
  }

  fields.push(current);
  return fields;
}

function detectDelimiter(headerLine: string): string {
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  const tabCount = (headerLine.match(/\t/g) || []).length;
  if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
  if (semicolonCount > commaCount) return ';';
  return ',';
}

function sanitizeString(value: string): string {
  let s = value.trim();
  if (s.length > 0 && (s[0] === '=' || s[0] === '+' || s[0] === '-' || s[0] === '@')) {
    s = s.slice(1).trim();
  }
  return s;
}

function normalizeHeaderName(raw: string): string {
  return raw.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizePhone(raw: string): string | null {
  const stripped = raw.replace(/\D/g, '');
  let digits = stripped;

  if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith('55')) {
    digits = '55' + digits;
  }

  if (digits.length < 7 || digits.length > 15) {
    return null;
  }

  return digits;
}

function mapHeaders(
  headerFields: string[],
  headerMap: Record<string, string>,
  requiredHeaders: string[],
): { columnMap: Map<string, number>; errors: string[] } {
  const columnMap = new Map<string, number>();
  const errors: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < headerFields.length; i++) {
    const raw = normalizeHeaderName(headerFields[i]);
    if (!raw) continue;

    const mapped = headerMap[raw];
    if (!mapped) continue;

    if (seen.has(mapped)) {
      errors.push(`Duplicate header: "${headerFields[i].trim()}" (column ${i + 1})`);
      continue;
    }

    seen.add(mapped);
    columnMap.set(mapped, i);
  }

  for (const req of requiredHeaders) {
    if (!columnMap.has(req)) {
      errors.push(`Required header missing: "${req}"`);
    }
  }

  if (columnMap.size === 0 && errors.length === 0) {
    errors.push('No recognized headers found in the file');
  }

  return { columnMap, errors };
}

function getField(fields: string[], columnMap: Map<string, number>, key: string): string {
  const idx = columnMap.get(key);
  if (idx === undefined) return '';
  return sanitizeString(fields[idx] ?? '');
}

// ─── CSV Parsers ─────────────────────────────────────────────────────

export function parseContactsCsv(content: string): { rows: ParsedContactRow[]; errors: ParseError[]; headerErrors?: string[] } {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: ParsedContactRow[] = [];
  const errors: ParseError[] = [];

  if (lines.length === 0) {
    return { rows, errors };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headerFields = parseCsvLine(lines[0], delimiter);
  const { columnMap, errors: headerErrors } = mapHeaders(headerFields, CONTACT_HEADER_MAP, CONTACT_REQUIRED_HEADERS);

  if (headerErrors.length > 0) {
    return { rows, errors, headerErrors };
  }

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i], delimiter);
    const rowNum = i + 1;

    const rawPhone = getField(fields, columnMap, 'telefone');
    if (!rawPhone) {
      errors.push({ row: rowNum, field: 'telefone', message: 'Phone is required' });
      continue;
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
      errors.push({ row: rowNum, field: 'telefone', message: 'Invalid phone number' });
      continue;
    }

    const name = getField(fields, columnMap, 'nome');
    const email = getField(fields, columnMap, 'email');
    const rawParticipations = getField(fields, columnMap, 'quantidade_participacoes');
    const rawLastEdition = getField(fields, columnMap, 'ultima_edicao');
    const rawAluno = getField(fields, columnMap, 'aluno').toLowerCase();
    const product = getField(fields, columnMap, 'produto');
    const origin = getField(fields, columnMap, 'origem');
    const firstContactDate = getField(fields, columnMap, 'data_primeiro_contato');
    const lastContactDate = getField(fields, columnMap, 'data_ultimo_contato');
    const notes = getField(fields, columnMap, 'observacoes');
    const rawPurchase = getField(fields, columnMap, 'comprou')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const campaignSource = getField(fields, columnMap, 'origem_campanha');

    if (email && !isValidEmail(email)) {
      errors.push({ row: rowNum, field: 'email', message: 'Invalid email format' });
      continue;
    }

    const totalParticipations = rawParticipations ? parseInt(rawParticipations, 10) : 0;
    if (rawParticipations && isNaN(totalParticipations)) {
      errors.push({ row: rowNum, field: 'quantidade_participacoes', message: 'Must be a number' });
      continue;
    }

    let lastEdition: number | null = null;
    if (rawLastEdition) {
      const parsed = parseInt(rawLastEdition, 10);
      if (isNaN(parsed)) {
        errors.push({ row: rowNum, field: 'ultima_edicao', message: 'Must be a number' });
        continue;
      }
      lastEdition = parsed;
    }

    const purchaseStatus = ['sim', 'yes', 'true', '1', 'comprou', 'purchased', 'cliente'].includes(rawPurchase)
      ? 'purchased'
      : ['nao', 'no', 'false', '0', 'nao comprou', 'not purchased'].includes(rawPurchase)
        ? 'not_purchased'
        : 'unknown';

    rows.push({
      phone,
      phoneRaw: rawPhone,
      name,
      email: email ? email.trim().toLowerCase() : '',
      totalParticipations,
      lastEdition,
      isStudent: rawAluno === 'sim',
      product,
      origin,
      firstContactDate,
      lastContactDate,
      notes,
      purchaseStatus,
      campaignSource,
    });
  }

  return { rows, errors };
}

export function parseParticipationsCsv(content: string): { rows: ParsedParticipationRow[]; errors: ParseError[]; headerErrors?: string[] } {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: ParsedParticipationRow[] = [];
  const errors: ParseError[] = [];

  if (lines.length === 0) {
    return { rows, errors };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headerFields = parseCsvLine(lines[0], delimiter);
  const { columnMap, errors: headerErrors } = mapHeaders(headerFields, PARTICIPATION_HEADER_MAP, PARTICIPATION_REQUIRED_HEADERS);

  if (headerErrors.length > 0) {
    return { rows, errors, headerErrors };
  }

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i], delimiter);
    const rowNum = i + 1;

    const rawPhone = getField(fields, columnMap, 'telefone');
    if (!rawPhone) {
      errors.push({ row: rowNum, field: 'telefone', message: 'Phone is required' });
      continue;
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
      errors.push({ row: rowNum, field: 'telefone', message: 'Invalid phone number' });
      continue;
    }

    const rawCampanha = getField(fields, columnMap, 'campanha');
    if (!rawCampanha) {
      errors.push({ row: rowNum, field: 'campanha', message: 'Campaign number is required' });
      continue;
    }

    const campaignNumber = parseInt(rawCampanha, 10);
    if (isNaN(campaignNumber) || campaignNumber <= 0) {
      errors.push({ row: rowNum, field: 'campanha', message: 'Must be a positive integer' });
      continue;
    }

    const rawAluno = getField(fields, columnMap, 'aluno_atual').toLowerCase();
    const campaignStatus = getField(fields, columnMap, 'status_na_campanha');
    const rawMarcadoSaiu = getField(fields, columnMap, 'marcado_saiu').toLowerCase();
    const vcardLabels = getField(fields, columnMap, 'rotulos_vcard');
    const origin = getField(fields, columnMap, 'origem');

    rows.push({
      phone,
      campaignNumber,
      isCurrentStudent: rawAluno === 'sim',
      campaignStatus,
      markedLeft: rawMarcadoSaiu === 'sim',
      vcardLabels,
      origin,
    });
  }

  return { rows, errors };
}

// ─── Preview ─────────────────────────────────────────────────────────

export async function createImportPreview(
  db: PrismaClient,
  type: string,
  filename: string,
  content: string,
  userId: string,
) {
  let parsedRows: (ParsedContactRow | ParsedParticipationRow)[];
  let parseErrors: ParseError[];
  let headerErrors: string[] | undefined;

  if (type === 'contacts') {
    const result = parseContactsCsv(content);
    parsedRows = result.rows;
    parseErrors = result.errors;
    headerErrors = result.headerErrors;
  } else if (type === 'participations') {
    const result = parseParticipationsCsv(content);
    parsedRows = result.rows;
    parseErrors = result.errors;
    headerErrors = result.headerErrors;
  } else {
    throw new Error('Invalid import type');
  }

  if (headerErrors && headerErrors.length > 0) {
    throw new Error(`Invalid CSV headers: ${headerErrors.join('; ')}`);
  }

  const stats: PreviewStats = {
    totalLines: parsedRows.length + parseErrors.length,
    validLines: parsedRows.length,
    invalidLines: parseErrors.length,
    newContacts: 0,
    existingContacts: 0,
    updatingContacts: 0,
    studentsDetected: 0,
    historicalCampaignsToCreate: 0,
    participationsToCreate: 0,
    duplicatesInFile: 0,
    invalidPhones: parseErrors.filter(e => e.field === 'telefone').length,
    divergences: [],
    warnings: [],
  };

  if (type === 'contacts') {
    const contactRows = parsedRows as ParsedContactRow[];
    const phoneSeen = new Set<string>();

    for (const row of contactRows) {
      if (phoneSeen.has(row.phone)) {
        stats.duplicatesInFile++;
      }
      phoneSeen.add(row.phone);
      if (row.isStudent) stats.studentsDetected++;
    }

    const uniquePhones = [...phoneSeen];
    const existingContacts = await db.contact.findMany({
      where: { phone: { in: uniquePhones } },
      select: { phone: true, totalParticipations: true },
    });
    const existingPhoneSet = new Set(existingContacts.map(c => c.phone!));

    for (const phone of uniquePhones) {
      if (existingPhoneSet.has(phone)) {
        stats.existingContacts++;
        stats.updatingContacts++;
      } else {
        stats.newContacts++;
      }
    }
  } else {
    const partRows = parsedRows as ParsedParticipationRow[];
    const phoneSeen = new Set<string>();
    const pairSeen = new Set<string>();
    const campaignNumbers = new Set<number>();

    for (const row of partRows) {
      phoneSeen.add(row.phone);
      const pairKey = `${row.phone}:${row.campaignNumber}`;
      if (pairSeen.has(pairKey)) {
        stats.duplicatesInFile++;
      }
      pairSeen.add(pairKey);
      campaignNumbers.add(row.campaignNumber);
      if (row.isCurrentStudent) stats.studentsDetected++;
    }

    const uniquePhones = [...phoneSeen];
    const existingContacts = await db.contact.findMany({
      where: { phone: { in: uniquePhones } },
      select: { phone: true },
    });
    const existingPhoneSet = new Set(existingContacts.map(c => c.phone!));

    for (const phone of uniquePhones) {
      if (existingPhoneSet.has(phone)) {
        stats.existingContacts++;
      } else {
        stats.newContacts++;
      }
    }

    const existingCampaigns = await db.campaign.findMany({
      where: { editionNumber: { in: [...campaignNumbers] } },
      select: { editionNumber: true },
    });
    const existingEditions = new Set(existingCampaigns.map(c => c.editionNumber));
    for (const num of campaignNumbers) {
      if (!existingEditions.has(num)) {
        stats.historicalCampaignsToCreate++;
      }
    }

    stats.participationsToCreate = pairSeen.size;
  }

  const imp = await db.import.create({
    data: {
      type,
      status: 'previewing',
      filename,
      totalRows: parsedRows.length + parseErrors.length,
      processedRows: 0,
      errorRows: parseErrors.length,
      createdBy: userId,
    },
  });

  const importRows: Prisma.ImportRowCreateManyInput[] = [];

  for (const row of parsedRows) {
    importRows.push({
      importId: imp.id,
      rowNumber: importRows.length + 1,
      data: row as unknown as Prisma.InputJsonValue,
      status: 'pending',
      error: null,
    });
  }

  for (const err of parseErrors) {
    importRows.push({
      importId: imp.id,
      rowNumber: err.row,
      data: { parseError: true, field: err.field, message: err.message } as Prisma.InputJsonValue,
      status: 'error',
      error: `${err.field}: ${err.message}`,
    });
  }

  if (importRows.length > 0) {
    await db.importRow.createMany({ data: importRows });
  }

  const preview = await db.importRow.findMany({
    where: { importId: imp.id, status: 'pending' },
    orderBy: { rowNumber: 'asc' },
    take: 10,
  });

  return {
    import: imp,
    validCount: parsedRows.length,
    errorCount: parseErrors.length,
    errors: parseErrors,
    preview,
    stats,
  };
}

// ─── Contact Import ──────────────────────────────────────────────────

export async function processContactsImport(db: PrismaClient, importId: string) {
  const imp = await db.import.findUnique({ where: { id: importId } });
  if (!imp) throw new Error('Import not found');
  if (imp.status !== 'previewing') throw new Error('Import is not in previewing status');

  await db.import.update({
    where: { id: importId },
    data: { status: 'processing', startedAt: new Date() },
  });

  const pendingRows = await db.importRow.findMany({
    where: { importId, status: 'pending' },
    orderBy: { rowNumber: 'asc' },
  });

  let processedCount = 0;
  let errorCount = imp.errorRows;
  const batchSize = 50;

  for (let batchStart = 0; batchStart < pendingRows.length; batchStart += batchSize) {
    const batch = pendingRows.slice(batchStart, batchStart + batchSize);

    await db.$transaction(async (tx) => {
      for (const row of batch) {
        try {
          const data = row.data as unknown as ParsedContactRow;

          const existing = await tx.contact.findUnique({
            where: { phone: data.phone },
          });

          const action: 'create' | 'update' = existing ? 'update' : 'create';

          const beforeState: Record<string, unknown> | null = existing
            ? {
                name: existing.name,
                email: existing.email,
                isStudent: existing.isStudent,
                totalParticipations: existing.totalParticipations,
                metadata: existing.metadata,
                firstSeenAt: existing.firstSeenAt,
                lastSeenAt: existing.lastSeenAt,
              }
            : null;

          const metadata: Record<string, string> = {};
          if (data.notes) metadata.observacoes = data.notes;
          if (data.origin) metadata.origem = data.origin;
          if (data.product) metadata.produto = data.product;
          if (data.lastEdition !== null) metadata.ultima_edicao_csv = String(data.lastEdition);
          if (data.totalParticipations > 0) metadata.quantidade_participacoes_csv = String(data.totalParticipations);

          const hasMetadata = Object.keys(metadata).length > 0;
          const existingMeta = existing?.metadata as Record<string, unknown> | null;
          const mergedMetadata = existingMeta
            ? { ...existingMeta, ...metadata }
            : hasMetadata ? metadata : null;

          // aluno=true never downgraded
          const isStudent = data.isStudent || data.purchaseStatus === 'purchased'
            ? true
            : (existing?.isStudent ?? false);
          const purchaseStatus = existing?.purchaseStatus === 'purchased'
            ? 'purchased'
            : data.purchaseStatus;

          const resolvedName = data.name || (existing?.name ?? '');

          // CSV totalParticipations is stored as legacy audit in metadata;
          // the Contact.totalParticipations field holds whatever was there
          // or the CSV value if no participations exist yet
          const resolvedParticipations = data.totalParticipations > 0
            ? data.totalParticipations
            : (existing?.totalParticipations ?? 0);

          // email: persist to Contact.email column, not metadata
          const resolvedEmail = data.email
            ? data.email
            : (existing?.email ?? null);

          let firstSeenAt: Date | undefined;
          if (data.firstContactDate) {
            const parsed = new Date(data.firstContactDate);
            if (!isNaN(parsed.getTime())) firstSeenAt = parsed;
          }

          let lastSeenAt: Date | undefined;
          if (data.lastContactDate) {
            const parsed = new Date(data.lastContactDate);
            if (!isNaN(parsed.getTime())) lastSeenAt = parsed;
          }

          const metaValue = mergedMetadata !== null
            ? (mergedMetadata as Prisma.InputJsonValue)
            : undefined;

          const contactData = {
            name: resolvedName,
            normalizedPhone: data.phone,
            phoneRaw: data.phoneRaw,
            source: data.origin || existing?.source || 'meteorico_grupo',
            campaignSource: data.campaignSource || existing?.campaignSource || '',
            purchaseStatus,
            isStudent,
            totalParticipations: resolvedParticipations,
            ...(resolvedEmail !== null ? { email: resolvedEmail } : {}),
            ...(metaValue !== undefined ? { metadata: metaValue } : {}),
            ...(firstSeenAt ? { firstSeenAt } : {}),
            ...(lastSeenAt ? { lastSeenAt } : {}),
          };

          const result = await tx.contact.upsert({
            where: { phone: data.phone },
            create: {
              phone: data.phone,
              ...contactData,
            },
            update: contactData,
          });

          const afterState: Record<string, unknown> = {
            name: result.name,
            email: result.email,
            isStudent: result.isStudent,
            totalParticipations: result.totalParticipations,
            metadata: result.metadata,
            firstSeenAt: result.firstSeenAt,
            lastSeenAt: result.lastSeenAt,
          };

          await tx.importRow.update({
            where: { id: row.id },
            data: {
              status: 'success',
              data: {
                ...data,
                _action: action,
                _contactId: result.id,
                _beforeState: beforeState as Prisma.InputJsonValue | null,
                _afterState: afterState as Prisma.InputJsonValue,
              } as Prisma.InputJsonValue,
            },
          });

          processedCount++;
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Unknown error';
          await tx.importRow.update({
            where: { id: row.id },
            data: { status: 'error', error: message },
          });
          errorCount++;
        }
      }
    });
  }

  return db.import.update({
    where: { id: importId },
    data: {
      status: 'done',
      processedRows: processedCount,
      errorRows: errorCount,
      completedAt: new Date(),
    },
  });
}

// ─── Participation Import ────────────────────────────────────────────

export async function processParticipationsImport(db: PrismaClient, importId: string) {
  const imp = await db.import.findUnique({ where: { id: importId } });
  if (!imp) throw new Error('Import not found');
  if (imp.status !== 'previewing') throw new Error('Import is not in previewing status');

  await db.import.update({
    where: { id: importId },
    data: { status: 'processing', startedAt: new Date() },
  });

  const pendingRows = await db.importRow.findMany({
    where: { importId, status: 'pending' },
    orderBy: { rowNumber: 'asc' },
  });

  let processedCount = 0;
  let errorCount = imp.errorRows;
  const batchSize = 50;

  for (let batchStart = 0; batchStart < pendingRows.length; batchStart += batchSize) {
    const batch = pendingRows.slice(batchStart, batchStart + batchSize);

    await db.$transaction(async (tx) => {
      for (const row of batch) {
        try {
          const data = row.data as unknown as ParsedParticipationRow;

          const existingContact = await tx.contact.findUnique({
            where: { phone: data.phone },
          });

          const contactAction: 'create' | 'update' = existingContact ? 'update' : 'create';

          const contactBeforeState: Record<string, unknown> | null = existingContact
            ? {
                name: existingContact.name,
                email: existingContact.email,
                isStudent: existingContact.isStudent,
                totalParticipations: existingContact.totalParticipations,
                metadata: existingContact.metadata,
              }
            : null;

          // aluno=true never downgraded
          const contact = await tx.contact.upsert({
            where: { phone: data.phone },
            create: {
              phone: data.phone,
              normalizedPhone: data.phone,
              isStudent: data.isCurrentStudent,
            },
            update: data.isCurrentStudent
              ? { isStudent: true }
              : {},
          });

          const existingCampaign = await tx.campaign.findUnique({
            where: { editionNumber: data.campaignNumber },
          });

          const campaignAction: 'existing' | 'create' = existingCampaign ? 'existing' : 'create';

          let campaign;
          if (existingCampaign) {
            campaign = existingCampaign;
          } else {
            campaign = await tx.campaign.create({
              data: {
                name: `Meteórico ${data.campaignNumber}`,
                slug: `meteorico-${data.campaignNumber}`,
                editionNumber: data.campaignNumber,
                status: 'historical',
                createdBy: imp.createdBy,
              },
            });
          }

          const existingParticipation = await tx.campaignParticipation.findUnique({
            where: {
              contactId_campaignId: {
                contactId: contact.id,
                campaignId: campaign.id,
              },
            },
          });

          const participationAction: 'create' | 'update' = existingParticipation ? 'update' : 'create';

          const participationBeforeState: Record<string, unknown> | null = existingParticipation
            ? {
                status: existingParticipation.status,
                classification: existingParticipation.classification,
                metadata: existingParticipation.metadata,
              }
            : null;

          const participationMetadata: Record<string, unknown> = {};
          if (data.markedLeft) participationMetadata.marcado_saiu = true;
          if (data.vcardLabels) participationMetadata.rotulos_vcard = data.vcardLabels;
          if (data.origin) participationMetadata.origem = data.origin;

          const hasParticipationMeta = Object.keys(participationMetadata).length > 0;
          const mergedParticipationMeta = existingParticipation?.metadata
            ? { ...(existingParticipation.metadata as Record<string, unknown>), ...participationMetadata }
            : hasParticipationMeta ? participationMetadata : null;

          const partMetaValue = mergedParticipationMeta !== null
            ? (mergedParticipationMeta as Prisma.InputJsonValue)
            : undefined;

          const participation = await tx.campaignParticipation.upsert({
            where: {
              contactId_campaignId: {
                contactId: contact.id,
                campaignId: campaign.id,
              },
            },
            create: {
              contactId: contact.id,
              campaignId: campaign.id,
              status: data.markedLeft ? 'left' : 'active',
              classification: data.campaignStatus || 'new',
              ...(partMetaValue !== undefined ? { metadata: partMetaValue } : {}),
            },
            update: {
              status: data.markedLeft ? 'left' : undefined,
              classification: data.campaignStatus || undefined,
              ...(partMetaValue !== undefined ? { metadata: partMetaValue } : {}),
            },
          });

          await tx.importRow.update({
            where: { id: row.id },
            data: {
              status: 'success',
              data: {
                ...data,
                _contactAction: contactAction,
                _campaignAction: campaignAction,
                _participationAction: participationAction,
                _contactId: contact.id,
                _campaignId: campaign.id,
                _participationId: participation.id,
                _contactBeforeState: contactBeforeState as Prisma.InputJsonValue | null,
                _participationBeforeState: participationBeforeState as Prisma.InputJsonValue | null,
              } as Prisma.InputJsonValue,
            },
          });

          processedCount++;
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Unknown error';
          await tx.importRow.update({
            where: { id: row.id },
            data: { status: 'error', error: message },
          });
          errorCount++;
        }
      }
    });
  }

  return db.import.update({
    where: { id: importId },
    data: {
      status: 'done',
      processedRows: processedCount,
      errorRows: errorCount,
      completedAt: new Date(),
    },
  });
}

// ─── Divergence Report ───────────────────────────────────────────────

export async function generateDivergenceReport(db: PrismaClient, importId: string): Promise<Divergence[]> {
  const imp = await db.import.findUnique({ where: { id: importId } });
  if (!imp || imp.status !== 'done') return [];

  const divergences: Divergence[] = [];

  if (imp.type === 'contacts') {
    const successRows = await db.importRow.findMany({
      where: { importId, status: 'success' },
    });

    for (const row of successRows) {
      const data = row.data as Record<string, unknown>;
      const phone = data.phone as string;
      const csvParticipations = data.totalParticipations as number;
      const csvLastEdition = data.lastEdition as number | null;

      const contact = await db.contact.findUnique({
        where: { phone },
        include: { participations: { include: { campaign: true } } },
      });

      if (!contact) continue;

      const confirmedParticipations = new Set(
        contact.participations.map((participation) => participation.campaignId),
      ).size;
      if (csvParticipations > 0 && csvParticipations !== confirmedParticipations) {
        divergences.push({
          phone,
          type: 'LEGACY_PARTICIPATION_COUNT_MISMATCH',
          csvValue: csvParticipations,
          calculatedValue: confirmedParticipations,
          action: 'Valor legado preservado em metadata; fonte de verdade: campanhas confirmadas no banco',
        });
      }

      if (csvLastEdition !== null && contact.participations.length > 0) {
        const maxEdition = Math.max(
          ...contact.participations
            .map(p => p.campaign.editionNumber)
            .filter((n): n is number => n !== null),
        );
        if (maxEdition > 0 && csvLastEdition !== maxEdition) {
          divergences.push({
            phone,
            type: 'ultima_edicao',
            csvValue: csvLastEdition,
            calculatedValue: maxEdition,
            action: 'Fonte de verdade: MAX edição confirmada no banco',
          });
        }
      }
    }
  }

  return divergences;
}

// ─── Rollback ────────────────────────────────────────────────────────

export async function rollbackImport(db: PrismaClient, importId: string) {
  const imp = await db.import.findUnique({ where: { id: importId } });
  if (!imp) throw new Error('Import not found');
  if (imp.status !== 'done') throw new Error('Only completed imports can be rolled back');

  const successRows = await db.importRow.findMany({
    where: { importId, status: 'success' },
    orderBy: { rowNumber: 'desc' },
  });

  await db.$transaction(async (tx) => {
    if (imp.type === 'contacts') {
      for (const row of successRows) {
        const data = row.data as Record<string, unknown>;
        const action = data._action as string;
        const phone = data.phone as string;
        const beforeState = data._beforeState as Record<string, unknown> | null;

        if (action === 'create') {
          const contact = await tx.contact.findUnique({ where: { phone } });
          if (contact) {
            await tx.campaignParticipation.deleteMany({ where: { contactId: contact.id } });
            await tx.contact.delete({ where: { phone } });
          }
        } else if (action === 'update' && beforeState) {
          await tx.contact.update({
            where: { phone },
            data: {
              name: beforeState.name as string,
              email: (beforeState.email as string | null) ?? null,
              isStudent: beforeState.isStudent as boolean,
              totalParticipations: beforeState.totalParticipations as number,
              metadata: beforeState.metadata as Prisma.InputJsonValue ?? Prisma.JsonNull,
              ...(beforeState.firstSeenAt ? { firstSeenAt: new Date(beforeState.firstSeenAt as string) } : {}),
              ...(beforeState.lastSeenAt ? { lastSeenAt: new Date(beforeState.lastSeenAt as string) } : {}),
            },
          });
        }
      }
    } else if (imp.type === 'participations') {
      for (const row of successRows) {
        const data = row.data as Record<string, unknown>;
        const participationAction = data._participationAction as string;
        const contactAction = data._contactAction as string;
        const campaignAction = data._campaignAction as string;
        const contactId = data._contactId as string;
        const campaignId = data._campaignId as string;
        const contactBeforeState = data._contactBeforeState as Record<string, unknown> | null;
        const participationBeforeState = data._participationBeforeState as Record<string, unknown> | null;

        if (participationAction === 'create') {
          await tx.campaignParticipation.deleteMany({
            where: { contactId, campaignId },
          });
        } else if (participationAction === 'update' && participationBeforeState) {
          const participationId = data._participationId as string;
          await tx.campaignParticipation.update({
            where: { id: participationId },
            data: {
              status: participationBeforeState.status as string,
              classification: participationBeforeState.classification as string,
              metadata: participationBeforeState.metadata as Prisma.InputJsonValue ?? Prisma.JsonNull,
            },
          }).catch(() => {});
        }

        if (campaignAction === 'create') {
          const remainingParticipations = await tx.campaignParticipation.count({
            where: { campaignId },
          });
          if (remainingParticipations === 0) {
            await tx.campaign.delete({ where: { id: campaignId } }).catch(() => {});
          }
        }

        if (contactAction === 'create') {
          const remainingParticipations = await tx.campaignParticipation.count({
            where: { contactId },
          });
          if (remainingParticipations === 0) {
            await tx.contact.delete({ where: { id: contactId } }).catch(() => {});
          }
        } else if (contactAction === 'update' && contactBeforeState) {
          await tx.contact.update({
            where: { id: contactId },
            data: {
              name: contactBeforeState.name as string,
              email: (contactBeforeState.email as string | null) ?? null,
              isStudent: contactBeforeState.isStudent as boolean,
              totalParticipations: contactBeforeState.totalParticipations as number,
              metadata: contactBeforeState.metadata as Prisma.InputJsonValue ?? Prisma.JsonNull,
            },
          }).catch(() => {});
        }
      }
    }

    await tx.import.update({
      where: { id: importId },
      data: { status: 'rolled_back' },
    });
  });
}

// ─── Reconcile participations (post-import) ──────────────────────────

export async function reconcileParticipationCounts(db: PrismaClient, importId: string): Promise<Divergence[]> {
  const imp = await db.import.findUnique({ where: { id: importId } });
  if (!imp || imp.status !== 'done') return [];

  const successRows = await db.importRow.findMany({
    where: { importId, status: 'success' },
  });

  const phoneSet = new Set<string>();
  for (const row of successRows) {
    const data = row.data as Record<string, unknown>;
    phoneSet.add(data.phone as string);
  }

  const divergences: Divergence[] = [];

  for (const phone of phoneSet) {
    const contact = await db.contact.findUnique({
      where: { phone },
      include: { participations: { include: { campaign: true } } },
    });

    if (!contact) continue;

    const distinctCampaigns = new Set(
      contact.participations.map((participation) => participation.campaignId),
    ).size;
    const previousTotal = contact.totalParticipations;
    const meta = contact.metadata as Record<string, unknown> | null;
    const legacyValueRaw = meta?.quantidade_participacoes_csv;
    const legacyValue = legacyValueRaw !== undefined && legacyValueRaw !== null
      ? Number(legacyValueRaw)
      : null;

    if (previousTotal !== distinctCampaigns) {
      await db.contact.update({
        where: { id: contact.id },
        data: { totalParticipations: distinctCampaigns },
      });
    }

    if (legacyValue !== null && Number.isFinite(legacyValue) && legacyValue !== distinctCampaigns) {
      divergences.push({
        phone,
        type: 'LEGACY_PARTICIPATION_COUNT_MISMATCH',
        csvValue: legacyValue,
        calculatedValue: distinctCampaigns,
        action: 'Valor legado preservado em metadata; campo derivado atualizado para campanhas distintas confirmadas',
      });
    } else if (previousTotal !== distinctCampaigns) {
      divergences.push({
        phone,
        type: 'PARTICIPATION_COUNT_RECONCILED',
        csvValue: previousTotal,
        calculatedValue: distinctCampaigns,
        action: 'Campo derivado atualizado para campanhas distintas confirmadas',
      });
    }

    const editions = contact.participations
      .map(p => p.campaign.editionNumber)
      .filter((n): n is number => n !== null);

    if (editions.length > 0) {
      const maxEdition = Math.max(...editions);
      const csvLastEdition = meta?.ultima_edicao_csv ? Number(meta.ultima_edicao_csv) : null;

      if (csvLastEdition !== null && csvLastEdition !== maxEdition) {
        divergences.push({
          phone,
          type: 'ultima_edicao',
          csvValue: csvLastEdition,
          calculatedValue: maxEdition,
          action: 'Fonte de verdade: MAX edição confirmada no banco',
        });
      }
    }
  }

  return divergences;
}

// ─── Queries ─────────────────────────────────────────────────────────

export async function getImport(db: PrismaClient, importId: string) {
  const imp = await db.import.findUnique({ where: { id: importId } });
  if (!imp) throw new Error('Import not found');

  const [pending, success, error] = await Promise.all([
    db.importRow.count({ where: { importId, status: 'pending' } }),
    db.importRow.count({ where: { importId, status: 'success' } }),
    db.importRow.count({ where: { importId, status: 'error' } }),
  ]);

  return {
    ...imp,
    rowCounts: { pending, success, error },
  };
}

export async function listImports(
  db: PrismaClient,
  opts: { page: number; limit: number },
) {
  const [imports, total] = await Promise.all([
    db.import.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    }),
    db.import.count(),
  ]);

  return { imports, total, page: opts.page, limit: opts.limit };
}
