-- AlterTable
ALTER TABLE "User" ADD COLUMN     "maxSavedDesigns" INTEGER;

-- CreateTable
CREATE TABLE "GeneralSetting" (
    "id" TEXT NOT NULL,
    "defaultMaxSavedDesigns" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneralSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedDesign_userId_updatedAt_idx" ON "SavedDesign"("userId", "updatedAt");
