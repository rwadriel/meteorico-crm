ALTER TABLE "contacts"
  ADD COLUMN "phone_raw" TEXT,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'meteorico_grupo',
  ADD COLUMN "campaign_source" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "purchase_status" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "opt_out_at" TIMESTAMP(3);

UPDATE "contacts"
SET
  "phone_raw" = COALESCE("phone", "normalized_phone"),
  "purchase_status" = CASE
    WHEN "is_student" = TRUE OR "total_purchases" > 0 THEN 'purchased'
    ELSE 'unknown'
  END;

CREATE TABLE "followup_campaigns" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "template_name" TEXT NOT NULL,
  "template_language" TEXT NOT NULL DEFAULT 'pt_BR',
  "offer_url" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "total_contacts" INTEGER NOT NULL DEFAULT 0,
  "eligible_contacts" INTEGER NOT NULL DEFAULT 0,
  "queued_count" INTEGER NOT NULL DEFAULT 0,
  "submitted_count" INTEGER NOT NULL DEFAULT 0,
  "sent_count" INTEGER NOT NULL DEFAULT 0,
  "delivered_count" INTEGER NOT NULL DEFAULT 0,
  "read_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "replied_count" INTEGER NOT NULL DEFAULT 0,
  "opt_out_count" INTEGER NOT NULL DEFAULT 0,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "followup_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "followup_campaign_messages" (
  "id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "meta_message_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "error_code" TEXT,
  "error_message" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(3),
  "submitted_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "read_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "replied_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "followup_campaign_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "followup_campaign_messages_meta_message_id_key"
  ON "followup_campaign_messages"("meta_message_id");
CREATE UNIQUE INDEX "followup_campaign_messages_campaign_id_contact_id_key"
  ON "followup_campaign_messages"("campaign_id", "contact_id");
CREATE INDEX "followup_campaigns_status_created_at_idx"
  ON "followup_campaigns"("status", "created_at");
CREATE INDEX "followup_campaign_messages_campaign_id_status_next_attempt_at_idx"
  ON "followup_campaign_messages"("campaign_id", "status", "next_attempt_at");
CREATE INDEX "followup_campaign_messages_contact_id_created_at_idx"
  ON "followup_campaign_messages"("contact_id", "created_at");

ALTER TABLE "followup_campaigns"
  ADD CONSTRAINT "followup_campaigns_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "followup_campaign_messages"
  ADD CONSTRAINT "followup_campaign_messages_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "followup_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "followup_campaign_messages"
  ADD CONSTRAINT "followup_campaign_messages_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
