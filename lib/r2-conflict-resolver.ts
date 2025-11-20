import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";
import { R2UserStorage } from "./r2-user-storage";
import { R2Config } from "./r2-config";
import {
  MockupType,
  AssetType,
  ExportType,
  ProfilePictureType,
} from "./r2-user-storage";

/**
 * Conflict resolution strategies
 */
export enum ConflictResolutionStrategy {
  TIMESTAMP = "timestamp", // Add timestamp: file_2025-10-07T11-23-00.ext
  UUID = "uuid", // Add UUID: file_abc12345.ext
  SEQUENTIAL = "sequential", // Add number: file_v1.ext, file_v2.ext
  CONTENT_HASH = "content_hash", // Use content hash: file_abc123def456.ext
  OVERWRITE = "overwrite", // Replace existing file
  RENAME = "rename", // Prompt user for new name
  SKIP = "skip", // Skip conflicting file
}

/**
 * File conflict information
 */
export interface FileConflict {
  originalName: string;
  conflictingPath: string;
  conflictType: ConflictType;
  existingFiles: ExistingFileInfo[];
  suggestedResolutions: ConflictResolution[];
  defaultStrategy: ConflictResolutionStrategy;
}

/**
 * Types of file conflicts
 */
export enum ConflictType {
  EXACT_NAME_MATCH = "exact_name_match",
  CASE_INSENSITIVE_MATCH = "case_insensitive_match",
  SPECIAL_CHAR_VARIATION = "special_char_variation",
  SIMILAR_NAME = "similar_name",
}

/**
 * Information about existing files
 */
export interface ExistingFileInfo {
  key: string;
  name: string;
  size: number;
  lastModified: Date;
  etag?: string;
  isDuplicate: boolean;
}

/**
 * Conflict resolution options
 */
export interface ConflictResolution {
  strategy: ConflictResolutionStrategy;
  resolvedName: string;
  resolvedPath: string;
  requiresUserInput: boolean;
  description: string;
}

/**
 * Batch conflict resolution result
 */
export interface BatchConflictResolution {
  totalFiles: number;
  conflicts: FileConflict[];
  resolutions: ConflictResolution[];
  skipped: string[];
  errors: ConflictError[];
}

/**
 * Conflict resolution error
 */
export interface ConflictError {
  filename: string;
  error: string;
  strategy?: ConflictResolutionStrategy;
}

/**
 * Version control information
 */
export interface FileVersionInfo {
  key: string;
  version: number;
  createdAt: Date;
  size: number;
  contentType: string;
  isActive: boolean;
}

/**
 * Conflict resolution configuration
 */
export interface ConflictResolutionConfig {
  defaultStrategy: ConflictResolutionStrategy;
  enableVersionControl: boolean;
  maxVersions: number;
  autoResolveDuplicates: boolean;
  preserveOriginalNames: boolean;
  contentTypeStrategies: Record<string, ConflictResolutionStrategy>;
}

/**
 * Default configuration for conflict resolution
 */
const DEFAULT_CONFIG: ConflictResolutionConfig = {
  defaultStrategy: ConflictResolutionStrategy.TIMESTAMP,
  enableVersionControl: true,
  maxVersions: 10,
  autoResolveDuplicates: true,
  preserveOriginalNames: true,
  contentTypeStrategies: {
    profilePicture: ConflictResolutionStrategy.TIMESTAMP,
    mockup: ConflictResolutionStrategy.SEQUENTIAL,
    asset: ConflictResolutionStrategy.UUID,
    export: ConflictResolutionStrategy.TIMESTAMP,
  },
};

/**
 * Comprehensive file naming conflict resolver for R2 storage
 */
export class R2ConflictResolver {
  private config: ConflictResolutionConfig;
  private versionCache: Map<string, FileVersionInfo[]> = new Map();
  private conflictDetectionCache: Map<string, FileConflict | null> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(config?: Partial<ConflictResolutionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Detect file naming conflicts
   * @param userId - User ID
   * @param folderPath - Folder path to check
   * @param filename - Filename to check
   * @returns Conflict information or null if no conflict
   */
  async detectConflict(
    userId: string,
    folderPath: string,
    filename: string
  ): Promise<FileConflict | null> {
    try {
      const normalizedFilename = this.normalizeFilename(filename);
      const existingFiles = await this.findExistingFiles(
        userId,
        folderPath,
        normalizedFilename
      );

      if (existingFiles.length === 0) {
        return null;
      }

      const conflictType = this.determineConflictType(
        normalizedFilename,
        existingFiles
      );
      const defaultStrategy = this.getDefaultStrategy(folderPath);
      const suggestedResolutions = await this.generateResolutions(
        userId,
        folderPath,
        normalizedFilename,
        existingFiles,
        defaultStrategy
      );

      return {
        originalName: filename,
        conflictingPath: `${folderPath}/${normalizedFilename}`,
        conflictType,
        existingFiles,
        suggestedResolutions,
        defaultStrategy,
      };
    } catch (error) {
      console.error(
        `[R2_CONFLICT_RESOLVER] Error detecting conflict for ${filename}:`,
        error
      );
      throw new Error(`Failed to detect conflict: ${error.message}`);
    }
  }

  /**
   * Resolve a file naming conflict using the specified strategy
   * @param userId - User ID
   * @param conflict - Conflict information
   * @param strategy - Resolution strategy to use
   * @param customName - Custom name (required for RENAME strategy)
   * @returns Resolved file path
   */
  async resolveConflict(
    userId: string,
    conflict: FileConflict,
    strategy: ConflictResolutionStrategy,
    customName?: string
  ): Promise<ConflictResolution> {
    try {
      switch (strategy) {
        case ConflictResolutionStrategy.TIMESTAMP:
          return this.resolveWithTimestamp(userId, conflict);

        case ConflictResolutionStrategy.UUID:
          return this.resolveWithUUID(userId, conflict);

        case ConflictResolutionStrategy.SEQUENTIAL:
          return this.resolveWithSequential(userId, conflict);

        case ConflictResolutionStrategy.CONTENT_HASH:
          return await this.resolveWithContentHash(userId, conflict);

        case ConflictResolutionStrategy.OVERWRITE:
          return this.resolveWithOverwrite(userId, conflict);

        case ConflictResolutionStrategy.RENAME:
          if (!customName) {
            throw new Error("Custom name is required for RENAME strategy");
          }
          return this.resolveWithCustomName(userId, conflict, customName);

        case ConflictResolutionStrategy.SKIP:
          return this.resolveWithSkip(conflict);

        default:
          throw new Error(
            `Unsupported conflict resolution strategy: ${strategy}`
          );
      }
    } catch (error) {
      console.error(`[R2_CONFLICT_RESOLVER] Error resolving conflict:`, error);
      throw new Error(
        `Failed to resolve conflict: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Resolve multiple conflicts in batch
   * @param userId - User ID
   * @param conflicts - Array of conflicts
   * @param strategy - Default strategy for all conflicts
   * @returns Batch resolution result
   */
  async resolveBatchConflicts(
    userId: string,
    conflicts: FileConflict[],
    strategy: ConflictResolutionStrategy
  ): Promise<BatchConflictResolution> {
    const resolutions: ConflictResolution[] = [];
    const skipped: string[] = [];
    const errors: ConflictError[] = [];

    for (const conflict of conflicts) {
      try {
        if (strategy === ConflictResolutionStrategy.SKIP) {
          skipped.push(conflict.originalName);
          continue;
        }

        const resolution = await this.resolveConflict(
          userId,
          conflict,
          strategy
        );
        resolutions.push(resolution);
      } catch (error) {
        errors.push({
          filename: conflict.originalName,
          error: error instanceof Error ? error.message : "Unknown error",
          strategy,
        });
      }
    }

    return {
      totalFiles: conflicts.length,
      conflicts,
      resolutions,
      skipped,
      errors,
    };
  }

  /**
   * Get file version history
   * @param userId - User ID
   * @param basePath - Base file path (without version)
   * @returns Array of version information
   */
  async getFileVersions(
    userId: string,
    basePath: string
  ): Promise<FileVersionInfo[]> {
    try {
      if (this.versionCache.has(basePath)) {
        return this.versionCache.get(basePath)!;
      }

      const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
      const client = R2Config.getS3Client();
      const config = R2Config.getConfig();

      const versions: FileVersionInfo[] = [];
      let continuationToken: string | undefined;

      do {
        const command = new ListObjectsV2Command({
          Bucket: config.bucketName,
          Prefix: basePath,
          ContinuationToken: continuationToken,
        });

        const response = await client.send(command);

        if (response.Contents) {
          for (const object of response.Contents) {
            if (object.Key) {
              const version = this.extractVersionFromKey(object.Key, basePath);
              versions.push({
                key: object.Key,
                version,
                createdAt: object.LastModified || new Date(),
                size: object.Size || 0,
                contentType: await this.getContentType(object.Key),
                isActive:
                  version ===
                  this.getLatestVersion(versions.map((v) => v.version)),
              });
            }
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      this.versionCache.set(basePath, versions);
      return versions;
    } catch (error) {
      console.error(
        `[R2_CONFLICT_RESOLVER] Error getting file versions:`,
        error
      );
      throw new Error(
        `Failed to get file versions: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Clean up old versions based on configuration
   * @param userId - User ID
   * @param basePath - Base file path
   * @returns Number of versions cleaned up
   */
  async cleanupOldVersions(userId: string, basePath: string): Promise<number> {
    try {
      if (!this.config.enableVersionControl) {
        return 0;
      }

      const versions = await this.getFileVersions(userId, basePath);
      const sortedVersions = versions.sort((a, b) => b.version - a.version);

      if (sortedVersions.length <= this.config.maxVersions) {
        return 0;
      }

      const versionsToDelete = sortedVersions.slice(this.config.maxVersions);
      let deletedCount = 0;

      for (const version of versionsToDelete) {
        try {
          await R2UserStorage.deleteFile(version.key);
          deletedCount++;
        } catch (error) {
          console.error(
            `[R2_CONFLICT_RESOLVER] Error deleting version ${version.key}:`,
            error
          );
        }
      }

      // Update cache
      this.versionCache.set(
        basePath,
        sortedVersions.slice(0, this.config.maxVersions)
      );

      return deletedCount;
    } catch (error) {
      console.error(
        `[R2_CONFLICT_RESOLVER] Error cleaning up versions:`,
        error
      );
      throw new Error(
        `Failed to cleanup versions: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Normalize filename for comparison
   * @param filename - Original filename
   * @returns Normalized filename
   */
  private normalizeFilename(filename: string): string {
    return filename.toLowerCase().replace(/[^a-z0-9.-]/g, "_");
  }

  /**
   * Find existing files that might conflict
   * @param userId - User ID
   * @param folderPath - Folder path
   * @param filename - Filename to check
   * @returns Array of existing file information
   */
  private async findExistingFiles(
    userId: string,
    folderPath: string,
    filename: string
  ): Promise<ExistingFileInfo[]> {
    try {
      const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
      const client = R2Config.getS3Client();
      const config = R2Config.getConfig();

      const existingFiles: ExistingFileInfo[] = [];
      const normalizedFilename = this.normalizeFilename(filename);
      const filenameWithoutExt = normalizedFilename
        .split(".")
        .slice(0, -1)
        .join(".");
      const extension = normalizedFilename.split(".").pop() || "";

      const command = new ListObjectsV2Command({
        Bucket: config.bucketName,
        Prefix: folderPath,
      });

      const response = await client.send(command);

      if (response.Contents) {
        for (const object of response.Contents) {
          if (object.Key && object.Key.endsWith(extension)) {
            const objectName = object.Key.split("/").pop() || "";
            const normalizedObjectName = this.normalizeFilename(objectName);
            const objectNameWithoutExt = normalizedObjectName
              .split(".")
              .slice(0, -1)
              .join("");

            // Check for various conflict types
            if (
              normalizedObjectName === normalizedFilename ||
              objectNameWithoutExt.startsWith(filenameWithoutExt)
            ) {
              existingFiles.push({
                key: object.Key,
                name: objectName,
                size: object.Size || 0,
                lastModified: object.LastModified || new Date(),
                etag: object.ETag,
                isDuplicate: normalizedObjectName === normalizedFilename,
              });
            }
          }
        }
      }

      return existingFiles;
    } catch (error) {
      console.error(
        `[R2_CONFLICT_RESOLVER] Error finding existing files:`,
        error
      );
      throw new Error(
        `Failed to find existing files: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Determine the type of conflict
   * @param filename - Filename to check
   * @param existingFiles - Array of existing files
   * @returns Conflict type
   */
  private determineConflictType(
    filename: string,
    existingFiles: ExistingFileInfo[]
  ): ConflictType {
    const exactMatch = existingFiles.find(
      (f) => this.normalizeFilename(f.name) === this.normalizeFilename(filename)
    );

    if (exactMatch) {
      return ConflictType.EXACT_NAME_MATCH;
    }

    const caseInsensitiveMatch = existingFiles.find(
      (f) =>
        f.name.toLowerCase() === filename.toLowerCase() && f.name !== filename
    );

    if (caseInsensitiveMatch) {
      return ConflictType.CASE_INSENSITIVE_MATCH;
    }

    const specialCharMatch = existingFiles.find((f) => {
      const normalized1 = this.normalizeFilename(f.name);
      const normalized2 = this.normalizeFilename(filename);
      return normalized1 === normalized2 && f.name !== filename;
    });

    if (specialCharMatch) {
      return ConflictType.SPECIAL_CHAR_VARIATION;
    }

    return ConflictType.SIMILAR_NAME;
  }

  /**
   * Get default strategy based on content type
   * @param folderPath - Folder path
   * @returns Default conflict resolution strategy
   */
  private getDefaultStrategy(folderPath: string): ConflictResolutionStrategy {
    for (const [contentType, strategy] of Object.entries(
      this.config.contentTypeStrategies
    )) {
      if (folderPath.includes(contentType)) {
        return strategy;
      }
    }
    return this.config.defaultStrategy;
  }

  /**
   * Generate resolution options for a conflict
   * @param userId - User ID
   * @param folderPath - Folder path
   * @param filename - Filename
   * @param existingFiles - Existing files
   * @param defaultStrategy - Default strategy
   * @returns Array of resolution options
   */
  private async generateResolutions(
    userId: string,
    folderPath: string,
    filename: string,
    existingFiles: ExistingFileInfo[],
    defaultStrategy: ConflictResolutionStrategy
  ): Promise<ConflictResolution[]> {
    const resolutions: ConflictResolution[] = [];
    const extension = filename.split(".").pop() || "";
    const filenameWithoutExt = filename.split(".").slice(0, -1).join(".");

    // Timestamp strategy
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const timestampName = `${filenameWithoutExt}_${timestamp}.${extension}`;
    resolutions.push({
      strategy: ConflictResolutionStrategy.TIMESTAMP,
      resolvedName: timestampName,
      resolvedPath: `${folderPath}/${timestampName}`,
      requiresUserInput: false,
      description: `Add timestamp to filename: ${timestampName}`,
    });

    // UUID strategy
    const uuid = uuidv4().slice(0, 8);
    const uuidName = `${filenameWithoutExt}_${uuid}.${extension}`;
    resolutions.push({
      strategy: ConflictResolutionStrategy.UUID,
      resolvedName: uuidName,
      resolvedPath: `${folderPath}/${uuidName}`,
      requiresUserInput: false,
      description: `Add UUID to filename: ${uuidName}`,
    });

    // Sequential strategy
    const nextVersion = this.getNextSequentialVersion(existingFiles);
    const sequentialName = `${filenameWithoutExt}_v${nextVersion}.${extension}`;
    resolutions.push({
      strategy: ConflictResolutionStrategy.SEQUENTIAL,
      resolvedName: sequentialName,
      resolvedPath: `${folderPath}/${sequentialName}`,
      requiresUserInput: false,
      description: `Add version number: ${sequentialName}`,
    });

    // Content hash strategy (requires file content)
    resolutions.push({
      strategy: ConflictResolutionStrategy.CONTENT_HASH,
      resolvedName: "", // Will be filled when content is available
      resolvedPath: "",
      requiresUserInput: false,
      description: "Use content hash for unique filename",
    });

    // Overwrite strategy
    resolutions.push({
      strategy: ConflictResolutionStrategy.OVERWRITE,
      resolvedName: filename,
      resolvedPath: `${folderPath}/${filename}`,
      requiresUserInput: false,
      description: "Replace existing file",
    });

    // Rename strategy
    resolutions.push({
      strategy: ConflictResolutionStrategy.RENAME,
      resolvedName: "",
      resolvedPath: "",
      requiresUserInput: true,
      description: "Choose a custom filename",
    });

    // Skip strategy
    resolutions.push({
      strategy: ConflictResolutionStrategy.SKIP,
      resolvedName: filename,
      resolvedPath: `${folderPath}/${filename}`,
      requiresUserInput: false,
      description: "Skip this file",
    });

    return resolutions;
  }

  /**
   * Get next sequential version number
   * @param existingFiles - Array of existing files
   * @returns Next version number
   */
  private getNextSequentialVersion(existingFiles: ExistingFileInfo[]): number {
    let maxVersion = 0;

    for (const file of existingFiles) {
      const versionMatch = file.name.match(/_v(\d+)\./);
      if (versionMatch) {
        const version = parseInt(versionMatch[1]);
        if (version > maxVersion) {
          maxVersion = version;
        }
      }
    }

    return maxVersion + 1;
  }

  /**
   * Resolve conflict with timestamp
   * @param userId - User ID
   * @param conflict - Conflict information
   * @returns Resolution result
   */
  private resolveWithTimestamp(
    userId: string,
    conflict: FileConflict
  ): ConflictResolution {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const extension = conflict.originalName.split(".").pop() || "";
    const filenameWithoutExt = conflict.originalName
      .split(".")
      .slice(0, -1)
      .join(".");
    const resolvedName = `${filenameWithoutExt}_${timestamp}.${extension}`;
    const folderPath = conflict.conflictingPath
      .split("/")
      .slice(0, -1)
      .join("/");

    return {
      strategy: ConflictResolutionStrategy.TIMESTAMP,
      resolvedName,
      resolvedPath: `${folderPath}/${resolvedName}`,
      requiresUserInput: false,
      description: `Resolved with timestamp: ${resolvedName}`,
    };
  }

  /**
   * Resolve conflict with UUID
   * @param userId - User ID
   * @param conflict - Conflict information
   * @returns Resolution result
   */
  private resolveWithUUID(
    userId: string,
    conflict: FileConflict
  ): ConflictResolution {
    const uuid = uuidv4().slice(0, 8);
    const extension = conflict.originalName.split(".").pop() || "";
    const filenameWithoutExt = conflict.originalName
      .split(".")
      .slice(0, -1)
      .join(".");
    const resolvedName = `${filenameWithoutExt}_${uuid}.${extension}`;
    const folderPath = conflict.conflictingPath
      .split("/")
      .slice(0, -1)
      .join("/");

    return {
      strategy: ConflictResolutionStrategy.UUID,
      resolvedName,
      resolvedPath: `${folderPath}/${resolvedName}`,
      requiresUserInput: false,
      description: `Resolved with UUID: ${resolvedName}`,
    };
  }

  /**
   * Resolve conflict with sequential numbering
   * @param userId - User ID
   * @param conflict - Conflict information
   * @returns Resolution result
   */
  private resolveWithSequential(
    userId: string,
    conflict: FileConflict
  ): ConflictResolution {
    const nextVersion = this.getNextSequentialVersion(conflict.existingFiles);
    const extension = conflict.originalName.split(".").pop() || "";
    const filenameWithoutExt = conflict.originalName
      .split(".")
      .slice(0, -1)
      .join(".");
    const resolvedName = `${filenameWithoutExt}_v${nextVersion}.${extension}`;
    const folderPath = conflict.conflictingPath
      .split("/")
      .slice(0, -1)
      .join("/");

    return {
      strategy: ConflictResolutionStrategy.SEQUENTIAL,
      resolvedName,
      resolvedPath: `${folderPath}/${resolvedName}`,
      requiresUserInput: false,
      description: `Resolved with sequential numbering: ${resolvedName}`,
    };
  }

  /**
   * Resolve conflict with content hash
   * @param userId - User ID
   * @param conflict - Conflict information
   * @returns Resolution result
   */
  private async resolveWithContentHash(
    userId: string,
    conflict: FileConflict
  ): Promise<ConflictResolution> {
    // This would need the actual file content to generate hash
    // For now, return a placeholder that would be filled during actual upload
    const extension = conflict.originalName.split(".").pop() || "";
    const filenameWithoutExt = conflict.originalName
      .split(".")
      .slice(0, -1)
      .join(".");
    const placeholderHash = "content_hash_placeholder";
    const resolvedName = `${filenameWithoutExt}_${placeholderHash}.${extension}`;
    const folderPath = conflict.conflictingPath
      .split("/")
      .slice(0, -1)
      .join("/");

    return {
      strategy: ConflictResolutionStrategy.CONTENT_HASH,
      resolvedName,
      resolvedPath: `${folderPath}/${resolvedName}`,
      requiresUserInput: false,
      description: `Resolved with content hash: ${resolvedName}`,
    };
  }

  /**
   * Resolve conflict by overwriting
   * @param userId - User ID
   * @param conflict - Conflict information
   * @returns Resolution result
   */
  private resolveWithOverwrite(
    userId: string,
    conflict: FileConflict
  ): ConflictResolution {
    return {
      strategy: ConflictResolutionStrategy.OVERWRITE,
      resolvedName: conflict.originalName,
      resolvedPath: conflict.conflictingPath,
      requiresUserInput: false,
      description: `Resolved by overwriting existing file: ${conflict.originalName}`,
    };
  }

  /**
   * Resolve conflict with custom name
   * @param userId - User ID
   * @param conflict - Conflict information
   * @param customName - Custom filename
   * @returns Resolution result
   */
  private resolveWithCustomName(
    userId: string,
    conflict: FileConflict,
    customName: string
  ): ConflictResolution {
    const folderPath = conflict.conflictingPath
      .split("/")
      .slice(0, -1)
      .join("/");

    return {
      strategy: ConflictResolutionStrategy.RENAME,
      resolvedName: customName,
      resolvedPath: `${folderPath}/${customName}`,
      requiresUserInput: false,
      description: `Resolved with custom name: ${customName}`,
    };
  }

  /**
   * Resolve conflict by skipping
   * @param conflict - Conflict information
   * @returns Resolution result
   */
  private resolveWithSkip(conflict: FileConflict): ConflictResolution {
    return {
      strategy: ConflictResolutionStrategy.SKIP,
      resolvedName: conflict.originalName,
      resolvedPath: conflict.conflictingPath,
      requiresUserInput: false,
      description: `Skipped file: ${conflict.originalName}`,
    };
  }

  /**
   * Extract version number from file key
   * @param key - File key
   * @param basePath - Base path
   * @returns Version number
   */
  private extractVersionFromKey(key: string, basePath: string): number {
    const filename = key.replace(basePath, "").replace(/^\//, "");
    const versionMatch = filename.match(/_v(\d+)\./);
    return versionMatch ? parseInt(versionMatch[1]) : 1;
  }

  /**
   * Get latest version number from array
   * @param versions - Array of version numbers
   * @returns Latest version number
   */
  private getLatestVersion(versions: number[]): number {
    return versions.length > 0 ? Math.max(...versions) : 1;
  }

  /**
   * Get content type for a file
   * @param key - File key
   * @returns Content type string
   */
  private async getContentType(key: string): Promise<string> {
    try {
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      const client = R2Config.getS3Client();
      const config = R2Config.getConfig();

      const command = new HeadObjectCommand({
        Bucket: config.bucketName,
        Key: key,
      });

      const response = await client.send(command);
      return response.ContentType || "application/octet-stream";
    } catch (error) {
      return "application/octet-stream";
    }
  }

  /**
   * Generate content hash for file
   * @param content - File content as buffer
   * @returns Content hash string
   */
  generateContentHash(content: Buffer): string {
    return createHash("sha256").update(content).digest("hex").slice(0, 12);
  }

  /**
   * Update configuration
   * @param newConfig - New configuration values
   */
  updateConfig(newConfig: Partial<ConflictResolutionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   * @returns Current configuration
   */
  getConfig(): ConflictResolutionConfig {
    return { ...this.config };
  }

  /**
   * Clear version cache
   */
  clearVersionCache(): void {
    this.versionCache.clear();
  }

  /**
   * Get cached conflict detection result
   * @param cacheKey - Cache key
   * @returns Cached conflict or null if not found/expired
   */
  private getCachedConflict(cacheKey: string): FileConflict | null | undefined {
    const expiry = this.cacheExpiry.get(cacheKey);
    if (!expiry || Date.now() > expiry) {
      // Cache expired
      this.conflictDetectionCache.delete(cacheKey);
      this.cacheExpiry.delete(cacheKey);
      return undefined;
    }
    return this.conflictDetectionCache.get(cacheKey);
  }

  /**
   * Set cached conflict detection result
   * @param cacheKey - Cache key
   * @param conflict - Conflict result or null
   */
  private setCachedConflict(
    cacheKey: string,
    conflict: FileConflict | null
  ): void {
    this.conflictDetectionCache.set(cacheKey, conflict);
    this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.versionCache.clear();
    this.conflictDetectionCache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Clean up expired cache entries
   */
  cleanupExpiredCache(): void {
    const now = Date.now();
    for (const [key, expiry] of this.cacheExpiry.entries()) {
      if (now > expiry) {
        this.conflictDetectionCache.delete(key);
        this.cacheExpiry.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   * @returns Cache statistics
   */
  getCacheStats(): {
    versionCacheSize: number;
    conflictCacheSize: number;
    expiryCacheSize: number;
  } {
    return {
      versionCacheSize: this.versionCache.size,
      conflictCacheSize: this.conflictDetectionCache.size,
      expiryCacheSize: this.cacheExpiry.size,
    };
  }
}
