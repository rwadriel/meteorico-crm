-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "edition_number" INTEGER;

-- AlterTable
ALTER TABLE "groups" ADD COLUMN "invite_link" TEXT,
ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_edition_number_key" ON "campaigns"("edition_number");
