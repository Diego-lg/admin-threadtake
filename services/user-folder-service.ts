import {
  R2UserStorage,
  UserFolderPaths,
  MockupType,
  AssetType,
  ExportType,
  ProfilePictureType,
  sanitizeUserNameForPath,
} from "../lib/r2-user-storage";
import { R2Config } from "../lib/r2-config";
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
        `[USER_FOLDER_SERVICE] Initializing folder structure for user ${userId}`,
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
            `[USER_FOLDER_SERVICE] User folder already exists for ${userId}`,
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
              context,
            );
          throw new Error(
            `Permission denied: ${recoveryResult.error?.message}`,
          );
        }

        // For other errors, try to proceed with folder creation
        console.warn(
          `[USER_FOLDER_SERVICE] Error checking folder existence: ${error.message}`,
        );
      }

      // Attempt to create folder structure with error handling
      try {
        const created = await R2UserStorage.createUserFolderStructure(userId);

        if (created) {
          console.log(
            `[USER_FOLDER_SERVICE] Successfully created folder structure for user ${userId}`,
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
          context,
        );

        if (recoveryResult.success) {
          console.log(
            `[USER_FOLDER_SERVICE] Successfully recovered and created folder structure for user ${userId}`,
          );
          await this.updateUserFolderMetadata(userId);
          return true;
        } else {
          throw new Error(
            `Failed to create user folder: ${recoveryResult.error?.message}`,
          );
        }
      }

      return false;
    } catch (error: any) {
      console.error(
        `[USER_FOLDER_SERVICE] Error initializing user folder for ${userId}:`,
        error,
      );
      throw new Error(`Failed to initialize user folder: ${error.message}`);
    }
  }

  /**
   * Initialize user folder structure using user's name (human-readable folders)
   * This creates folders like: users/john-doe/ instead of users/userId/
   * @param userId - The user ID
   * @param userName - The user's display name
   * @returns True if initialization was successful
   */
  static async initializeUserFolderByName(
    userId: string,
    userName: string,
  ): Promise<boolean> {
    const startTime = Date.now();
    const sanitizedName = sanitizeUserNameForPath(userName, userId);
    const context: FolderOperationContext = {
      userId,
      operation: "initialize_user_folder_by_name",
      startTime: new Date(),
    };

    try {
      console.log(
        `[USER_FOLDER_SERVICE] Initializing name-based folder structure for user ${userId} (name: ${sanitizedName})`,
      );

      // Validate user exists in database
      const user = await prismadb.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true },
      });

      if (!user) {
        throw new Error(`User ${userId} not found in database`);
      }

      // Create folder structure using R2UserStorage with name-based paths
      const created =
        await R2UserStorage.createUserFolderStructureByName(sanitizedName);

      if (created) {
        console.log(
          `[USER_FOLDER_SERVICE] Successfully created name-based folder structure for user ${userId}: users/${sanitizedName}/`,
        );

        // Update user record with folder info
        await prismadb.user.update({
          where: { id: userId },
          data: {
            r2FolderCreated: true,
          },
        });

        return true;
      }

      return false;
    } catch (error: any) {
      console.error(
        `[USER_FOLDER_SERVICE] Error initializing name-based folder for ${userId}:`,
        error,
      );
      throw new Error(
        `Failed to initialize name-based folder: ${error.message}`,
      );
    }
  }

  /**
   * Initialize user folder using their name from database
   * This is the main method to use for creating user folders with human-readable names
   * @param userId - The user ID
   * @returns True if initialization was successful
   */
  static async initializeUserFolderWithName(userId: string): Promise<boolean> {
    try {
      // Get user from database to get their name
      const user = await prismadb.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true },
      });

      if (!user) {
        throw new Error(`User ${userId} not found in database`);
      }

      // If user doesn't have a name, fall back to ID-based folder
      if (!user.name) {
        console.log(
          `[USER_FOLDER_SERVICE] User ${userId} has no name, using ID-based folder`,
        );
        return await this.initializeUserFolder(userId);
      }

      // Use name-based folder
      return await this.initializeUserFolderByName(userId, user.name);
    } catch (error: any) {
      console.error(
        `[USER_FOLDER_SERVICE] Error initializing folder with name for ${userId}:`,
        error,
      );
      throw new Error(
        `Failed to initialize folder with name: ${error.message}`,
      );
    }
  }

  /**
   * Get user folder name for display purposes
   * @param userId - The user ID
   * @returns Object with folder path info
   */
  static async getUserFolderInfo(
    userId: string,
  ): Promise<{ folderPath: string; folderExists: boolean }> {
    try {
      const user = await prismadb.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true },
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Use name-based path if user has a name
      if (user.name) {
        const folderName = sanitizeUserNameForPath(user.name, userId);
        const folderPath = `users/${folderName}`;
        const folderExists =
          await R2UserStorage.userFolderExistsByName(folderName);

        return { folderPath, folderExists };
      }

      // Fall back to ID-based path
      const folderPath = UserFolderPaths.getUserBasePath(userId);
      const folderExists = await R2UserStorage.userFolderExists(userId);

      return { folderPath, folderExists };
    } catch (error: any) {
      console.error(
        `[USER_FOLDER_SERVICE] Error getting folder info for ${userId}:`,
        error,
      );
      throw new Error(`Failed to get folder info: ${error.message}`);
    }
  }

  /**
   * Handle folder creation errors with automatic recovery
   */
  private static async handleFolderCreationError(
    userId: string,
    error: Error,
    context: FolderOperationContext,
  ): Promise<ErrorRecoveryResult> {
    console.error(
      `[USER_FOLDER_SERVICE] Folder creation error for ${userId}:`,
      error,
    );

    // Classify error type and handle accordingly
    if (error.message.includes("Permission denied")) {
      return await folderErrorHandler.handlePermissionDenied(
        userId,
        UserFolderPaths.getUserBasePath(userId),
        context,
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
   * Determine which folder type is being used for a user
   * @param userId - The user ID
   * @returns Object with folder type and sanitized name (if using name-based)
   */
  static async getUserFolderType(
    userId: string,
  ): Promise<{ folderType: "name" | "id"; sanitizedName?: string }> {
    try {
      // Get user from database
      const user = await prismadb.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      if (user?.name) {
        const sanitizedName = sanitizeUserNameForPath(user.name, userId);

        // Check if name-based folder exists
        const nameFolderExists =
          await R2UserStorage.userFolderExistsByName(sanitizedName);
        if (nameFolderExists) {
          return { folderType: "name", sanitizedName };
        }

        // Check if ID-based folder exists
        const idFolderExists = await R2UserStorage.userFolderExists(userId);
        if (idFolderExists) {
          return { folderType: "id" };
        }

        // Neither exists yet, use name-based (will be created)
        return { folderType: "name", sanitizedName };
      }

      // No user name, use ID-based
      return { folderType: "id" };
    } catch (error) {
      console.error(
        `[USER_FOLDER_SERVICE] Error determining folder type for ${userId}:`,
        error,
      );
      // Default to ID-based on error
      return { folderType: "id" };
    }
  }

  /**
   * Ensure user folder exists (create if needed) with comprehensive error handling
   * Prefers name-based folders when user has a name set
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
      // Check if user has a name - if so, use name-based folder
      const user = await prismadb.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      if (user?.name) {
        // Use name-based folder approach
        return await this.ensureNameBasedFolder(userId, user.name);
      }

      // Fall back to ID-based folder
      return await R2UserStorage.ensureUserFolderExists(userId);
    } catch (error: any) {
      console.error(
        `[USER_FOLDER_SERVICE] Error ensuring user folder exists for ${userId}:`,
        error,
      );

      // Try to recover from the error
      const recoveryResult = await this.handleFolderCreationError(
        userId,
        error,
        context,
      );

      if (recoveryResult.success) {
        console.log(
          `[USER_FOLDER_SERVICE] Successfully recovered and ensured folder exists for user ${userId}`,
        );
        return true;
      }

      throw new Error(
        `Failed to ensure user folder exists: ${recoveryResult.error?.message}`,
      );
    }
  }

  /**
   * Get user folder metadata with error handling for missing folders
   * @param userId - The user ID
   * @returns User folder metadata
   */
  static async getUserFolderMetadata(
    userId: string,
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
          context,
        );

        if (recoveryResult.success) {
          console.log(
            `[USER_FOLDER_SERVICE] Auto-created missing folder for user ${userId}`,
          );
        } else {
          console.warn(
            `[USER_FOLDER_SERVICE] Could not auto-create folder for user ${userId}`,
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
        error,
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
    folderType: "mockups" | "assets" | "exports" | "profile-pictures",
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
        error,
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
    userId: string,
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
        },
      );

      return metadata;
    } catch (error: any) {
      console.error(
        `[USER_FOLDER_SERVICE] Error updating user folder metadata for ${userId}:`,
        error,
      );
      throw new Error(
        `Failed to update user folder metadata: ${error.message}`,
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
    fileKey: string,
  ): Promise<boolean> {
    try {
      // Check if the file key starts with the user's base path
      const userBasePath = UserFolderPaths.getUserBasePath(userId);

      if (!fileKey.startsWith(userBasePath)) {
        console.warn(
          `[USER_FOLDER_SERVICE] Access denied: User ${userId} trying to access file outside their folder: ${fileKey}`,
        );
        return false;
      }

      // Check if the file actually exists
      const fileExists = await R2UserStorage.fileExists(fileKey);

      if (!fileExists) {
        console.warn(
          `[USER_FOLDER_SERVICE] Access denied: File does not exist: ${fileKey}`,
        );
        return false;
      }

      return true;
    } catch (error: any) {
      console.error(
        `[USER_FOLDER_SERVICE] Error validating user file access for ${userId}:`,
        error,
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
    extension: string,
  ): Promise<{ key: string; publicUrl: string }> {
    const context: FolderOperationContext = {
      userId,
      operation: "get_mockup_path",
      folderPath: UserFolderPaths.getMockupTypePath(
        userId,
        designId,
        mockupType,
      ),
      startTime: new Date(),
      metadata: { designId, mockupType, extension },
    };

    try {
      // Ensure user folder exists with error handling
      await this.ensureUserFolderExists(userId);

      // Determine which folder type is being used
      const folderInfo = await this.getUserFolderType(userId);

      // Generate path based on folder type
      if (folderInfo.folderType === "name" && folderInfo.sanitizedName) {
        return R2UserStorage.generateMockupPathByName(
          folderInfo.sanitizedName,
          designId,
          mockupType,
          extension,
        );
      }

      // Fall back to ID-based path
      return R2UserStorage.generateMockupPath(
        userId,
        designId,
        mockupType,
        extension,
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
          context,
        );
        if (recoveryResult.success) {
          // Retry the operation after recovery
          return R2UserStorage.generateMockupPath(
            userId,
            designId,
            mockupType,
            extension,
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
    extension: string,
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

      // Determine which folder type is being used
      const folderInfo = await this.getUserFolderType(userId);

      // Generate path based on folder type
      if (folderInfo.folderType === "name" && folderInfo.sanitizedName) {
        return R2UserStorage.generateProfilePicturePathByName(
          folderInfo.sanitizedName,
          type,
          extension,
        );
      }

      // Fall back to ID-based path
      return R2UserStorage.generateProfilePicturePath(userId, type, extension);
    } catch (error: any) {
      console.error(
        `[USER_FOLDER_SERVICE] Error getting profile picture path:`,
        error,
      );

      // Try to recover from folder-related errors
      if (
        error.message.includes("folder") ||
        error.message.includes("directory")
      ) {
        const recoveryResult = await folderErrorHandler.handleMissingUserFolder(
          userId,
          context,
        );
        if (recoveryResult.success) {
          // Retry the operation after recovery
          return R2UserStorage.generateProfilePicturePath(
            userId,
            type,
            extension,
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
    extension: string = "",
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

      // Determine which folder type is being used
      const folderInfo = await this.getUserFolderType(userId);

      // Generate path based on folder type
      if (folderInfo.folderType === "name" && folderInfo.sanitizedName) {
        return R2UserStorage.generateAssetPathByName(
          folderInfo.sanitizedName,
          assetType,
          designId,
          extension,
        );
      }

      // Fall back to ID-based path
      return R2UserStorage.generateAssetPath(
        userId,
        assetType,
        designId,
        extension,
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
          context,
        );
        if (recoveryResult.success) {
          // Retry the operation after recovery
          return R2UserStorage.generateAssetPath(
            userId,
            assetType,
            designId,
            extension,
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
    filename: string,
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

      // Determine which folder type is being used
      const folderInfo = await this.getUserFolderType(userId);

      // Generate path based on folder type
      if (folderInfo.folderType === "name" && folderInfo.sanitizedName) {
        return R2UserStorage.generateExportPathByName(
          folderInfo.sanitizedName,
          exportType,
          filename,
        );
      }

      // Fall back to ID-based path
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
          context,
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
    fileKey: string,
  ): Promise<boolean> {
    try {
      // Validate user has access to the file
      const hasAccess = await this.validateUserFileAccess(userId, fileKey);
      if (!hasAccess) {
        throw new Error(
          `User ${userId} does not have access to file ${fileKey}`,
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
    pageSize: number = 50,
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
        error,
      );
      throw new Error(`Failed to get user folder stats: ${error.message}`);
    }
  }

  // ===== NEW: Folder Migration Methods =====

  /**
   * Rename user folder when user changes their name
   * @param userId - The user ID
   * @param oldName - Old user name
   * @param newName - New user name
   * @returns Result with success status
   */
  static async renameUserFolderOnNameChange(
    userId: string,
    oldName: string,
    newName: string,
  ): Promise<{ success: boolean; filesCopied: number; error?: string }> {
    try {
      const oldSanitizedName = sanitizeUserNameForPath(oldName, userId);
      const newSanitizedName = sanitizeUserNameForPath(newName, userId);

      // If names are the same after sanitization, no need to rename
      if (oldSanitizedName === newSanitizedName) {
        console.log(
          `[USER_FOLDER_SERVICE] Name unchanged after sanitization, skipping folder rename`,
        );
        return { success: true, filesCopied: 0 };
      }

      console.log(
        `[USER_FOLDER_SERVICE] Renaming user folder from ${oldSanitizedName} to ${newSanitizedName} for user ${userId}`,
      );

      const result = await R2UserStorage.renameUserFolder(
        oldSanitizedName,
        newSanitizedName,
      );

      if (result.success) {
        console.log(
          `[USER_FOLDER_SERVICE] Successfully renamed folder for user ${userId}: ${result.filesCopied} files copied`,
        );
      } else {
        console.error(
          `[USER_FOLDER_SERVICE] Failed to rename folder for user ${userId}: ${result.error}`,
        );
      }

      return result;
    } catch (error: any) {
      console.error(
        `[USER_FOLDER_SERVICE] Error renaming user folder on name change:`,
        error,
      );
      return {
        success: false,
        filesCopied: 0,
        error: error.message,
      };
    }
  }

  /**
   * Migrate existing ID-based folder to name-based folder
   * @param userId - The user ID
   * @param userName - The user's name
   * @returns Result with success status
   */
  static async migrateToNameBasedFolder(
    userId: string,
    userName: string,
  ): Promise<{ success: boolean; filesCopied: number; error?: string }> {
    try {
      const sanitizedName = sanitizeUserNameForPath(userName, userId);

      console.log(
        `[USER_FOLDER_SERVICE] Migrating user ${userId} folder to name-based: users/${sanitizedName}/`,
      );

      const result = await R2UserStorage.migrateToNameBasedFolder(
        userId,
        sanitizedName,
      );

      if (result.success) {
        console.log(
          `[USER_FOLDER_SERVICE] Successfully migrated folder for user ${userId}: ${result.filesCopied} files copied`,
        );
      } else {
        console.error(
          `[USER_FOLDER_SERVICE] Failed to migrate folder for user ${userId}: ${result.error}`,
        );
      }

      return result;
    } catch (error: any) {
      console.error(
        `[USER_FOLDER_SERVICE] Error migrating to name-based folder:`,
        error,
      );
      return {
        success: false,
        filesCopied: 0,
        error: error.message,
      };
    }
  }

  /**
   * Ensure user has a name-based folder (create or migrate)
   * This is the main method to call during user registration/profile completion
   * @param userId - The user ID
   * @param userName - The user's name
   * @returns True if folder was created/migrated successfully
   */
  static async ensureNameBasedFolder(
    userId: string,
    userName: string,
  ): Promise<boolean> {
    try {
      const sanitizedName = sanitizeUserNameForPath(userName, userId);

      // Check if name-based folder already exists
      const nameFolderExists =
        await R2UserStorage.userFolderExistsByName(sanitizedName);
      if (nameFolderExists) {
        console.log(
          `[USER_FOLDER_SERVICE] Name-based folder already exists for ${sanitizedName}`,
        );
        return true;
      }

      // Check if there's an existing ID-based folder to migrate
      const idFolderExists = await R2UserStorage.userFolderExists(userId);
      if (idFolderExists) {
        // Migrate from ID-based to name-based
        const result = await this.migrateToNameBasedFolder(userId, userName);
        return result.success;
      }

      // Create new name-based folder
      const created =
        await R2UserStorage.createUserFolderStructureByName(sanitizedName);

      return created;
    } catch (error: any) {
      console.error(
        `[USER_FOLDER_SERVICE] Error ensuring name-based folder:`,
        error,
      );
      return false;
    }
  }

  /**
   * Resolve an image URL to the correct R2 path
   * Checks both ID-based and name-based paths to find the image
   * Also attempts to extract and check potential old folder names from the URL
   * Useful for fixing legacy URLs or when folder migration is incomplete
   * @param imageUrl - The image URL to resolve
   * @param userId - The user ID
   * @param userName - The user's current name (optional, for name-based path checking)
   * @returns The resolved URL or original URL if not found
   */
  static async resolveImageUrl(
    imageUrl: string | null | undefined,
    userId: string,
    userName?: string | null,
  ): Promise<string | null> {
    if (!imageUrl) return null;

    try {
      const r2Config = R2Config.getConfig();
      const publicBucketUrl = r2Config.publicBucketUrl;

      // If image is not from our R2 bucket, return as-is
      if (!imageUrl.includes(publicBucketUrl) && !imageUrl.includes("r2.dev")) {
        return imageUrl;
      }

      // Get the path part of the URL
      let relativePath = imageUrl;
      if (imageUrl.includes(publicBucketUrl)) {
        relativePath = imageUrl.replace(publicBucketUrl + "/", "");
      } else if (imageUrl.includes("r2.dev/")) {
        relativePath = imageUrl.split("r2.dev/")[1];
      }

      // Helper function to check if file exists and return resolved URL
      const checkAndReturn = async (path: string): Promise<string | null> => {
        const exists = await R2UserStorage.fileExists(path);
        if (exists) {
          return `${publicBucketUrl}/${path}`;
        }
        return null;
      };

      // 1. Check if file exists at the current/stored path
      const currentExists = await R2UserStorage.fileExists(relativePath);
      if (currentExists) {
        return imageUrl;
      }

      // 2. Build possible paths to check
      const idBasedPath = `users/${userId}/`;
      const sanitizedName = userName
        ? sanitizeUserNameForPath(userName, userId)
        : null;
      const nameBasedPath = sanitizedName ? `users/${sanitizedName}/` : null;

      // 3. Try swapping between ID-based and name-based paths (using current name)
      if (nameBasedPath) {
        // If currently using ID-based path, try name-based
        if (relativePath.startsWith(idBasedPath)) {
          const alternatePath = relativePath.replace(
            idBasedPath,
            nameBasedPath,
          );
          const result = await checkAndReturn(alternatePath);
          if (result) return result;
        }

        // If currently using name-based path, try ID-based
        if (relativePath.startsWith(nameBasedPath)) {
          const alternatePath = relativePath.replace(
            nameBasedPath,
            idBasedPath,
          );
          const result = await checkAndReturn(alternatePath);
          if (result) return result;
        }
      }

      // 4. Try to extract potential old folder names from the URL and check those
      // This handles the case where user changed their name - old files might be in old name folder
      const urlPathParts = relativePath.split("/");
      if (urlPathParts.length >= 2 && urlPathParts[0] === "users") {
        const potentialOldFolder = urlPathParts[1];

        // Skip if it's already the userId or current sanitized name
        if (
          potentialOldFolder !== userId &&
          potentialOldFolder !== sanitizedName
        ) {
          // This is a potential old folder name - check if file exists at original path
          const originalPathExists =
            await R2UserStorage.fileExists(relativePath);
          if (originalPathExists) {
            console.log(
              `[RESOLVE_URL] File exists at original path: ${relativePath}`,
            );
            return imageUrl;
          }

          // Also try the old folder with current user ID or name
          const fileName = urlPathParts.slice(2).join("/");

          // Try with user ID
          const withIdPath = `users/${userId}/${fileName}`;
          const withIdResult = await checkAndReturn(withIdPath);
          if (withIdResult) return withIdResult;

          // Try with current name
          if (sanitizedName) {
            const withNamePath = `users/${sanitizedName}/${fileName}`;
            const withNameResult = await checkAndReturn(withNamePath);
            if (withNameResult) return withNameResult;
          }
        }
      }

      // 5. Try to list files in user's folders to find matching file by name
      // This is a more expensive operation but handles edge cases
      const matchingPath = await this.findMatchingFileInUserFolders(
        relativePath,
        userId,
        sanitizedName,
      );
      if (matchingPath) {
        return `${publicBucketUrl}/${matchingPath}`;
      }

      // Return original URL if not found in either location
      console.warn(
        `[USER_FOLDER_SERVICE] Could not resolve image URL ${imageUrl} for user ${userId}`,
      );
      return imageUrl;
    } catch (error) {
      console.error(`[USER_FOLDER_SERVICE] Error resolving image URL:`, error);
      // Return original URL on error
      return imageUrl;
    }
  }

  /**
   * Find a matching file in user folders by searching for files with matching filename
   * This handles cases where the folder structure changed but filename stayed the same
   * @param originalPath - The original path to match
   * @param userId - The user ID
   * @param sanitizedName - The current sanitized user name
   * @returns The resolved path or null if not found
   */
  private static async findMatchingFileInUserFolders(
    originalPath: string,
    userId: string,
    sanitizedName?: string | null,
  ): Promise<string | null> {
    try {
      // Extract just the filename from the path
      const pathParts = originalPath.split("/");
      const fileName = pathParts[pathParts.length - 1];

      if (!fileName) return null;

      // Search in ID-based folder
      const files = await R2UserStorage.listUserFiles(userId, "", 1000);

      // Search in name-based folder if it exists
      let nameBasedFiles: { key: string; size: number }[] = [];
      if (sanitizedName) {
        try {
          // Use listAllFilesInFolder with the name-based path
          nameBasedFiles = await R2UserStorage.listAllFilesInFolder(
            `users/${sanitizedName}/`,
          );
        } catch (e) {
          // Folder might not exist, ignore
        }
      }

      // Combine all files and search for matching filename
      const allFiles = [...files, ...nameBasedFiles];

      for (const file of allFiles) {
        if (file.key.endsWith(fileName)) {
          console.log(
            `[USER_FOLDER_SERVICE] Found matching file: ${file.key} for ${originalPath}`,
          );
          return file.key;
        }
      }

      return null;
    } catch (error) {
      console.error(
        `[USER_FOLDER_SERVICE] Error finding matching file:`,
        error,
      );
      return null;
    }
  }
}
