import type { PrismaClient } from '@meteorico/database';

interface MetaPhoneNumberRecord {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
  status?: string;
}

interface MetaPhoneNumbersResponse {
  data?: MetaPhoneNumberRecord[];
  paging?: { next?: string };
  error?: { message?: string };
}

export class WhatsAppSenderError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}

function requiredMetaConfig() {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN?.trim();
  const wabaId = process.env.META_WHATSAPP_WABA_ID?.trim();
  if (!accessToken || !wabaId) {
    throw new WhatsAppSenderError('A integração com a Meta não está configurada.', 503);
  }
  return {
    accessToken,
    wabaId,
    graphVersion: process.env.META_GRAPH_API_VERSION?.trim() || 'v26.0',
  };
}

export async function ensureConfiguredWhatsAppSender(db: PrismaClient) {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
  const wabaId = process.env.META_WHATSAPP_WABA_ID?.trim();
  if (!phoneNumberId || !wabaId) return null;

  const sender = await db.whatsAppSender.upsert({
    where: { phoneNumberId },
    create: {
      phoneNumberId,
      wabaId,
      internalName: 'Número principal',
      status: 'CONNECTED',
      isDefault: true,
      isActive: true,
      sendEnabled: true,
      lastSyncedAt: new Date(),
    },
    update: {
      wabaId,
      status: 'CONNECTED',
    },
  });
  const defaultCount = await db.whatsAppSender.count({ where: { isDefault: true } });
  if (defaultCount === 0) {
    return db.whatsAppSender.update({ where: { id: sender.id }, data: { isDefault: true } });
  }
  return sender;
}

export async function listWhatsAppSenders(db: PrismaClient) {
  await ensureConfiguredWhatsAppSender(db);
  return db.whatsAppSender.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function resolveWhatsAppSender(db: PrismaClient, senderId?: string | null) {
  await ensureConfiguredWhatsAppSender(db);
  const sender = senderId
    ? await db.whatsAppSender.findFirst({
        where: { id: senderId, isActive: true, sendEnabled: true },
      })
    : await db.whatsAppSender.findFirst({
        where: { isDefault: true, isActive: true, sendEnabled: true },
      });
  if (!sender) {
    throw new WhatsAppSenderError(
      senderId
        ? 'O número remetente escolhido não está liberado para envios.'
        : 'Nenhum número remetente padrão está liberado para envios.',
      409,
    );
  }
  return sender;
}

export async function syncWhatsAppSenders(db: PrismaClient) {
  const config = requiredMetaConfig();
  const records = await fetchMetaPhoneNumbers(config);
  const configuredPhoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
  const syncedIds: string[] = [];

  for (const record of records) {
    if (!record.id) continue;
    syncedIds.push(record.id);
    const existing = await db.whatsAppSender.findUnique({ where: { phoneNumberId: record.id } });
    const status = normalizeSenderStatus(record, configuredPhoneNumberId);
    await db.whatsAppSender.upsert({
      where: { phoneNumberId: record.id },
      create: {
        phoneNumberId: record.id,
        wabaId: config.wabaId,
        displayPhoneNumber: record.display_phone_number ?? '',
        verifiedName: record.verified_name ?? '',
        internalName: record.verified_name || record.display_phone_number || 'Número do WhatsApp',
        status,
        qualityRating: record.quality_rating ?? 'UNKNOWN',
        codeVerificationStatus: record.code_verification_status ?? 'UNKNOWN',
        isDefault: record.id === configuredPhoneNumberId,
        isActive: true,
        sendEnabled: record.id === configuredPhoneNumberId,
        lastSyncedAt: new Date(),
      },
      update: {
        wabaId: config.wabaId,
        displayPhoneNumber: record.display_phone_number ?? '',
        verifiedName: record.verified_name ?? '',
        status,
        qualityRating: record.quality_rating ?? 'UNKNOWN',
        codeVerificationStatus: record.code_verification_status ?? 'UNKNOWN',
        isActive: true,
        lastSyncedAt: new Date(),
        ...(existing ? {} : { sendEnabled: record.id === configuredPhoneNumberId }),
      },
    });
  }

  if (syncedIds.length > 0) {
    await db.whatsAppSender.updateMany({
      where: { wabaId: config.wabaId, phoneNumberId: { notIn: syncedIds } },
      data: { isActive: false, sendEnabled: false, isDefault: false },
    });
  }
  await ensureConfiguredWhatsAppSender(db);
  return { synced: syncedIds.length, senders: await listWhatsAppSenders(db) };
}

export async function updateWhatsAppSender(
  db: PrismaClient,
  id: string,
  input: {
    internalName?: string;
    isDefault?: boolean;
    isActive?: boolean;
    sendEnabled?: boolean;
  },
) {
  const current = await db.whatsAppSender.findUnique({ where: { id } });
  if (!current) throw new WhatsAppSenderError('Número remetente não encontrado.', 404);

  return db.$transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx.whatsAppSender.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }
    const updated = await tx.whatsAppSender.update({
      where: { id },
      data: {
        ...(input.internalName !== undefined ? { internalName: input.internalName } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sendEnabled !== undefined ? { sendEnabled: input.sendEnabled } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.isDefault === true ? { isActive: true, sendEnabled: true } : {}),
        ...(input.isActive === false ? { isDefault: false, sendEnabled: false } : {}),
      },
    });
    if (updated.isDefault && updated.isActive && updated.sendEnabled) return updated;
    if (!current.isDefault) return updated;

    if (updated.isDefault) {
      await tx.whatsAppSender.update({ where: { id }, data: { isDefault: false } });
    }

    const replacement = await tx.whatsAppSender.findFirst({
      where: { id: { not: id }, isActive: true, sendEnabled: true },
      orderBy: { createdAt: 'asc' },
    });
    if (replacement) {
      await tx.whatsAppSender.update({
        where: { id: replacement.id },
        data: { isDefault: true },
      });
    }
    return updated;
  });
}

export function normalizeSenderStatus(
  record: MetaPhoneNumberRecord,
  configuredId?: string,
): string {
  if (record.id && record.id === configuredId) return 'CONNECTED';
  const status = record.status?.trim().toUpperCase();
  if (status) return status;
  return 'PENDING';
}

async function fetchMetaPhoneNumbers(config: {
  accessToken: string;
  wabaId: string;
  graphVersion: string;
}): Promise<MetaPhoneNumberRecord[]> {
  let next: string | undefined =
    `https://graph.facebook.com/${config.graphVersion}/${config.wabaId}/phone_numbers`;
  const records: MetaPhoneNumberRecord[] = [];
  for (let page = 0; next && page < 10; page += 1) {
    const response = await fetch(next, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json().catch(() => null)) as MetaPhoneNumbersResponse | null;
    if (!response.ok || !body) {
      throw new WhatsAppSenderError(
        body?.error?.message || 'Não foi possível sincronizar os números com a Meta.',
        response.status || 502,
      );
    }
    records.push(...(body.data ?? []));
    next = safeGraphNext(body.paging?.next);
  }
  return records;
}

function safeGraphNext(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'graph.facebook.com'
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
