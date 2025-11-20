import {
  R2UserStorage,
  UserFolderPaths,
  MockupType,
  AssetType,
  ExportType,
  ProfilePictureType,
} from "./r2-user-storage";
import { UserFolderService } from "../services/user-folder-service";
import { R2Config } from "./r2-config";
import {
  R2ConflictResolver,
  ConflictResolutionStrategy,
  FileConflict,
  ConflictResolution,
  BatchConflictResolution,
  ConflictResolutionConfig,
} from "./r2-conflict-resolver";

/**
 * File upload result interface
 */
export interface FileUploadResult {
  key: string;
  publicUrl: string;
  size: number;
  contentType: string;
  uploadedAt: Date;
}

/**
 * File validation result interface
 */
export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Content type mappings
 */
export const CONTENT_TYPES = {
  // Images
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",

  // Documents
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  // Archives
  zip: "application/zip",
  rar: "application/x-rar-compressed",

  // Default
  default: "application/octet-stream",
} as const;

/**
 * Maximum file sizes (in bytes)
 */
export const MAX_FILE_SIZES = {
  profilePicture: 5 * 1024 * 1024, // 5MB
  mockup: 10 * 1024 * 1024, // 10MB
  asset: 20 * 1024 * 1024, // 20MB
  export: 50 * 1024 * 1024, // 50MB
  default: 10 * 1024 * 1024, // 10MB
} as const;

/**
 * Allowed file extensions by type
 */
export const ALLOWED_EXTENSIONS = {
  profilePicture: ["jpg", "jpeg", "png", "webp"],
  mockup: ["jpg", "jpeg", "png", "webp"],
  asset: ["jpg", "jpeg", "png", "webp", "svg", "pdf"],
  export: ["jpg", "jpeg", "png", "webp", "pdf", "zip"],
  default: ["jpg", "jpeg", "png", "webp"],
} as const;

/**
 * Helper functions for R2 file operations
 */
export class R2FileHelpers {
  private static conflictResolver: R2ConflictResolver =
    new R2ConflictResolver();

  /**
   * Initialize conflict resolver with custom configuration
   * @param config - Conflict resolution configuration
   */
  static initializeConflictResolver(
    config?: Partial<ConflictResolutionConfig>
  ): void {
    this.conflictResolver = new R2ConflictResolver(config);
  }

  /**
   * Get current conflict resolver instance
   * @returns Conflict resolver instance
   */
  static getConflictResolver(): R2ConflictResolver {
    return this.conflictResolver;
  }

  /**
   * Detect file naming conflicts before upload
   * @param userId - User ID
   * @param fileType - Type of file
   * @param filename - Filename to check
   * @param additionalPath - Additional path components
   * @returns Conflict information or null if no conflict
   */
  static async detectFileConflict(
    userId: string,
    fileType: keyof typeof ALLOWED_EXTENSIONS,
    filename: string,
    additionalPath?: string
  ): Promise<FileConflict | null> {
    try {
      const folderPath = this.getFolderPath(userId, fileType, additionalPath);
      return await this.conflictResolver.detectConflict(
        userId,
        folderPath,
        filename
      );
    } catch (error) {
      console.error(`[R2_FILE_HELPERS] Error detecting file conflict:`, error);
      throw new Error(
        `Failed to detect file conflict: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Resolve a file naming conflict
   * @param userId - User ID
   * @param conflict - Conflict information
   * @param strategy - Resolution strategy
   * @param customName - Custom name (required for RENAME strategy)
   * @returns Resolution result
   */
  static async resolveFileConflict(
    userId: string,
    conflict: FileConflict,
    strategy: ConflictResolutionStrategy,
    customName?: string
  ): Promise<ConflictResolution> {
    try {
      return await this.conflictResolver.resolveConflict(
        userId,
        conflict,
        strategy,
        customName
      );
    } catch (error) {
      console.error(`[R2_FILE_HELPERS] Error resolving file conflict:`, error);
      throw new Error(
        `Failed to resolve file conflict: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Upload a file with automatic conflict resolution
   * @param userId - User ID
   * @param file - File to upload
   * @param fileType - Type of file
   * @param additionalPath - Additional path components
   * @param conflictStrategy - Conflict resolution strategy (optional)
   * @returns Upload result with resolution information
   */
  static async uploadFileWithConflictResolution(
    userId: string,
    file: File,
    fileType: keyof typeof ALLOWED_EXTENSIONS,
    additionalPath?: string,
    conflictStrategy?: ConflictResolutionStrategy
  ): Promise<FileUploadResult & { conflictResolution?: ConflictResolution }> {
    try {
      // Validate file
      const validation = this.validateFile(file, fileType);
      if (!validation.isValid) {
        throw new Error(
          `File validation failed: ${validation.errors.join(", ")}`
        );
      }

      // Log warnings if any
      if (validation.warnings.length > 0) {
        console.warn(
          `[R2_FILE_HELPERS] File validation warnings:`,
          validation.warnings
        );
      }

      // Ensure user folder exists
      await UserFolderService.ensureUserFolderExists(userId);

      // Check for conflicts
      const conflict = await this.detectFileConflict(
        userId,
        fileType,
        file.name,
        additionalPath
      );

      if (conflict) {
        const strategy = conflictStrategy || conflict.defaultStrategy;
        const resolution = await this.resolveFileConflict(
          userId,
          conflict,
          strategy
        );

        if (resolution.strategy === ConflictResolutionStrategy.SKIP) {
          throw new Error(`File upload skipped due to conflict: ${file.name}`);
        }

        // Use the resolved filename for upload
        const resolvedFile = new File([file], resolution.resolvedName, {
          type: file.type,
        });
        const uploadResult = await this.uploadFileWithKey(
          userId,
          resolvedFile,
          fileType,
          resolution.resolvedPath
        );

        return {
          ...uploadResult,
          conflictResolution: resolution,
        };
      }

      // No conflict, proceed with normal upload
      const uploadResult = await this.uploadFile(
        userId,
        file,
        fileType,
        additionalPath
      );
      return uploadResult;
    } catch (error) {
      console.error(
        `[R2_FILE_HELPERS] Error uploading file with conflict resolution:`,
        error
      );
      throw new Error(
        `Failed to upload file with conflict resolution: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Upload multiple files with batch conflict resolution
   * @param userId - User ID
   * @param files - Array of files to upload
   * @param fileType - Type of files
   * @param additionalPath - Additional path components
   * @param conflictStrategy - Default conflict resolution strategy
   * @returns Batch upload result with conflict resolution information
   */
  static async uploadBatchWithConflictResolution(
    userId: string,
    files: File[],
    fileType: keyof typeof ALLOWED_EXTENSIONS,
    additionalPath?: string,
    conflictStrategy?: ConflictResolutionStrategy
  ): Promise<{
    results: (FileUploadResult & { conflictResolution?: ConflictResolution })[];
    conflicts: FileConflict[];
    errors: { filename: string; error: string }[];
  }> {
    const results: (FileUploadResult & {
      conflictResolution?: ConflictResolution;
    })[] = [];
    const conflicts: FileConflict[] = [];
    const errors: { filename: string; error: string }[] = [];

    // First, detect all conflicts
    const detectedConflicts: (FileConflict | null)[] = [];
    for (const file of files) {
      try {
        const conflict = await this.detectFileConflict(
          userId,
          fileType,
          file.name,
          additionalPath
        );
        detectedConflicts.push(conflict);
        if (conflict) conflicts.push(conflict);
      } catch (error) {
        errors.push({
          filename: file.name,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        detectedConflicts.push(null);
      }
    }

    // Resolve conflicts in batch if strategy is provided
    let batchResolution: BatchConflictResolution | null = null;
    if (conflictStrategy && conflicts.length > 0) {
      try {
        batchResolution = await this.conflictResolver.resolveBatchConflicts(
          userId,
          conflicts,
          conflictStrategy
        );
      } catch (error) {
        console.error(
          `[R2_FILE_HELPERS] Error in batch conflict resolution:`,
          error
        );
      }
    }

    // Upload files with resolved names
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const conflict = detectedConflicts[i];

      try {
        if (conflict && batchResolution) {
          const resolution = batchResolution.resolutions.find(
            (r) => r.strategy !== ConflictResolutionStrategy.SKIP
          );

          if (resolution) {
            const resolvedFile = new File([file], resolution.resolvedName, {
              type: file.type,
            });
            const uploadResult = await this.uploadFileWithKey(
              userId,
              resolvedFile,
              fileType,
              resolution.resolvedPath
            );
            results.push({
              ...uploadResult,
              conflictResolution: resolution,
            });
          } else {
            errors.push({
              filename: file.name,
              error: "File skipped due to conflict resolution",
            });
          }
        } else {
          const uploadResult = await this.uploadFileWithConflictResolution(
            userId,
            file,
            fileType,
            additionalPath,
            conflictStrategy
          );
          results.push(uploadResult);
        }
      } catch (error) {
        errors.push({
          filename: file.name,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      results,
      conflicts,
      errors,
    };
  }

  /**
   * Upload file with specific key (internal method)
   * @param userId - User ID
   * @param file - File to upload
   * @param fileType - Type of file
   * @param key - Specific key to use for upload
   * @returns Upload result
   */
  private static async uploadFileWithKey(
    userId: string,
    file: File,
    fileType: keyof typeof ALLOWED_EXTENSIONS,
    key: string
  ): Promise<FileUploadResult> {
    try {
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      const client = R2Config.getS3Client();
      const config = R2Config.getConfig();

      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const contentType = this.getContentType(file.name);

      const command = new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
      });

      await client.send(command);

      // Generate public URL
      const publicUrl = `${config.publicBucketUrl}/${key}`;

      console.log(`[R2_FILE_HELPERS] Successfully uploaded file: ${key}`);

      return {
        key,
        publicUrl,
        size: file.size,
        contentType,
        uploadedAt: new Date(),
      };
    } catch (error: any) {
      console.error(`[R2_FILE_HELPERS] Error uploading file:`, error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Get folder path for file type
   * @param userId - User ID
   * @param fileType - Type of file
   * @param additionalPath - Additional path components
   * @returns Folder path
   */
  private static getFolderPath(
    userId: string,
    fileType: keyof typeof ALLOWED_EXTENSIONS,
    additionalPath?: string
  ): string {
    switch (fileType) {
      case "profilePicture":
        return UserFolderPaths.getProfilePicturesPath(userId);

      case "mockup":
        if (!additionalPath) {
          throw new Error(
            "Mockup uploads require additional path (designId_mockupType)"
          );
        }
        const [designId, mockupType] = additionalPath.split("_");
        return UserFolderPaths.getMockupTypePath(
          userId,
          designId,
          mockupType as MockupType
        );

      case "asset":
        const assetType = (additionalPath as AssetType) || "uploads";
        return UserFolderPaths.getAssetTypePath(userId, assetType);

      case "export":
        const exportType = (additionalPath as ExportType) || "designs";
        return UserFolderPaths.getExportTypePath(userId, exportType);

      default:
        return UserFolderPaths.getUserBasePath(userId);
    }
  }

  /**
   * Get file version history
   * @param userId - User ID
   * @param basePath - Base file path (without version)
   * @returns Array of version information
   */
  static async getFileVersions(userId: string, basePath: string) {
    try {
      return await this.conflictResolver.getFileVersions(userId, basePath);
    } catch (error) {
      console.error(`[R2_FILE_HELPERS] Error getting file versions:`, error);
      throw new Error(
        `Failed to get file versions: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Clean up old file versions
   * @param userId - User ID
   * @param basePath - Base file path (without version)
   * @returns Number of versions cleaned up
   */
  static async cleanupOldVersions(
    userId: string,
    basePath: string
  ): Promise<number> {
    try {
      return await this.conflictResolver.cleanupOldVersions(userId, basePath);
    } catch (error) {
      console.error(`[R2_FILE_HELPERS] Error cleaning up old versions:`, error);
      throw new Error(
        `Failed to cleanup old versions: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Generate content hash for file
   * @param file - File to hash
   * @returns Content hash string
   */
  static generateContentHash(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer;
          const buffer = Buffer.from(arrayBuffer);
          const hash = this.conflictResolver.generateContentHash(buffer);
          resolve(hash);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsArrayBuffer(file);
    });
  }
  /**
   * Get content type from file extension
   * @param filename - The filename
   * @returns Content type string
   */
  static getContentType(filename: string): string {
    const extension = filename.split(".").pop()?.toLowerCase();
    return (
      CONTENT_TYPES[extension as keyof typeof CONTENT_TYPES] ||
      CONTENT_TYPES.default
    );
  }

  /**
   * Get file extension from filename
   * @param filename - The filename
   * @returns File extension (without dot)
   */
  static getFileExtension(filename: string): string {
    return filename.split(".").pop()?.toLowerCase() || "";
  }

  /**
   * Validate file for upload
   * @param file - File to validate
   * @param fileType - Type of file (profilePicture, mockup, asset, export)
   * @returns Validation result
   */
  static validateFile(
    file: File,
    fileType: keyof typeof ALLOWED_EXTENSIONS
  ): FileValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check file size
    const maxSize = MAX_FILE_SIZES[fileType] || MAX_FILE_SIZES.default;
    if (file.size > maxSize) {
      errors.push(
        `File size (${Math.round(
          file.size / 1024 / 1024
        )}MB) exceeds maximum allowed size (${Math.round(
          maxSize / 1024 / 1024
        )}MB)`
      );
    }

    // Check file extension
    const extension = this.getFileExtension(file.name);
    const allowedExtensions =
      ALLOWED_EXTENSIONS[fileType] || ALLOWED_EXTENSIONS.default;
    if (!allowedExtensions.includes(extension as any)) {
      errors.push(
        `File extension .${extension} is not allowed. Allowed extensions: ${allowedExtensions.join(
          ", "
        )}`
      );
    }

    // Check content type
    const expectedContentType = this.getContentType(file.name);
    if (
      file.type &&
      file.type !== expectedContentType &&
      expectedContentType !== CONTENT_TYPES.default
    ) {
      warnings.push(
        `File content type (${file.type}) doesn't match expected type for .${extension} files (${expectedContentType})`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Convert old path format to new user-centric format
   * @param oldPath - Old path format
   * @param userId - User ID for the new path
   * @returns New path format or null if conversion is not possible
   */
  static convertOldPathToNewFormat(
    oldPath: string,
    userId: string
  ): string | null {
    try {
      // Example old formats:
      // - mockups/designId/default/image.jpg
      // - profile-pictures/current/image.jpg
      // - assets/logos/logo.png

      const pathParts = oldPath.split("/").filter((part) => part.length > 0);

      if (pathParts.length < 2) {
        return null;
      }

      const [folderType, ...rest] = pathParts;
      const userBasePath = UserFolderPaths.getUserBasePath(userId);

      switch (folderType) {
        case "mockups":
          if (rest.length >= 2) {
            const [designId, mockupType, ...filenameParts] = rest;
            const filename = filenameParts.join("/");
            return `${UserFolderPaths.getMockupTypePath(
              userId,
              designId,
              mockupType as MockupType
            )}/${filename}`;
          }
          break;

        case "profile-pictures":
          if (rest.length >= 1) {
            const [type, ...filenameParts] = rest;
            const filename = filenameParts.join("/");
            const folderPath =
              type === "current"
                ? UserFolderPaths.getProfilePicturesPath(userId)
                : UserFolderPaths.getProfilePictureHistoryPath(userId);
            return `${folderPath}/${filename}`;
          }
          break;

        case "assets":
          if (rest.length >= 2) {
            const [assetType, ...filenameParts] = rest;
            const filename = filenameParts.join("/");
            return `${UserFolderPaths.getAssetTypePath(
              userId,
              assetType as AssetType
            )}/${filename}`;
          }
          break;

        case "exports":
          if (rest.length >= 1) {
            const [exportType, ...filenameParts] = rest;
            const filename = filenameParts.join("/");
            return `${UserFolderPaths.getExportTypePath(
              userId,
              exportType as ExportType
            )}/${filename}`;
          }
          break;

        default:
          // For unknown folders, place under user's base folder
          return `${userBasePath}/${oldPath}`;
      }

      return null;
    } catch (error) {
      console.error(
        `[R2_FILE_HELPERS] Error converting old path ${oldPath}:`,
        error
      );
      return null;
    }
  }

  /**
   * Extract user ID from a user-centric path
   * @param path - The path to analyze
   * @returns User ID or null if not found
   */
  static extractUserIdFromPath(path: string): string | null {
    try {
      const pathParts = path.split("/").filter((part) => part.length > 0);

      if (pathParts.length >= 2 && pathParts[0] === "users") {
        return pathParts[1];
      }

      return null;
    } catch (error) {
      console.error(
        `[R2_FILE_HELPERS] Error extracting user ID from path ${path}:`,
        error
      );
      return null;
    }
  }

  /**
   * Check if a path is user-centric
   * @param path - The path to check
   * @returns True if path is user-centric
   */
  static isUserCentricPath(path: string): boolean {
    return (
      path.startsWith("users/") && this.extractUserIdFromPath(path) !== null
    );
  }

  /**
   * Generate a presigned URL for file upload
   * @param userId - User ID
   * @param key - File key
   * @param contentType - Content type
   * @param expiresIn - Expiration time in seconds (default: 3600)
   * @returns Presigned URL
   */
  static async generatePresignedUploadUrl(
    userId: string,
    key: string,
    contentType: string,
    expiresIn: number = 3600
  ): Promise<string> {
    try {
      // Validate user has access to this path
      const hasAccess = await UserFolderService.validateUserFileAccess(
        userId,
        key
      );
      if (!hasAccess) {
        throw new Error(`User ${userId} does not have access to path ${key}`);
      }

      // Generate presigned URL using R2 configuration
      const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");

      const client = R2Config.getS3Client();
      const config = R2Config.getConfig();

      const command = new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        ContentType: contentType,
      });

      const signedUrl = await getSignedUrl(client, command, { expiresIn });

      return signedUrl;
    } catch (error: any) {
      console.error(`[R2_FILE_HELPERS] Error generating presigned URL:`, error);
      throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
  }

  /**
   * Generate a presigned URL for file download
   * @param userId - User ID
   * @param key - File key
   * @param expiresIn - Expiration time in seconds (default: 3600)
   * @returns Presigned URL
   */
  static async generatePresignedDownloadUrl(
    userId: string,
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    try {
      // Validate user has access to this path
      const hasAccess = await UserFolderService.validateUserFileAccess(
        userId,
        key
      );
      if (!hasAccess) {
        throw new Error(`User ${userId} does not have access to path ${key}`);
      }

      // Check if file exists
      const fileExists = await R2UserStorage.fileExists(key);
      if (!fileExists) {
        throw new Error(`File ${key} does not exist`);
      }

      // Generate presigned URL using R2 configuration
      const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");

      const client = R2Config.getS3Client();
      const config = R2Config.getConfig();

      const command = new GetObjectCommand({
        Bucket: config.bucketName,
        Key: key,
      });

      const signedUrl = await getSignedUrl(client, command, { expiresIn });

      return signedUrl;
    } catch (error: any) {
      console.error(
        `[R2_FILE_HELPERS] Error generating presigned download URL:`,
        error
      );
      throw new Error(
        `Failed to generate presigned download URL: ${error.message}`
      );
    }
  }

  /**
   * Upload a file to R2 with validation
   * @param userId - User ID
   * @param file - File to upload
   * @param fileType - Type of file
   * @param additionalPath - Additional path components
   * @returns Upload result
   */
  static async uploadFile(
    userId: string,
    file: File,
    fileType: keyof typeof ALLOWED_EXTENSIONS,
    additionalPath?: string
  ): Promise<FileUploadResult> {
    try {
      // Validate file
      const validation = this.validateFile(file, fileType);
      if (!validation.isValid) {
        throw new Error(
          `File validation failed: ${validation.errors.join(", ")}`
        );
      }

      // Log warnings if any
      if (validation.warnings.length > 0) {
        console.warn(
          `[R2_FILE_HELPERS] File validation warnings:`,
          validation.warnings
        );
      }

      // Ensure user folder exists
      await UserFolderService.ensureUserFolderExists(userId);

      // Generate file path based on file type
      let key: string;
      const extension = this.getFileExtension(file.name);

      switch (fileType) {
        case "profilePicture":
          const profilePath = await UserFolderService.getProfilePicturePath(
            userId,
            "current",
            extension
          );
          key = profilePath.key;
          break;

        case "mockup":
          if (!additionalPath) {
            throw new Error(
              "Mockup uploads require additional path (designId_mockupType)"
            );
          }
          const [designId, mockupType] = additionalPath.split("_");
          const mockupPath = await UserFolderService.getMockupPath(
            userId,
            designId,
            mockupType as MockupType,
            extension
          );
          key = mockupPath.key;
          break;

        case "asset":
          const assetType = (additionalPath as AssetType) || "uploads";
          const assetPath = await UserFolderService.getAssetPath(
            userId,
            assetType,
            undefined,
            extension
          );
          key = assetPath.key;
          break;

        case "export":
          const exportType = (additionalPath as ExportType) || "designs";
          const exportPath = await UserFolderService.getExportPath(
            userId,
            exportType,
            file.name
          );
          key = exportPath.key;
          break;

        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }

      // Upload file
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      const client = R2Config.getS3Client();
      const config = R2Config.getConfig();

      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const contentType = this.getContentType(file.name);

      const command = new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
      });

      await client.send(command);

      // Generate public URL
      const publicUrl = `${config.publicBucketUrl}/${key}`;

      console.log(`[R2_FILE_HELPERS] Successfully uploaded file: ${key}`);

      return {
        key,
        publicUrl,
        size: file.size,
        contentType,
        uploadedAt: new Date(),
      };
    } catch (error: any) {
      console.error(`[R2_FILE_HELPERS] Error uploading file:`, error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Copy a file to a new location
   * @param userId - User ID
   * @param sourceKey - Source file key
   * @param destinationKey - Destination file key
   * @returns True if copy was successful
   */
  static async copyFile(
    userId: string,
    sourceKey: string,
    destinationKey: string
  ): Promise<boolean> {
    try {
      // Validate user has access to source file
      const hasSourceAccess = await UserFolderService.validateUserFileAccess(
        userId,
        sourceKey
      );
      if (!hasSourceAccess) {
        throw new Error(
          `User ${userId} does not have access to source file ${sourceKey}`
        );
      }

      // Validate user has access to destination path
      const hasDestAccess = await UserFolderService.validateUserFileAccess(
        userId,
        destinationKey
      );
      if (!hasDestAccess) {
        throw new Error(
          `User ${userId} does not have access to destination path ${destinationKey}`
        );
      }

      // Copy file using R2 configuration
      const { CopyObjectCommand } = await import("@aws-sdk/client-s3");
      const client = R2Config.getS3Client();
      const config = R2Config.getConfig();

      const command = new CopyObjectCommand({
        Bucket: config.bucketName,
        Key: destinationKey,
        CopySource: `${config.bucketName}/${sourceKey}`,
      });

      await client.send(command);

      console.log(
        `[R2_FILE_HELPERS] Successfully copied file from ${sourceKey} to ${destinationKey}`
      );
      return true;
    } catch (error: any) {
      console.error(`[R2_FILE_HELPERS] Error copying file:`, error);
      throw new Error(`Failed to copy file: ${error.message}`);
    }
  }

  /**
   * Move a file to a new location
   * @param userId - User ID
   * @param sourceKey - Source file key
   * @param destinationKey - Destination file key
   * @returns True if move was successful
   */
  static async moveFile(
    userId: string,
    sourceKey: string,
    destinationKey: string
  ): Promise<boolean> {
    try {
      // Copy file first
      await this.copyFile(userId, sourceKey, destinationKey);

      // Delete source file
      await UserFolderService.deleteUserFile(userId, sourceKey);

      console.log(
        `[R2_FILE_HELPERS] Successfully moved file from ${sourceKey} to ${destinationKey}`
      );
      return true;
    } catch (error: any) {
      console.error(`[R2_FILE_HELPERS] Error moving file:`, error);
      throw new Error(`Failed to move file: ${error.message}`);
    }
  }
}
