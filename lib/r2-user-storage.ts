import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { R2Config } from "./r2-config";

/**
 * Initialize R2 S3 client if not already initialized
 * @returns S3Client instance
 */
function getR2Client(): S3Client {
  return R2Config.getS3Client();
}

/**
 * Get R2 configuration
 * @returns R2 configuration object
 */
function getR2Config() {
  return R2Config.getConfig();
}

/**
 * Types of mockup views for T-shirt designs
 */
export type MockupType = "default" | "back" | "sleeve_left" | "sleeve_right";

/**
 * Types of assets that can be stored
 */
export type AssetType = "logos" | "patterns" | "uploads";

/**
 * Types of exports
 */
export type ExportType = "designs" | "collections";

/**
 * Profile picture types
 */
export type ProfilePictureType = "current" | "history";

/**
 * Sanitize user name for use in folder paths
 * Converts "John Doe" -> "john-doe" or "John_Doe_123"
 * @param userName - The user's display name
 * @param userId - Optional user ID for uniqueness
 * @returns Sanitized folder-safe name
 */
export function sanitizeUserNameForPath(
  userName: string | null | undefined,
  userId?: string,
): string {
  if (!userName || userName.trim() === "") {
    // Fall back to user ID if no name provided
    return userId || "unknown-user";
  }

  // Convert to lowercase
  let sanitized = userName.toLowerCase();

  // Replace spaces and special characters with hyphens
  sanitized = sanitized.replace(/[^a-z0-9]/g, "-");

  // Remove multiple consecutive hyphens
  sanitized = sanitized.replace(/-+/g, "-");

  // Remove leading/trailing hyphens
  sanitized = sanitized.replace(/^-+|-+$/g, "");

  // If sanitized name is empty or too short, use user ID
  if (sanitized.length < 2 && userId) {
    sanitized = userId;
  }

  // Add user ID suffix for uniqueness if name is common
  const commonNames = [
    "user",
    "admin",
    "test",
    "demo",
    "john",
    "jane",
    "default",
  ];
  if (commonNames.includes(sanitized) || sanitized.length < 4) {
    const shortId = userId
      ? userId.substring(0, 8)
      : Math.random().toString(36).substring(2, 10);
    sanitized = `${sanitized}-${shortId}`;
  }

  return sanitized || "unknown-user";
}

/**
 * User folder structure paths
 */
export class UserFolderPaths {
  /**
   * Get the base user folder path
   * @param userId - The user ID
   * @returns Base user folder path
   */
  static getUserBasePath(userId: string): string {
    if (!userId || typeof userId !== "string") {
      throw new Error("Invalid user ID provided");
    }
    return `users/${userId}`;
  }

  /**
   * Get the mockups folder path for a user
   * @param userId - The user ID
   * @returns Mockups folder path
   */
  static getMockupsPath(userId: string): string {
    return `${this.getUserBasePath(userId)}/mockups`;
  }

  /**
   * Get the mockup path for a specific design
   * @param userId - The user ID
   * @param designId - The design ID
   * @returns Design mockup path
   */
  static getDesignMockupPath(userId: string, designId: string): string {
    if (!designId || typeof designId !== "string") {
      throw new Error("Invalid design ID provided");
    }
    return `${this.getMockupsPath(userId)}/${designId}`;
  }

  /**
   * Get the mockup type path for a design
   * @param userId - The user ID
   * @param designId - The design ID
   * @param mockupType - The mockup type
   * @returns Mockup type path
   */
  static getMockupTypePath(
    userId: string,
    designId: string,
    mockupType: MockupType,
  ): string {
    return `${this.getDesignMockupPath(userId, designId)}/${mockupType}`;
  }

  /**
   * Get the temp mockups path for a user
   * @param userId - The user ID
   * @returns Temp mockups path
   */
  static getTempMockupsPath(userId: string): string {
    return `${this.getMockupsPath(userId)}/temp`;
  }

  /**
   * Get the profile pictures folder path for a user
   * @param userId - The user ID
   * @returns Profile pictures folder path
   */
  static getProfilePicturesPath(userId: string): string {
    return `${this.getUserBasePath(userId)}/profile-pictures`;
  }

  /**
   * Get the profile picture history path for a user
   * @param userId - The user ID
   * @returns Profile picture history path
   */
  static getProfilePictureHistoryPath(userId: string): string {
    return `${this.getProfilePicturesPath(userId)}/history`;
  }

  /**
   * Get the assets folder path for a user
   * @param userId - The user ID
   * @returns Assets folder path
   */
  static getAssetsPath(userId: string): string {
    return `${this.getUserBasePath(userId)}/assets`;
  }

  /**
   * Get the asset type path for a user
   * @param userId - The user ID
   * @param assetType - The asset type
   * @returns Asset type path
   */
  static getAssetTypePath(userId: string, assetType: AssetType): string {
    return `${this.getAssetsPath(userId)}/${assetType}`;
  }

  /**
   * Get the exports folder path for a user
   * @param userId - The user ID
   * @returns Exports folder path
   */
  static getExportsPath(userId: string): string {
    return `${this.getUserBasePath(userId)}/exports`;
  }

  /**
   * Get the export type path for a user
   * @param userId - The user ID
   * @param exportType - The export type
   * @returns Export type path
   */
  static getExportTypePath(userId: string, exportType: ExportType): string {
    return `${this.getExportsPath(userId)}/${exportType}`;
  }

  // ===== NEW: Name-based path methods =====

  /**
   * Get the base user folder path using user's name
   * @param userName - The sanitized user name for folder
   * @returns Base user folder path using name
   */
  static getUserBasePathByName(userName: string): string {
    if (!userName || typeof userName !== "string") {
      throw new Error("Invalid user name provided");
    }
    return `users/${userName}`;
  }

  /**
   * Get the mockups folder path using user name
   * @param userName - The sanitized user name
   * @returns Mockups folder path
   */
  static getMockupsPathByName(userName: string): string {
    return `${this.getUserBasePathByName(userName)}/mockups`;
  }

  /**
   * Get the profile pictures folder path using user name
   * @param userName - The sanitized user name
   * @returns Profile pictures folder path
   */
  static getProfilePicturesPathByName(userName: string): string {
    return `${this.getUserBasePathByName(userName)}/profile-pictures`;
  }

  /**
   * Get the assets folder path using user name
   * @param userName - The sanitized user name
   * @returns Assets folder path
   */
  static getAssetsPathByName(userName: string): string {
    return `${this.getUserBasePathByName(userName)}/assets`;
  }

  /**
   * Get the exports folder path using user name
   * @param userName - The sanitized user name
   * @returns Exports folder path
   */
  static getExportsPathByName(userName: string): string {
    return `${this.getUserBasePathByName(userName)}/exports`;
  }
}

/**
 * File naming utilities for user storage
 */
export class UserFileNaming {
  /**
   * Generate a unique filename with timestamp and UUID
   * @param originalName - Original filename
   * @param prefix - Optional prefix for the filename
   * @returns Unique filename
   */
  static generateUniqueFilename(originalName: string, prefix?: string): string {
    const timestamp = Date.now();
    const uuid = uuidv4();
    const extension = originalName.includes(".")
      ? originalName.substring(originalName.lastIndexOf("."))
      : "";
    const baseName = originalName.includes(".")
      ? originalName.substring(0, originalName.lastIndexOf("."))
      : originalName;

    const cleanBaseName = baseName.replace(/[^a-zA-Z0-9-_]/g, "_");
    const prefixPart = prefix ? `${prefix}_` : "";

    return `${prefixPart}${timestamp}_${uuid}${extension}`;
  }

  /**
   * Generate a mockup filename
   * @param designId - The design ID
   * @param mockupType - The mockup type
   * @param extension - File extension
   * @returns Mockup filename
   */
  static generateMockupFilename(
    designId: string,
    mockupType: MockupType,
    extension: string,
  ): string {
    const timestamp = Date.now();
    const uuid = uuidv4();
    const cleanExtension = extension.startsWith(".")
      ? extension
      : `.${extension}`;
    return `${timestamp}_${uuid}${cleanExtension}`;
  }

  /**
   * Generate a profile picture filename
   * @param type - Profile picture type
   * @param extension - File extension
   * @returns Profile picture filename
   */
  static generateProfilePictureFilename(
    type: ProfilePictureType,
    extension: string,
  ): string {
    const timestamp = Date.now();
    const uuid = uuidv4();
    const cleanExtension = extension.startsWith(".")
      ? extension
      : `.${extension}`;
    return `${type}_${timestamp}_${uuid}${cleanExtension}`;
  }

  /**
   * Generate an asset filename
   * @param designId - The design ID (optional)
   * @param extension - File extension
   * @returns Asset filename
   */
  static generateAssetFilename(
    designId?: string,
    extension: string = "",
  ): string {
    const timestamp = Date.now();
    const uuid = uuidv4();
    const cleanExtension = extension.startsWith(".")
      ? extension
      : `.${extension}`;
    const designPart = designId ? `${designId}_` : "";
    return `${designPart}${uuid}${cleanExtension}`;
  }
}

/**
 * R2 User Storage utilities
 */
export class R2UserStorage {
  /**
   * Check if a user folder exists
   * @param userId - The user ID
   * @returns True if user folder exists
   */
  static async userFolderExists(userId: string): Promise<boolean> {
    try {
      const client = getR2Client();
      const userBasePath = UserFolderPaths.getUserBasePath(userId);

      const config = getR2Config();
      const command = new HeadObjectCommand({
        Bucket: config.bucketName,
        Key: `${userBasePath}/.folder_marker`,
      });

      await client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === "NotFound") {
        return false;
      }
      console.error(
        `[R2_USER_STORAGE] Error checking user folder existence:`,
        error,
      );
      throw new Error(
        `Failed to check user folder existence: ${error.message}`,
      );
    }
  }

  /**
   * Create user folder structure
   * @param userId - The user ID
   * @returns True if folders were created successfully
   */
  static async createUserFolderStructure(userId: string): Promise<boolean> {
    try {
      const client = getR2Client();
      const folders = [
        `${UserFolderPaths.getUserBasePath(userId)}/.folder_marker`,
        `${UserFolderPaths.getMockupsPath(userId)}/.folder_marker`,
        `${UserFolderPaths.getTempMockupsPath(userId)}/.folder_marker`,
        `${UserFolderPaths.getProfilePicturesPath(userId)}/.folder_marker`,
        `${UserFolderPaths.getProfilePictureHistoryPath(
          userId,
        )}/.folder_marker`,
        `${UserFolderPaths.getAssetsPath(userId)}/.folder_marker`,
        `${UserFolderPaths.getAssetTypePath(userId, "logos")}/.folder_marker`,
        `${UserFolderPaths.getAssetTypePath(
          userId,
          "patterns",
        )}/.folder_marker`,
        `${UserFolderPaths.getAssetTypePath(userId, "uploads")}/.folder_marker`,
        `${UserFolderPaths.getExportsPath(userId)}/.folder_marker`,
        `${UserFolderPaths.getExportTypePath(
          userId,
          "designs",
        )}/.folder_marker`,
        `${UserFolderPaths.getExportTypePath(
          userId,
          "collections",
        )}/.folder_marker`,
      ];

      // Create all folders in parallel
      const config = getR2Config();
      await Promise.all(
        folders.map(async (folderPath) => {
          const command = new PutObjectCommand({
            Bucket: config.bucketName,
            Key: folderPath,
            Body: "", // Empty content for folder marker
            ContentType: "application/x-directory",
          });
          await client.send(command);
        }),
      );

      console.log(
        `[R2_USER_STORAGE] Created folder structure for user ${userId}`,
      );
      return true;
    } catch (error: any) {
      console.error(
        `[R2_USER_STORAGE] Error creating user folder structure:`,
        error,
      );
      throw new Error(
        `Failed to create user folder structure: ${error.message}`,
      );
    }
  }

  /**
   * Ensure user folder structure exists (create if it doesn't)
   * @param userId - The user ID
   * @returns True if folders exist or were created
   */
  static async ensureUserFolderExists(userId: string): Promise<boolean> {
    const exists = await this.userFolderExists(userId);
    if (!exists) {
      return await this.createUserFolderStructure(userId);
    }
    return true;
  }

  // ===== NEW: Name-based folder methods =====

  /**
   * Check if a user folder exists using user name
   * @param userName - The sanitized user name
   * @returns True if user folder exists
   */
  static async userFolderExistsByName(userName: string): Promise<boolean> {
    try {
      const client = getR2Client();
      const userBasePath = UserFolderPaths.getUserBasePathByName(userName);

      const config = getR2Config();
      const command = new HeadObjectCommand({
        Bucket: config.bucketName,
        Key: `${userBasePath}/.folder_marker`,
      });

      await client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === "NotFound") {
        return false;
      }
      console.error(
        `[R2_USER_STORAGE] Error checking user folder existence by name:`,
        error,
      );
      throw new Error(
        `Failed to check user folder existence: ${error.message}`,
      );
    }
  }

  /**
   * Create user folder structure using user's name
   * Creates folders like: users/john-doe/ instead of users/userId/
   * @param userName - The sanitized user name
   * @returns True if folders were created successfully
   */
  static async createUserFolderStructureByName(
    userName: string,
  ): Promise<boolean> {
    try {
      const client = getR2Client();
      const folders = [
        `${UserFolderPaths.getUserBasePathByName(userName)}/.folder_marker`,
        `${UserFolderPaths.getMockupsPathByName(userName)}/.folder_marker`,
        `${UserFolderPaths.getMockupsPathByName(userName)}/temp/.folder_marker`,
        `${UserFolderPaths.getProfilePicturesPathByName(userName)}/.folder_marker`,
        `${UserFolderPaths.getProfilePicturesPathByName(
          userName,
        )}/history/.folder_marker`,
        `${UserFolderPaths.getAssetsPathByName(userName)}/.folder_marker`,
        `${UserFolderPaths.getAssetsPathByName(userName)}/logos/.folder_marker`,
        `${UserFolderPaths.getAssetsPathByName(userName)}/patterns/.folder_marker`,
        `${UserFolderPaths.getAssetsPathByName(userName)}/uploads/.folder_marker`,
        `${UserFolderPaths.getExportsPathByName(userName)}/.folder_marker`,
        `${UserFolderPaths.getExportsPathByName(
          userName,
        )}/designs/.folder_marker`,
        `${UserFolderPaths.getExportsPathByName(
          userName,
        )}/collections/.folder_marker`,
      ];

      // Create all folders in parallel
      const config = getR2Config();
      await Promise.all(
        folders.map(async (folderPath) => {
          const command = new PutObjectCommand({
            Bucket: config.bucketName,
            Key: folderPath,
            Body: "", // Empty content for folder marker
            ContentType: "application/x-directory",
          });
          await client.send(command);
        }),
      );

      console.log(
        `[R2_USER_STORAGE] Created name-based folder structure for: users/${userName}/`,
      );
      return true;
    } catch (error: any) {
      console.error(
        `[R2_USER_STORAGE] Error creating name-based folder structure:`,
        error,
      );
      throw new Error(
        `Failed to create name-based folder structure: ${error.message}`,
      );
    }
  }

  /**
   * Ensure user folder structure exists by name (create if it doesn't)
   * @param userName - The sanitized user name
   * @returns True if folders exist or were created
   */
  static async ensureUserFolderExistsByName(
    userName: string,
  ): Promise<boolean> {
    const exists = await this.userFolderExistsByName(userName);
    if (!exists) {
      return await this.createUserFolderStructureByName(userName);
    }
    return true;
  }

  // ===== NEW: Name-based path generation methods =====

  /**
   * Generate a full file path for a mockup using user name
   * @param userName - The sanitized user name
   * @param designId - The design ID
   * @param mockupType - The mockup type
   * @param extension - File extension
   * @returns Full file path and public URL
   */
  static generateMockupPathByName(
    userName: string,
    designId: string,
    mockupType: MockupType,
    extension: string,
  ): { key: string; publicUrl: string } {
    const filename = UserFileNaming.generateMockupFilename(
      designId,
      mockupType,
      extension,
    );
    const key = `${UserFolderPaths.getMockupsPathByName(userName)}/${designId}/${mockupType}/${filename}`;
    const config = getR2Config();
    const publicUrl = `${config.publicBucketUrl}/${key}`;

    return { key, publicUrl };
  }

  /**
   * Generate a full file path for a profile picture using user name
   * @param userName - The sanitized user name
   * @param type - Profile picture type
   * @param extension - File extension
   * @returns Full file path and public URL
   */
  static generateProfilePicturePathByName(
    userName: string,
    type: ProfilePictureType,
    extension: string,
  ): { key: string; publicUrl: string } {
    const filename = UserFileNaming.generateProfilePictureFilename(
      type,
      extension,
    );
    const folderPath =
      type === "current"
        ? UserFolderPaths.getProfilePicturesPathByName(userName)
        : `${UserFolderPaths.getProfilePicturesPathByName(userName)}/history`;

    const key = `${folderPath}/${filename}`;
    const config = getR2Config();
    const publicUrl = `${config.publicBucketUrl}/${key}`;

    return { key, publicUrl };
  }

  /**
   * Generate a full file path for an asset using user name
   * @param userName - The sanitized user name
   * @param assetType - The asset type
   * @param designId - Optional design ID
   * @param extension - File extension
   * @returns Full file path and public URL
   */
  static generateAssetPathByName(
    userName: string,
    assetType: AssetType,
    designId?: string,
    extension: string = "",
  ): { key: string; publicUrl: string } {
    const filename = UserFileNaming.generateAssetFilename(designId, extension);
    const key = `${UserFolderPaths.getAssetsPathByName(userName)}/${assetType}/${filename}`;
    const config = getR2Config();
    const publicUrl = `${config.publicBucketUrl}/${key}`;

    return { key, publicUrl };
  }

  /**
   * Generate a full file path for an export using user name
   * @param userName - The sanitized user name
   * @param exportType - The export type
   * @param filename - The filename
   * @returns Full file path and public URL
   */
  static generateExportPathByName(
    userName: string,
    exportType: ExportType,
    filename: string,
  ): { key: string; publicUrl: string } {
    const uniqueFilename = UserFileNaming.generateUniqueFilename(filename);
    const key = `${UserFolderPaths.getExportsPathByName(userName)}/${exportType}/${uniqueFilename}`;
    const config = getR2Config();
    const publicUrl = `${config.publicBucketUrl}/${key}`;

    return { key, publicUrl };
  }

  // ===== Legacy path methods (keeping for backward compatibility) =====

  /**
   * Generate a full file path for a mockup
   * @param userId - The user ID
   * @param designId - The design ID
   * @param mockupType - The mockup type
   * @param extension - File extension
   * @returns Full file path and public URL
   */
  static generateMockupPath(
    userId: string,
    designId: string,
    mockupType: MockupType,
    extension: string,
  ): { key: string; publicUrl: string } {
    const filename = UserFileNaming.generateMockupFilename(
      designId,
      mockupType,
      extension,
    );
    const key = `${UserFolderPaths.getMockupTypePath(
      userId,
      designId,
      mockupType,
    )}/${filename}`;
    const config = getR2Config();
    const publicUrl = `${config.publicBucketUrl}/${key}`;

    return { key, publicUrl };
  }

  /**
   * Generate a full file path for a profile picture
   * @param userId - The user ID
   * @param type - Profile picture type
   * @param extension - File extension
   * @returns Full file path and public URL
   */
  static generateProfilePicturePath(
    userId: string,
    type: ProfilePictureType,
    extension: string,
  ): { key: string; publicUrl: string } {
    const filename = UserFileNaming.generateProfilePictureFilename(
      type,
      extension,
    );
    const folderPath =
      type === "current"
        ? UserFolderPaths.getProfilePicturesPath(userId)
        : UserFolderPaths.getProfilePictureHistoryPath(userId);

    const key = `${folderPath}/${filename}`;
    const config = getR2Config();
    const publicUrl = `${config.publicBucketUrl}/${key}`;

    return { key, publicUrl };
  }

  /**
   * Generate a full file path for an asset
   * @param userId - The user ID
   * @param assetType - The asset type
   * @param designId - Optional design ID
   * @param extension - File extension
   * @returns Full file path and public URL
   */
  static generateAssetPath(
    userId: string,
    assetType: AssetType,
    designId?: string,
    extension: string = "",
  ): { key: string; publicUrl: string } {
    const filename = UserFileNaming.generateAssetFilename(designId, extension);
    const key = `${UserFolderPaths.getAssetTypePath(
      userId,
      assetType,
    )}/${filename}`;
    const config = getR2Config();
    const publicUrl = `${config.publicBucketUrl}/${key}`;

    return { key, publicUrl };
  }

  /**
   * Generate a full file path for an export
   * @param userId - The user ID
   * @param exportType - The export type
   * @param filename - The filename
   * @returns Full file path and public URL
   */
  static generateExportPath(
    userId: string,
    exportType: ExportType,
    filename: string,
  ): { key: string; publicUrl: string } {
    const uniqueFilename = UserFileNaming.generateUniqueFilename(filename);
    const key = `${UserFolderPaths.getExportTypePath(
      userId,
      exportType,
    )}/${uniqueFilename}`;
    const config = getR2Config();
    const publicUrl = `${config.publicBucketUrl}/${key}`;

    return { key, publicUrl };
  }

  /**
   * Delete a file from R2 storage
   * @param key - The file key
   * @returns True if file was deleted successfully
   */
  static async deleteFile(key: string): Promise<boolean> {
    try {
      const client = getR2Client();
      const config = getR2Config();
      const command = new DeleteObjectCommand({
        Bucket: config.bucketName,
        Key: key,
      });

      await client.send(command);
      console.log(`[R2_USER_STORAGE] Deleted file: ${key}`);
      return true;
    } catch (error: any) {
      console.error(`[R2_USER_STORAGE] Error deleting file ${key}:`, error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Check if a file exists in R2 storage
   * @param key - The file key
   * @returns True if file exists
   */
  static async fileExists(key: string): Promise<boolean> {
    try {
      const client = getR2Client();
      const config = getR2Config();
      const command = new HeadObjectCommand({
        Bucket: config.bucketName,
        Key: key,
      });

      await client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === "NotFound") {
        return false;
      }
      console.error(
        `[R2_USER_STORAGE] Error checking file existence ${key}:`,
        error,
      );
      throw new Error(`Failed to check file existence: ${error.message}`);
    }
  }

  /**
   * List files in a user folder
   * @param userId - The user ID
   * @param prefix - Optional prefix to filter files
   * @param maxKeys - Maximum number of keys to return
   * @returns List of files
   */
  static async listUserFiles(
    userId: string,
    prefix?: string,
    maxKeys: number = 100,
  ): Promise<{ key: string; lastModified: Date; size: number }[]> {
    try {
      const client = getR2Client();
      const userBasePath = UserFolderPaths.getUserBasePath(userId);
      const fullPrefix = prefix ? `${userBasePath}/${prefix}` : userBasePath;

      const config = getR2Config();
      const command = new ListObjectsV2Command({
        Bucket: config.bucketName,
        Prefix: fullPrefix,
        MaxKeys: maxKeys,
      });

      const response = await client.send(command);

      return (response.Contents || [])
        .filter((item) => !item.Key?.endsWith("/.folder_marker"))
        .map((item) => ({
          key: item.Key!,
          lastModified: item.LastModified!,
          size: item.Size || 0,
        }));
    } catch (error: any) {
      console.error(`[R2_USER_STORAGE] Error listing user files:`, error);
      throw new Error(`Failed to list user files: ${error.message}`);
    }
  }

  // ===== NEW: Folder Migration/Rename Methods =====

  /**
   * List all files in a folder (including subfolders)
   * @param prefix - The folder prefix to list
   * @returns List of all file keys in the folder
   */
  static async listAllFilesInFolder(
    prefix: string,
  ): Promise<{ key: string; size: number }[]> {
    try {
      const client = getR2Client();
      const config = getR2Config();
      const allFiles: { key: string; size: number }[] = [];
      let continuationToken: string | undefined;

      do {
        const command = new ListObjectsV2Command({
          Bucket: config.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        });

        const response = await client.send(command);

        if (response.Contents && response.Contents.length > 0) {
          allFiles.push(
            ...response.Contents.filter((item) => item.Key).map((item) => ({
              key: item.Key!,
              size: item.Size || 0,
            })),
          );
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      return allFiles;
    } catch (error: any) {
      console.error(
        `[R2_USER_STORAGE] Error listing files in folder ${prefix}:`,
        error,
      );
      throw new Error(`Failed to list files in folder: ${error.message}`);
    }
  }

  /**
   * Copy a file from one location to another
   * @param sourceKey - Source file key
   * @param destinationKey - Destination file key
   * @returns True if copy was successful
   */
  static async copyFile(
    sourceKey: string,
    destinationKey: string,
  ): Promise<boolean> {
    try {
      const client = getR2Client();
      const config = getR2Config();

      const command = new CopyObjectCommand({
        Bucket: config.bucketName,
        CopySource: `${config.bucketName}/${sourceKey}`,
        Key: destinationKey,
      });

      await client.send(command);
      return true;
    } catch (error: any) {
      console.error(
        `[R2_USER_STORAGE] Error copying file ${sourceKey}:`,
        error,
      );
      throw new Error(`Failed to copy file: ${error.message}`);
    }
  }

  /**
   * Copy all files from one folder to another
   * @param sourcePrefix - Source folder prefix
   * @param destinationPrefix - Destination folder prefix
   * @returns Number of files copied
   */
  static async copyFolderContents(
    sourcePrefix: string,
    destinationPrefix: string,
  ): Promise<number> {
    try {
      const files = await this.listAllFilesInFolder(sourcePrefix);

      if (files.length === 0) {
        console.log(`[R2_USER_STORAGE] No files to copy from ${sourcePrefix}`);
        return 0;
      }

      // Copy all files in parallel
      await Promise.all(
        files.map(async (file) => {
          const relativePath = file.key.substring(sourcePrefix.length);
          const destinationKey = `${destinationPrefix}${relativePath}`;
          await this.copyFile(file.key, destinationKey);
        }),
      );

      console.log(
        `[R2_USER_STORAGE] Copied ${files.length} files from ${sourcePrefix} to ${destinationPrefix}`,
      );
      return files.length;
    } catch (error: any) {
      console.error(`[R2_USER_STORAGE] Error copying folder contents:`, error);
      throw new Error(`Failed to copy folder contents: ${error.message}`);
    }
  }

  /**
   * Delete all files in a folder
   * @param prefix - Folder prefix to delete
   * @returns Number of files deleted
   */
  static async deleteFolderContents(prefix: string): Promise<number> {
    try {
      const files = await this.listAllFilesInFolder(prefix);

      if (files.length === 0) {
        return 0;
      }

      const client = getR2Client();
      const config = getR2Config();

      // Delete in batches of 1000 (R2 limit)
      const batchSize = 1000;
      let deletedCount = 0;

      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const objectsToDelete = batch.map((file) => ({ Key: file.key }));

        const command = new DeleteObjectsCommand({
          Bucket: config.bucketName,
          Delete: {
            Objects: objectsToDelete,
            Quiet: true,
          },
        });

        await client.send(command);
        deletedCount += batch.length;
      }

      console.log(
        `[R2_USER_STORAGE] Deleted ${deletedCount} files from ${prefix}`,
      );
      return deletedCount;
    } catch (error: any) {
      console.error(`[R2_USER_STORAGE] Error deleting folder contents:`, error);
      throw new Error(`Failed to delete folder contents: ${error.message}`);
    }
  }

  /**
   * Rename/migrate a user folder from old name to new name
   * This copies all files from old folder to new folder and deletes the old folder
   * @param oldUserName - Old sanitized user name
   * @param newUserName - New sanitized user name
   * @returns Result object with success status and details
   */
  static async renameUserFolder(
    oldUserName: string,
    newUserName: string,
  ): Promise<{ success: boolean; filesCopied: number; error?: string }> {
    try {
      const oldPrefix = `users/${oldUserName}`;
      const newPrefix = `users/${newUserName}`;

      // Check if source folder exists
      const sourceExists = await this.userFolderExistsByName(oldUserName);
      if (!sourceExists) {
        return {
          success: false,
          filesCopied: 0,
          error: `Source folder users/${oldUserName} does not exist`,
        };
      }

      // Check if destination folder already exists
      const destExists = await this.userFolderExistsByName(newUserName);
      if (destExists) {
        return {
          success: false,
          filesCopied: 0,
          error: `Destination folder users/${newUserName} already exists`,
        };
      }

      console.log(
        `[R2_USER_STORAGE] Renaming user folder from ${oldPrefix} to ${newPrefix}`,
      );

      // Copy all files from old folder to new folder
      const filesCopied = await this.copyFolderContents(oldPrefix, newPrefix);

      // Delete the old folder
      await this.deleteFolderContents(oldPrefix);

      console.log(
        `[R2_USER_STORAGE] Successfully renamed folder from ${oldUserName} to ${newUserName}. Files copied: ${filesCopied}`,
      );

      return { success: true, filesCopied };
    } catch (error: any) {
      console.error(`[R2_USER_STORAGE] Error renaming user folder:`, error);
      return {
        success: false,
        filesCopied: 0,
        error: error.message,
      };
    }
  }

  /**
   * Migrate from ID-based folder to name-based folder
   * @param userId - The user ID
   * @param userName - The sanitized user name
   * @returns Result object with success status and details
   */
  static async migrateToNameBasedFolder(
    userId: string,
    userName: string,
  ): Promise<{ success: boolean; filesCopied: number; error?: string }> {
    try {
      const idPrefix = `users/${userId}`;
      const namePrefix = `users/${userName}`;

      // Check if ID-based folder exists
      const idFolderExists = await this.userFolderExists(userId);
      if (!idFolderExists) {
        // No existing folder to migrate, just create new name-based folder
        await this.createUserFolderStructureByName(userName);
        return { success: true, filesCopied: 0 };
      }

      // Check if name-based folder already exists
      const nameFolderExists = await this.userFolderExistsByName(userName);
      if (nameFolderExists) {
        // Name folder already exists, just delete the ID folder
        await this.deleteFolderContents(idPrefix);
        return { success: true, filesCopied: 0 };
      }

      console.log(
        `[R2_USER_STORAGE] Migrating user folder from ${idPrefix} to ${namePrefix}`,
      );

      // Copy all files from ID folder to name folder
      const filesCopied = await this.copyFolderContents(idPrefix, namePrefix);

      // Delete the old ID-based folder
      await this.deleteFolderContents(idPrefix);

      console.log(
        `[R2_USER_STORAGE] Successfully migrated folder for user ${userId} to ${userName}. Files copied: ${filesCopied}`,
      );

      return { success: true, filesCopied };
    } catch (error: any) {
      console.error(
        `[R2_USER_STORAGE] Error migrating to name-based folder:`,
        error,
      );
      return {
        success: false,
        filesCopied: 0,
        error: error.message,
      };
    }
  }
}

// Re-export UserFolderService for convenience
export { UserFolderService } from "../services/user-folder-service";
