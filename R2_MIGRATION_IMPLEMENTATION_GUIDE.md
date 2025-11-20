# R2 User-Centric Storage Migration Implementation Guide

## Overview

This guide provides comprehensive instructions for implementing the new user-centric R2 storage structure. The migration includes database schema updates, new utility services, and backward compatibility support.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Migration Overview](#migration-overview)
3. [Database Schema Updates](#database-schema-updates)
4. [Implementation Steps](#implementation-steps)
5. [Testing and Validation](#testing-and-validation)
6. [Rollback Procedures](#rollback-procedures)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting](#troubleshooting)

## 🚀 Prerequisites

### Environment Requirements

- Node.js 18+
- PostgreSQL 14+
- Prisma Client
- R2 Storage configured with proper credentials

### Required Environment Variables

```bash
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=your-bucket-name
R2_PUBLIC_BUCKET_URL=https://your-bucket-url.com
CLOUDFLARE_ACCOUNT_ID=your-account-id
DATABASE_URL=your-database-url
```

## 📊 Migration Overview

### Migration Strategy

The migration follows a **phased approach** to ensure zero downtime:

1. **Phase 1**: Schema updates (add new fields without removing old ones)
2. **Phase 2**: Data migration (populate new fields with converted paths)
3. **Phase 3**: Application updates (use new fields)
4. **Phase 4**: Cleanup (optional removal of old fields)

### New Folder Structure

```
users/
├── {userId}/
│   ├── mockups/
│   │   ├── {designId}/
│   │   │   ├── default/
│   │   │   ├── back/
│   │   │   ├── sleeve_left/
│   │   │   └── sleeve_right/
│   │   └── temp/
│   ├── profile-pictures/
│   │   ├── current/
│   │   └── history/
│   ├── assets/
│   │   ├── logos/
│   │   ├── patterns/
│   │   └── uploads/
│   └── exports/
│       ├── designs/
│       └── collections/
```

## 🗄️ Database Schema Updates

### New Fields Added

#### User Model

- `profilePictureKey` - New R2 storage key for profile picture
- `profilePictureHistory` - Array of previous profile picture keys
- `r2FolderCreated` - Track if user's R2 folder structure is initialized
- `storageUsageBytes` - Total storage usage in bytes

#### SavedDesign Model

- `designImageKey` - R2 storage key for design image
- `mockupImageKey` - R2 storage key for primary mockup image
- `uploadedLogoKey` - R2 storage key for uploaded logo
- `uploadedPatternKey` - R2 storage key for uploaded pattern
- `assetKeys` - JSON object containing multiple asset keys
- `mockupKeys` - JSON object containing multiple mockup keys
- `migrationStatus` - Track migration status
- `migratedAt` - Migration completion timestamp

#### MockupJob Model

- `mockupKeys` - JSON object containing multiple mockup output keys
- `migrationStatus` - Track migration status
- `migratedAt` - Migration completion timestamp

### New Tables

#### R2MigrationLog

- Tracks migration progress and status
- Supports multiple migration types
- Includes error handling and metadata

#### R2FileMetadata

- Comprehensive file metadata tracking
- Supports file integrity validation
- Enables efficient file queries and management

## 🛠️ Implementation Steps

### Step 1: Run Database Migration

```bash
# Apply the database schema updates
psql $DATABASE_URL -f migrations/update_user_storage_paths.sql

# Or run via Prisma (if using Prisma migrations)
npx prisma migrate dev --name update_user_storage_paths
```

### Step 2: Update Prisma Client

```bash
# Regenerate Prisma client with new schema
npx prisma generate
```

### Step 3: Initialize Migration Service

```typescript
import { R2MigrationService } from "./services/r2-migration-service";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const migrationService = new R2MigrationService(prisma);
```

### Step 4: Run Migration Process

```typescript
// Run all migrations
const results = await migrationService.runAllMigrations({
  batchSize: 100,
  enableRollback: true,
  validateAfterMigration: true,
  continueOnError: false,
  dryRun: false, // Set to true for testing
});

console.log("Migration results:", results);
```

### Step 5: Update Application Code

#### Profile Picture Handling

```typescript
import { R2Queries } from "./lib/r2-queries";

// Get user profile picture (supports both old and new formats)
const profilePic = await R2Queries.getUserProfilePicture(prisma, userId);

// Update user profile picture
await R2Queries.updateUserProfilePicture(prisma, userId, newKey, true);
```

#### Design File Handling

```typescript
// Get design files (supports both old and new formats)
const designFiles = await R2Queries.getDesignFiles(prisma, designId);

// Update design files
await R2Queries.updateDesignFiles(prisma, designId, {
  designImageKey: newDesignKey,
  mockupImageKey: newMockupKey,
});
```

#### User File Management

```typescript
// Get user files with pagination
const userFiles = await R2Queries.getUserFiles(prisma, userId, {
  fileType: "mockups",
  limit: 50,
  offset: 0,
  includeLegacy: true,
});

// Get user storage usage
const storageUsage = await R2Queries.getUserStorageUsage(prisma, userId);
```

## 🧪 Testing and Validation

### Run Test Suite

```bash
# Run the comprehensive test suite
node test-r2-migration.js
```

### Manual Validation Steps

1. **Schema Validation**

   ```sql
   -- Check new columns exist
   \d User
   \d SavedDesign
   \d MockupJob

   -- Check new tables exist
   \d R2MigrationLog
   \d R2FileMetadata
   ```

2. **Data Validation**

   ```sql
   -- Check migration progress
   SELECT * FROM "R2MigrationLog" ORDER BY "startTime" DESC;

   -- Check file metadata
   SELECT "userId", "fileType", COUNT(*) FROM "R2FileMetadata" GROUP BY "userId", "fileType";

   -- Check user storage usage
   SELECT "id", "storageUsageBytes", "r2FolderCreated" FROM "User" WHERE "r2FolderCreated" = true;
   ```

3. **Application Testing**
   - Test profile picture uploads
   - Test design saving and loading
   - Test mockup generation
   - Test file listing and management

## 🔄 Rollback Procedures

### Database Rollback

```sql
-- Create rollback script
BEGIN;

-- Drop new tables
DROP TABLE IF EXISTS "R2FileMetadata";
DROP TABLE IF EXISTS "R2MigrationLog";

-- Drop new columns
ALTER TABLE "User" DROP COLUMN IF EXISTS "profilePictureKey";
ALTER TABLE "User" DROP COLUMN IF EXISTS "profilePictureHistory";
ALTER TABLE "User" DROP COLUMN IF EXISTS "r2FolderCreated";
ALTER TABLE "User" DROP COLUMN IF EXISTS "storageUsageBytes";

ALTER TABLE "SavedDesign" DROP COLUMN IF EXISTS "designImageKey";
ALTER TABLE "SavedDesign" DROP COLUMN IF EXISTS "mockupImageKey";
ALTER TABLE "SavedDesign" DROP COLUMN IF EXISTS "uploadedLogoKey";
ALTER TABLE "SavedDesign" DROP COLUMN IF EXISTS "uploadedPatternKey";
ALTER TABLE "SavedDesign" DROP COLUMN IF EXISTS "assetKeys";
ALTER TABLE "SavedDesign" DROP COLUMN IF EXISTS "mockupKeys";
ALTER TABLE "SavedDesign" DROP COLUMN IF EXISTS "migrationStatus";
ALTER TABLE "SavedDesign" DROP COLUMN IF EXISTS "migratedAt";

ALTER TABLE "MockupJob" DROP COLUMN IF EXISTS "mockupKeys";
ALTER TABLE "MockupJob" DROP COLUMN IF EXISTS "migrationStatus";
ALTER TABLE "MockupJob" DROP COLUMN IF EXISTS "migratedAt";

-- Drop indexes
DROP INDEX IF EXISTS "User_profilePictureKey_idx";
DROP INDEX IF EXISTS "SavedDesign_designImageKey_idx";
DROP INDEX IF EXISTS "SavedDesign_mockupImageKey_idx";
-- ... (drop all new indexes)

COMMIT;
```

### Application Rollback

1. Revert to previous version of application code
2. Restore Prisma schema to previous version
3. Regenerate Prisma client: `npx prisma generate`
4. Restart application services

## ⚡ Performance Considerations

### Database Optimization

1. **Indexes**: All new fields are properly indexed for optimal query performance
2. **Batch Processing**: Migrations use batch processing to avoid overwhelming the database
3. **Connection Pooling**: Ensure proper connection pooling for migration operations

### Storage Optimization

1. **File Compression**: Consider enabling compression for large files
2. **CDN Caching**: Use CDN caching for frequently accessed files
3. **Lifecycle Policies**: Implement lifecycle policies for old files

### Query Optimization

1. **Pagination**: Use pagination for large file listings
2. **Selective Queries**: Only query required fields
3. **Caching**: Cache frequently accessed metadata

## 🔧 Troubleshooting

### Common Issues

#### Migration Fails Partway Through

```bash
# Check migration status
SELECT * FROM "R2MigrationLog" WHERE "status" = 'failed';

# Resume migration
await migrationService.runAllMigrations({
  continueOnError: true,
});
```

#### TypeScript Errors After Schema Update

```bash
# Regenerate Prisma client
npx prisma generate

# Clear TypeScript cache
rm -rf node_modules/.cache
npm run build
```

#### File Access Issues

```bash
# Check R2 configuration
node -e "console.log(require('./lib/r2-config').R2Config.getConfigStatus())"

# Test file access
node test-r2-user-storage.js
```

#### Performance Issues

```sql
-- Check slow queries
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Check table sizes
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Debug Mode

Enable debug logging by setting environment variable:

```bash
DEBUG=r2:* npm run migration
```

### Monitoring

Monitor migration progress with:

```typescript
// Get real-time progress
const progress = await migrationService.getMigrationProgress(migrationId);
console.log(`Progress: ${progress.progressPercentage}%`);

// Get migration statistics
const stats = await migrationService.getMigrationStatistics();
console.log("Migration stats:", stats);
```

## 📚 Additional Resources

### Documentation

- [R2 Configuration Guide](./R2_USER_STORAGE_IMPLEMENTATION.md)
- [Security Implementation](./R2_SECURITY_IMPLEMENTATION_SUMMARY.md)
- [API Documentation](./docs/api.md)

### Scripts

- [Migration Test Suite](./test-r2-migration.js)
- [User Storage Tests](./test-r2-user-storage.js)
- [Migration SQL Script](./migrations/update_user_storage_paths.sql)

### Support

- Check logs for detailed error messages
- Use the test suite to validate implementation
- Monitor database performance during migration

## 🎯 Success Criteria

Migration is considered successful when:

1. ✅ All database schema updates are applied
2. ✅ Migration service completes without errors
3. ✅ Test suite passes all validations
4. ✅ Application functions correctly with new structure
5. ✅ Backward compatibility is maintained
6. ✅ Performance meets or exceeds previous benchmarks
7. ✅ File access and management work as expected

## 📈 Post-Migration Tasks

1. **Monitor Performance**: Track application performance for 24-48 hours
2. **Cleanup Legacy Data**: Run cleanup script after validation period
3. **Update Documentation**: Update API documentation and user guides
4. **Team Training**: Train development team on new structure
5. **Backup Strategy**: Update backup procedures for new structure

---

**Migration completed successfully! 🎉**

For questions or issues, refer to the troubleshooting section or contact the development team.
