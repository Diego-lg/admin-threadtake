-- CreateEnum
CREATE TYPE "DesignStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED');

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_colorId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_sizeId_fkey";

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "sizeId" DROP NOT NULL,
ALTER COLUMN "colorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SavedDesign" ADD COLUMN     "designFolderKey" TEXT,
ADD COLUMN     "designId" TEXT,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "mockupFolderKey" TEXT,
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "DesignStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hasCompletedProfileSetup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "profilePicturePath" TEXT;

-- CreateTable
CREATE TABLE "FrontendConfig" (
    "id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FrontendConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "R2AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "R2AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "identifier" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetTime" TIMESTAMP(3) NOT NULL,
    "lastAccess" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("identifier")
);

-- CreateIndex
CREATE UNIQUE INDEX "FrontendConfig_section_key" ON "FrontendConfig"("section");

-- CreateIndex
CREATE INDEX "R2AuditLog_userId_idx" ON "R2AuditLog"("userId");

-- CreateIndex
CREATE INDEX "R2AuditLog_action_idx" ON "R2AuditLog"("action");

-- CreateIndex
CREATE INDEX "R2AuditLog_createdAt_idx" ON "R2AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "RateLimit_identifier_idx" ON "RateLimit"("identifier");

-- CreateIndex
CREATE INDEX "RateLimit_resetTime_idx" ON "RateLimit"("resetTime");

-- CreateIndex
CREATE INDEX "SavedDesign_designId_idx" ON "SavedDesign"("designId");

-- CreateIndex
CREATE INDEX "SavedDesign_designFolderKey_idx" ON "SavedDesign"("designFolderKey");

-- CreateIndex
CREATE INDEX "SavedDesign_status_idx" ON "SavedDesign"("status");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "Size"("id") ON DELETE SET NULL ON UPDATE CASCADE;
