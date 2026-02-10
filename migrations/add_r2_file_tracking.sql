-- Migration: Add R2 File Tracking Tables
-- This migration creates tables for tracking R2 bucket files

-- Create R2FileMetadata table for tracking file metadata
CREATE TABLE IF NOT EXISTS "R2FileMetadata" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "fileKey" VARCHAR(500) NOT NULL UNIQUE,
    "fileName" VARCHAR(255) NOT NULL,
    "fileType" VARCHAR(50) NOT NULL,
    "fileSize" BIGINT NOT NULL DEFAULT 0,
    "userId" UUID NOT NULL,
    "folderPath" VARCHAR(500) NOT NULL,
    "contentType" VARCHAR(100),
    "metadata" JSONB DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "lastAccessedAt" TIMESTAMP WITH TIME ZONE,
    
    -- Indexes
    CONSTRAINT "fk_user" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Create index on userId for faster lookups
CREATE INDEX IF NOT EXISTS "idx_R2FileMetadata_userId" ON "R2FileMetadata"("userId");

-- Create index on fileKey for faster lookups
CREATE INDEX IF NOT EXISTS "idx_R2FileMetadata_fileKey" ON "R2FileMetadata"("fileKey");

-- Create index on folderPath for faster lookups
CREATE INDEX IF NOT EXISTS "idx_R2FileMetadata_folderPath" ON "R2FileMetadata"("folderPath");

-- Create index on isActive for filtering
CREATE INDEX IF NOT EXISTS "idx_R2FileMetadata_isActive" ON "R2FileMetadata"("isActive");

-- Create index on createdAt for sorting and age-based queries
CREATE INDEX IF NOT EXISTS "idx_R2FileMetadata_createdAt" ON "R2FileMetadata"("createdAt" DESC);

-- Create index on fileType for grouping
CREATE INDEX IF NOT EXISTS "idx_R2FileMetadata_fileType" ON "R2FileMetadata"("fileType");

-- Create R2AuditLog table for tracking R2 operations
CREATE TABLE IF NOT EXISTS "R2AuditLog" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "details" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Indexes
    CONSTRAINT "fk_audit_user" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Create index on userId for user audit lookups
CREATE INDEX IF NOT EXISTS "idx_R2AuditLog_userId" ON "R2AuditLog"("userId");

-- Create index on action for filtering
CREATE INDEX IF NOT EXISTS "idx_R2AuditLog_action" ON "R2AuditLog"("action");

-- Create index on createdAt for time-based queries
CREATE INDEX IF NOT EXISTS "idx_R2AuditLog_createdAt" ON "R2AuditLog"("createdAt" DESC);

-- Add comments for documentation
COMMENT ON TABLE "R2FileMetadata" IS 'Stores metadata for files stored in Cloudflare R2';
COMMENT ON TABLE "R2AuditLog" IS 'Audit log for R2 storage operations';

COMMENT ON COLUMN "R2FileMetadata"."fileKey" IS 'Full path/key of the file in R2 bucket';
COMMENT ON COLUMN "R2FileMetadata"."fileName" IS 'Original filename without path';
COMMENT ON COLUMN "R2FileMetadata"."fileType" IS 'Type category (mockups, assets, exports, profile-pictures)';
COMMENT ON COLUMN "R2FileMetadata"."fileSize" IS 'File size in bytes';
COMMENT ON COLUMN "R2FileMetadata"."folderPath" IS 'Folder path without the filename';
COMMENT ON COLUMN "R2FileMetadata"."isActive" IS 'Soft delete flag - false means file is deleted';

COMMENT ON COLUMN "R2AuditLog"."action" IS 'Action type: CLEANUP, DELETE_FILE, BATCH_DELETE, UPLOAD';
