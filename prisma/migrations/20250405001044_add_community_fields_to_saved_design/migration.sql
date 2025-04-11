-- AlterTable
ALTER TABLE "SavedDesign" ADD COLUMN     "description" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "SavedDesign_tags_idx" ON "SavedDesign"("tags");
