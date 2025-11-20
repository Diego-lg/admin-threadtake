-- Migration: Update User Storage Paths for R2 User-Centric Structure
-- Version: 1.0.0
-- Date: 2025-10-07
-- Description: Adds new fields to support user-centric R2 storage structure
-- Migration Strategy: Phase 1 - Add new fields without removing old ones

-- Start transaction
BEGIN;

-- Add new fields to User model for profile picture tracking
ALTER TABLE "User" 
ADD COLUMN "profilePictureKey" TEXT,
ADD COLUMN "profilePictureHistory" TEXT[], -- Array of previous profile picture keys
ADD COLUMN "r2FolderCreated" BOOLEAN DEFAULT FALSE,
ADD COLUMN "storageUsageBytes" BIGINT DEFAULT 0;

-- Add index for profile picture key
CREATE INDEX "User_profilePictureKey_idx" ON "User"("profilePictureKey");

-- Add new fields to SavedDesign model for new path formats
ALTER TABLE "SavedDesign" 
ADD COLUMN "designImageKey" TEXT,
ADD COLUMN "mockupImageKey" TEXT,
ADD COLUMN "uploadedLogoKey" TEXT,
ADD COLUMN "uploadedPatternKey" TEXT,
ADD COLUMN "assetKeys" JSONB, -- Multiple asset keys stored as JSON
ADD COLUMN "mockupKeys" JSONB, -- Multiple mockup keys stored as JSON
ADD COLUMN "migrationStatus" VARCHAR(20) DEFAULT 'pending', -- Track migration status
ADD COLUMN "migratedAt" TIMESTAMP;

-- Add indexes for SavedDesign new fields
CREATE INDEX "SavedDesign_designImageKey_idx" ON "SavedDesign"("designImageKey");
CREATE INDEX "SavedDesign_mockupImageKey_idx" ON "SavedDesign"("mockupImageKey");
CREATE INDEX "SavedDesign_uploadedLogoKey_idx" ON "SavedDesign"("uploadedLogoKey");
CREATE INDEX "SavedDesign_uploadedPatternKey_idx" ON "SavedDesign"("uploadedPatternKey");
CREATE INDEX "SavedDesign_migrationStatus_idx" ON "SavedDesign"("migrationStatus");

-- Add new fields to MockupJob model for mockup paths
ALTER TABLE "MockupJob" 
ADD COLUMN "mockupKeys" JSONB, -- Multiple mockup output keys
ADD COLUMN "migrationStatus" VARCHAR(20) DEFAULT 'pending',
ADD COLUMN "migratedAt" TIMESTAMP;

-- Add indexes for MockupJob new fields
CREATE INDEX "MockupJob_migrationStatus_idx" ON "MockupJob"("migrationStatus");

-- Create new table: R2MigrationLog
CREATE TABLE "R2MigrationLog" (
    "id" TEXT NOT NULL,
    "migrationType" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "processedRecords" INTEGER NOT NULL DEFAULT 0,
    "failedRecords" INTEGER NOT NULL DEFAULT 0,
    "startTime" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "R2MigrationLog_pkey" PRIMARY KEY ("id")
);

-- Add indexes for R2MigrationLog
CREATE INDEX "R2MigrationLog_migrationType_idx" ON "R2MigrationLog"("migrationType");
CREATE INDEX "R2MigrationLog_status_idx" ON "R2MigrationLog"("status");
CREATE INDEX "R2MigrationLog_startTime_idx" ON "R2MigrationLog"("startTime");

-- Create new table: R2FileMetadata
CREATE TABLE "R2FileMetadata" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" VARCHAR(50) NOT NULL,
    "fileSize" BIGINT NOT NULL DEFAULT 0,
    "contentType" VARCHAR(100),
    "folderPath" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT FALSE,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "oldPath" TEXT, -- Reference to old path format for migration tracking
    "migrationStatus" VARCHAR(20) DEFAULT 'pending',
    "checksum" VARCHAR(64), -- SHA-256 checksum for file integrity
    "metadata" JSONB,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "R2FileMetadata_pkey" PRIMARY KEY ("id")
);

-- Add indexes for R2FileMetadata
CREATE INDEX "R2FileMetadata_userId_idx" ON "R2FileMetadata"("userId");
CREATE INDEX "R2FileMetadata_fileType_idx" ON "R2FileMetadata"("fileType");
CREATE INDEX "R2FileMetadata_folderPath_idx" ON "R2FileMetadata"("folderPath");
CREATE INDEX "R2FileMetadata_fileKey_idx" ON "R2FileMetadata"("fileKey");
CREATE INDEX "R2FileMetadata_migrationStatus_idx" ON "R2FileMetadata"("migrationStatus");
CREATE INDEX "R2FileMetadata_createdAt_idx" ON "R2FileMetadata"("createdAt");

-- Add foreign key constraint for R2FileMetadata.userId
ALTER TABLE "R2FileMetadata" ADD CONSTRAINT "R2FileMetadata_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create migration trigger function for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updating timestamps
CREATE TRIGGER "R2MigrationLog_updated_at" BEFORE UPDATE ON "R2MigrationLog" 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER "R2FileMetadata_updated_at" BEFORE UPDATE ON "R2FileMetadata" 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create view for user storage statistics
CREATE OR REPLACE VIEW "UserStorageStats" AS
SELECT 
    u."id" as "userId",
    u."email",
    u."storageUsageBytes",
    COALESCE(profile_pictures.count, 0) as "profilePictureCount",
    COALESCE(mockups.count, 0) as "mockupCount",
    COALESCE(assets.count, 0) as "assetCount",
    COALESCE(exports.count, 0) as "exportCount",
    COALESCE(all_files.total_size, 0) as "totalFileSize",
    COALESCE(all_files.total_count, 0) as "totalFileCount"
FROM "User" u
LEFT JOIN (
    SELECT "userId", COUNT(*) as count, SUM("fileSize") as total_size
    FROM "R2FileMetadata" 
    WHERE "fileType" = 'profile-pictures'
    GROUP BY "userId"
) profile_pictures ON u."id" = profile_pictures."userId"
LEFT JOIN (
    SELECT "userId", COUNT(*) as count, SUM("fileSize") as total_size
    FROM "R2FileMetadata" 
    WHERE "fileType" = 'mockups'
    GROUP BY "userId"
) mockups ON u."id" = mockups."userId"
LEFT JOIN (
    SELECT "userId", COUNT(*) as count, SUM("fileSize") as total_size
    FROM "R2FileMetadata" 
    WHERE "fileType" = 'assets'
    GROUP BY "userId"
) assets ON u."id" = assets."userId"
LEFT JOIN (
    SELECT "userId", COUNT(*) as count, SUM("fileSize") as total_size
    FROM "R2FileMetadata" 
    WHERE "fileType" = 'exports'
    GROUP BY "userId"
) exports ON u."id" = exports."userId"
LEFT JOIN (
    SELECT "userId", COUNT(*) as count, SUM("fileSize") as total_size
    FROM "R2FileMetadata"
    GROUP BY "userId"
) all_files ON u."id" = all_files."userId";

-- Create function to update user storage usage
CREATE OR REPLACE FUNCTION update_user_storage_usage(user_id TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE "User" 
    SET "storageUsageBytes" = (
        SELECT COALESCE(SUM("fileSize"), 0)
        FROM "R2FileMetadata"
        WHERE "userId" = user_id
    )
    WHERE "id" = user_id;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update storage usage when file metadata changes
CREATE OR REPLACE FUNCTION trigger_update_storage_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        PERFORM update_user_storage_usage(NEW."userId");
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM update_user_storage_usage(OLD."userId");
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for automatic storage usage updates
CREATE TRIGGER "R2FileMetadata_storage_usage" 
    AFTER INSERT OR UPDATE OR DELETE ON "R2FileMetadata"
    FOR EACH ROW EXECUTE FUNCTION trigger_update_storage_usage();

-- Create function to get migration progress
CREATE OR REPLACE FUNCTION get_migration_progress(migration_type VARCHAR(50))
RETURNS TABLE(
    "totalRecords" INTEGER,
    "processedRecords" INTEGER,
    "failedRecords" INTEGER,
    "progressPercentage" DECIMAL(5,2),
    "status" VARCHAR(20),
    "startTime" TIMESTAMP,
    "endTime" TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ml."totalRecords",
        ml."processedRecords",
        ml."failedRecords",
        CASE 
            WHEN ml."totalRecords" = 0 THEN 0
            ELSE ROUND((ml."processedRecords"::DECIMAL / ml."totalRecords"::DECIMAL) * 100, 2)
        END as "progressPercentage",
        ml."status",
        ml."startTime",
        ml."endTime"
    FROM "R2MigrationLog" ml
    WHERE ml."migrationType" = migration_type
    ORDER BY ml."startTime" DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Create function to cleanup old migration logs (keep last 10 per type)
CREATE OR REPLACE FUNCTION cleanup_migration_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH ranked_logs AS (
        SELECT id,
            ROW_NUMBER() OVER (PARTITION BY "migrationType" ORDER BY "startTime" DESC) as rn
        FROM "R2MigrationLog"
    )
    DELETE FROM "R2MigrationLog"
    WHERE id IN (SELECT id FROM ranked_logs WHERE rn > 10);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to validate file metadata integrity
CREATE OR REPLACE FUNCTION validate_file_metadata_integrity()
RETURNS TABLE(
    "fileId" TEXT,
    "userId" TEXT,
    "issues" TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fm."id" as "fileId",
        fm."userId" as "userId",
        ARRAY[
            CASE WHEN fm."fileKey" IS NULL OR fm."fileKey" = '' THEN 'Missing file key' ELSE NULL END,
            CASE WHEN fm."userId" IS NULL OR fm."userId" = '' THEN 'Missing user ID' ELSE NULL END,
            CASE WHEN fm."fileName" IS NULL OR fm."fileName" = '' THEN 'Missing file name' ELSE NULL END,
            CASE WHEN fm."fileSize" < 0 THEN 'Invalid file size' ELSE NULL END,
            CASE WHEN fm."folderPath" IS NULL OR fm."folderPath" = '' THEN 'Missing folder path' ELSE NULL END,
            CASE WHEN NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = fm."userId") THEN 'Invalid user ID' ELSE NULL END
        ] FILTER (WHERE element IS NOT NULL) as "issues"
    FROM "R2FileMetadata" fm
    WHERE fm."fileKey" IS NULL OR fm."fileKey" = ''
       OR fm."userId" IS NULL OR fm."userId" = ''
       OR fm."fileName" IS NULL OR fm."fileName" = ''
       OR fm."fileSize" < 0
       OR fm."folderPath" IS NULL OR fm."folderPath" = ''
       OR NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = fm."userId");
END;
$$ LANGUAGE plpgsql;

-- Create initial migration log entry
INSERT INTO "R2MigrationLog" (
    "id",
    "migrationType",
    "status",
    "totalRecords",
    "metadata"
) VALUES (
    gen_random_uuid()::TEXT,
    'schema_update',
    'completed',
    0,
    '{"version": "1.0.0", "description": "Initial schema update for user-centric storage"}'::JSONB
);

-- Create comment documentation
COMMENT ON TABLE "R2MigrationLog" IS 'Tracks migration progress and status for R2 storage updates';
COMMENT ON TABLE "R2FileMetadata" IS 'Comprehensive metadata for all files stored in R2 user folders';
COMMENT ON VIEW "UserStorageStats" IS 'Aggregated storage statistics for each user';
COMMENT ON COLUMN "User"."profilePictureKey" IS 'R2 storage key for the user''s current profile picture';
COMMENT ON COLUMN "User"."profilePictureHistory" IS 'Array of previous profile picture keys for version tracking';
COMMENT ON COLUMN "User"."r2FolderCreated" IS 'Tracks if user''s R2 folder structure has been initialized';
COMMENT ON COLUMN "User"."storageUsageBytes" IS 'Total storage usage in bytes for the user';
COMMENT ON COLUMN "SavedDesign"."designImageKey" IS 'R2 storage key for the design image';
COMMENT ON COLUMN "SavedDesign"."mockupImageKey" IS 'R2 storage key for the primary mockup image';
COMMENT ON COLUMN "SavedDesign"."uploadedLogoKey" IS 'R2 storage key for the uploaded logo';
COMMENT ON COLUMN "SavedDesign"."uploadedPatternKey" IS 'R2 storage key for the uploaded pattern';
COMMENT ON COLUMN "SavedDesign"."assetKeys" IS 'JSON object containing multiple asset keys';
COMMENT ON COLUMN "SavedDesign"."mockupKeys" IS 'JSON object containing multiple mockup keys';
COMMENT ON COLUMN "SavedDesign"."migrationStatus" IS 'Migration status: pending, in_progress, completed, failed';
COMMENT ON COLUMN "MockupJob"."mockupKeys" IS 'JSON object containing multiple mockup output keys';

-- Commit transaction
COMMIT;

-- Migration completed successfully
-- Next steps: Run data migration to populate new fields with converted paths