-- Migration: Comprehensive Baseline for Existing Tables
-- Date: 2025-10-07
-- Description: Baseline migration to track all existing tables and columns that were created outside of Prisma
-- This migration marks existing structures as already created to resolve drift detection

-- Create the MockupJob table if it doesn't exist (for safety)
CREATE TABLE IF NOT EXISTS "MockupJob" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "canvasImageUrl" TEXT,
    "productId" TEXT,
    "colorId" TEXT,
    "sizeId" TEXT,
    "description" TEXT,
    "customText" TEXT,
    "shirtColorHex" TEXT,
    "isLogoMode" BOOLEAN,
    "logoScale" DOUBLE PRECISION,
    "logoOffsetX" DOUBLE PRECISION,
    "logoOffsetY" DOUBLE PRECISION,
    "logoTargetPart" TEXT,
    "uploadedLogoUrl" TEXT,
    "uploadedPatternUrl" TEXT,
    "mockupResults" JSONB,
    "error" TEXT,
    "designId" TEXT,
    "estimatedTimeRemaining" INTEGER,
    "mockupKeys" JSONB,
    "migrationStatus" TEXT NOT NULL DEFAULT 'pending',
    "migratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockupJob_pkey" PRIMARY KEY ("id")
);

-- Create indexes for MockupJob if they don't exist (for safety)
CREATE INDEX IF NOT EXISTS "MockupJob_userId_idx" ON "MockupJob"("userId");
CREATE INDEX IF NOT EXISTS "MockupJob_status_idx" ON "MockupJob"("status");
CREATE INDEX IF NOT EXISTS "MockupJob_createdAt_idx" ON "MockupJob"("createdAt");
CREATE INDEX IF NOT EXISTS "MockupJob_userId_status_idx" ON "MockupJob"("userId", "status");
CREATE INDEX IF NOT EXISTS "MockupJob_designId_idx" ON "MockupJob"("designId");
CREATE INDEX IF NOT EXISTS "MockupJob_migrationStatus_idx" ON "MockupJob"("migrationStatus");
CREATE INDEX IF NOT EXISTS "MockupJob_canvasImageUrl_idx" ON "MockupJob"("canvasImageUrl");

-- Add foreign key constraint if it doesn't exist (for safety)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'MockupJob_userId_fkey' 
        AND table_name = 'MockupJob'
    ) THEN
        ALTER TABLE "MockupJob" ADD CONSTRAINT "MockupJob_userId_fkey" 
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Add R2 storage fields to User table if they don't exist
DO $$
BEGIN
    -- Check and add profilePictureKey
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'profilePictureKey') THEN
        ALTER TABLE "User" ADD COLUMN "profilePictureKey" TEXT;
    END IF;
    
    -- Check and add profilePictureHistory
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'profilePictureHistory') THEN
        ALTER TABLE "User" ADD COLUMN "profilePictureHistory" TEXT[] DEFAULT ARRAY[]::TEXT[];
    END IF;
    
    -- Check and add r2FolderCreated
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'r2FolderCreated') THEN
        ALTER TABLE "User" ADD COLUMN "r2FolderCreated" BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
    
    -- Check and add storageUsageBytes
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'storageUsageBytes') THEN
        ALTER TABLE "User" ADD COLUMN "storageUsageBytes" BIGINT NOT NULL DEFAULT 0;
    END IF;
END $$;

-- Add R2 storage fields to SavedDesign table if they don't exist
DO $$
BEGIN
    -- Check and add designImageKey
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SavedDesign' AND column_name = 'designImageKey') THEN
        ALTER TABLE "SavedDesign" ADD COLUMN "designImageKey" TEXT;
    END IF;
    
    -- Check and add mockupImageKey
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SavedDesign' AND column_name = 'mockupImageKey') THEN
        ALTER TABLE "SavedDesign" ADD COLUMN "mockupImageKey" TEXT;
    END IF;
    
    -- Check and add uploadedLogoKey
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SavedDesign' AND column_name = 'uploadedLogoKey') THEN
        ALTER TABLE "SavedDesign" ADD COLUMN "uploadedLogoKey" TEXT;
    END IF;
    
    -- Check and add uploadedPatternKey
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SavedDesign' AND column_name = 'uploadedPatternKey') THEN
        ALTER TABLE "SavedDesign" ADD COLUMN "uploadedPatternKey" TEXT;
    END IF;
    
    -- Check and add assetKeys
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SavedDesign' AND column_name = 'assetKeys') THEN
        ALTER TABLE "SavedDesign" ADD COLUMN "assetKeys" JSONB;
    END IF;
    
    -- Check and add mockupKeys
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SavedDesign' AND column_name = 'mockupKeys') THEN
        ALTER TABLE "SavedDesign" ADD COLUMN "mockupKeys" JSONB;
    END IF;
    
    -- Check and add migrationStatus
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SavedDesign' AND column_name = 'migrationStatus') THEN
        ALTER TABLE "SavedDesign" ADD COLUMN "migrationStatus" TEXT NOT NULL DEFAULT 'pending';
    END IF;
    
    -- Check and add migratedAt
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SavedDesign' AND column_name = 'migratedAt') THEN
        ALTER TABLE "SavedDesign" ADD COLUMN "migratedAt" TIMESTAMP(3);
    END IF;
END $$;

-- Create additional R2 related tables if they don't exist
CREATE TABLE IF NOT EXISTS "UserFileMetadata" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "contentType" TEXT,
    "folderPath" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT FALSE,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFileMetadata_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "R2MigrationLog" (
    "id" TEXT NOT NULL,
    "migrationType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "processedRecords" INTEGER NOT NULL DEFAULT 0,
    "failedRecords" INTEGER NOT NULL DEFAULT 0,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "R2MigrationLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "R2FileMetadata" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL DEFAULT 0,
    "contentType" TEXT,
    "folderPath" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT FALSE,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "oldPath" TEXT,
    "migrationStatus" TEXT NOT NULL DEFAULT 'pending',
    "checksum" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "R2FileMetadata_pkey" PRIMARY KEY ("id")
);

-- Create indexes for new tables if they don't exist
CREATE INDEX IF NOT EXISTS "UserFileMetadata_userId_idx" ON "UserFileMetadata"("userId");
CREATE INDEX IF NOT EXISTS "UserFileMetadata_fileType_idx" ON "UserFileMetadata"("fileType");
CREATE INDEX IF NOT EXISTS "UserFileMetadata_folderPath_idx" ON "UserFileMetadata"("folderPath");
CREATE INDEX IF NOT EXISTS "UserFileMetadata_createdAt_idx" ON "UserFileMetadata"("createdAt");
CREATE INDEX IF NOT EXISTS "UserFileMetadata_fileKey_idx" ON "UserFileMetadata"("fileKey");

CREATE INDEX IF NOT EXISTS "R2MigrationLog_migrationType_idx" ON "R2MigrationLog"("migrationType");
CREATE INDEX IF NOT EXISTS "R2MigrationLog_status_idx" ON "R2MigrationLog"("status");
CREATE INDEX IF NOT EXISTS "R2MigrationLog_startTime_idx" ON "R2MigrationLog"("startTime");
CREATE INDEX IF NOT EXISTS "R2MigrationLog_userId_idx" ON "R2MigrationLog"("userId");

CREATE INDEX IF NOT EXISTS "R2FileMetadata_userId_idx" ON "R2FileMetadata"("userId");
CREATE INDEX IF NOT EXISTS "R2FileMetadata_fileType_idx" ON "R2FileMetadata"("fileType");
CREATE INDEX IF NOT EXISTS "R2FileMetadata_folderPath_idx" ON "R2FileMetadata"("folderPath");
CREATE INDEX IF NOT EXISTS "R2FileMetadata_fileKey_idx" ON "R2FileMetadata"("fileKey");
CREATE INDEX IF NOT EXISTS "R2FileMetadata_migrationStatus_idx" ON "R2FileMetadata"("migrationStatus");
CREATE INDEX IF NOT EXISTS "R2FileMetadata_createdAt_idx" ON "R2FileMetadata"("createdAt");
CREATE INDEX IF NOT EXISTS "R2FileMetadata_isPublic_idx" ON "R2FileMetadata"("isPublic");

-- Create indexes for R2 storage fields if they don't exist
CREATE INDEX IF NOT EXISTS "User_profilePictureKey_idx" ON "User"("profilePictureKey");
CREATE INDEX IF NOT EXISTS "User_r2FolderCreated_idx" ON "User"("r2FolderCreated");
CREATE INDEX IF NOT EXISTS "User_storageUsageBytes_idx" ON "User"("storageUsageBytes");

CREATE INDEX IF NOT EXISTS "SavedDesign_designImageKey_idx" ON "SavedDesign"("designImageKey");
CREATE INDEX IF NOT EXISTS "SavedDesign_mockupImageKey_idx" ON "SavedDesign"("mockupImageKey");
CREATE INDEX IF NOT EXISTS "SavedDesign_uploadedLogoKey_idx" ON "SavedDesign"("uploadedLogoKey");
CREATE INDEX IF NOT EXISTS "SavedDesign_uploadedPatternKey_idx" ON "SavedDesign"("uploadedPatternKey");
CREATE INDEX IF NOT EXISTS "SavedDesign_migrationStatus_idx" ON "SavedDesign"("migrationStatus");

-- Add foreign key constraints for new tables if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'UserFileMetadata_userId_fkey' 
        AND table_name = 'UserFileMetadata'
    ) THEN
        ALTER TABLE "UserFileMetadata" ADD CONSTRAINT "UserFileMetadata_userId_fkey" 
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'R2MigrationLog_userId_fkey' 
        AND table_name = 'R2MigrationLog'
    ) THEN
        ALTER TABLE "R2MigrationLog" ADD CONSTRAINT "R2MigrationLog_userId_fkey" 
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'R2FileMetadata_userId_fkey' 
        AND table_name = 'R2FileMetadata'
    ) THEN
        ALTER TABLE "R2FileMetadata" ADD CONSTRAINT "R2FileMetadata_userId_fkey" 
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;