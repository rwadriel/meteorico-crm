ALTER TABLE "integration_cursors"
  ALTER COLUMN "last_polled_at" DROP NOT NULL,
  ADD COLUMN "last_successful_snapshot_at" TIMESTAMP(3),
  ADD COLUMN "last_cursor_advance_at" TIMESTAMP(3),
  ADD COLUMN "provider_last_seq" INTEGER,
  ADD COLUMN "provider_connected" BOOLEAN,
  ADD COLUMN "last_provider_error" TEXT,
  ADD COLUMN "consecutive_failures" INTEGER NOT NULL DEFAULT 0;
