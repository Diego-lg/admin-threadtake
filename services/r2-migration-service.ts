import { PrismaClient } from "@prisma/client";
import { R2FileHelpers } from "../lib/r2-file-helpers";
import { UserFolderService } from "./user-folder-service";
import { R2UserStorage, UserFolderPaths } from "../lib/r2-user-storage";
import { v4 as uuidv4 } from "uuid";

/**
 * Migration status types
 */
export type MigrationStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "rolled_back";

/**
 * Migration types
 */
export type MigrationType =
  | "user_paths"
  | "file_metadata"
  | "profile_pictures"
  | "saved_designs"
  | "mockup_jobs";

/**
 * Migration progress interface
 */
export interface MigrationProgress {
  migrationId: string;
  migrationType: MigrationType;
  status: MigrationStatus;
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  progressPercentage: number;
  startTime: Date;
  endTime?: Date;
  errorMessage?: string;
  currentStep?: string;
}

/**
 * Migration result interface
 */
export interface MigrationResult {
  success: boolean;
  migrationId: string;
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  errors: string[];
  duration: number; // in milliseconds
}

/**
 * Migration configuration interface
 */
export interface MigrationConfig {
  batchSize: number;
  enableRollback: boolean;
  validateAfterMigration: boolean;
  continueOnError: boolean;
  dryRun: boolean;
}

/**
 * Service for handling R2 storage migrations
 */
export class R2MigrationService {
  private prisma: PrismaClient;
  private defaultConfig: MigrationConfig = {
    batchSize: 100,
    enableRollback: true,
    validateAfterMigration: true,
    continueOnError: false,
    dryRun: false,
  };

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
  }

  /**
   * Create a new migration log entry
   * @param migrationType - Type of migration
   * @param totalRecords - Total number of records to migrate
   * @param userId - User ID who initiated the migration
   * @param config - Migration configuration
   * @returns Migration ID
   */
  async createMigrationLog(
    migrationType: MigrationType,
    totalRecords: number,
    userId?: string,
    config: Partial<MigrationConfig> = {}
  ): Promise<string> {
    const migrationId = uuidv4();
    const finalConfig = { ...this.defaultConfig, ...config };

    try {
      await this.prisma.r2MigrationLog.create({
        data: {
          id: migrationId,
          migrationType,
          status: "pending",
          totalRecords,
          processedRecords: 0,
          failedRecords: 0,
          userId,
          metadata: {
            config: finalConfig,
            startedAt: new Date().toISOString(),
          },
        },
      });

      console.log(
        `[R2_MIGRATION] Created migration log: ${migrationId} for type: ${migrationType}`
      );
      return migrationId;
    } catch (error: any) {
      console.error(`[R2_MIGRATION] Error creating migration log:`, error);
      throw new Error(`Failed to create migration log: ${error.message}`);
    }
  }

  /**
   * Update migration progress
   * @param migrationId - Migration ID
   * @param processedRecords - Number of processed records
   * @param failedRecords - Number of failed records
   * @param status - Migration status
   * @param errorMessage - Optional error message
   * @param currentStep - Current migration step
   */
  async updateMigrationProgress(
    migrationId: string,
    processedRecords: number,
    failedRecords: number,
    status: MigrationStatus,
    errorMessage?: string,
    currentStep?: string
  ): Promise<void> {
    try {
      const updateData: any = {
        processedRecords,
        failedRecords,
        status,
      };

      if (errorMessage) {
        updateData.errorMessage = errorMessage;
      }

      if (status === "completed" || status === "failed") {
        updateData.endTime = new Date();
      }

      if (currentStep) {
        updateData.metadata = {
          currentStep,
          updatedAt: new Date().toISOString(),
        };
      }

      await this.prisma.r2MigrationLog.update({
        where: { id: migrationId },
        data: updateData,
      });

      console.log(
        `[R2_MIGRATION] Updated migration ${migrationId}: ${processedRecords}/${failedRecords} processed/failed, status: ${status}`
      );
    } catch (error: any) {
      console.error(`[R2_MIGRATION] Error updating migration progress:`, error);
      throw new Error(`Failed to update migration progress: ${error.message}`);
    }
  }

  /**
   * Get migration progress
   * @param migrationId - Migration ID
   * @returns Migration progress
   */
  async getMigrationProgress(
    migrationId: string
  ): Promise<MigrationProgress | null> {
    try {
      const migration = await this.prisma.r2MigrationLog.findUnique({
        where: { id: migrationId },
      });

      if (!migration) {
        return null;
      }

      const progressPercentage =
        migration.totalRecords > 0
          ? Math.round(
              (migration.processedRecords / migration.totalRecords) * 100
            )
          : 0;

      return {
        migrationId: migration.id,
        migrationType: migration.migrationType as MigrationType,
        status: migration.status as MigrationStatus,
        totalRecords: migration.totalRecords,
        processedRecords: migration.processedRecords,
        failedRecords: migration.failedRecords,
        progressPercentage,
        startTime: migration.startTime,
        endTime: migration.endTime || undefined,
        errorMessage: migration.errorMessage || undefined,
      };
    } catch (error: any) {
      console.error(`[R2_MIGRATION] Error getting migration progress:`, error);
      throw new Error(`Failed to get migration progress: ${error.message}`);
    }
  }

  /**
   * Get all migrations for a specific type
   * @param migrationType - Migration type
   * @returns Array of migration progress
   */
  async getMigrationsByType(
    migrationType: MigrationType
  ): Promise<MigrationProgress[]> {
    try {
      const migrations = await this.prisma.r2MigrationLog.findMany({
        where: { migrationType },
        orderBy: { startTime: "desc" },
      });

      return migrations.map((migration) => ({
        migrationId: migration.id,
        migrationType: migration.migrationType as MigrationType,
        status: migration.status as MigrationStatus,
        totalRecords: migration.totalRecords,
        processedRecords: migration.processedRecords,
        failedRecords: migration.failedRecords,
        progressPercentage:
          migration.totalRecords > 0
            ? Math.round(
                (migration.processedRecords / migration.totalRecords) * 100
              )
            : 0,
        startTime: migration.startTime,
        endTime: migration.endTime || undefined,
        errorMessage: migration.errorMessage || undefined,
      }));
    } catch (error: any) {
      console.error(`[R2_MIGRATION] Error getting migrations by type:`, error);
      throw new Error(`Failed to get migrations by type: ${error.message}`);
    }
  }

  /**
   * Migrate user profile pictures to new R2 structure
   * @param config - Migration configuration
   * @returns Migration result
   */
  async migrateProfilePictures(
    config: Partial<MigrationConfig> = {}
  ): Promise<MigrationResult> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      console.log(`[R2_MIGRATION] Starting profile picture migration`);

      // Get users with profile pictures that need migration
      const users = await this.prisma.user.findMany({
        where: {
          OR: [{ image: { not: null } }, { profilePicturePath: { not: null } }],
        },
        select: {
          id: true,
          email: true,
          image: true,
          profilePicturePath: true,
        },
      });

      const totalRecords = users.length;
      const migrationId = await this.createMigrationLog(
        "profile_pictures",
        totalRecords,
        undefined,
        finalConfig
      );

      await this.updateMigrationProgress(
        migrationId,
        0,
        0,
        "in_progress",
        undefined,
        "Starting profile picture migration"
      );

      let processedRecords = 0;
      let failedRecords = 0;

      // Process users in batches
      for (let i = 0; i < users.length; i += finalConfig.batchSize) {
        const batch = users.slice(i, i + finalConfig.batchSize);

        for (const user of batch) {
          try {
            // Ensure user folder exists
            await UserFolderService.ensureUserFolderExists(user.id);

            // Convert old path to new format if needed
            let newProfilePictureKey: string | null = null;

            if (user.profilePicturePath) {
              newProfilePictureKey = R2FileHelpers.convertOldPathToNewFormat(
                user.profilePicturePath,
                user.id
              );
            } else if (user.image && !user.image.startsWith("http")) {
              // Handle legacy image field
              newProfilePictureKey = R2FileHelpers.convertOldPathToNewFormat(
                user.image,
                user.id
              );
            }

            if (newProfilePictureKey) {
              // Update user with new profile picture key
              await this.prisma.user.update({
                where: { id: user.id },
                data: {
                  profilePictureKey: newProfilePictureKey,
                  r2FolderCreated: true,
                },
              });

              // Create file metadata record
              await this.prisma.r2FileMetadata.create({
                data: {
                  userId: user.id,
                  fileKey: newProfilePictureKey,
                  fileName: `profile-picture-${user.id}`,
                  fileType: "profile-pictures",
                  folderPath: UserFolderPaths.getProfilePicturesPath(user.id),
                  isPublic: true,
                  oldPath: user.profilePicturePath || user.image || undefined,
                  migrationStatus: "completed",
                  migratedAt: new Date(),
                },
              });
            }

            processedRecords++;
          } catch (error: any) {
            failedRecords++;
            const errorMsg = `Failed to migrate profile picture for user ${user.id}: ${error.message}`;
            console.error(`[R2_MIGRATION] ${errorMsg}`);
            errors.push(errorMsg);

            if (!finalConfig.continueOnError) {
              throw error;
            }
          }
        }

        // Update progress
        await this.updateMigrationProgress(
          migrationId,
          processedRecords,
          failedRecords,
          "in_progress",
          undefined,
          `Processed ${Math.min(
            i + finalConfig.batchSize,
            totalRecords
          )} of ${totalRecords} users`
        );
      }

      // Final update
      await this.updateMigrationProgress(
        migrationId,
        processedRecords,
        failedRecords,
        failedRecords > 0 ? "completed_with_errors" : "completed"
      );

      const duration = Date.now() - startTime;
      console.log(
        `[R2_MIGRATION] Profile picture migration completed: ${processedRecords} processed, ${failedRecords} failed, ${duration}ms`
      );

      return {
        success: failedRecords === 0,
        migrationId,
        totalRecords,
        processedRecords,
        failedRecords,
        errors,
        duration,
      };
    } catch (error: any) {
      console.error(`[R2_MIGRATION] Profile picture migration failed:`, error);
      throw new Error(`Profile picture migration failed: ${error.message}`);
    }
  }

  /**
   * Migrate saved designs to new R2 structure
   * @param config - Migration configuration
   * @returns Migration result
   */
  async migrateSavedDesigns(
    config: Partial<MigrationConfig> = {}
  ): Promise<MigrationResult> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      console.log(`[R2_MIGRATION] Starting saved designs migration`);

      // Get saved designs that need migration
      const savedDesigns = await this.prisma.savedDesign.findMany({
        where: {
          migrationStatus: "pending",
          OR: [
            { designImageUrl: { not: null } },
            { mockupImageUrl: { not: null } },
            { uploadedLogoUrl: { not: null } },
            { uploadedPatternUrl: { not: null } },
          ],
        },
        select: {
          id: true,
          userId: true,
          designId: true,
          designImageUrl: true,
          mockupImageUrl: true,
          uploadedLogoUrl: true,
          uploadedPatternUrl: true,
        },
      });

      const totalRecords = savedDesigns.length;
      const migrationId = await this.createMigrationLog(
        "saved_designs",
        totalRecords,
        undefined,
        finalConfig
      );

      await this.updateMigrationProgress(
        migrationId,
        0,
        0,
        "in_progress",
        undefined,
        "Starting saved designs migration"
      );

      let processedRecords = 0;
      let failedRecords = 0;

      // Process designs in batches
      for (let i = 0; i < savedDesigns.length; i += finalConfig.batchSize) {
        const batch = savedDesigns.slice(i, i + finalConfig.batchSize);

        for (const design of batch) {
          try {
            // Ensure user folder exists
            await UserFolderService.ensureUserFolderExists(design.userId);

            const assetKeys: any = {};
            const mockupKeys: any = {};
            const fileMetadataRecords: any[] = [];

            // Convert design image URL
            if (design.designImageUrl) {
              const newKey = R2FileHelpers.convertOldPathToNewFormat(
                design.designImageUrl,
                design.userId
              );
              if (newKey) {
                assetKeys.designImage = newKey;
                fileMetadataRecords.push({
                  userId: design.userId,
                  fileKey: newKey,
                  fileName: `design-${design.id}`,
                  fileType: "designs",
                  folderPath: UserFolderPaths.getAssetTypePath(
                    design.userId,
                    "designs"
                  ),
                  isPublic: false,
                  oldPath: design.designImageUrl,
                  migrationStatus: "completed",
                });
              }
            }

            // Convert mockup image URL
            if (design.mockupImageUrl) {
              const newKey = R2FileHelpers.convertOldPathToNewFormat(
                design.mockupImageUrl,
                design.userId
              );
              if (newKey) {
                mockupKeys.primary = newKey;
                fileMetadataRecords.push({
                  userId: design.userId,
                  fileKey: newKey,
                  fileName: `mockup-${design.id}`,
                  fileType: "mockups",
                  folderPath: UserFolderPaths.getDesignMockupPath(
                    design.userId,
                    design.designId || design.id
                  ),
                  isPublic: false,
                  oldPath: design.mockupImageUrl,
                  migrationStatus: "completed",
                });
              }
            }

            // Convert uploaded logo URL
            if (design.uploadedLogoUrl) {
              const newKey = R2FileHelpers.convertOldPathToNewFormat(
                design.uploadedLogoUrl,
                design.userId
              );
              if (newKey) {
                assetKeys.logo = newKey;
                fileMetadataRecords.push({
                  userId: design.userId,
                  fileKey: newKey,
                  fileName: `logo-${design.id}`,
                  fileType: "assets",
                  folderPath: UserFolderPaths.getAssetTypePath(
                    design.userId,
                    "logos"
                  ),
                  isPublic: false,
                  oldPath: design.uploadedLogoUrl,
                  migrationStatus: "completed",
                });
              }
            }

            // Convert uploaded pattern URL
            if (design.uploadedPatternUrl) {
              const newKey = R2FileHelpers.convertOldPathToNewFormat(
                design.uploadedPatternUrl,
                design.userId
              );
              if (newKey) {
                assetKeys.pattern = newKey;
                fileMetadataRecords.push({
                  userId: design.userId,
                  fileKey: newKey,
                  fileName: `pattern-${design.id}`,
                  fileType: "assets",
                  folderPath: UserFolderPaths.getAssetTypePath(
                    design.userId,
                    "patterns"
                  ),
                  isPublic: false,
                  oldPath: design.uploadedPatternUrl,
                  migrationStatus: "completed",
                });
              }
            }

            // Update saved design with new keys
            await this.prisma.savedDesign.update({
              where: { id: design.id },
              data: {
                designImageKey: assetKeys.designImage || null,
                mockupImageKey: mockupKeys.primary || null,
                uploadedLogoKey: assetKeys.logo || null,
                uploadedPatternKey: assetKeys.pattern || null,
                assetKeys: Object.keys(assetKeys).length > 0 ? assetKeys : null,
                mockupKeys:
                  Object.keys(mockupKeys).length > 0 ? mockupKeys : null,
                migrationStatus: "completed",
                migratedAt: new Date(),
              },
            });

            // Create file metadata records
            if (fileMetadataRecords.length > 0) {
              await this.prisma.r2FileMetadata.createMany({
                data: fileMetadataRecords,
              });
            }

            processedRecords++;
          } catch (error: any) {
            failedRecords++;
            const errorMsg = `Failed to migrate saved design ${design.id}: ${error.message}`;
            console.error(`[R2_MIGRATION] ${errorMsg}`);
            errors.push(errorMsg);

            if (!finalConfig.continueOnError) {
              throw error;
            }
          }
        }

        // Update progress
        await this.updateMigrationProgress(
          migrationId,
          processedRecords,
          failedRecords,
          "in_progress",
          undefined,
          `Processed ${Math.min(
            i + finalConfig.batchSize,
            totalRecords
          )} of ${totalRecords} designs`
        );
      }

      // Final update
      await this.updateMigrationProgress(
        migrationId,
        processedRecords,
        failedRecords,
        failedRecords > 0 ? "completed_with_errors" : "completed"
      );

      const duration = Date.now() - startTime;
      console.log(
        `[R2_MIGRATION] Saved designs migration completed: ${processedRecords} processed, ${failedRecords} failed, ${duration}ms`
      );

      return {
        success: failedRecords === 0,
        migrationId,
        totalRecords,
        processedRecords,
        failedRecords,
        errors,
        duration,
      };
    } catch (error: any) {
      console.error(`[R2_MIGRATION] Saved designs migration failed:`, error);
      throw new Error(`Saved designs migration failed: ${error.message}`);
    }
  }

  /**
   * Migrate mockup jobs to new R2 structure
   * @param config - Migration configuration
   * @returns Migration result
   */
  async migrateMockupJobs(
    config: Partial<MigrationConfig> = {}
  ): Promise<MigrationResult> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      console.log(`[R2_MIGRATION] Starting mockup jobs migration`);

      // Get mockup jobs that need migration
      const mockupJobs = await this.prisma.mockupJob.findMany({
        where: {
          migrationStatus: "pending",
          OR: [
            { imageUrl: { not: null } },
            { uploadedLogoUrl: { not: null } },
            { uploadedPatternUrl: { not: null } },
          ],
        },
        select: {
          id: true,
          userId: true,
          designId: true,
          imageUrl: true,
          uploadedLogoUrl: true,
          uploadedPatternUrl: true,
          mockupResults: true,
        },
      });

      const totalRecords = mockupJobs.length;
      const migrationId = await this.createMigrationLog(
        "mockup_jobs",
        totalRecords,
        undefined,
        finalConfig
      );

      await this.updateMigrationProgress(
        migrationId,
        0,
        0,
        "in_progress",
        undefined,
        "Starting mockup jobs migration"
      );

      let processedRecords = 0;
      let failedRecords = 0;

      // Process jobs in batches
      for (let i = 0; i < mockupJobs.length; i += finalConfig.batchSize) {
        const batch = mockupJobs.slice(i, i + finalConfig.batchSize);

        for (const job of batch) {
          try {
            // Ensure user folder exists
            await UserFolderService.ensureUserFolderExists(job.userId);

            const mockupKeys: any = {};
            const fileMetadataRecords: any[] = [];

            // Convert primary image URL
            if (job.imageUrl) {
              const newKey = R2FileHelpers.convertOldPathToNewFormat(
                job.imageUrl,
                job.userId
              );
              if (newKey) {
                mockupKeys.primary = newKey;
                fileMetadataRecords.push({
                  userId: job.userId,
                  fileKey: newKey,
                  fileName: `mockup-${job.id}`,
                  fileType: "mockups",
                  folderPath: UserFolderPaths.getDesignMockupPath(
                    job.userId,
                    job.designId || job.id
                  ),
                  isPublic: false,
                  oldPath: job.imageUrl,
                  migrationStatus: "completed",
                });
              }
            }

            // Process mockup results if they contain URLs
            if (job.mockupResults && typeof job.mockupResults === "object") {
              const results = job.mockupResults as any;
              if (results.urls && Array.isArray(results.urls)) {
                results.urls.forEach((url: string, index: number) => {
                  const newKey = R2FileHelpers.convertOldPathToNewFormat(
                    url,
                    job.userId
                  );
                  if (newKey) {
                    mockupKeys[`result_${index}`] = newKey;
                    fileMetadataRecords.push({
                      userId: job.userId,
                      fileKey: newKey,
                      fileName: `mockup-${job.id}-${index}`,
                      fileType: "mockups",
                      folderPath: UserFolderPaths.getDesignMockupPath(
                        job.userId,
                        job.designId || job.id
                      ),
                      isPublic: false,
                      oldPath: url,
                      migrationStatus: "completed",
                    });
                  }
                });
              }
            }

            // Update mockup job with new keys
            await this.prisma.mockupJob.update({
              where: { id: job.id },
              data: {
                mockupKeys:
                  Object.keys(mockupKeys).length > 0 ? mockupKeys : null,
                migrationStatus: "completed",
                migratedAt: new Date(),
              },
            });

            // Create file metadata records
            if (fileMetadataRecords.length > 0) {
              await this.prisma.r2FileMetadata.createMany({
                data: fileMetadataRecords,
              });
            }

            processedRecords++;
          } catch (error: any) {
            failedRecords++;
            const errorMsg = `Failed to migrate mockup job ${job.id}: ${error.message}`;
            console.error(`[R2_MIGRATION] ${errorMsg}`);
            errors.push(errorMsg);

            if (!finalConfig.continueOnError) {
              throw error;
            }
          }
        }

        // Update progress
        await this.updateMigrationProgress(
          migrationId,
          processedRecords,
          failedRecords,
          "in_progress",
          undefined,
          `Processed ${Math.min(
            i + finalConfig.batchSize,
            totalRecords
          )} of ${totalRecords} jobs`
        );
      }

      // Final update
      await this.updateMigrationProgress(
        migrationId,
        processedRecords,
        failedRecords,
        failedRecords > 0 ? "completed_with_errors" : "completed"
      );

      const duration = Date.now() - startTime;
      console.log(
        `[R2_MIGRATION] Mockup jobs migration completed: ${processedRecords} processed, ${failedRecords} failed, ${duration}ms`
      );

      return {
        success: failedRecords === 0,
        migrationId,
        totalRecords,
        processedRecords,
        failedRecords,
        errors,
        duration,
      };
    } catch (error: any) {
      console.error(`[R2_MIGRATION] Mockup jobs migration failed:`, error);
      throw new Error(`Mockup jobs migration failed: ${error.message}`);
    }
  }

  /**
   * Run all migrations in sequence
   * @param config - Migration configuration
   * @returns Array of migration results
   */
  async runAllMigrations(
    config: Partial<MigrationConfig> = {}
  ): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];

    try {
      console.log(`[R2_MIGRATION] Starting all migrations`);

      // Run migrations in order
      const migrations = [
        () => this.migrateProfilePictures(config),
        () => this.migrateSavedDesigns(config),
        () => this.migrateMockupJobs(config),
      ];

      for (const migration of migrations) {
        try {
          const result = await migration();
          results.push(result);
        } catch (error: any) {
          console.error(`[R2_MIGRATION] Migration failed:`, error);
          if (!config.continueOnError) {
            throw error;
          }
          // Add failed result
          results.push({
            success: false,
            migrationId: uuidv4(),
            totalRecords: 0,
            processedRecords: 0,
            failedRecords: 1,
            errors: [error.message],
            duration: 0,
          });
        }
      }

      console.log(`[R2_MIGRATION] All migrations completed`);
      return results;
    } catch (error: any) {
      console.error(`[R2_MIGRATION] All migrations failed:`, error);
      throw new Error(`All migrations failed: ${error.message}`);
    }
  }

  /**
   * Validate migration results
   * @param migrationId - Migration ID to validate
   * @returns Validation result
   */
  async validateMigration(migrationId: string): Promise<{
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    try {
      const migration = await this.prisma.r2MigrationLog.findUnique({
        where: { id: migrationId },
      });

      if (!migration) {
        throw new Error(`Migration ${migrationId} not found`);
      }

      const issues: string[] = [];
      const recommendations: string[] = [];

      // Check for failed records
      if (migration.failedRecords > 0) {
        issues.push(`${migration.failedRecords} records failed to migrate`);
        recommendations.push("Review error logs and retry failed records");
      }

      // Check for incomplete migration
      if (migration.status !== "completed") {
        issues.push(`Migration status is ${migration.status}`);
        recommendations.push("Complete the migration before validation");
      }

      // Validate file metadata if it's a file migration
      if (
        migration.migrationType.includes("file") ||
        migration.migrationType.includes("picture")
      ) {
        const orphanedFiles = await this.prisma.r2FileMetadata.findMany({
          where: {
            migrationStatus: "completed",
            OR: [{ userId: null }, { fileKey: null }, { folderPath: null }],
          },
        });

        if (orphanedFiles.length > 0) {
          issues.push(`${orphanedFiles.length} files have incomplete metadata`);
          recommendations.push("Clean up orphaned file metadata records");
        }
      }

      return {
        isValid: issues.length === 0,
        issues,
        recommendations,
      };
    } catch (error: any) {
      console.error(`[R2_MIGRATION] Error validating migration:`, error);
      throw new Error(`Failed to validate migration: ${error.message}`);
    }
  }

  /**
   * Cleanup old migration logs
   * @param keepCount - Number of recent migrations to keep per type
   * @returns Number of deleted logs
   */
  async cleanupMigrationLogs(keepCount: number = 10): Promise<number> {
    try {
      // Get migration types
      const migrationTypes = await this.prisma.r2MigrationLog.findMany({
        select: { migrationType: true },
        distinct: ["migrationType"],
      });

      let totalDeleted = 0;

      for (const { migrationType } of migrationTypes) {
        // Get all migrations for this type, ordered by date
        const migrations = await this.prisma.r2MigrationLog.findMany({
          where: { migrationType },
          orderBy: { startTime: "desc" },
        });

        // Delete older migrations beyond the keep count
        if (migrations.length > keepCount) {
          const toDelete = migrations.slice(keepCount);
          const idsToDelete = toDelete.map((m) => m.id);

          await this.prisma.r2MigrationLog.deleteMany({
            where: {
              id: { in: idsToDelete },
            },
          });

          totalDeleted += toDelete.length;
        }
      }

      console.log(
        `[R2_MIGRATION] Cleaned up ${totalDeleted} old migration logs`
      );
      return totalDeleted;
    } catch (error: any) {
      console.error(`[R2_MIGRATION] Error cleaning up migration logs:`, error);
      throw new Error(`Failed to cleanup migration logs: ${error.message}`);
    }
  }

  /**
   * Get migration statistics
   * @returns Migration statistics
   */
  async getMigrationStatistics(): Promise<{
    totalMigrations: number;
    completedMigrations: number;
    failedMigrations: number;
    pendingMigrations: number;
    averageDuration: number;
    lastMigrationDate?: Date;
  }> {
    try {
      const migrations = await this.prisma.r2MigrationLog.findMany({
        select: {
          status: true,
          startTime: true,
          endTime: true,
        },
      });

      const totalMigrations = migrations.length;
      const completedMigrations = migrations.filter(
        (m) => m.status === "completed"
      ).length;
      const failedMigrations = migrations.filter(
        (m) => m.status === "failed"
      ).length;
      const pendingMigrations = migrations.filter(
        (m) => m.status === "pending"
      ).length;

      // Calculate average duration for completed migrations
      const completedWithTimes = migrations.filter(
        (m) => m.status === "completed" && m.endTime
      );
      const averageDuration =
        completedWithTimes.length > 0
          ? completedWithTimes.reduce(
              (sum, m) => sum + (m.endTime!.getTime() - m.startTime.getTime()),
              0
            ) / completedWithTimes.length
          : 0;

      // Get last migration date
      const lastMigration = migrations.sort(
        (a, b) => b.startTime.getTime() - a.startTime.getTime()
      )[0];

      return {
        totalMigrations,
        completedMigrations,
        failedMigrations,
        pendingMigrations,
        averageDuration,
        lastMigrationDate: lastMigration?.startTime,
      };
    } catch (error: any) {
      console.error(
        `[R2_MIGRATION] Error getting migration statistics:`,
        error
      );
      throw new Error(`Failed to get migration statistics: ${error.message}`);
    }
  }
}
