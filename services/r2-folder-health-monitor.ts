import {
  FolderErrorType,
  ErrorSeverity,
  FolderHealthStatus,
  ErrorMetrics,
  BackgroundTaskStatus,
} from "../lib/r2-folder-error-types";
import { R2UserStorage, UserFolderPaths } from "../lib/r2-user-storage";
import { UserFolderService } from "./user-folder-service";
import { folderErrorHandler } from "../lib/r2-folder-error-handler";
import prismadb from "../lib/prismadb";
import { v4 as uuidv4 } from "uuid";

/**
 * Folder health monitoring service for R2 storage
 */
export class R2FolderHealthMonitor {
  private static instance: R2FolderHealthMonitor;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private healthChecks: Map<string, FolderHealthStatus> = new Map();
  private monitoringTasks: Map<string, BackgroundTaskStatus> = new Map();
  private isMonitoring = false;
  private readonly MONITORING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): R2FolderHealthMonitor {
    if (!R2FolderHealthMonitor.instance) {
      R2FolderHealthMonitor.instance = new R2FolderHealthMonitor();
    }
    return R2FolderHealthMonitor.instance;
  }

  /**
   * Start health monitoring for all users
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log("[FOLDER_HEALTH_MONITOR] Monitoring already started");
      return;
    }

    console.log("[FOLDER_HEALTH_MONITOR] Starting folder health monitoring");
    this.isMonitoring = true;

    // Start periodic health checks
    this.monitoringInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.MONITORING_INTERVAL_MS);

    // Perform initial health check
    await this.performHealthCheck();
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    console.log("[FOLDER_HEALTH_MONITOR] Stopping folder health monitoring");
    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Perform comprehensive health check for all users
   */
  private async performHealthCheck(): Promise<void> {
    const taskId = uuidv4();
    const startTime = Date.now();

    try {
      const taskStatus: BackgroundTaskStatus = {
        taskId,
        userId: "system",
        taskType: "health_check",
        status: "running",
        progress: 0,
        startTime: new Date(),
      };

      this.monitoringTasks.set(taskId, taskStatus);

      // Get all active users
      const users = await this.getActiveUsers();
      const totalUsers = users.length;
      let processedUsers = 0;

      console.log(
        `[FOLDER_HEALTH_MONITOR] Checking health for ${totalUsers} users`
      );

      for (const user of users) {
        try {
          const healthStatus = await this.checkUserFolderHealth(user.id);
          this.healthChecks.set(user.id, healthStatus);

          // Log health issues
          if (!healthStatus.isHealthy) {
            console.warn(
              `[FOLDER_HEALTH_MONITOR] Health issues found for user ${user.id}:`,
              {
                missingFolders: healthStatus.missingFolders,
                corruptedFolders: healthStatus.corruptedFolders,
                issuesCount: healthStatus.issues.length,
              }
            );

            // Attempt automatic recovery for recoverable issues
            await this.attemptAutomaticRecovery(user.id, healthStatus);
          }

          processedUsers++;
          taskStatus.progress = Math.round((processedUsers / totalUsers) * 100);
        } catch (error) {
          console.error(
            `[FOLDER_HEALTH_MONITOR] Error checking health for user ${user.id}:`,
            error
          );
        }
      }

      taskStatus.status = "completed";
      taskStatus.endTime = new Date();
      taskStatus.progress = 100;

      const duration = Date.now() - startTime;
      console.log(
        `[FOLDER_HEALTH_MONITOR] Health check completed in ${duration}ms for ${totalUsers} users`
      );
    } catch (error) {
      console.error(
        "[FOLDER_HEALTH_MONITOR] Error during health check:",
        error
      );

      const taskStatus = this.monitoringTasks.get(taskId);
      if (taskStatus) {
        taskStatus.status = "failed";
        taskStatus.endTime = new Date();
      }
    } finally {
      this.monitoringTasks.delete(taskId);
    }
  }

  /**
   * Get active users from database
   */
  private async getActiveUsers(): Promise<{ id: string; email: string }[]> {
    try {
      const users = await prismadb.user.findMany({
        where: {
          // Get users who have been active in the last 30 days
          updatedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        select: {
          id: true,
          email: true,
        },
        take: 1000, // Limit to prevent overwhelming the system
      });

      return users;
    } catch (error) {
      console.error(
        "[FOLDER_HEALTH_MONITOR] Error getting active users:",
        error
      );
      return [];
    }
  }

  /**
   * Check health of a specific user's folder structure
   */
  async checkUserFolderHealth(userId: string): Promise<FolderHealthStatus> {
    const startTime = Date.now();
    const issues: any[] = [];
    const missingFolders: string[] = [];
    const corruptedFolders: string[] = [];

    try {
      // Check base user folder
      const baseFolderExists = await R2UserStorage.userFolderExists(userId);
      if (!baseFolderExists) {
        missingFolders.push("base");
        issues.push({
          type: FolderErrorType.MISSING_USER_FOLDER,
          severity: ErrorSeverity.HIGH,
          message: "Base user folder is missing",
          userId,
          timestamp: new Date(),
        });
      }

      // Check required subfolders
      const requiredFolders = [
        { name: "mockups", path: UserFolderPaths.getMockupsPath(userId) },
        { name: "temp", path: UserFolderPaths.getTempMockupsPath(userId) },
        {
          name: "profile-pictures",
          path: UserFolderPaths.getProfilePicturesPath(userId),
        },
        {
          name: "profile-history",
          path: UserFolderPaths.getProfilePictureHistoryPath(userId),
        },
        { name: "assets", path: UserFolderPaths.getAssetsPath(userId) },
        {
          name: "assets-logos",
          path: UserFolderPaths.getAssetTypePath(userId, "logos"),
        },
        {
          name: "assets-patterns",
          path: UserFolderPaths.getAssetTypePath(userId, "patterns"),
        },
        {
          name: "assets-uploads",
          path: UserFolderPaths.getAssetTypePath(userId, "uploads"),
        },
        { name: "exports", path: UserFolderPaths.getExportsPath(userId) },
        {
          name: "exports-designs",
          path: UserFolderPaths.getExportTypePath(userId, "designs"),
        },
        {
          name: "exports-collections",
          path: UserFolderPaths.getExportTypePath(userId, "collections"),
        },
      ];

      for (const folder of requiredFolders) {
        try {
          const folderMarker = `${folder.path}/.folder_marker`;
          const exists = await R2UserStorage.fileExists(folderMarker);

          if (!exists) {
            missingFolders.push(folder.name);
            issues.push({
              type: FolderErrorType.MISSING_SUBFOLDER,
              severity: ErrorSeverity.MEDIUM,
              message: `Subfolder ${folder.name} is missing`,
              userId,
              folderPath: folder.path,
              timestamp: new Date(),
            });
          }
        } catch (error) {
          corruptedFolders.push(folder.name);
          issues.push({
            type: FolderErrorType.CORRUPTED_STRUCTURE,
            severity: ErrorSeverity.HIGH,
            message: `Subfolder ${folder.name} appears corrupted`,
            userId,
            folderPath: folder.path,
            timestamp: new Date(),
          });
        }
      }

      // Get folder statistics
      let totalSize = 0;
      let fileCount = 0;
      let permissionsOk = true;

      try {
        const metadata = await UserFolderService.getUserFolderMetadata(userId);
        totalSize = metadata.totalSize;
        fileCount = metadata.totalFiles;
      } catch (error) {
        permissionsOk = false;
        issues.push({
          type: FolderErrorType.PERMISSION_DENIED,
          severity: ErrorSeverity.HIGH,
          message: "Permission denied when accessing folder metadata",
          userId,
          timestamp: new Date(),
        });
      }

      const isHealthy = issues.length === 0 && permissionsOk;

      const healthStatus: FolderHealthStatus = {
        userId,
        isHealthy,
        lastChecked: new Date(),
        issues,
        missingFolders,
        corruptedFolders,
        permissionsOk,
        totalSize,
        fileCount,
      };

      this.healthChecks.set(userId, healthStatus);
      return healthStatus;
    } catch (error: any) {
      const errorStatus: FolderHealthStatus = {
        userId,
        isHealthy: false,
        lastChecked: new Date(),
        issues: [
          {
            type: FolderErrorType.UNKNOWN_ERROR,
            severity: ErrorSeverity.HIGH,
            message: `Health check failed: ${error.message}`,
            userId,
            timestamp: new Date(),
            recoverable: false,
            suggestedRecovery: "manual" as any,
          },
        ],
        missingFolders,
        corruptedFolders,
        permissionsOk: false,
        totalSize: 0,
        fileCount: 0,
      };

      this.healthChecks.set(userId, errorStatus);
      return errorStatus;
    }
  }

  /**
   * Attempt automatic recovery for health issues
   */
  private async attemptAutomaticRecovery(
    userId: string,
    healthStatus: FolderHealthStatus
  ): Promise<void> {
    if (healthStatus.missingFolders.length > 0) {
      try {
        console.log(
          `[FOLDER_HEALTH_MONITOR] Attempting automatic recovery for user ${userId}`
        );

        // Try to create missing folders
        const recoveryResult = await folderErrorHandler.handleMissingUserFolder(
          userId,
          {
            userId,
            operation: "automatic_recovery",
            startTime: new Date(),
          }
        );

        if (recoveryResult.success) {
          console.log(
            `[FOLDER_HEALTH_MONITOR] Automatic recovery successful for user ${userId}`
          );

          // Re-check health after recovery
          setTimeout(async () => {
            await this.checkUserFolderHealth(userId);
          }, 5000);
        } else {
          console.error(
            `[FOLDER_HEALTH_MONITOR] Automatic recovery failed for user ${userId}:`,
            recoveryResult.error
          );
        }
      } catch (error) {
        console.error(
          `[FOLDER_HEALTH_MONITOR] Error during automatic recovery for user ${userId}:`,
          error
        );
      }
    }
  }

  /**
   * Get health status for a specific user
   */
  getUserHealthStatus(userId: string): FolderHealthStatus | null {
    return this.healthChecks.get(userId) || null;
  }

  /**
   * Get all health statuses
   */
  getAllHealthStatuses(): Map<string, FolderHealthStatus> {
    return new Map(this.healthChecks);
  }

  /**
   * Get users with health issues
   */
  getUsersWithHealthIssues(): { userId: string; issues: any[] }[] {
    const issues: { userId: string; issues: any[] }[] = [];

    for (const [userId, status] of this.healthChecks.entries()) {
      if (!status.isHealthy && status.issues.length > 0) {
        issues.push({
          userId,
          issues: status.issues,
        });
      }
    }

    return issues;
  }

  /**
   * Get monitoring statistics
   */
  getMonitoringStats(): {
    isMonitoring: boolean;
    totalUsers: number;
    healthyUsers: number;
    usersWithIssues: number;
    lastCheck: Date | null;
    activeTasks: number;
  } {
    const totalUsers = this.healthChecks.size;
    const healthyUsers = Array.from(this.healthChecks.values()).filter(
      (status) => status.isHealthy
    ).length;
    const usersWithIssues = totalUsers - healthyUsers;

    const lastCheck =
      this.healthChecks.size > 0
        ? Array.from(this.healthChecks.values()).reduce(
            (latest, status) =>
              status.lastChecked > latest ? status.lastChecked : latest,
            new Date(0)
          )
        : null;

    return {
      isMonitoring: this.isMonitoring,
      totalUsers,
      healthyUsers,
      usersWithIssues,
      lastCheck,
      activeTasks: this.monitoringTasks.size,
    };
  }

  /**
   * Force health check for specific user
   */
  async forceHealthCheck(userId: string): Promise<FolderHealthStatus> {
    console.log(
      `[FOLDER_HEALTH_MONITOR] Forcing health check for user ${userId}`
    );
    return await this.checkUserFolderHealth(userId);
  }

  /**
   * Clear health status for a user
   */
  clearUserHealthStatus(userId: string): void {
    this.healthChecks.delete(userId);
  }

  /**
   * Clear all health statuses
   */
  clearAllHealthStatuses(): void {
    this.healthChecks.clear();
  }

  /**
   * Generate health report for administrators
   */
  generateHealthReport(): {
    summary: any;
    issues: any[];
    recommendations: string[];
  } {
    const stats = this.getMonitoringStats();
    const usersWithIssues = this.getUsersWithHealthIssues();

    const summary = {
      ...stats,
      issueRate:
        stats.totalUsers > 0
          ? (stats.usersWithIssues / stats.totalUsers) * 100
          : 0,
      errorMetrics: folderErrorHandler.getErrorMetrics(),
    };

    const issues = usersWithIssues.flatMap((user) =>
      user.issues.map((issue) => ({
        userId: user.userId,
        ...issue,
      }))
    );

    const recommendations = this.generateRecommendations(issues);

    return {
      summary,
      issues,
      recommendations,
    };
  }

  /**
   * Generate recommendations based on health issues
   */
  private generateRecommendations(issues: any[]): string[] {
    const recommendations: string[] = [];

    const missingFolderCount = issues.filter(
      (i) => i.type === FolderErrorType.MISSING_USER_FOLDER
    ).length;
    const permissionCount = issues.filter(
      (i) => i.type === FolderErrorType.PERMISSION_DENIED
    ).length;
    const corruptedCount = issues.filter(
      (i) => i.type === FolderErrorType.CORRUPTED_STRUCTURE
    ).length;

    if (missingFolderCount > 0) {
      recommendations.push(
        `${missingFolderCount} users have missing folders - consider running bulk folder creation`
      );
    }

    if (permissionCount > 0) {
      recommendations.push(
        `${permissionCount} users have permission issues - review R2 access policies`
      );
    }

    if (corruptedCount > 0) {
      recommendations.push(
        `${corruptedCount} users have corrupted folder structures - manual intervention may be required`
      );
    }

    if (issues.length === 0) {
      recommendations.push("All user folders are healthy");
    }

    return recommendations;
  }
}

// Export singleton instance
export const folderHealthMonitor = R2FolderHealthMonitor.getInstance();
