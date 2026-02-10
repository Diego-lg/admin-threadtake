import { PrismaClient } from "@prisma/client";
import { R2FileHelpers } from "./r2-file-helpers";
import { UserFolderPaths, MockupType, AssetType } from "./r2-user-storage";
import { v4 as uuidv4 } from "uuid";

/**
 * File path conversion result
 */
export interface PathConversionResult {
  success: boolean;
  oldPath?: string;
  newPath?: string;
  fileKey?: string;
  error?: string;
}

/**
 * File metadata for migration tracking
 */
export interface FileMetadata {
  userId: string;
  fileKey: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  contentType?: string;
  folderPath: string;
  isPublic: boolean;
  oldPath?: string;
  checksum?: string;
  metadata?: Record<string, any>;
}

/**
 * User file query options
 */
export interface UserFileQueryOptions {
  fileType?: string;
  folderPath?: string;
  limit?: number;
  offset?: number;
  orderBy?: "createdAt" | "fileName" | "fileSize";
  orderDirection?: "asc" | "desc";
  includeMetadata?: boolean;
}

/**
 * Pagination result
 */
export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * Helper functions for R2 database operations
 */
export class R2DbHelpers {
  /**
   * Convert legacy URL to R2 file key
   * @param legacyUrl - Legacy URL to convert
   * @param userId - User ID for the new path
   * @returns Conversion result
   */
  static convertLegacyUrlToR2Key(
    legacyUrl: string,
    userId: string
  ): PathConversionResult {
    try {
      if (!legacyUrl || !userId) {
        return {
          success: false,
          error: "Legacy URL and user ID are required",
        };
      }

      // Extract path from URL if it's a full URL
      let path = legacyUrl;
      if (legacyUrl.startsWith("http")) {
        try {
          const url = new URL(legacyUrl);
          path = url.pathname;
          // Remove leading slash
          if (path.startsWith("/")) {
            path = path.substring(1);
          }
        } catch {
          // If URL parsing fails, use the original string as path
          path = legacyUrl;
        }
      }

      // Convert to new user-centric format
      const newPath = R2FileHelpers.convertOldPathToNewFormat(path, userId);

      if (!newPath) {
        return {
          success: false,
          error: `Unable to convert legacy path: ${path}`,
        };
      }

      return {
        success: true,
        oldPath: path,
        newPath,
        fileKey: newPath,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Conversion failed: ${error.message}`,
      };
    }
  }

  /**
   * Convert multiple legacy URLs to R2 keys
   * @param legacyUrls - Array of legacy URLs to convert
   * @param userId - User ID for the new paths
   * @returns Array of conversion results
   */
  static convertLegacyUrlsToR2Keys(
    legacyUrls: string[],
    userId: string
  ): PathConversionResult[] {
    return legacyUrls.map((url) => this.convertLegacyUrlToR2Key(url, userId));
  }

  /**
   * Extract file type from path
   * @param path - File path
   * @returns File type string
   */
  static extractFileTypeFromPath(path: string): string {
    if (!path) return "unknown";

    const pathParts = path.split("/").filter((part) => part.length > 0);

    if (pathParts.length === 0) return "unknown";

    // Check for known folder patterns
    if (pathParts.includes("mockups")) return "mockups";
    if (pathParts.includes("profile-pictures")) return "profile-pictures";
    if (pathParts.includes("assets")) {
      // Check for specific asset types
      if (pathParts.includes("logos")) return "assets";
      if (pathParts.includes("patterns")) return "assets";
      if (pathParts.includes("uploads")) return "assets";
      return "assets";
    }
    if (pathParts.includes("exports")) return "exports";
    if (pathParts.includes("designs")) return "designs";

    // Default to unknown
    return "unknown";
  }

  /**
   * Generate file metadata from path and user ID
   * @param path - File path
   * @param userId - User ID
   * @param additionalData - Additional metadata
   * @returns File metadata object
   */
  static generateFileMetadata(
    path: string,
    userId: string,
    additionalData: Partial<FileMetadata> = {}
  ): FileMetadata {
    const conversion = this.convertLegacyUrlToR2Key(path, userId);

    if (!conversion.success || !conversion.newPath) {
      throw new Error(`Failed to convert path: ${path}`);
    }

    const fileName = path.split("/").pop() || `file-${uuidv4()}`;
    const fileType = this.extractFileTypeFromPath(path);
    const folderPath = conversion.newPath.substring(
      0,
      conversion.newPath.lastIndexOf("/")
    );

    return {
      userId,
      fileKey: conversion.newPath,
      fileName,
      fileType,
      fileSize: 0,
      folderPath,
      isPublic: false,
      oldPath: path,
      ...additionalData,
    };
  }

  /**
   * Create file metadata records in database
   * @param prisma - Prisma client instance
   * @param metadata - Array of file metadata
   * @returns Created records count
   */
  static async createFileMetadata(
    prisma: PrismaClient,
    metadata: FileMetadata[]
  ): Promise<number> {
    try {
      if (metadata.length === 0) return 0;

      // Prepare data for insertion
      const data = metadata.map((m) => ({
        id: uuidv4(),
        userId: m.userId,
        fileKey: m.fileKey,
        fileName: m.fileName,
        fileType: m.fileType,
        fileSize: m.fileSize,
        contentType: m.contentType,
        folderPath: m.folderPath,
        isPublic: m.isPublic,
        oldPath: m.oldPath,
        checksum: m.checksum,
        metadata: m.metadata || {},
        migrationStatus: "completed" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // Insert in batches to avoid overwhelming the database
      const batchSize = 100;
      let createdCount = 0;

      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        await prisma.$transaction(async (tx) => {
          // Use raw SQL for now since Prisma client might not be updated yet
          // @ts-ignore - Temporary workaround
          await tx.$executeRaw`
            INSERT INTO "R2FileMetadata" (
              "id", "userId", "fileKey", "fileName", "fileType", 
              "fileSize", "contentType", "folderPath", "isPublic", 
              "oldPath", "checksum", "metadata", "migrationStatus", 
              "createdAt", "updatedAt"
            ) VALUES 
            ${batch.map((item) => [
              item.id,
              item.userId,
              item.fileKey,
              item.fileName,
              item.fileType,
              item.fileSize,
              item.contentType,
              item.folderPath,
              item.isPublic,
              item.oldPath,
              item.checksum,
              JSON.stringify(item.metadata),
              item.migrationStatus,
              item.createdAt,
              item.updatedAt,
            ])}
          `;
        });
        createdCount += batch.length;
      }

      console.log(
        `[R2_DB_HELPERS] Created ${createdCount} file metadata records`
      );
      return createdCount;
    } catch (error: any) {
      console.error(`[R2_DB_HELPERS] Error creating file metadata:`, error);
      throw new Error(`Failed to create file metadata: ${error.message}`);
    }
  }

  /**
   * Query user files with pagination
   * @param prisma - Prisma client instance
   * @param userId - User ID
   * @param options - Query options
   * @returns Paginated result of files
   */
  static async queryUserFiles(
    prisma: PrismaClient,
    userId: string,
    options: UserFileQueryOptions = {}
  ): Promise<PaginatedResult<any>> {
    try {
      const {
        fileType,
        folderPath,
        limit = 50,
        offset = 0,
        orderBy = "createdAt",
        orderDirection = "desc",
        includeMetadata = true,
      } = options;

      // Build where clause
      const whereConditions: string[] = [`"userId" = $1`];
      const params: any[] = [userId];
      let paramIndex = 2;

      if (fileType) {
        whereConditions.push(`"fileType" = $${paramIndex++}`);
        params.push(fileType);
      }

      if (folderPath) {
        whereConditions.push(`"folderPath" LIKE $${paramIndex++}`);
        params.push(`${folderPath}%`);
      }

      const whereClause = whereConditions.join(" AND ");

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as count
        FROM "R2FileMetadata"
        WHERE ${whereClause}
      `;

      // @ts-ignore - Temporary workaround
      const countResult = await prisma.$queryRawUnsafe(countQuery, ...params) as Array<{ count: bigint }>;
      const totalCount = Number(countResult[0]?.count || 0);

      // Get paginated results
      const dataQuery = `
        SELECT ${
          includeMetadata
            ? "*"
            : '"id", "fileKey", "fileName", "fileType", "fileSize", "createdAt"'
        }
        FROM "R2FileMetadata"
        WHERE ${whereClause}
        ORDER BY "${orderBy}" ${orderDirection.toUpperCase()}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      params.push(limit, offset);

      // @ts-ignore - Temporary workaround
      const files = await prisma.$queryRawUnsafe(dataQuery, ...params) as any[];

      const totalPages = Math.ceil(totalCount / limit);
      const currentPage = Math.floor(offset / limit) + 1;

      return {
        items: files,
        totalCount,
        currentPage,
        totalPages,
        hasNext: currentPage < totalPages,
        hasPrevious: currentPage > 1,
      };
    } catch (error: any) {
      console.error(`[R2_DB_HELPERS] Error querying user files:`, error);
      throw new Error(`Failed to query user files: ${error.message}`);
    }
  }

  /**
   * Get user storage statistics
   * @param prisma - Prisma client instance
   * @param userId - User ID
   * @returns Storage statistics
   */
  static async getUserStorageStats(
    prisma: PrismaClient,
    userId: string
  ): Promise<{
    totalFiles: number;
    totalSize: number;
    fileCounts: Record<string, number>;
    sizeByType: Record<string, number>;
  }> {
    try {
      // Get file counts and sizes by type
      const query = `
        SELECT 
          "fileType",
          COUNT(*) as count,
          COALESCE(SUM("fileSize"), 0) as totalSize
        FROM "R2FileMetadata"
        WHERE "userId" = $1
        GROUP BY "fileType"
      `;

      // @ts-ignore - Temporary workaround
      const results = await prisma.$queryRawUnsafe(query, userId) as any[];

      const fileCounts: Record<string, number> = {};
      const sizeByType: Record<string, number> = {};
      let totalFiles = 0;
      let totalSize = 0;

      results.forEach((row: any) => {
        const fileType = row.fileType;
        const count = Number(row.count);
        const size = Number(row.totalSize);

        fileCounts[fileType] = count;
        sizeByType[fileType] = size;
        totalFiles += count;
        totalSize += size;
      });

      return {
        totalFiles,
        totalSize,
        fileCounts,
        sizeByType,
      };
    } catch (error: any) {
      console.error(`[R2_DB_HELPERS] Error getting user storage stats:`, error);
      throw new Error(`Failed to get user storage stats: ${error.message}`);
    }
  }

  /**
   * Update user storage usage
   * @param prisma - Prisma client instance
   * @param userId - User ID
   * @returns Updated storage usage
   */
  static async updateUserStorageUsage(
    prisma: PrismaClient,
    userId: string
  ): Promise<number> {
    try {
      // Calculate total storage usage
      const query = `
        SELECT COALESCE(SUM("fileSize"), 0) as totalSize
        FROM "R2FileMetadata"
        WHERE "userId" = $1
      `;

      // @ts-ignore - Temporary workaround
      const result = await prisma.$queryRawUnsafe(query, userId) as any[];
      const totalSize = Number(result[0]?.totalSize || 0);

      // Update user record
      await prisma.$executeRaw`
        UPDATE "User" 
        SET "storageUsageBytes" = ${totalSize}, "updatedAt" = NOW()
        WHERE "id" = ${userId}
      `;

      console.log(
        `[R2_DB_HELPERS] Updated storage usage for user ${userId}: ${totalSize} bytes`
      );
      return totalSize;
    } catch (error: any) {
      console.error(
        `[R2_DB_HELPERS] Error updating user storage usage:`,
        error
      );
      throw new Error(`Failed to update user storage usage: ${error.message}`);
    }
  }

  /**
   * Find orphaned files (files that exist in R2 but not in database)
   * @param prisma - Prisma client instance
   * @param userId - User ID
   * @param r2Files - List of files from R2
   * @returns Orphaned files
   */
  static async findOrphanedFiles(
    prisma: PrismaClient,
    userId: string,
    r2Files: { key: string; size: number; lastModified: Date }[]
  ): Promise<string[]> {
    try {
      if (r2Files.length === 0) return [];

      // Get all file keys for the user from database
      const query = `
        SELECT "fileKey"
        FROM "R2FileMetadata"
        WHERE "userId" = $1
      `;

      // @ts-ignore - Temporary workaround
      const dbFiles = await prisma.$queryRawUnsafe(query, userId) as any[];
      const dbFileKeys = new Set(dbFiles.map((f: any) => f.fileKey));

      // Find files in R2 that don't exist in database
      const orphanedFiles = r2Files
        .filter((file) => !dbFileKeys.has(file.key))
        .map((file) => file.key);

      console.log(
        `[R2_DB_HELPERS] Found ${orphanedFiles.length} orphaned files for user ${userId}`
      );
      return orphanedFiles;
    } catch (error: any) {
      console.error(`[R2_DB_HELPERS] Error finding orphaned files:`, error);
      throw new Error(`Failed to find orphaned files: ${error.message}`);
    }
  }

  /**
   * Clean up orphaned file metadata
   * @param prisma - Prisma client instance
   * @param userId - User ID
   * @param dryRun - If true, only return what would be deleted
   * @returns Number of records cleaned up
   */
  static async cleanupOrphanedMetadata(
    prisma: PrismaClient,
    userId: string,
    dryRun: boolean = false
  ): Promise<number> {
    try {
      // Find metadata records with invalid user references or missing required fields
      const query = `
        SELECT "id"
        FROM "R2FileMetadata"
        WHERE "userId" = $1
          AND (
            "fileKey" IS NULL 
            OR "fileName" IS NULL 
            OR "folderPath" IS NULL
            OR NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = "userId")
          )
      `;

      // @ts-ignore - Temporary workaround
      const orphanedRecords = await prisma.$queryRawUnsafe(query, userId) as any[];

      if (orphanedRecords.length === 0) {
        console.log(
          `[R2_DB_HELPERS] No orphaned metadata found for user ${userId}`
        );
        return 0;
      }

      if (dryRun) {
        console.log(
          `[R2_DB_HELPERS] Would delete ${orphanedRecords.length} orphaned metadata records for user ${userId}`
        );
        return orphanedRecords.length;
      }

      // Delete orphaned records
      const deleteQuery = `
        DELETE FROM "R2FileMetadata"
        WHERE "id" = ANY($1)
      `;

      const idsToDelete = orphanedRecords.map((r: any) => r.id);
      // @ts-ignore - Temporary workaround
      const result = await prisma.$executeRawUnsafe(deleteQuery, idsToDelete);
      const deletedCount = Number(result);

      console.log(
        `[R2_DB_HELPERS] Cleaned up ${deletedCount} orphaned metadata records for user ${userId}`
      );
      return deletedCount;
    } catch (error: any) {
      console.error(
        `[R2_DB_HELPERS] Error cleaning up orphaned metadata:`,
        error
      );
      throw new Error(`Failed to cleanup orphaned metadata: ${error.message}`);
    }
  }

  /**
   * Validate file metadata integrity
   * @param prisma - Prisma client instance
   * @param userId - Optional user ID to validate specific user
   * @returns Validation issues
   */
  static async validateMetadataIntegrity(
    prisma: PrismaClient,
    userId?: string
  ): Promise<{
    totalRecords: number;
    issues: Array<{
      id: string;
      userId: string;
      issue: string;
      severity: "error" | "warning";
    }>;
  }> {
    try {
      const whereClause = userId ? `WHERE "userId" = $1` : "";
      const params = userId ? [userId] : [];

      // Get all records with potential issues
      const query = `
        SELECT 
          "id",
          "userId",
          "fileKey",
          "fileName",
          "fileSize",
          "folderPath",
          "migrationStatus"
        FROM "R2FileMetadata"
        ${whereClause}
      `;

      // @ts-ignore - Temporary workaround
      const records = await prisma.$queryRawUnsafe(query, ...params) as any[];
      const issues: Array<{
        id: string;
        userId: string;
        issue: string;
        severity: "error" | "warning";
      }> = [];

      for (const record of records) {
        // Check for missing required fields
        if (!record.fileKey) {
          issues.push({
            id: record.id,
            userId: record.userId,
            issue: "Missing file key",
            severity: "error",
          });
        }

        if (!record.fileName) {
          issues.push({
            id: record.id,
            userId: record.userId,
            issue: "Missing file name",
            severity: "error",
          });
        }

        if (!record.folderPath) {
          issues.push({
            id: record.id,
            userId: record.userId,
            issue: "Missing folder path",
            severity: "error",
          });
        }

        if (record.fileSize < 0) {
          issues.push({
            id: record.id,
            userId: record.userId,
            issue: "Invalid file size (negative)",
            severity: "error",
          });
        }

        // Check for incomplete migration
        if (record.migrationStatus === "pending") {
          issues.push({
            id: record.id,
            userId: record.userId,
            issue: "Migration status is still pending",
            severity: "warning",
          });
        }
      }

      console.log(
        `[R2_DB_HELPERS] Validation complete: ${issues.length} issues found for ${records.length} records`
      );
      return {
        totalRecords: records.length,
        issues,
      };
    } catch (error: any) {
      console.error(
        `[R2_DB_HELPERS] Error validating metadata integrity:`,
        error
      );
      throw new Error(
        `Failed to validate metadata integrity: ${error.message}`
      );
    }
  }

  /**
   * Get migration progress summary
   * @param prisma - Prisma client instance
   * @returns Migration summary
   */
  static async getMigrationSummary(prisma: PrismaClient): Promise<{
    totalMigrations: number;
    completedMigrations: number;
    failedMigrations: number;
    pendingMigrations: number;
    recentMigrations: Array<{
      id: string;
      type: string;
      status: string;
      startTime: Date;
      progress: number;
    }>;
  }> {
    try {
      // Get migration statistics
      const statsQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN "status" = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN "status" = 'failed' THEN 1 END) as failed,
          COUNT(CASE WHEN "status" = 'pending' THEN 1 END) as pending
        FROM "R2MigrationLog"
      `;

      // @ts-ignore - Temporary workaround
      const stats = await prisma.$queryRawUnsafe(statsQuery) as any[];

      // Get recent migrations
      const recentQuery = `
        SELECT 
          "id",
          "migrationType" as type,
          "status",
          "startTime",
          CASE 
            WHEN "totalRecords" = 0 THEN 0
            ELSE ROUND(("processedRecords"::float / "totalRecords"::float) * 100, 2)
          END as progress
        FROM "R2MigrationLog"
        ORDER BY "startTime" DESC
        LIMIT 10
      `;

      // @ts-ignore - Temporary workaround
      const recentMigrations = await prisma.$queryRawUnsafe(recentQuery) as any[];

      return {
        totalMigrations: Number(stats[0]?.total || 0),
        completedMigrations: Number(stats[0]?.completed || 0),
        failedMigrations: Number(stats[0]?.failed || 0),
        pendingMigrations: Number(stats[0]?.pending || 0),
        recentMigrations,
      };
    } catch (error: any) {
      console.error(`[R2_DB_HELPERS] Error getting migration summary:`, error);
      throw new Error(`Failed to get migration summary: ${error.message}`);
    }
  }
}
