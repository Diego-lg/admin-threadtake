import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { R2Config } from "./r2-config";
import { UserFolderPaths } from "./r2-user-storage";
import { v4 as uuidv4 } from "uuid";

/**
 * Cleanup criteria for old files
 */
export interface CleanupCriteria {
  /** Delete files older than this many days */
  olderThanDays?: number;
  /** Delete files larger than this size in bytes */
  largerThanBytes?: number;
  /** Delete files in specific folder paths */
  folderPaths?: string[];
  /** Maximum number of files to delete */
  maxFiles?: number;
  /** Dry run mode - only return what would be deleted */
  dryRun?: boolean;
}

/**
 * File information from R2
 */
export interface R2FileInfo {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string;
  isLatest?: boolean;
}

/**
 * Storage statistics
 */
export interface StorageStats {
  totalFiles: number;
  totalSize: number;
  sizeByFolder: Record<string, { count: number; size: number }>;
  sizeByType: Record<string, number>;
  oldestFile?: Date;
  newestFile?: Date;
}

/**
 * Cleanup result
 */
export interface CleanupResult {
  success: boolean;
  deletedFiles: R2FileInfo[];
  deletedCount: number;
  freedSpace: number;
  errors: string[];
  dryRun: boolean;
}

/**
 * Pagination options for listing files
 */
export interface ListFilesOptions {
  prefix?: string;
  maxKeys?: number;
  continuationToken?: string;
}

/**
 * Paginated file list result
 */
export interface PaginatedFileList {
  files: R2FileInfo[];
  nextToken?: string;
  isTruncated: boolean;
}

/**
 * R2 Bucket Manager - Comprehensive file management for Cloudflare R2
 */
export class R2BucketManager {
  private static client: S3Client | null = null;
  private static config = R2Config.getConfig();

  /**
   * Get the S3 client instance
   */
  private static getClient(): S3Client {
    if (!this.client) {
      this.client = R2Config.getS3Client();
    }
    return this.client;
  }

  /**
   * List all files in the bucket with optional filtering
   */
  static async listFiles(
    options: ListFilesOptions = {},
  ): Promise<PaginatedFileList> {
    try {
      const { prefix = "", maxKeys = 1000, continuationToken } = options;

      const client = this.getClient();
      const command = new ListObjectsV2Command({
        Bucket: this.config.bucketName,
        Prefix: prefix,
        MaxKeys: Math.min(maxKeys, 1000),
        ContinuationToken: continuationToken,
      });

      const response = await client.send(command);

      const files: R2FileInfo[] = (response.Contents || [])
        .filter((item) => !item.Key?.endsWith("/.folder_marker"))
        .map((item) => ({
          key: item.Key!,
          size: item.Size || 0,
          lastModified: item.LastModified || new Date(),
          etag: item.ETag,
        }));

      return {
        files,
        nextToken: response.NextContinuationToken,
        isTruncated: !!response.IsTruncated,
      };
    } catch (error: any) {
      console.error("[R2_BUCKET_MANAGER] Error listing files:", error);
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  /**
   * List files for a specific user
   */
  static async listUserFiles(
    userId: string,
    options: ListFilesOptions = {},
  ): Promise<PaginatedFileList> {
    const prefix = `users/${userId}`;
    return this.listFiles({ ...options, prefix });
  }

  /**
   * Get files by folder path
   */
  static async listFolderFiles(
    folderPath: string,
    maxKeys: number = 1000,
  ): Promise<R2FileInfo[]> {
    const result = await this.listFiles({ prefix: folderPath, maxKeys });
    return result.files;
  }

  /**
   * Get detailed storage statistics
   */
  static async getStorageStats(userId?: string): Promise<StorageStats> {
    try {
      const prefix = userId ? `users/${userId}` : "";
      const stats: StorageStats = {
        totalFiles: 0,
        totalSize: 0,
        sizeByFolder: {},
        sizeByType: {},
      };

      let continuationToken: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const result = await this.listFiles({
          prefix,
          maxKeys: 1000,
          continuationToken,
        });

        for (const file of result.files) {
          stats.totalFiles++;
          stats.totalSize += file.size;

          // Calculate size by folder
          const folder = file.key.split("/").slice(0, -1).join("/") || "root";
          if (!stats.sizeByFolder[folder]) {
            stats.sizeByFolder[folder] = { count: 0, size: 0 };
          }
          stats.sizeByFolder[folder].count++;
          stats.sizeByFolder[folder].size += file.size;

          // Calculate size by file type
          const extension =
            file.key.split(".").pop()?.toLowerCase() || "unknown";
          stats.sizeByType[extension] =
            (stats.sizeByType[extension] || 0) + file.size;

          // Track oldest and newest files
          if (!stats.oldestFile || file.lastModified < stats.oldestFile) {
            stats.oldestFile = file.lastModified;
          }
          if (!stats.newestFile || file.lastModified > stats.newestFile) {
            stats.newestFile = file.lastModified;
          }
        }

        continuationToken = result.nextToken;
        hasMore = result.isTruncated;
      }

      return stats;
    } catch (error: any) {
      console.error("[R2_BUCKET_MANAGER] Error getting storage stats:", error);
      throw new Error(`Failed to get storage stats: ${error.message}`);
    }
  }

  /**
   * Get file information
   */
  static async getFileInfo(key: string): Promise<R2FileInfo | null> {
    try {
      const client = this.getClient();
      const command = new HeadObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      });

      const response = await client.send(command);

      return {
        key,
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        etag: response.ETag,
      };
    } catch (error: any) {
      if (error.name === "NotFound") {
        return null;
      }
      console.error("[R2_BUCKET_MANAGER] Error getting file info:", error);
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }

  /**
   * Check if a file exists
   */
  static async fileExists(key: string): Promise<boolean> {
    const info = await this.getFileInfo(key);
    return info !== null;
  }

  /**
   * Delete a single file
   */
  static async deleteFile(key: string): Promise<boolean> {
    try {
      const client = this.getClient();
      const command = new DeleteObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      });

      await client.send(command);
      console.log(`[R2_BUCKET_MANAGER] Deleted file: ${key}`);
      return true;
    } catch (error: any) {
      console.error(`[R2_BUCKET_MANAGER] Error deleting file ${key}:`, error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Delete multiple files
   */
  static async deleteFiles(keys: string[]): Promise<{
    deleted: string[];
    failed: { key: string; error: string }[];
  }> {
    if (keys.length === 0) {
      return { deleted: [], failed: [] };
    }

    try {
      const client = this.getClient();

      // Delete in batches of 1000 (S3 limit)
      const batchSize = 1000;
      const deleted: string[] = [];
      const failed: { key: string; error: string }[] = [];

      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);

        const command = new DeleteObjectsCommand({
          Bucket: this.config.bucketName,
          Delete: {
            Objects: batch.map((key) => ({ Key: key })),
            Quiet: false,
          },
        });

        const response = await client.send(command);

        // Collect deleted files
        if (response.Deleted) {
          for (const item of response.Deleted) {
            if (item.Key) {
              deleted.push(item.Key);
              console.log(`[R2_BUCKET_MANAGER] Deleted file: ${item.Key}`);
            }
          }
        }

        // Collect errors
        if (response.Errors) {
          for (const error of response.Errors) {
            if (error.Key) {
              failed.push({
                key: error.Key,
                error: error.Message || "Unknown error",
              });
            }
          }
        }
      }

      return { deleted, failed };
    } catch (error: any) {
      console.error("[R2_BUCKET_MANAGER] Error deleting files:", error);
      throw new Error(`Failed to delete files: ${error.message}`);
    }
  }

  /**
   * Clean up old files based on criteria
   */
  static async cleanupOldFiles(
    criteria: CleanupCriteria,
  ): Promise<CleanupResult> {
    const {
      olderThanDays,
      largerThanBytes,
      folderPaths,
      maxFiles,
      dryRun = false,
    } = criteria;

    const result: CleanupResult = {
      success: true,
      deletedFiles: [],
      deletedCount: 0,
      freedSpace: 0,
      errors: [],
      dryRun,
    };

    try {
      // Build prefix from folder paths
      let prefix = "";
      if (folderPaths && folderPaths.length > 0) {
        // Find common prefix
        prefix = folderPaths[0];
        for (const path of folderPaths) {
          if (path.length < prefix.length) {
            prefix = path;
          }
        }
      }

      const cutoffDate = olderThanDays
        ? new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
        : undefined;

      let continuationToken: string | undefined;
      let hasMore = true;
      const filesToDelete: R2FileInfo[] = [];

      while (hasMore) {
        const listResult = await this.listFiles({
          prefix,
          maxKeys: 1000,
          continuationToken,
        });

        for (const file of listResult.files) {
          // Apply filters
          let shouldDelete = true;

          // Check age filter
          if (cutoffDate && file.lastModified >= cutoffDate) {
            shouldDelete = false;
          }

          // Check size filter
          if (largerThanBytes && file.size <= largerThanBytes) {
            shouldDelete = false;
          }

          // Check folder path filter
          if (folderPaths && folderPaths.length > 0) {
            const matchesFolder = folderPaths.some((path) =>
              file.key.startsWith(path),
            );
            if (!matchesFolder) {
              shouldDelete = false;
            }
          }

          if (shouldDelete) {
            filesToDelete.push(file);

            // Check max files limit
            if (maxFiles && filesToDelete.length >= maxFiles) {
              break;
            }
          }
        }

        continuationToken = listResult.nextToken;
        hasMore = listResult.isTruncated;

        // Stop if we reached max files
        if (maxFiles && filesToDelete.length >= maxFiles) {
          break;
        }
      }

      if (dryRun) {
        // Just return what would be deleted
        result.deletedFiles = filesToDelete;
        result.deletedCount = filesToDelete.length;
        result.freedSpace = filesToDelete.reduce((sum, f) => sum + f.size, 0);
      } else {
        // Actually delete the files
        const keysToDelete = filesToDelete.map((f) => f.key);
        const deleteResult = await this.deleteFiles(keysToDelete);

        result.deletedFiles = filesToDelete.filter((f) =>
          deleteResult.deleted.includes(f.key),
        );
        result.deletedCount = deleteResult.deleted.length;
        result.errors = deleteResult.failed.map((f) => f.error);
        result.freedSpace = result.deletedFiles.reduce(
          (sum, f) => sum + f.size,
          0,
        );
        result.success = deleteResult.failed.length === 0;
      }

      console.log(
        `[R2_BUCKET_MANAGER] Cleanup ${dryRun ? "preview" : "completed"}: ${result.deletedCount} files, ${this.formatBytes(result.freedSpace)} freed`,
      );

      return result;
    } catch (error: any) {
      result.success = false;
      result.errors.push(error.message);
      console.error("[R2_BUCKET_MANAGER] Error during cleanup:", error);
      return result;
    }
  }

  /**
   * Delete file versions (for objects with versioning enabled)
   */
  static async deleteFileVersions(
    key: string,
  ): Promise<{ deleted: number; errors: string[] }> {
    try {
      const client = this.getClient();
      const command = new ListObjectVersionsCommand({
        Bucket: this.config.bucketName,
        Prefix: key,
      });

      const response = await client.send(command);

      const versions = [
        ...(response.Versions || []),
        ...(response.DeleteMarkers || []),
      ];

      if (versions.length === 0) {
        return { deleted: 0, errors: [] };
      }

      const errors: string[] = [];

      // Delete in batches
      const batchSize = 1000;
      let deleted = 0;

      for (let i = 0; i < versions.length; i += batchSize) {
        const batch = versions.slice(i, i + batchSize);

        const deleteCommand = new DeleteObjectsCommand({
          Bucket: this.config.bucketName,
          Delete: {
            Objects: batch.map((v) => ({
              Key: v.Key!,
              VersionId: v.VersionId,
            })),
            Quiet: true,
          },
        });

        try {
          await client.send(deleteCommand);
          deleted += batch.length;
        } catch (error: any) {
          errors.push(error.message);
        }
      }

      console.log(`[R2_BUCKET_MANAGER] Deleted ${deleted} versions of ${key}`);

      return { deleted, errors };
    } catch (error: any) {
      console.error(`[R2_BUCKET_MANAGER] Error deleting file versions:`, error);
      throw new Error(`Failed to delete file versions: ${error.message}`);
    }
  }

  /**
   * Clean up orphaned files (files not referenced in database)
   */
  static async cleanupOrphanedFiles(
    referencedKeys: Set<string>,
    dryRun: boolean = false,
  ): Promise<CleanupResult> {
    const result: CleanupResult = {
      success: true,
      deletedFiles: [],
      deletedCount: 0,
      freedSpace: 0,
      errors: [],
      dryRun,
    };

    try {
      let continuationToken: string | undefined;
      let hasMore = true;

      const orphanedFiles: R2FileInfo[] = [];

      while (hasMore) {
        const listResult = await this.listFiles({
          maxKeys: 1000,
          continuationToken,
        });

        for (const file of listResult.files) {
          if (!referencedKeys.has(file.key)) {
            orphanedFiles.push(file);
          }
        }

        continuationToken = listResult.nextToken;
        hasMore = listResult.isTruncated;
      }

      if (dryRun) {
        result.deletedFiles = orphanedFiles;
        result.deletedCount = orphanedFiles.length;
        result.freedSpace = orphanedFiles.reduce((sum, f) => sum + f.size, 0);
      } else {
        const keysToDelete = orphanedFiles.map((f) => f.key);
        const deleteResult = await this.deleteFiles(keysToDelete);

        result.deletedFiles = orphanedFiles.filter((f) =>
          deleteResult.deleted.includes(f.key),
        );
        result.deletedCount = deleteResult.deleted.length;
        result.errors = deleteResult.failed.map((f) => f.error);
        result.freedSpace = result.deletedFiles.reduce(
          (sum, f) => sum + f.size,
          0,
        );
        result.success = deleteResult.failed.length === 0;
      }

      console.log(
        `[R2_BUCKET_MANAGER] Orphaned files cleanup ${dryRun ? "preview" : "completed"}: ${result.deletedCount} files`,
      );

      return result;
    } catch (error: any) {
      result.success = false;
      result.errors.push(error.message);
      console.error(
        "[R2_BUCKET_MANAGER] Error during orphaned files cleanup:",
        error,
      );
      return result;
    }
  }

  /**
   * Get cleanup recommendations based on storage analysis
   */
  static async getCleanupRecommendations(userId?: string): Promise<{
    totalFiles: number;
    totalSize: number;
    oldestFile: Date | null;
    recommendations: Array<{
      type: string;
      description: string;
      estimatedFiles: number;
      estimatedSpace: number;
    }>;
  }> {
    const stats = await this.getStorageStats(userId);
    const recommendations: Array<{
      type: string;
      description: string;
      estimatedFiles: number;
      estimatedSpace: number;
    }> = [];

    // Recommendation: Old temp files
    const tempFiles = await this.listFolderFiles(
      userId ? `users/${userId}/mockups/temp` : "mockups/temp",
    );
    if (tempFiles.length > 0) {
      recommendations.push({
        type: "temp_files",
        description: "Temporary mockup files older than 7 days",
        estimatedFiles: tempFiles.length,
        estimatedSpace: tempFiles.reduce((sum, f) => sum + f.size, 0),
      });
    }

    // Recommendation: Large files - filter folders over 10MB first
    const largeFolderPromises = Object.entries(stats.sizeByFolder)
      .filter(([_, data]) => data.size > 10 * 1024 * 1024)
      .map(([folder]) => this.listFolderFiles(folder));

    const largeFilesArrays = await Promise.all(largeFolderPromises);
    let uniqueLargeFiles: R2FileInfo[] = [];

    for (const files of largeFilesArrays) {
      uniqueLargeFiles = [...uniqueLargeFiles, ...files];
    }

    // Deduplicate by key
    const seenKeys = new Set<string>();
    uniqueLargeFiles = uniqueLargeFiles.filter((f) => {
      if (seenKeys.has(f.key)) return false;
      seenKeys.add(f.key);
      return true;
    });

    if (uniqueLargeFiles.length > 0) {
      recommendations.push({
        type: "large_files",
        description: "Files in folders larger than 10MB",
        estimatedFiles: uniqueLargeFiles.length,
        estimatedSpace: uniqueLargeFiles.reduce((sum, f) => sum + f.size, 0),
      });
    }

    // Recommendation: Old files by type
    const oldFilesByType = await this.findOldFilesByType(
      userId,
      90, // 90 days
    );
    if (oldFilesByType.total > 0) {
      recommendations.push({
        type: "old_files",
        description: "Files older than 90 days",
        estimatedFiles: oldFilesByType.total,
        estimatedSpace: oldFilesByType.size,
      });
    }

    return {
      totalFiles: stats.totalFiles,
      totalSize: stats.totalSize,
      oldestFile: stats.oldestFile || null,
      recommendations,
    };
  }

  /**
   * Find old files by type
   */
  static async findOldFilesByType(
    userId: string | undefined,
    olderThanDays: number,
  ): Promise<{ total: number; size: number }> {
    const cutoffDate = new Date(
      Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
    );
    let total = 0;
    let size = 0;

    let continuationToken: string | undefined;
    let hasMore = true;
    const prefix = userId ? `users/${userId}` : "";

    while (hasMore) {
      const result = await this.listFiles({
        prefix,
        maxKeys: 1000,
        continuationToken,
      });

      for (const file of result.files) {
        if (file.lastModified < cutoffDate) {
          total++;
          size += file.size;
        }
      }

      continuationToken = result.nextToken;
      hasMore = result.isTruncated;
    }

    return { total, size };
  }

  /**
   * Format bytes to human readable string
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * Get bucket configuration status
   */
  static getBucketStatus(): {
    bucketName: string;
    publicBucketUrl: string;
    accountId: string;
    isConfigured: boolean;
  } {
    try {
      const config = R2Config.getConfig();
      return {
        bucketName: config.bucketName,
        publicBucketUrl: config.publicBucketUrl,
        accountId: config.accountId,
        isConfigured: true,
      };
    } catch (error) {
      return {
        bucketName: "",
        publicBucketUrl: "",
        accountId: "",
        isConfigured: false,
      };
    }
  }

  // ===== FOLDER MANAGEMENT METHODS =====

  /**
   * Folder information interface
   */
  static async listFolders(prefix: string = "users/"): Promise<{
    folders: string[];
    count: number;
  }> {
    try {
      const client = this.getClient();
      const config = this.config;

      const command = new ListObjectsV2Command({
        Bucket: config.bucketName,
        Prefix: prefix,
        Delimiter: "/",
      });

      const response = await client.send(command);

      // Extract folder prefixes (common prefixes in S3/R2)
      const folders = (response.CommonPrefixes || []).map(
        (cp) => cp.Prefix || "",
      );

      return {
        folders,
        count: folders.length,
      };
    } catch (error: any) {
      console.error("[R2_BUCKET_MANAGER] Error listing folders:", error);
      throw new Error(`Failed to list folders: ${error.message}`);
    }
  }

  /**
   * List all user folders (top-level folders under users/)
   */
  static async listUserFolders(): Promise<{
    folders: { name: string; path: string }[];
    count: number;
  }> {
    try {
      const { folders } = await this.listFolders("users/");

      const userFolders = folders
        .map((path) => {
          // Extract folder name from path like "users/john-doe/"
          const parts = path.replace("users/", "").split("/");
          return {
            name: parts[0],
            path: path,
          };
        })
        .filter((f) => f.name); // Filter out empty names

      return {
        folders: userFolders,
        count: userFolders.length,
      };
    } catch (error: any) {
      console.error("[R2_BUCKET_MANAGER] Error listing user folders:", error);
      throw new Error(`Failed to list user folders: ${error.message}`);
    }
  }

  /**
   * Check if a folder exists
   */
  static async folderExists(folderPath: string): Promise<boolean> {
    try {
      const client = this.getClient();
      const config = this.config;

      // Add trailing slash if not present
      const normalizedPath = folderPath.endsWith("/")
        ? folderPath
        : `${folderPath}/`;

      const command = new ListObjectsV2Command({
        Bucket: config.bucketName,
        Prefix: normalizedPath,
        MaxKeys: 1,
      });

      const response = await client.send(command);
      return (
        (response.Contents?.length || 0) > 0 ||
        (response.CommonPrefixes?.length || 0) > 0
      );
    } catch (error: any) {
      console.error("[R2_BUCKET_MANAGER] Error checking folder exists:", error);
      return false;
    }
  }

  /**
   * Create a folder (folder marker)
   */
  static async createFolder(folderPath: string): Promise<boolean> {
    try {
      const client = this.getClient();
      const config = this.config;

      // Normalize path
      const normalizedPath = folderPath.endsWith("/")
        ? folderPath
        : `${folderPath}/`;
      const markerPath = `${normalizedPath}.folder_marker`;

      const command = new PutObjectCommand({
        Bucket: config.bucketName,
        Key: markerPath,
        Body: "",
        ContentType: "application/x-directory",
      });

      await client.send(command);
      console.log(`[R2_BUCKET_MANAGER] Created folder: ${normalizedPath}`);
      return true;
    } catch (error: any) {
      console.error("[R2_BUCKET_MANAGER] Error creating folder:", error);
      throw new Error(`Failed to create folder: ${error.message}`);
    }
  }

  /**
   * Delete a folder and all its contents
   */
  static async deleteFolder(
    folderPath: string,
    options?: { dryRun?: boolean },
  ): Promise<{
    success: boolean;
    deletedFiles: string[];
    deletedFolders: string[];
    error?: string;
  }> {
    try {
      const client = this.getClient();
      const config = this.config;

      // Normalize path
      const normalizedPath = folderPath.endsWith("/")
        ? folderPath
        : `${folderPath}/`;

      // First, list all objects in the folder
      const listCommand = new ListObjectsV2Command({
        Bucket: config.bucketName,
        Prefix: normalizedPath,
      });

      const response = await client.send(listCommand);
      const objects = response.Contents || [];

      if (objects.length === 0) {
        return {
          success: true,
          deletedFiles: [],
          deletedFolders: [],
        };
      }

      const deletedFiles: string[] = [];
      const deletedFolders: string[] = [];

      if (!options?.dryRun) {
        // Delete all objects in batches
        const batchSize = 1000;
        for (let i = 0; i < objects.length; i += batchSize) {
          const batch = objects.slice(i, i + batchSize);
          const deleteCommand = new DeleteObjectsCommand({
            Bucket: config.bucketName,
            Delete: {
              Objects: batch.map((obj) => ({ Key: obj.Key })),
              Quiet: true,
            },
          });

          await client.send(deleteCommand);
          batch.forEach((obj) => {
            deletedFiles.push(obj.Key || "");
          });
        }

        // Also delete the folder markers (common prefixes)
        const commonPrefixes = response.CommonPrefixes || [];
        for (const prefix of commonPrefixes) {
          deletedFolders.push(prefix.Prefix || "");
        }
      }

      console.log(
        `[R2_BUCKET_MANAGER] Deleted folder ${normalizedPath}: ${deletedFiles.length} files, ${deletedFolders.length} subfolders`,
      );

      return {
        success: true,
        deletedFiles,
        deletedFolders,
      };
    } catch (error: any) {
      console.error("[R2_BUCKET_MANAGER] Error deleting folder:", error);
      return {
        success: false,
        deletedFiles: [],
        deletedFolders: [],
        error: error.message,
      };
    }
  }

  /**
   * Get folder statistics (size, file count, etc.)
   */
  static async getFolderStats(folderPath: string): Promise<{
    totalFiles: number;
    totalSize: number;
    subfolders: string[];
    lastModified?: Date;
  }> {
    try {
      const client = this.getClient();
      const config = this.config;

      // Normalize path
      const normalizedPath = folderPath.endsWith("/")
        ? folderPath
        : `${folderPath}/`;

      const command = new ListObjectsV2Command({
        Bucket: config.bucketName,
        Prefix: normalizedPath,
      });

      const response = await client.send(command);
      const objects = response.Contents || [];
      const subfolders = (response.CommonPrefixes || []).map(
        (cp) => cp.Prefix || "",
      );

      let totalSize = 0;
      let lastModified: Date | undefined;

      for (const obj of objects) {
        totalSize += obj.Size || 0;
        if (
          !lastModified ||
          (obj.LastModified && obj.LastModified > lastModified)
        ) {
          lastModified = obj.LastModified;
        }
      }

      return {
        totalFiles: objects.length,
        totalSize,
        subfolders,
        lastModified,
      };
    } catch (error: any) {
      console.error("[R2_BUCKET_MANAGER] Error getting folder stats:", error);
      throw new Error(`Failed to get folder stats: ${error.message}`);
    }
  }

  /**
   * Get statistics for all user folders
   */
  static async getAllUserFoldersStats(): Promise<{
    folders: {
      name: string;
      path: string;
      totalFiles: number;
      totalSize: number;
      subfolders: string[];
    }[];
  }> {
    try {
      const { folders } = await this.listUserFolders();

      const folderStats = await Promise.all(
        folders.map(async (folder) => {
          const stats = await this.getFolderStats(folder.path);
          return {
            name: folder.name,
            path: folder.path,
            totalFiles: stats.totalFiles,
            totalSize: stats.totalSize,
            subfolders: stats.subfolders,
          };
        }),
      );

      return { folders: folderStats };
    } catch (error: any) {
      console.error(
        "[R2_BUCKET_MANAGER] Error getting all user folders stats:",
        error,
      );
      throw new Error(`Failed to get all user folders stats: ${error.message}`);
    }
  }

  /**
   * Copy/move a folder to a new location
   */
  static async copyFolder(
    sourcePath: string,
    destinationPath: string,
    options?: { dryRun?: boolean },
  ): Promise<{
    success: boolean;
    copiedFiles: number;
    error?: string;
  }> {
    try {
      const client = this.getClient();
      const config = this.config;

      // Normalize paths
      const normalizedSource = sourcePath.endsWith("/")
        ? sourcePath
        : `${sourcePath}/`;
      const normalizedDest = destinationPath.endsWith("/")
        ? destinationPath
        : `${destinationPath}/`;

      // List all objects in source folder
      const listCommand = new ListObjectsV2Command({
        Bucket: config.bucketName,
        Prefix: normalizedSource,
      });

      const response = await client.send(listCommand);
      const objects = response.Contents || [];

      if (objects.length === 0) {
        return {
          success: true,
          copiedFiles: 0,
        };
      }

      if (options?.dryRun) {
        return {
          success: true,
          copiedFiles: objects.length,
        };
      }

      // Copy each object
      const { CopyObjectCommand } = await import("@aws-sdk/client-s3");
      let copiedFiles = 0;

      for (const obj of objects) {
        const sourceKey = obj.Key;
        if (!sourceKey) continue;

        const destKey = sourceKey.replace(normalizedSource, normalizedDest);

        const copyCommand = new CopyObjectCommand({
          Bucket: config.bucketName,
          CopySource: `${config.bucketName}/${sourceKey}`,
          Key: destKey,
        });

        await client.send(copyCommand);
        copiedFiles++;
      }

      console.log(
        `[R2_BUCKET_MANAGER] Copied folder ${normalizedSource} to ${normalizedDest}: ${copiedFiles} files`,
      );

      return {
        success: true,
        copiedFiles,
      };
    } catch (error: any) {
      console.error("[R2_BUCKET_MANAGER] Error copying folder:", error);
      return {
        success: false,
        copiedFiles: 0,
        error: error.message,
      };
    }
  }
}

/**
 * Database record for tracking R2 files
 */
export interface R2FileRecord {
  id: string;
  fileKey: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  userId: string;
  folderPath: string;
  contentType?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
  migrationStatus: string;
}

/**
 * R2 File Database Manager - Track and manage file metadata in database
 */
export class R2FileDatabaseManager {
  private static prisma: any = null;

  /**
   * Get Prisma client
   */
  private static getPrisma() {
    if (!this.prisma) {
      const { PrismaClient } = require("@prisma/client");
      this.prisma = new PrismaClient();
    }
    return this.prisma;
  }

  /**
   * Get file record by key
   */
  static async getFileRecord(fileKey: string): Promise<R2FileRecord | null> {
    try {
      const prisma = this.getPrisma();
      const record = await prisma.r2FileMetadata.findUnique({
        where: { fileKey },
      });
      return record ? this.mapToRecord(record) : null;
    } catch (error: any) {
      console.error("[R2_FILE_DB_MANAGER] Error getting file record:", error);
      return null;
    }
  }

  /**
   * Get all files for a user
   */
  static async getUserFiles(
    userId: string,
    options: {
      includeInactive?: boolean;
      limit?: number;
      offset?: number;
      orderBy?: "createdAt" | "fileSize" | "fileName";
      orderDirection?: "asc" | "desc";
    } = {},
  ): Promise<{ files: R2FileRecord[]; total: number }> {
    try {
      const prisma = this.getPrisma();
      const {
        includeInactive = true,
        limit = 50,
        offset = 0,
        orderBy = "createdAt",
        orderDirection = "desc",
      } = options;

      // Build where clause - exclude deleted files if includeInactive is false
      const whereClause: any = { userId };
      if (!includeInactive) {
        whereClause.migrationStatus = { not: "deleted" };
      }

      const [files, total] = await Promise.all([
        prisma.r2FileMetadata.findMany({
          where: whereClause,
          orderBy: { [orderBy]: orderDirection },
          take: limit,
          skip: offset,
        }),
        prisma.r2FileMetadata.count({ where: whereClause }),
      ]);

      return {
        files: files.map((f: any) => this.mapToRecord(f)),
        total,
      };
    } catch (error: any) {
      console.error("[R2_FILE_DB_MANAGER] Error getting user files:", error);
      return { files: [], total: 0 };
    }
  }

  /**
   * Create or update file record
   */
  static async upsertFileRecord(data: {
    fileKey: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    userId: string;
    folderPath: string;
    contentType?: string;
    metadata?: Record<string, any>;
  }): Promise<R2FileRecord> {
    try {
      const prisma = this.getPrisma();
      const record = await prisma.r2FileMetadata.upsert({
        where: { fileKey: data.fileKey },
        update: {
          fileName: data.fileName,
          fileType: data.fileType,
          fileSize: BigInt(data.fileSize),
          folderPath: data.folderPath,
          contentType: data.contentType,
          metadata: data.metadata,
          updatedAt: new Date(),
        },
        create: {
          id: uuidv4(),
          fileKey: data.fileKey,
          fileName: data.fileName,
          fileType: data.fileType,
          fileSize: BigInt(data.fileSize),
          userId: data.userId,
          folderPath: data.folderPath,
          contentType: data.contentType,
          metadata: data.metadata || {},
          migrationStatus: "completed",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return this.mapToRecord(record);
    } catch (error: any) {
      console.error("[R2_FILE_DB_MANAGER] Error upserting file record:", error);
      throw error;
    }
  }

  /**
   * Mark file as deleted (soft delete)
   * Note: Using migrationStatus field for soft delete in existing schema
   */
  static async softDeleteFile(fileKey: string): Promise<boolean> {
    try {
      const prisma = this.getPrisma();
      // Update migrationStatus to indicate file is deleted/migrated
      await prisma.r2FileMetadata.update({
        where: { fileKey },
        data: { migrationStatus: "deleted", updatedAt: new Date() },
      });
      return true;
    } catch (error: any) {
      console.error("[R2_FILE_DB_MANAGER] Error soft deleting file:", error);
      return false;
    }
  }

  /**
   * Get referenced file keys for cleanup
   * Returns all active file keys (those not marked as deleted)
   */
  static async getReferencedFileKeys(): Promise<Set<string>> {
    try {
      const prisma = this.getPrisma();
      // Get all files that are not marked as deleted (migrationStatus !== 'deleted')
      const records = await prisma.r2FileMetadata.findMany({
        where: {
          migrationStatus: { not: "deleted" },
        },
        select: { fileKey: true },
      });
      return new Set(records.map((r: any) => r.fileKey));
    } catch (error: any) {
      console.error(
        "[R2_FILE_DB_MANAGER] Error getting referenced file keys:",
        error,
      );
      return new Set();
    }
  }

  /**
   * Get storage summary for a user
   */
  static async getUserStorageSummary(userId: string): Promise<{
    totalFiles: number;
    activeFiles: number;
    totalSize: number;
    sizeByType: Record<string, { count: number; size: number }>;
  }> {
    try {
      const prisma = this.getPrisma();
      const records = await prisma.r2FileMetadata.findMany({
        where: { userId },
      });

      const summary = {
        totalFiles: records.length,
        activeFiles: records.filter((r: any) => r.migrationStatus !== "deleted")
          .length,
        totalSize: 0,
        sizeByType: {} as Record<string, { count: number; size: number }>,
      };

      for (const record of records) {
        summary.totalSize += Number(record.fileSize);
        const type = record.fileType || "unknown";
        if (!summary.sizeByType[type]) {
          summary.sizeByType[type] = { count: 0, size: 0 };
        }
        summary.sizeByType[type].count++;
        summary.sizeByType[type].size += Number(record.fileSize);
      }

      return summary;
    } catch (error: any) {
      console.error(
        "[R2_FILE_DB_MANAGER] Error getting storage summary:",
        error,
      );
      return {
        totalFiles: 0,
        activeFiles: 0,
        totalSize: 0,
        sizeByType: {},
      };
    }
  }

  /**
   * Map database record to interface
   */
  private static mapToRecord(dbRecord: any): R2FileRecord {
    return {
      id: dbRecord.id,
      fileKey: dbRecord.fileKey,
      fileName: dbRecord.fileName,
      fileType: dbRecord.fileType,
      fileSize: Number(dbRecord.fileSize),
      userId: dbRecord.userId,
      folderPath: dbRecord.folderPath,
      contentType: dbRecord.contentType,
      metadata: dbRecord.metadata,
      createdAt: new Date(dbRecord.createdAt),
      updatedAt: new Date(dbRecord.updatedAt),
      lastAccessedAt: dbRecord.lastAccessedAt
        ? new Date(dbRecord.lastAccessedAt)
        : undefined,
      migrationStatus: dbRecord.migrationStatus || "completed",
    };
  }
}

// Export both managers
