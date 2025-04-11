-- AlterTable
ALTER TABLE "SavedDesign" ADD COLUMN     "isShared" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "SavedDesign_userId_isShared_idx" ON "SavedDesign"("userId", "isShared");
