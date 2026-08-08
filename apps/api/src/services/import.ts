import type { PrismaClient, Prisma } from '@meteorico/database';

interface ParsedContactRow {
  phone: string;
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

function parseCsvLine(line: string): string[] {
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
      if (ch === ',') {
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

function sanitizeString(value: string): string {
  let s = value.trim();
  if (s.length > 0 && (s[0] === '=' || s[0] === '+' || s[0] === '-' || s[0] === '@')) {
    s = s.slice(1).trim();
  }
  return s;
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

export function parseContactsCsv(content: string): { rows: ParsedContactRow[]; errors: ParseError[] } {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: ParsedContactRow[] = [];
  const errors: ParseError[] = [];

  if (lines.length === 0) {
    return { rows, errors };
  }

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const rowNum = i + 1;

    const rawPhone = sanitizeString(fields[0] ?? '');
    if (!rawPhone) {
      errors.push({ row: rowNum, field: 'telefone', message: 'Phone is required' });
      continue;
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
      errors.push({ row: rowNum, field: 'telefone', message: 'Invalid phone number' });
      continue;
    }

    const name = sanitizeString(fields[1] ?? '');
    const email = sanitizeString(fields[2] ?? '');
    const rawParticipations = sanitizeString(fields[3] ?? '');
    const rawLastEdition = sanitizeString(fields[4] ?? '');
    const rawAluno = sanitizeString(fields[5] ?? '').toLowerCase();
    const product = sanitizeString(fields[6] ?? '');
    const origin = sanitizeString(fields[7] ?? '');
    const firstContactDate = sanitizeString(fields[8] ?? '');
    const lastContactDate = sanitizeString(fields[9] ?? '');
    const notes = sanitizeString(fields[10] ?? '');

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

    rows.push({
      phone,
      name,
      email,
      totalParticipations,
      lastEdition,
      isStudent: rawAluno === 'sim',
      product,
      origin,
      firstContactDate,
      lastContactDate,
      notes,
    });
  }

  return { rows, errors };
}

export function parseParticipationsCsv(content: string): { rows: ParsedParticipationRow[]; errors: ParseError[] } {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: ParsedParticipationRow[] = [];
  const errors: ParseError[] = [];

  if (lines.length === 0) {
    return { rows, errors };
  }

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const rowNum = i + 1;

    const rawPhone = sanitizeString(fields[0] ?? '');
    if (!rawPhone) {
      errors.push({ row: rowNum, field: 'telefone', message: 'Phone is required' });
      continue;
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
      errors.push({ row: rowNum, field: 'telefone', message: 'Invalid phone number' });
      continue;
    }

    const rawCampanha = sanitizeString(fields[1] ?? '');
    if (!rawCampanha) {
      errors.push({ row: rowNum, field: 'campanha', message: 'Campaign number is required' });
      continue;
    }

    const campaignNumber = parseInt(rawCampanha, 10);
    if (isNaN(campaignNumber) || campaignNumber <= 0) {
      errors.push({ row: rowNum, field: 'campanha', message: 'Must be a positive integer' });
      continue;
    }

    const rawAluno = sanitizeString(fields[2] ?? '').toLowerCase();
    const campaignStatus = sanitizeString(fields[3] ?? '');
    const rawMarcadoSaiu = sanitizeString(fields[4] ?? '').toLowerCase();
    const vcardLabels = sanitizeString(fields[5] ?? '');
    const origin = sanitizeString(fields[6] ?? '');

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

export async function createImportPreview(
  db: PrismaClient,
  type: string,
  filename: string,
  content: string,
  userId: string,
) {
  let parsedRows: (ParsedContactRow | ParsedParticipationRow)[];
  let parseErrors: ParseError[];

  if (type === 'contacts') {
    const result = parseContactsCsv(content);
    parsedRows = result.rows;
    parseErrors = result.errors;
  } else if (type === 'participations') {
    const result = parseParticipationsCsv(content);
    parsedRows = result.rows;
    parseErrors = result.errors;
  } else {
    throw new Error('Invalid import type');
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
  };
}

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

          const action = existing ? 'update' : 'create';

          const metadata: Record<string, string> = {};
          if (data.notes) metadata.observacoes = data.notes;
          if (data.origin) metadata.origem = data.origin;
          if (data.product) metadata.produto = data.product;
          if (data.email) metadata.email = data.email;

          const hasMetadata = Object.keys(metadata).length > 0;
          const mergedMetadata = existing?.metadata
            ? { ...(existing.metadata as Record<string, unknown>), ...metadata }
            : hasMetadata ? metadata : null;

          const isStudent = data.isStudent ? true : (existing?.isStudent ?? false);

          const resolvedName = data.name || (existing?.name ?? '');
          const resolvedParticipations = data.totalParticipations > 0
            ? data.totalParticipations
            : (existing?.totalParticipations ?? 0);

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

          await tx.contact.upsert({
            where: { phone: data.phone },
            create: {
              phone: data.phone,
              name: resolvedName,
              normalizedPhone: data.phone,
              isStudent,
              totalParticipations: resolvedParticipations,
              ...(metaValue !== undefined ? { metadata: metaValue } : {}),
              ...(firstSeenAt ? { firstSeenAt } : {}),
              ...(lastSeenAt ? { lastSeenAt } : {}),
            },
            update: {
              name: resolvedName,
              normalizedPhone: data.phone,
              isStudent,
              totalParticipations: resolvedParticipations,
              ...(metaValue !== undefined ? { metadata: metaValue } : {}),
              ...(firstSeenAt ? { firstSeenAt } : {}),
              ...(lastSeenAt ? { lastSeenAt } : {}),
            },
          });

          await tx.importRow.update({
            where: { id: row.id },
            data: {
              status: 'success',
              data: { ...data, _action: action },
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

          const contactAction = existingContact ? 'update' : 'create';

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

          const campaignAction = existingCampaign ? 'existing' : 'create';

          let campaign;
          if (existingCampaign) {
            campaign = existingCampaign;
          } else {
            campaign = await tx.campaign.create({
              data: {
                name: `Edicao ${data.campaignNumber}`,
                slug: `edicao-${data.campaignNumber}`,
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

          const participationAction = existingParticipation ? 'update' : 'create';

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

          await tx.campaignParticipation.upsert({
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
              },
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

        if (action === 'create') {
          const contact = await tx.contact.findUnique({ where: { phone } });
          if (contact) {
            await tx.campaignParticipation.deleteMany({ where: { contactId: contact.id } });
            await tx.contact.delete({ where: { phone } });
          }
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

        if (participationAction === 'create') {
          await tx.campaignParticipation.deleteMany({
            where: { contactId, campaignId },
          });
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
        }
      }
    }

    await tx.import.update({
      where: { id: importId },
      data: { status: 'rolled_back' },
    });
  });
}

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
