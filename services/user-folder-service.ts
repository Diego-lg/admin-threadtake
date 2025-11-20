import {
  R2UserStorage,
  UserFolderPaths,
  MockupType,
  AssetType,
  ExportType,
  ProfilePictureType,
} from "../lib/r2-user-storage";
import prismadb from "../lib/prismadb";
import { folderErrorHandler } from "../lib/r2-folder-error-handler";
import {
  FolderErrorType,
  ErrorRecoveryResult,
  FolderOperationContext,
} from "../lib/r2-folder-error-types";

/**
 * User folder metadata interface
 */
export interface UserFolderMetadata {
  userId: string;
  folderExists: boolean;
  createdAt?: Date;
  lastAccessedAt?: Date;
  totalFiles: number;
  totalSize: number;
  mockupCount: number;
  assetCount: number;
  exportCount: number;
}

/**
 * User folder statistics
 */
export interface UserFolderStats {
  totalFiles: number;
  totalSize: number;
  fileCounts: {
    mockups: number;
    profilePictures: number;
    assets: number;
    exports: number;
  };
  sizeByType: {
    mockups: number;
    profilePictures: number;
    assets: number;
    exports: number;
  };
}

/**
 * Service for managing user folders in R2 storage
 */
export class UserFolderService {
  /**
   * Initialize user folder structure for a new user with comprehensive error handling
   * @param userId - The user ID
   * @returns True if initialization was successful
   */
  static async initializeUserFolder(userId: string): Promise<boolean> {
    const startTime = Date.now();
    const context: FolderOperationContext = {
      userId,
      operation: "initialize_user_folder",
      startTime: new Date(),
    };

    try {
      console.log(
        `[USER_FOLDER_SERVICE] Initializing folder structure for user ${userId}`
      );

      // Validate user exists in database
      const user = await prismadb.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true },
      });

      if (!user) {
        throw new Error(`User ${userId} not found in database`);
      }

      // Check if folder already exists
      try {
        const folderExists = await R2UserStorage.userFolderExists(userId);
        if (folderExists) {
          console.log(
            `[USER_FOLDER_SERVICE] User folder already exists for ${userId}`
          );
          return true;
        }
      } catch (error: any) {
        // Handle potential permission or network errors
        if (error.message.includes("Permission denied")) {
          const recoveryResult =
            await folderErrorHandler.handlePermissionDenied(
              userId,
              UserFolderPaths.getUserBasePath(userId),
              context
            );
          throw new Error(
            `Permission denied: ${recoveryResult.error?.message}`
          );
        }

        // For other errors, try to proceed with folder creation
        console.warn(
          `[USER_FOLDER_SERVICE] Error checking folder existence: ${error.message}`
        );
      }

      // Attempt to create folder structure with error handling
      try {
        const created = await R2UserStorage.createUserFolderStructure(userId);

        if (created) {
          console.log(
            `[USER_FOLDER_SERVICE] Successfully created folder structure for user ${userId}`
          );
          // Optionally store metadata in database
          await this.updateUserFolderMetadata(userId);
          return true;
        }
      } catch (error: any) {
        // Handle folder creation errors with recovery
        const recoveryResult = await this.handleFolderCreationError(
          userId,
          error,
          context
        );

        if (recoveryResult.success) {
          console.log(
            `[USER_FOLDER_SERVICE] Successfully recovered and created folder structure for user ${userId}`
          );
          await this.updateUserFolderMetadata(userId);
          return true;
        } else {
          throw new Error(
            `Failed to create user folder: ${recoveryResult.error?.message}`
          );
        }
      }

      return false;
    } catch (error: any) {
      console.error(
        `[USER_FOLDER_SERVICE] Error initializing user folder for ${userId}:`,
        error
      );
      throw new Error(`Failed to initialize user folder: ${error.message}`);
    }
  }

  /**
   * Handle folder creation errors with automatic recovery
   */
  private static async handleFolderCreationError(
    userId: string,
    error: Error,
    context: FolderOperationContext
  ): Promise<ErrorRecoveryResult> {
    console.error(
      `[USER_FOLDER_SERVICE] Folder creation error for ${userId}:`,
      error
    );

    // Classify error type and handle accordingly
    if (error.message.includes("Permission denied")) {
      return await folderErrorHandler.handlePermissionDenied(
        userId,
        UserFolderPaths.getUserBasePath(userId),
        context
      );
    }

    if (
      error.message.includes("quota") ||
      error.message.includes("storage limit")
    ) {
      return await folderErrorHandler.handleQuotaExceeded(userId, context);
    }

    if (
      error.message.includes("concurrent") ||
      error.message.includes("already exists")
    ) {
      return await folderErrorHandler.handleConcurrentCreation(userId, context);
    }

    // Default to handling missing user folder
    return await folderErrorHandler.handleMissingUserFolder(userId, context);
  }

  /**
   * Ensure user folder exists (create if needed) with comprehensive error handling
   * @param userId - The user ID
   * @returns True if folder exists or was created
   */
  static async ensureUserFolderExists(userId: string): Promise<boolean> {
    const startTime = Date.now();
    const context: FolderOperationContext = {
      userId,
      operation: "ensure_user_folder_exists",
      startTime: new Date(),
    };

    try {
      // First try the basic approach
      return await R2UserStorage.ensureUserFolderExists(userId);
    } catch (error: any) {
      console.error(
        `[USER_FOLDER_SERVICE] Error ensuring user folder exists for ${userId}:`,
        error
      );

      // Try to recover from the error
      const recoveryResult = await this.handleFolderCreationError(
        userId,
        error,
        context
      );

      if (recoveryResult.success) {
        console.log(
          `[USER_FOLDER_SERVICE] Successfully recovered and ensured folder exists for user ${userId}`
        );
        return true;
      }

      throw new Error(
        `Failed to ensure user folder exists: ${recoveryResult.error?.message}`
      );
    }
  }

  /**
   * Get user folder metadata with error handling for missing folders
   * @param userId - The user ID
   * @returns User folder metadata
   */
  static async getUserFolderMetadata(
    userId: string
  ): Promise<UserFolderMetadata> {
    const context: FolderOperationContext = {
      userId,
      operation: "get_user_folder_metadata",
      startTime: new Date(),
    };

    try {
      const folderExists = await R2UserStorage.userFolderExists(userId);

      if (!folderExists) {
        // Try to create the folder automatically
        const recoveryResult = await folderErrorHandler.handleMissingUserFolder(
          userId,
          context
        );

        if (recoveryResult.success) {
          console.log(
            `[USER_FOLDER_SERVICE] Auto-created missing folder for user ${userId}`
          );
        } else {
          console.warn(
            `[USER_FOLDER_SERVICE] Could not auto-create folder for user ${userId}`
          );
          return {
            userId,
            folderExists: false,
            totalFiles: 0,
            totalSize: 0,
            mockupCount: 0,
            assetCount: 0,
            exportCount: 0,
          };
        }
      }

      // Get file counts and sizes for each folder type with error handling
      const [mockupFiles, assetFiles, exportFiles, profileFiles] =
        await Promise.allSettled([
          this.getFolderStats(userId, "mockups"),
          this.getFolderStats(userId, "assets"),
          this.getFolderStats(userId, "exports"),
          this.getFolderStats(userId, "profile-pictures"),
        ]);

      // Extract results, using default values for failed promises
      const mockupResult =
        mockupFiles.status === "fulfilled"
          ? mockupFiles.value
          : { count: 0, size: 0 };
      const assetResult =
        assetFiles.status === "fulfilled"
          ? assetFiles.value
          : { count: 0, size: 0 };
      const exportResult =
        exportFiles.status === "fulfilled"
          ? exportFiles.value
          : { count: 0, size: 0 };
      const profileResult =
        profileFiles.status === "fulfilled"
          ? profileFiles.value
          : { count: 0, size: 0 };

      const totalFiles =
        mockupResult.count +
        assetResult.count +
        exportResult.count +
        profileResult.count;
      const totalSize =
        mockupResult.size +
        assetResult.size +
        exportResult.size +
        profileResult.size;

      return {
        userId,
        folderExists: true,
        totalFiles,
        totalSize,
        mockupCount: mockupResult.count,
        assetCount: assetResult.count,
        exportCount: exportResult.count,
      };
    } catch (error: any) {
      console.error(
        `[USER_FOLDER_SERVICE] Error getting user folder metadata for ${userId}:`,
        error
      );

      // Return default metadata on error
      return {
        userId,
        folderExists: false,
        totalFiles: 0,
        totalSize: 0,
        mockupCount: 0,
        assetCount: 0,
        exportCount: 0,
      };
    }
  }

  /**
   * Get statistics for a specific folder type
   * @param userId - The user ID
   * @param folderType - The folder type
   * @returns Folder statistics
   */
  private static async getFolderStats(
    userId: string,
    folderType: "mockups" | "assets" | "exports" | "profile-pictures"
  ): Promise<{ count: number; size: number }> {
    try {
      const files = await R2UserStorage.listUserFiles(userId, folderType, 1000);
      return {
        count: files.length,
        size: files.reduce((total, file) => total + file.size, 0),
      };
    } catch (error) {
      console.error(
        `[USER_FOLDER_SERVICE] Error getting stats for ${folderType} folder:`,
        error
      );
      return { count: 0, size: 0 };
    }
  }

  /**
   * Update user folder metadata in database
   * @param userId - The user ID
   * @returns Updated metadata
   */
  static async updateUserFolderMetadata(
    userId: string
  ): Promise<UserFolderMetadata> {
    try {
      const metadata = await this.getUserFolderMetadata(userId);

      // In a real implementation, you might store this metadata in the database
      // For now, we'll just return the computed metadata
      console.log(
        `[USER_FOLDER_SERVICE] Updated metadata for user ${userId}:`,
        {
          totalFiles: metadata.totalFiles,
          totalSize: metadata.totalSize,
          folderExists: metadata.folderExists,
        }
      );

      return metadata;
    } catch (error: any) {
      console.error(
        `[USER_FOLDER_SERVICE] Error updating user folder metadata for ${userId}:`,
        error
      );
      throw new Error(
        `Failed to update user folder metadata: ${error.message}`
      );
    }
  }

  /**
   * Validate user access to a file path
   * @param userId - The user ID
   * @param fileKey - The file key to validate
   * @returns True if user has access to the file
   */
  static async validateUserFileAccess(
    userId: string,
    fileKey: string
  ): Promise<boolean> {
    try {
      // Check if the file key starts with the user's base path
      const userBasePath = UserFolderPaths.getUserBasePath(userId);

      if (!fileKey.startsWith(userBasePath)) {
        console.warn(
          `[USER_FOLDER_SERVICE] Access denied: User ${userId} trying to access file outside their folder: ${fileKey}`
        );
        return false;
      }

      // Check if the file actually exists
      const fileExists = await R2UserStorage.fileExists(fileKey);

      if (!fileExists) {
        console.warn(
          `[USER_FOLDER_SERVICE] Access denied: File does not exist: ${fileKey}`
        );
        return false;
      }

      return true;
    } catch (error: any) {
      console.error(
        `[USER_FOLDER_SERVICE] Error validating user file access for ${userId}:`,
        error
      );
      return false;
    }
  }

  /**
   * Get a mockup file path and ensure folder exists with error handling
   * @param userId - The user ID
   * @param designId - The design ID
   * @param mockupType - The mockup type
   * @param extension - File extension
   * @returns File path information
   */
  static async getMockupPath(
    userId: string,
    designId: string,
    mockupType: MockupType,
    extension: string
  ): Promise<{ key: string; publicUrl: string }> {
    const context: FolderOperationContext = {
      userId,
      operation: "get_mockup_path",
      folderPath: UserFolderPaths.getMockupTypePath(
        userId,
        designId,
        mockupType
      ),
      startTime: new Date(),
      metadata: { designId, mockupType, extension },
    };

    try {
      // Ensure user folder exists with error handling
      await this.ensureUserFolderExists(userId);

      // Generate path
      return R2UserStorage.generateMockupPath(
        userId,
        designId,
        mockupType,
        extension
      );
    } catch (error: any) {
      console.error(`[USER_FOLDER_SERVICE] Error getting mockup path:`, error);

      // Try to recover from folder-related errors
      if (
        error.message.includes("folder") ||
        error.message.includes("directory")
      ) {
        const recoveryResult = await folderErrorHandler.handleMissingUserFolder(
          userId,
          context
        );
        if (recoveryResult.success) {
          // Retry the operation after recovery
          return R2UserStorage.generateMockupPath(
            userId,
            designId,
            mockupType,
            extension
          );
        }
      }

      throw new Error(`Failed to get mockup path: ${error.message}`);
    }
  }

  /**
   * Get a profile picture path and ensure folder exists with error handling
   * @param userId - The user ID
   * @param type - Profile picture type
   * @param extension - File extension
   * @returns File path information
   */
  static async getProfilePicturePath(
    userId: string,
    type: ProfilePictureType,
    extension: string
  ): Promise<{ key: string; publicUrl: string }> {
    const context: FolderOperationContext = {
      userId,
      operation: "get_profile_picture_path",
      folderPath:
        type === "current"
          ? UserFolderPaths.getProfilePicturesPath(userId)
          : UserFolderPaths.getProfilePictureHistoryPath(userId),
      startTime: new Date(),
      metadata: { type, extension },
    };

    try {
      // Ensure user folder exists with error handling
      await this.ensureUserFolderExists(userId);

      // Generate path
      return R2UserStorage.generateProfilePicturePath(userId, type, extension);
    } catch (error: any) {
      console.error(
        `[USER_FOLDER_SERVICE] Error getting profile picture path:`,
        error
      );

      // Try to recover from folder-related errors
      if (
        error.message.includes("folder") ||
        error.message.includes("directory")
      ) {
        const recoveryResult = await folderErrorHandler.handleMissingUserFolder(
          userId,
          context
        );
        if (recoveryResult.success) {
          // Retry the operation after recovery
          return R2UserStorage.generateProfilePicturePath(
            userId,
            type,
            extension
          );
        }
      }

      throw new Error(`Failed to get profile picture path: ${error.message}`);
    }
  }

  /**
   * Get an asset path and ensure folder exists with error handling
   * @param userId - The user ID
   * @param assetType - The asset type
   * @param designId - Optional design ID
   * @param extension - File extension
   * @returns File path information
   */
  static async getAssetPath(
    userId: string,
    assetType: AssetType,
    designId?: string,
    extension: string = ""
  ): Promise<{ key: string; publicUrl: string }> {
    const context: FolderOperationContext = {
      userId,
      operation: "get_asset_path",
      folderPath: UserFolderPaths.getAssetTypePath(userId, assetType),
      startTime: new Date(),
      metadata: { assetType, designId, extension },
    };

    try {
      // Ensure user folder exists with error handling
      await this.ensureUserFolderExists(userId);

      // Generate path
      return R2UserStorage.generateAssetPath(
        userId,
        assetType,
        designId,
        extension
      );
    } catch (error: any) {
      console.error(`[USER_FOLDER_SERVICE] Error getting asset path:`, error);

      // Try to recover from folder-related errors
      if (
        error.message.includes("folder") ||
        error.message.includes("directory")
      ) {
        const recoveryResult = await folderErrorHandler.handleMissingUserFolder(
          userId,
          context
        );
        if (recoveryResult.success) {
          // Retry the operation after recovery
          return R2UserStorage.generateAssetPath(
            userId,
            assetType,
            designId,
            extension
          );
        }
      }

      throw new Error(`Failed to get asset path: ${error.message}`);
    }
  }

  /**
   * Get an export path and ensure folder exists with error handling
   * @param userId - The user ID
   * @param exportType - The export type
   * @param filename - The filename
   * @returns File path information
   */
  static async getExportPath(
    userId: string,
    exportType: ExportType,
    filename: string
  ): Promise<{ key: string; publicUrl: string }> {
    const context: FolderOperationContext = {
      userId,
      operation: "get_export_path",
      folderPath: UserFolderPaths.getExportTypePath(userId, exportType),
      startTime: new Date(),
      metadata: { exportType, filename },
    };

    try {
      // Ensure user folder exists with error handling
      await this.ensureUserFolderExists(userId);

      // Generate path
      return R2UserStorage.generateExportPath(userId, exportType, filename);
    } catch (error: any) {
      console.error(`[USER_FOLDER_SERVICE] Error getting export path:`, error);

      // Try to recover from folder-related errors
      if (
        error.message.includes("folder") ||
        error.message.includes("directory")
      ) {
        const recoveryResult = await folderErrorHandler.handleMissingUserFolder(
          userId,
          context
        );
        if (recoveryResult.success) {
          // Retry the operation after recovery
          return R2UserStorage.generateExportPath(userId, exportType, filename);
        }
      }

      throw new Error(`Failed to get export path: ${error.message}`);
    }
  }

  /**
   * Delete a user file with validation
   * @param userId - The user ID
   * @param fileKey - The file key to delete
   * @returns True if file was deleted successfully
   */
  static async deleteUserFile(
    userId: string,
    fileKey: string
  ): Promise<boolean> {
    try {
      // Validate user has access to the file
      const hasAccess = await this.validateUserFileAccess(userId, fileKey);
      if (!hasAccess) {
        throw new Error(
          `User ${userId} does not have access to file ${fileKey}`
        );
      }

      // Delete the file
      const deleted = await R2UserStorage.deleteFile(fileKey);

      if (deleted) {
        // Update metadata
        await this.updateUserFolderMetadata(userId);
      }

      return deleted;
    } catch (error: any) {
      console.error(`[USER_FOLDER_SERVICE] Error deleting user file:`, error);
      throw new Error(`Failed to delete user file: ${error.message}`);
    }
  }

  /**
   * List user files with pagination
   * @param userId - The user ID
   * @param prefix - Optional prefix to filter files
   * @param page - Page number (0-based)
   * @param pageSize - Page size
   * @returns Paginated list of files
   */
  static async listUserFilesPaginated(
    userId: string,
    prefix?: string,
    page: number = 0,
    pageSize: number = 50
  ): Promise<{
    files: { key: string; lastModified: Date; size: number }[];
    totalCount: number;
    currentPage: number;
    totalPages: number;
  }> {
    try {
      // Validate user folder exists
      const folderExists = await this.ensureUserFolderExists(userId);
      if (!folderExists) {
        return {
          files: [],
          totalCount: 0,
          currentPage: page,
          totalPages: 0,
        };
      }

      // Get files with pagination
      const maxKeys = pageSize;
      const startKey = page > 0 ? undefined : undefined; // R2 doesn't support simple offset pagination

      const files = await R2UserStorage.listUserFiles(userId, prefix, maxKeys);

      // For simplicity, we're not implementing full pagination here
      // In a real implementation, you might need to use continuation tokens
      return {
        files,
        totalCount: files.length,
        currentPage: page,
        totalPages: Math.ceil(files.length / pageSize),
      };
    } catch (error: any) {
      console.error(`[USER_FOLDER_SERVICE] Error listing user files:`, error);
      throw new Error(`Failed to list user files: ${error.message}`);
    }
  }

  /**
   * Get comprehensive user folder statistics
   * @param userId - The user ID
   * @returns Detailed statistics
   */
  static async getUserFolderStats(userId: string): Promise<UserFolderStats> {
    try {
      const metadata = await this.getUserFolderMetadata(userId);

      const sizeByType = {
        mockups: 0,
        profilePictures: 0,
        assets: 0,
        exports: 0,
      };

      const fileCounts = {
        mockups: metadata.mockupCount,
        profilePictures: 0, // Would need to be calculated
        assets: metadata.assetCount,
        exports: metadata.exportCount,
      };

      return {
        totalFiles: metadata.totalFiles,
        totalSize: metadata.totalSize,
        fileCounts,
        sizeByType,
      };
    } catch (error: any) {
      console.error(
        `[USER_FOLDER_SERVICE] Error getting user folder stats:`,
        error
      );
      throw new Error(`Failed to get user folder stats: ${error.message}`);
    }
  }
}
