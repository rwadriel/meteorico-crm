import { MetaTemplateError } from './meta-template-error.js';

export interface TemplateHeaderImage {
  data: Uint8Array<ArrayBuffer>;
  mimeType: 'image/jpeg' | 'image/png';
  fileName: string;
}

interface UploadSessionResponse {
  id?: string;
  error?: { message?: string };
}

interface UploadHandleResponse {
  h?: string;
  error?: { message?: string };
}

export async function uploadTemplateHeaderSample(image: TemplateHeaderImage): Promise<string> {
  const token = requiredEnv('META_WHATSAPP_ACCESS_TOKEN');
  const appId = requiredEnv('META_APP_ID');
  const version = process.env.META_GRAPH_API_VERSION?.trim() || 'v26.0';
  const query = new URLSearchParams({
    file_length: String(image.data.length),
    file_type: image.mimeType,
    file_name: image.fileName,
  });
  const sessionResponse = await fetch(
    `https://graph.facebook.com/${version}/${appId}/uploads?${query}`,
    {
      method: 'POST',
      headers: { Authorization: `OAuth ${token}` },
      signal: AbortSignal.timeout(20_000),
    },
  );
  const session = (await sessionResponse.json().catch(() => null)) as UploadSessionResponse | null;
  if (!sessionResponse.ok || !session?.id) {
    throw new MetaTemplateError(
      session?.error?.message || 'A Meta não iniciou o upload da imagem do template.',
      sessionResponse.status || 502,
    );
  }

  const uploadResponse = await fetch(`https://graph.facebook.com/${version}/${session.id}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${token}`,
      file_offset: '0',
      'Content-Type': 'application/octet-stream',
    },
    body: image.data,
    signal: AbortSignal.timeout(30_000),
  });
  const uploaded = (await uploadResponse.json().catch(() => null)) as UploadHandleResponse | null;
  if (!uploadResponse.ok || !uploaded?.h) {
    throw new MetaTemplateError(
      uploaded?.error?.message || 'A Meta não concluiu o upload da imagem do template.',
      uploadResponse.status || 502,
    );
  }
  return uploaded.h;
}

export async function uploadWhatsAppImage(
  image: TemplateHeaderImage,
  phoneNumberId?: string,
): Promise<string> {
  const token = requiredEnv('META_WHATSAPP_ACCESS_TOKEN');
  const resolvedPhoneNumberId = phoneNumberId || requiredEnv('META_WHATSAPP_PHONE_NUMBER_ID');
  const version = process.env.META_GRAPH_API_VERSION?.trim() || 'v26.0';
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', new Blob([image.data], { type: image.mimeType }), image.fileName);
  const response = await fetch(
    `https://graph.facebook.com/${version}/${resolvedPhoneNumberId}/media`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    },
  );
  const result = (await response.json().catch(() => null)) as {
    id?: string;
    error?: { message?: string };
  } | null;
  if (!response.ok || !result?.id) {
    throw new Error(result?.error?.message || 'A Meta não recebeu a imagem da campanha.');
  }
  return result.id;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new MetaTemplateError(
      name === 'META_APP_ID'
        ? 'Configure META_APP_ID para enviar templates com imagem.'
        : 'A integração com a Meta não está configurada.',
      503,
    );
  }
  return value;
}
