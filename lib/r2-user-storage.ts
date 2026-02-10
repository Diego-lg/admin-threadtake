import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
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
    mockupType: MockupType
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
    extension: string
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
    extension: string
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
    extension: string = ""
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
        error
      );
      throw new Error(
        `Failed to check user folder existence: ${error.message}`
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
          userId
        )}/.folder_marker`,
        `${UserFolderPaths.getAssetsPath(userId)}/.folder_marker`,
        `${UserFolderPaths.getAssetTypePath(userId, "logos")}/.folder_marker`,
        `${UserFolderPaths.getAssetTypePath(
          userId,
          "patterns"
        )}/.folder_marker`,
        `${UserFolderPaths.getAssetTypePath(userId, "uploads")}/.folder_marker`,
        `${UserFolderPaths.getExportsPath(userId)}/.folder_marker`,
        `${UserFolderPaths.getExportTypePath(
          userId,
          "designs"
        )}/.folder_marker`,
        `${UserFolderPaths.getExportTypePath(
          userId,
          "collections"
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
        })
      );

      console.log(
        `[R2_USER_STORAGE] Created folder structure for user ${userId}`
      );
      return true;
    } catch (error: any) {
      console.error(
        `[R2_USER_STORAGE] Error creating user folder structure:`,
        error
      );
      throw new Error(
        `Failed to create user folder structure: ${error.message}`
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
    extension: string
  ): { key: string; publicUrl: string } {
    const filename = UserFileNaming.generateMockupFilename(
      designId,
      mockupType,
      extension
    );
    const key = `${UserFolderPaths.getMockupTypePath(
      userId,
      designId,
      mockupType
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
    extension: string
  ): { key: string; publicUrl: string } {
    const filename = UserFileNaming.generateProfilePictureFilename(
      type,
      extension
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
    extension: string = ""
  ): { key: string; publicUrl: string } {
    const filename = UserFileNaming.generateAssetFilename(designId, extension);
    const key = `${UserFolderPaths.getAssetTypePath(
      userId,
      assetType
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
    filename: string
  ): { key: string; publicUrl: string } {
    const uniqueFilename = UserFileNaming.generateUniqueFilename(filename);
    const key = `${UserFolderPaths.getExportTypePath(
      userId,
      exportType
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
        error
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
    maxKeys: number = 100
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
}

// Re-export UserFolderService for convenience
export { UserFolderService } from "../services/user-folder-service";
