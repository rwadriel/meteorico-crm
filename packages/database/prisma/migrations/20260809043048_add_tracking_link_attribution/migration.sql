-- AlterTable
ALTER TABLE "redirect_links" ADD COLUMN     "creative_id" TEXT,
ADD COLUMN     "meta_ad_id" TEXT,
ADD COLUMN     "meta_adset_id" TEXT,
ADD COLUMN     "meta_campaign_id" TEXT,
ADD COLUMN     "placement" TEXT;

-- AlterTable
ALTER TABLE "tracking_clicks" ADD COLUMN     "link_id" TEXT;

-- CreateIndex
CREATE INDEX "tracking_clicks_link_id_idx" ON "tracking_clicks"("link_id");

-- AddForeignKey
ALTER TABLE "tracking_clicks" ADD CONSTRAINT "tracking_clicks_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "redirect_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;
