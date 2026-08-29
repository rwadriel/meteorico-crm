ALTER TABLE "followup_campaigns"
ADD COLUMN "template_parameters" JSONB;

ALTER TABLE "message_templates"
ADD COLUMN "label" TEXT NOT NULL DEFAULT '',
ADD COLUMN "language" TEXT NOT NULL DEFAULT 'pt_BR',
ADD COLUMN "requested_category" TEXT NOT NULL DEFAULT '',
ADD COLUMN "meta_category" TEXT,
ADD COLUMN "meta_status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "meta_template_id" TEXT,
ADD COLUMN "meta_rejected_reason" TEXT,
ADD COLUMN "meta_quality_rating" TEXT,
ADD COLUMN "allow_category_change" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "submitted_at" TIMESTAMP(3),
ADD COLUMN "meta_synced_at" TIMESTAMP(3);

ALTER TABLE "message_template_versions"
ADD COLUMN "footer" TEXT NOT NULL DEFAULT '',
ADD COLUMN "components" JSONB,
ADD COLUMN "example_values" JSONB;

CREATE UNIQUE INDEX "message_templates_meta_template_id_key"
ON "message_templates"("meta_template_id");

CREATE INDEX "message_templates_name_language_idx"
ON "message_templates"("name", "language");

CREATE INDEX "message_templates_meta_status_language_idx"
ON "message_templates"("meta_status", "language");
