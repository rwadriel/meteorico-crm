import type { PrismaClient } from '@meteorico/database';

export interface EduzzWebhookPayload {
  event: string;
  data: {
    sale_id: string;
    product_id: string;
    product_name: string;
    buyer_email: string;
    buyer_phone: string;
    amount_cents: number;
    currency: string;
    status: string;
    created_at: string;
    refund_reason?: string;
  };
  signature: string;
}

export interface EduzzProvider {
  name: string;
  verifySignature(payload: unknown, signature: string): boolean;
}

export class MockEduzzProvider implements EduzzProvider {
  name = 'eduzz-mock';

  verifySignature(_payload: unknown, _signature: string): boolean {
    return true;
  }
}

export async function handleEduzzWebhook(
  db: PrismaClient,
  provider: EduzzProvider,
  payload: EduzzWebhookPayload,
): Promise<{ processed: boolean; action: string }> {
  if (!provider.verifySignature(payload.data, payload.signature)) {
    throw new Error('Invalid signature');
  }

  const existing = await db.processedEvent.findUnique({
    where: {
      eventSource_externalEventId: {
        eventSource: 'eduzz',
        externalEventId: `${payload.event}:${payload.data.sale_id}`,
      },
    },
  });

  if (existing) {
    return { processed: false, action: 'duplicate' };
  }

  const phone = normalizeEduzzPhone(payload.data.buyer_phone);

  let contact = phone
    ? await db.contact.findUnique({ where: { phone } })
    : null;

  if (!contact && phone) {
    contact = await db.contact.create({
      data: {
        phone,
        normalizedPhone: phone,
        name: '',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
  }

  let action = 'unknown';

  switch (payload.event) {
    case 'purchase_completed': {
      if (!contact) break;
      await db.purchase.create({
        data: {
          contactId: contact.id,
          externalId: payload.data.sale_id,
          platform: 'eduzz',
          productId: payload.data.product_id,
          productName: payload.data.product_name,
          amountCents: payload.data.amount_cents,
          currency: payload.data.currency || 'BRL',
          purchasedAt: new Date(payload.data.created_at),
        },
      });

      await db.contact.update({
        where: { id: contact.id },
        data: {
          isStudent: true,
          totalPurchases: { increment: 1 },
        },
      });

      await db.studentStatus.create({
        data: {
          contactId: contact.id,
          status: 'active',
          productId: payload.data.product_id,
          changedAt: new Date(),
        },
      });

      action = 'purchase_created';
      break;
    }

    case 'purchase_refunded': {
      const purchase = await db.purchase.findUnique({
        where: {
          platform_externalId: {
            platform: 'eduzz',
            externalId: payload.data.sale_id,
          },
        },
      });

      if (purchase) {
        await db.refund.create({
          data: {
            purchaseId: purchase.id,
            externalId: `refund-${payload.data.sale_id}`,
            reason: payload.data.refund_reason ?? '',
            refundedAt: new Date(),
          },
        });
        action = 'refund_created';
      }
      break;
    }

    case 'subscription_cancelled': {
      if (!contact) break;
      await db.studentStatus.create({
        data: {
          contactId: contact.id,
          status: 'cancelled',
          productId: payload.data.product_id,
          changedAt: new Date(),
        },
      });
      action = 'subscription_cancelled';
      break;
    }

    default:
      action = 'unknown_event';
  }

  await db.processedEvent.create({
    data: {
      eventSource: 'eduzz',
      externalEventId: `${payload.event}:${payload.data.sale_id}`,
      eventType: payload.event,
      result: action,
    },
  });

  return { processed: true, action };
}

function normalizeEduzzPhone(phone: string | undefined | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length < 10) return null;
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}
