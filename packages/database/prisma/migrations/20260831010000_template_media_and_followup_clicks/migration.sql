ALTER TABLE "message_template_versions"
  ADD COLUMN "header_format" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "header_mime_type" TEXT,
  ADD COLUMN "header_file_name" TEXT,
  ADD COLUMN "header_data" BYTEA;

ALTER TABLE "followup_campaigns"
  ADD COLUMN "click_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "unique_click_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "header_media_id" TEXT;

ALTER TABLE "followup_campaign_messages"
  ADD COLUMN "tracking_code" TEXT,
  ADD COLUMN "click_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "clicked_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "followup_campaign_messages_tracking_code_key"
  ON "followup_campaign_messages"("tracking_code");
CREATE INDEX "followup_campaign_messages_campaign_id_clicked_at_idx"
  ON "followup_campaign_messages"("campaign_id", "clicked_at");
