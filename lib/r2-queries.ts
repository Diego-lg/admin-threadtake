import { PrismaClient } from "@prisma/client";
import { R2DbHelpers } from "./r2-db-helpers";
import { R2FileHelpers } from "./r2-file-helpers";
import { R2Config } from "./r2-config";

/**
 * File URL resolution result
 */
export interface FileUrlResult {
  url: string;
  isLegacy: boolean;
  fileKey?: string;
  exists: boolean;
}

/**
 * User file information
 */
export interface UserFileInfo {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  folderPath: string;
  isPublic: boolean;
  createdAt: Date;
  url: string;
  isLegacy: boolean;
}

/**
 * Design file information
 */
export interface DesignFileInfo {
  designId: string;
  designImageUrl?: string;
  mockupImageUrl?: string;
  uploadedLogoUrl?: string;
  uploadedPatternUrl?: string;
  designImageKey?: string;
  mockupImageKey?: string;
  uploadedLogoKey?: string;
  uploadedPatternKey?: string;
  assetKeys?: any;
  mockupKeys?: any;
  migrationStatus: string;
}

/**
 * Enhanced database queries that support both old and new R2 path formats
 */
export class R2Queries {
  /**
   * Get user's profile picture URL with fallback to legacy format
   * @param prisma - Prisma client instance
   * @param userId - User ID
   * @returns Profile picture URL result
   */
  static async getUserProfilePicture(
    prisma: PrismaClient,
    userId: string
  ): Promise<FileUrlResult | null> {
    try {
      // Get user with both new and legacy fields
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          image: true, // Legacy field
          profilePictureKey: true, // New field
          profilePicturePath: true, // Legacy field
        },
      });

      if (!user) {
        return null;
      }

      // Try new format first
      if (user.profilePictureKey) {
        const config = R2Config.getConfig();
        const url = `${config.publicBucketUrl}/${user.profilePictureKey}`;
        return {
          url,
          isLegacy: false,
          fileKey: user.profilePictureKey,
          exists: true, // Assume exists if key is present
        };
      }

      // Fall back to legacy format
      let legacyUrl: string | null = null;
      if (user.profilePicturePath) {
        const config = R2Config.getConfig();
        legacyUrl = `${config.publicBucketUrl}/${user.profilePicturePath}`;
      } else if (user.image && !user.image.startsWith("http")) {
        // Handle legacy image field
        legacyUrl = user.image;
      } else if (user.image && user.image.startsWith("http")) {
        // Handle external image URLs
        return {
          url: user.image,
          isLegacy: true,
          exists: true,
        };
      }

      if (legacyUrl) {
        return {
          url: legacyUrl,
          isLegacy: true,
          exists: true, // Assume exists for legacy URLs
        };
      }

      return null;
    } catch (error: any) {
      console.error(`[R2_QUERIES] Error getting user profile picture:`, error);
      throw new Error(`Failed to get user profile picture: ${error.message}`);
    }
  }

  /**
   * Get design files with support for both old and new formats
   * @param prisma - Prisma client instance
   * @param designId - Design ID
   * @returns Design file information
   */
  static async getDesignFiles(
    prisma: PrismaClient,
    designId: string
  ): Promise<DesignFileInfo | null> {
    try {
      const design = await prisma.savedDesign.findUnique({
        where: { id: designId },
        select: {
          id: true,
          designImageUrl: true, // Legacy
          mockupImageUrl: true, // Legacy
          uploadedLogoUrl: true, // Legacy
          uploadedPatternUrl: true, // Legacy
          designImageKey: true, // New
          mockupImageKey: true, // New
          uploadedLogoKey: true, // New
          uploadedPatternKey: true, // New
          assetKeys: true, // New
          mockupKeys: true, // New
          migrationStatus: true, // New
        },
      });

      if (!design) {
        return null;
      }

      const config = R2Config.getConfig();
      const result: DesignFileInfo = {
        designId: design.id,
        migrationStatus: design.migrationStatus || "unknown",
      };

      // Process design image
      if (design.designImageKey) {
        result.designImageKey = design.designImageKey;
        result.designImageUrl = `${config.publicBucketUrl}/${design.designImageKey}`;
      } else if (design.designImageUrl) {
        result.designImageUrl = design.designImageUrl;
      }

      // Process mockup image
      if (design.mockupImageKey) {
        result.mockupImageKey = design.mockupImageKey;
        result.mockupImageUrl = `${config.publicBucketUrl}/${design.mockupImageKey}`;
      } else if (design.mockupImageUrl) {
        result.mockupImageUrl = design.mockupImageUrl;
      }

      // Process uploaded logo
      if (design.uploadedLogoKey) {
        result.uploadedLogoKey = design.uploadedLogoKey;
        result.uploadedLogoUrl = `${config.publicBucketUrl}/${design.uploadedLogoKey}`;
      } else if (design.uploadedLogoUrl) {
        result.uploadedLogoUrl = design.uploadedLogoUrl;
      }

      // Process uploaded pattern
      if (design.uploadedPatternKey) {
        result.uploadedPatternKey = design.uploadedPatternKey;
        result.uploadedPatternUrl = `${config.publicBucketUrl}/${design.uploadedPatternKey}`;
      } else if (design.uploadedPatternUrl) {
        result.uploadedPatternUrl = design.uploadedPatternUrl;
      }

      // Include JSON fields
      if (design.assetKeys) {
        result.assetKeys = design.assetKeys;
      }
      if (design.mockupKeys) {
        result.mockupKeys = design.mockupKeys;
      }

      return result;
    } catch (error: any) {
      console.error(`[R2_QUERIES] Error getting design files:`, error);
      throw new Error(`Failed to get design files: ${error.message}`);
    }
  }

  /**
   * Get mockup job files with support for both old and new formats
   * @param prisma - Prisma client instance
   * @param jobId - Mockup job ID
   * @returns Mockup job file information
   */
  static async getMockupJobFiles(
    prisma: PrismaClient,
    jobId: string
  ): Promise<{
    id: string;
    imageUrl?: string;
    mockupKeys?: any;
    migrationStatus: string;
    allUrls: string[];
  } | null> {
    try {
      const job = await prisma.mockupJob.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          imageUrl: true, // Legacy
          mockupKeys: true, // New
          migrationStatus: true, // New
          mockupResults: true, // Legacy
        },
      });

      if (!job) {
        return null;
      }

      const config = R2Config.getConfig();
      const allUrls: string[] = [];
      const result: any = {
        id: job.id,
        migrationStatus: job.migrationStatus || "unknown",
        allUrls,
      };

      // Process primary image URL
      if (job.imageUrl) {
        result.imageUrl = job.imageUrl;
        allUrls.push(job.imageUrl);
      }

      // Process mockup keys (new format)
      if (job.mockupKeys && typeof job.mockupKeys === "object") {
        result.mockupKeys = job.mockupKeys;

        // Extract URLs from mockup keys
        Object.values(job.mockupKeys).forEach((key) => {
          if (typeof key === "string") {
            const url = `${config.publicBucketUrl}/${key}`;
            allUrls.push(url);
          }
        });
      }

      // Process mockup results (legacy format)
      if (job.mockupResults && typeof job.mockupResults === "object") {
        const results = job.mockupResults as any;
        if (results.urls && Array.isArray(results.urls)) {
          results.urls.forEach((url: string) => {
            if (!allUrls.includes(url)) {
              allUrls.push(url);
            }
          });
        }
      }

      return result;
    } catch (error: any) {
      console.error(`[R2_QUERIES] Error getting mockup job files:`, error);
      throw new Error(`Failed to get mockup job files: ${error.message}`);
    }
  }

  /**
   * Get user files with pagination and filtering
   * @param prisma - Prisma client instance
   * @param userId - User ID
   * @param options - Query options
   * @returns Paginated user files
   */
  static async getUserFiles(
    prisma: PrismaClient,
    userId: string,
    options: {
      fileType?: string;
      limit?: number;
      offset?: number;
      includeLegacy?: boolean;
    } = {}
  ): Promise<{
    files: UserFileInfo[];
    totalCount: number;
    hasMore: boolean;
  }> {
    try {
      const {
        fileType,
        limit = 50,
        offset = 0,
        includeLegacy = true,
      } = options;

      // Get files from new R2FileMetadata table
      const newFiles = await R2DbHelpers.queryUserFiles(prisma, userId, {
        fileType,
        limit,
        offset,
        includeMetadata: true,
      });

      const files: UserFileInfo[] = newFiles.items.map((file: any) => {
        const config = R2Config.getConfig();
        return {
          id: file.id,
          fileName: file.fileName,
          fileType: file.fileType,
          fileSize: Number(file.fileSize),
          folderPath: file.folderPath,
          isPublic: file.isPublic,
          createdAt: new Date(file.createdAt),
          url: `${config.publicBucketUrl}/${file.fileKey}`,
          isLegacy: false,
        };
      });

      // If includeLegacy is true, also get legacy files from other tables
      let legacyFiles: UserFileInfo[] = [];
      if (includeLegacy && (!fileType || fileType === "profile-pictures")) {
        // Get legacy profile pictures
        const profilePictures = await prisma.user.findMany({
          where: {
            id: userId,
            OR: [
              { image: { not: null } },
              { profilePicturePath: { not: null } },
            ],
          },
          select: {
            id: true,
            image: true,
            profilePicturePath: true,
          },
        });

        const config = R2Config.getConfig();
        legacyFiles = profilePictures
          .filter((user) => user.image || user.profilePicturePath)
          .map((user) => ({
            id: `profile-${user.id}`,
            fileName: "profile-picture",
            fileType: "profile-pictures",
            fileSize: 0,
            folderPath: "profile-pictures",
            isPublic: true,
            createdAt: new Date(),
            url: user.profilePicturePath
              ? `${config.publicBucketUrl}/${user.profilePicturePath}`
              : user.image || "",
            isLegacy: true,
          }));
      }

      // Combine results
      const allFiles = [...files, ...legacyFiles];

      return {
        files: allFiles,
        totalCount: newFiles.totalCount + legacyFiles.length,
        hasMore: newFiles.hasNext || legacyFiles.length > 0,
      };
    } catch (error: any) {
      console.error(`[R2_QUERIES] Error getting user files:`, error);
      throw new Error(`Failed to get user files: ${error.message}`);
    }
  }

  /**
   * Update design file references to use new R2 keys
   * @param prisma - Prisma client instance
   * @param designId - Design ID
   * @param updates - File updates
   * @returns Updated design
   */
  static async updateDesignFiles(
    prisma: PrismaClient,
    designId: string,
    updates: {
      designImageKey?: string;
      mockupImageKey?: string;
      uploadedLogoKey?: string;
      uploadedPatternKey?: string;
      assetKeys?: any;
      mockupKeys?: any;
    }
  ): Promise<void> {
    try {
      await prisma.savedDesign.update({
        where: { id: designId },
        data: {
          ...updates,
          migrationStatus: "completed",
          updatedAt: new Date(),
        },
      });

      console.log(`[R2_QUERIES] Updated design files for ${designId}`);
    } catch (error: any) {
      console.error(`[R2_QUERIES] Error updating design files:`, error);
      throw new Error(`Failed to update design files: ${error.message}`);
    }
  }

  /**
   * Update user profile picture to use new R2 key
   * @param prisma - Prisma client instance
   * @param userId - User ID
   * @param profilePictureKey - New profile picture key
   * @param keepHistory - Whether to keep old profile picture in history
   * @returns Updated user
   */
  static async updateUserProfilePicture(
    prisma: PrismaClient,
    userId: string,
    profilePictureKey: string,
    keepHistory: boolean = true
  ): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          profilePictureKey: true,
          profilePictureHistory: true,
        },
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Update history if requested
      let history = user.profilePictureHistory || [];
      if (keepHistory && user.profilePictureKey) {
        history = [...history, user.profilePictureKey];
        // Keep only last 5 profile pictures in history
        if (history.length > 5) {
          history = history.slice(-5);
        }
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          profilePictureKey,
          profilePictureHistory: history,
          updatedAt: new Date(),
        },
      });

      console.log(`[R2_QUERIES] Updated profile picture for user ${userId}`);
    } catch (error: any) {
      console.error(`[R2_QUERIES] Error updating user profile picture:`, error);
      throw new Error(
        `Failed to update user profile picture: ${error.message}`
      );
    }
  }

  /**
   * Get user storage usage with breakdown by type
   * @param prisma - Prisma client instance
   * @param userId - User ID
   * @returns Storage usage breakdown
   */
  static async getUserStorageUsage(
    prisma: PrismaClient,
    userId: string
  ): Promise<{
    totalUsage: number;
    usageByType: Record<string, number>;
    fileCount: number;
    fileCountByType: Record<string, number>;
    isR2FolderCreated: boolean;
  }> {
    try {
      // Get user info
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          storageUsageBytes: true,
          r2FolderCreated: true,
        },
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Get detailed stats from R2FileMetadata
      const stats = await R2DbHelpers.getUserStorageStats(prisma, userId);

      return {
        totalUsage: Number(user.storageUsageBytes || 0),
        usageByType: stats.sizeByType,
        fileCount: stats.totalFiles,
        fileCountByType: stats.fileCounts,
        isR2FolderCreated: user.r2FolderCreated || false,
      };
    } catch (error: any) {
      console.error(`[R2_QUERIES] Error getting user storage usage:`, error);
      throw new Error(`Failed to get user storage usage: ${error.message}`);
    }
  }

  /**
   * Search user files by name or type
   * @param prisma - Prisma client instance
   * @param userId - User ID
   * @param query - Search query
   * @param options - Search options
   * @returns Search results
   */
  static async searchUserFiles(
    prisma: PrismaClient,
    userId: string,
    query: string,
    options: {
      fileType?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    files: UserFileInfo[];
    totalCount: number;
  }> {
    try {
      const { fileType, limit = 50, offset = 0 } = options;

      // Build search query
      let whereClause = `"userId" = $1`;
      const params: any[] = [userId];
      let paramIndex = 2;

      if (query) {
        whereClause += ` AND ("fileName" ILIKE $${paramIndex++} OR "folderPath" ILIKE $${paramIndex++})`;
        params.push(`%${query}%`, `%${query}%`);
      }

      if (fileType) {
        whereClause += ` AND "fileType" = $${paramIndex++}`;
        params.push(fileType);
      }

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as count
        FROM "R2FileMetadata"
        WHERE ${whereClause}
      `;

      // @ts-ignore - Temporary workaround
      const countResult = await prisma.$queryRawUnsafe(countQuery, ...params);
      const totalCount = Number(countResult[0]?.count || 0);

      // Get search results
      const dataQuery = `
        SELECT *
        FROM "R2FileMetadata"
        WHERE ${whereClause}
        ORDER BY "createdAt" DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      params.push(limit, offset);

      // @ts-ignore - Temporary workaround
      const files = await prisma.$queryRawUnsafe(dataQuery, ...params);

      const config = R2Config.getConfig();
      const userFiles: UserFileInfo[] = files.map((file: any) => ({
        id: file.id,
        fileName: file.fileName,
        fileType: file.fileType,
        fileSize: Number(file.fileSize),
        folderPath: file.folderPath,
        isPublic: file.isPublic,
        createdAt: new Date(file.createdAt),
        url: `${config.publicBucketUrl}/${file.fileKey}`,
        isLegacy: false,
      }));

      return {
        files: userFiles,
        totalCount,
      };
    } catch (error: any) {
      console.error(`[R2_QUERIES] Error searching user files:`, error);
      throw new Error(`Failed to search user files: ${error.message}`);
    }
  }

  /**
   * Get migration status for a user
   * @param prisma - Prisma client instance
   * @param userId - User ID
   * @returns Migration status
   */
  static async getUserMigrationStatus(
    prisma: PrismaClient,
    userId: string
  ): Promise<{
    userMigrated: boolean;
    profilePictureMigrated: boolean;
    designsMigrated: number;
    designsTotal: number;
    mockupJobsMigrated: number;
    mockupJobsTotal: number;
    lastMigrationDate?: Date;
  }> {
    try {
      // Check if user has been migrated
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          r2FolderCreated: true,
          profilePictureKey: true,
        },
      });

      const userMigrated = user?.r2FolderCreated || false;
      const profilePictureMigrated = !!user?.profilePictureKey;

      // Check saved designs migration
      const designStats = await prisma.savedDesign.groupBy({
        by: ["migrationStatus"],
        where: { userId },
        _count: true,
      });

      const designsTotal = designStats.reduce(
        (sum, stat) => sum + stat._count,
        0
      );
      const designsMigrated = designStats
        .filter((stat) => stat.migrationStatus === "completed")
        .reduce((sum, stat) => sum + stat._count, 0);

      // Check mockup jobs migration
      const mockupJobStats = await prisma.mockupJob.groupBy({
        by: ["migrationStatus"],
        where: { userId },
        _count: true,
      });

      const mockupJobsTotal = mockupJobStats.reduce(
        (sum, stat) => sum + stat._count,
        0
      );
      const mockupJobsMigrated = mockupJobStats
        .filter((stat) => stat.migrationStatus === "completed")
        .reduce((sum, stat) => sum + stat._count, 0);

      // Get last migration date
      const lastMigration = await prisma.r2MigrationLog.findFirst({
        where: { userId },
        orderBy: { startTime: "desc" },
        select: { startTime: true },
      });

      return {
        userMigrated,
        profilePictureMigrated,
        designsMigrated,
        designsTotal,
        mockupJobsMigrated,
        mockupJobsTotal,
        lastMigrationDate: lastMigration?.startTime,
      };
    } catch (error: any) {
      console.error(`[R2_QUERIES] Error getting user migration status:`, error);
      throw new Error(`Failed to get user migration status: ${error.message}`);
    }
  }

  /**
   * Cleanup old file references after successful migration
   * @param prisma - Prisma client instance
   * @param userId - User ID
   * @param options - Cleanup options
   * @returns Cleanup result
   */
  static async cleanupLegacyReferences(
    prisma: PrismaClient,
    userId: string,
    options: {
      keepBackupDays?: number;
      dryRun?: boolean;
    } = {}
  ): Promise<{
    cleanedDesigns: number;
    cleanedMockupJobs: number;
    cleanedProfilePictures: number;
    errors: string[];
  }> {
    try {
      const { keepBackupDays = 30, dryRun = false } = options;
      const errors: string[] = [];
      let cleanedDesigns = 0;
      let cleanedMockupJobs = 0;
      let cleanedProfilePictures = 0;

      // Cleanup saved designs
      try {
        const designsToClean = await prisma.savedDesign.findMany({
          where: {
            userId,
            migrationStatus: "completed",
            migratedAt: {
              lt: new Date(Date.now() - keepBackupDays * 24 * 60 * 60 * 1000),
            },
            OR: [
              { designImageUrl: { not: null } },
              { mockupImageUrl: { not: null } },
              { uploadedLogoUrl: { not: null } },
              { uploadedPatternUrl: { not: null } },
            ],
          },
          select: { id: true },
        });

        if (!dryRun) {
          await prisma.savedDesign.updateMany({
            where: {
              id: { in: designsToClean.map((d) => d.id) },
            },
            data: {
              designImageUrl: null,
              mockupImageUrl: null,
              uploadedLogoUrl: null,
              uploadedPatternUrl: null,
            },
          });
        }

        cleanedDesigns = designsToClean.length;
      } catch (error: any) {
        errors.push(`Failed to cleanup designs: ${error.message}`);
      }

      // Cleanup mockup jobs
      try {
        const jobsToClean = await prisma.mockupJob.findMany({
          where: {
            userId,
            migrationStatus: "completed",
            migratedAt: {
              lt: new Date(Date.now() - keepBackupDays * 24 * 60 * 60 * 1000),
            },
            OR: [
              { imageUrl: { not: null } },
              { uploadedLogoUrl: { not: null } },
              { uploadedPatternUrl: { not: null } },
            ],
          },
          select: { id: true },
        });

        if (!dryRun) {
          await prisma.mockupJob.updateMany({
            where: {
              id: { in: jobsToClean.map((j) => j.id) },
            },
            data: {
              imageUrl: null,
              uploadedLogoUrl: null,
              uploadedPatternUrl: null,
            },
          });
        }

        cleanedMockupJobs = jobsToClean.length;
      } catch (error: any) {
        errors.push(`Failed to cleanup mockup jobs: ${error.message}`);
      }

      // Cleanup user profile picture
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            image: true,
            profilePicturePath: true,
            profilePictureKey: true,
            updatedAt: true,
          },
        });

        if (
          user &&
          user.profilePictureKey &&
          user.updatedAt <
            new Date(Date.now() - keepBackupDays * 24 * 60 * 60 * 1000)
        ) {
          if (!dryRun) {
            await prisma.user.update({
              where: { id: userId },
              data: {
                image: null,
                profilePicturePath: null,
              },
            });
          }
          cleanedProfilePictures = 1;
        }
      } catch (error: any) {
        errors.push(`Failed to cleanup profile picture: ${error.message}`);
      }

      console.log(
        `[R2_QUERIES] Cleanup completed for user ${userId}: ${cleanedDesigns} designs, ${cleanedMockupJobs} jobs, ${cleanedProfilePictures} profile pictures`
      );

      return {
        cleanedDesigns,
        cleanedMockupJobs,
        cleanedProfilePictures,
        errors,
      };
    } catch (error: any) {
      console.error(`[R2_QUERIES] Error cleaning up legacy references:`, error);
      throw new Error(`Failed to cleanup legacy references: ${error.message}`);
    }
  }
}
