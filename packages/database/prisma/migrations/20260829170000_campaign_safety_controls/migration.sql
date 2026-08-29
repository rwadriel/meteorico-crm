ALTER TABLE "followup_campaigns"
  ADD COLUMN "scheduled_at" TIMESTAMP(3),
  ADD COLUMN "batch_size" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "batch_interval_seconds" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "cooldown_days" INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN "cancelled_at" TIMESTAMP(3);

ALTER TABLE "contact_preferences"
  ADD COLUMN "opted_in_at" TIMESTAMP(3),
  ADD COLUMN "opt_in_source" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "opt_in_categories" JSONB;

ALTER TABLE "imports"
  ADD COLUMN "consent_source" TEXT,
  ADD COLUMN "consent_at" TIMESTAMP(3);
