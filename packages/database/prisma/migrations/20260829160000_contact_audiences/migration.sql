ALTER TABLE "imports" ADD COLUMN "audience_name" TEXT;
ALTER TABLE "followup_campaigns" ADD COLUMN "audience_list_id" TEXT;

CREATE TABLE "contact_lists" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "source_import_id" TEXT,
  "created_by" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_lists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contact_list_memberships" (
  "id" TEXT NOT NULL,
  "list_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_list_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_lists_source_import_id_key" ON "contact_lists"("source_import_id");
CREATE INDEX "contact_lists_is_active_created_at_idx" ON "contact_lists"("is_active", "created_at");
CREATE UNIQUE INDEX "contact_list_memberships_list_id_contact_id_key" ON "contact_list_memberships"("list_id", "contact_id");
CREATE INDEX "contact_list_memberships_contact_id_idx" ON "contact_list_memberships"("contact_id");
CREATE INDEX "followup_campaigns_audience_list_id_idx" ON "followup_campaigns"("audience_list_id");

ALTER TABLE "contact_lists" ADD CONSTRAINT "contact_lists_source_import_id_fkey"
  FOREIGN KEY ("source_import_id") REFERENCES "imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contact_list_memberships" ADD CONSTRAINT "contact_list_memberships_list_id_fkey"
  FOREIGN KEY ("list_id") REFERENCES "contact_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_list_memberships" ADD CONSTRAINT "contact_list_memberships_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "followup_campaigns" ADD CONSTRAINT "followup_campaigns_audience_list_id_fkey"
  FOREIGN KEY ("audience_list_id") REFERENCES "contact_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing completed contact imports become selectable audiences immediately.
INSERT INTO "contact_lists" ("id", "name", "source_import_id", "created_by", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  COALESCE(NULLIF(regexp_replace("filename", '\\.[^.]+$', ''), ''), 'Importação de contatos'),
  "id",
  "created_by",
  "created_at",
  CURRENT_TIMESTAMP
FROM "imports"
WHERE "type" = 'contacts' AND "status" = 'done';

UPDATE "imports" AS i
SET "audience_name" = l."name"
FROM "contact_lists" AS l
WHERE l."source_import_id" = i."id";

INSERT INTO "contact_list_memberships" ("id", "list_id", "contact_id", "created_at")
SELECT DISTINCT
  gen_random_uuid()::text,
  l."id",
  r."data"->>'_contactId',
  r."created_at"
FROM "import_rows" AS r
JOIN "contact_lists" AS l ON l."source_import_id" = r."import_id"
JOIN "contacts" AS c ON c."id" = r."data"->>'_contactId'
WHERE r."status" = 'success' AND r."data"->>'_contactId' IS NOT NULL
ON CONFLICT ("list_id", "contact_id") DO NOTHING;
