CREATE TABLE "whatsapp_senders" (
    "id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "waba_id" TEXT NOT NULL,
    "display_phone_number" TEXT NOT NULL DEFAULT '',
    "verified_name" TEXT NOT NULL DEFAULT '',
    "internal_name" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "quality_rating" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "code_verification_status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "send_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_senders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_senders_phone_number_id_key" ON "whatsapp_senders"("phone_number_id");
CREATE INDEX "whatsapp_senders_is_active_send_enabled_idx" ON "whatsapp_senders"("is_active", "send_enabled");
CREATE INDEX "whatsapp_senders_waba_id_idx" ON "whatsapp_senders"("waba_id");

ALTER TABLE "followup_campaigns" ADD COLUMN "sender_id" TEXT;
CREATE INDEX "followup_campaigns_sender_id_idx" ON "followup_campaigns"("sender_id");
ALTER TABLE "followup_campaigns"
ADD CONSTRAINT "followup_campaigns_sender_id_fkey"
FOREIGN KEY ("sender_id") REFERENCES "whatsapp_senders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
