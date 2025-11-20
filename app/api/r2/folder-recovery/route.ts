import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { UserFolderService } from "@/services/user-folder-service";
import { folderErrorHandler } from "@/lib/r2-folder-error-handler";
import { errorRecoveryUtilities } from "@/lib/r2-error-recovery-utilities";
import { folderHealthMonitor } from "@/services/r2-folder-health-monitor";
import { FolderErrorType, RecoveryStrategy } from "@/lib/r2-folder-error-types";

/**
 * API endpoint for folder recovery operations
 * POST /api/r2/folder-recovery - Attempt to recover user folders
 * GET /api/r2/folder-recovery - Get folder status and recovery options
 */

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { operation, force = false } = body;

    console.log(
      `[FOLDER_RECOVERY_API] ${operation} requested for user ${userId}`
    );

    switch (operation) {
      case "check_and_create":
        return await handleCheckAndCreate(userId, force);

      case "health_check":
        return await handleHealthCheck(userId);

      case "recover_missing":
        return await handleRecoverMissing(userId);

      case "process_queue":
        return await handleProcessQueue(userId);

      default:
        return NextResponse.json(
          { error: "Invalid operation" },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("[FOLDER_RECOVERY_API] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error.message,
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const operation = searchParams.get("operation") || "status";

    console.log(
      `[FOLDER_RECOVERY_API] ${operation} status requested for user ${userId}`
    );

    switch (operation) {
      case "status":
        return await handleGetStatus(userId);

      case "health":
        return await handleGetHealth(userId);

      case "queue":
        return await handleGetQueue(userId);

      case "metrics":
        return await handleGetMetrics(userId);

      default:
        return NextResponse.json(
          { error: "Invalid operation" },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("[FOLDER_RECOVERY_API] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error.message,
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * Handle check and create folder operation
 */
async function handleCheckAndCreate(userId: string, force: boolean = false) {
  try {
    const startTime = Date.now();

    // Get current folder status
    const healthStatus = await folderHealthMonitor.checkUserFolderHealth(
      userId
    );

    if (healthStatus.isHealthy && !force) {
      return NextResponse.json({
        success: true,
        message: "User folders are already healthy",
        alreadyHealthy: true,
        healthStatus,
        duration: Date.now() - startTime,
      });
    }

    // Attempt to initialize/recover folders
    const initialized = await UserFolderService.initializeUserFolder(userId);

    if (initialized) {
      // Re-check health after initialization
      const newHealthStatus = await folderHealthMonitor.checkUserFolderHealth(
        userId
      );

      return NextResponse.json({
        success: true,
        message: "User folders successfully created/recovered",
        previouslyHealthy: healthStatus.isHealthy,
        healthStatus: newHealthStatus,
        duration: Date.now() - startTime,
        recoveryDetails: {
          missingFolders: healthStatus.missingFolders,
          corruptedFolders: healthStatus.corruptedFolders,
          issuesResolved: healthStatus.issues.length,
        },
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to create/recover user folders",
          healthStatus,
          duration: Date.now() - startTime,
          suggestions: [
            "Try again in a few minutes",
            "Check your storage quota",
            "Contact support if the issue persists",
          ],
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("[FOLDER_RECOVERY_API] Check and create error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error during folder recovery",
        error: error.message,
        suggestions: [
          "Check your internet connection",
          "Try refreshing the page",
          "Contact support if the issue persists",
        ],
      },
      { status: 500 }
    );
  }
}

/**
 * Handle health check operation
 */
async function handleHealthCheck(userId: string) {
  try {
    const startTime = Date.now();
    const healthStatus = await folderHealthMonitor.checkUserFolderHealth(
      userId
    );

    return NextResponse.json({
      success: true,
      healthStatus,
      duration: Date.now() - startTime,
      recommendations: generateRecommendations(healthStatus),
    });
  } catch (error: any) {
    console.error("[FOLDER_RECOVERY_API] Health check error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Health check failed",
        error: error.message,
        healthStatus: {
          userId,
          isHealthy: false,
          lastChecked: new Date(),
          issues: [
            {
              type: FolderErrorType.UNKNOWN_ERROR,
              severity: "high" as any,
              message: `Health check failed: ${error.message}`,
              userId,
              timestamp: new Date(),
              recoverable: false,
              suggestedRecovery: RecoveryStrategy.MANUAL,
            },
          ],
          missingFolders: [],
          corruptedFolders: [],
          permissionsOk: false,
          totalSize: 0,
          fileCount: 0,
        },
      },
      { status: 500 }
    );
  }
}

/**
 * Handle recover missing folders operation
 */
async function handleRecoverMissing(userId: string) {
  try {
    const startTime = Date.now();

    // Get current health status to identify missing folders
    const healthStatus = await folderHealthMonitor.checkUserFolderHealth(
      userId
    );

    if (healthStatus.missingFolders.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No missing folders to recover",
        healthStatus,
        duration: Date.now() - startTime,
      });
    }

    // Attempt recovery using error handler
    const recoveryResult = await folderErrorHandler.handleMissingUserFolder(
      userId,
      {
        userId,
        operation: "api_recovery",
        startTime: new Date(),
      }
    );

    if (recoveryResult.success) {
      // Re-check health after recovery
      const newHealthStatus = await folderHealthMonitor.checkUserFolderHealth(
        userId
      );

      return NextResponse.json({
        success: true,
        message: "Successfully recovered missing folders",
        recoveryResult,
        previousStatus: healthStatus,
        newHealthStatus,
        duration: Date.now() - startTime,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to recover missing folders",
          recoveryResult,
          healthStatus,
          duration: Date.now() - startTime,
          error: recoveryResult.error?.message,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("[FOLDER_RECOVERY_API] Recover missing error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error during folder recovery",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * Handle process queue operation
 */
async function handleProcessQueue(userId: string) {
  try {
    const startTime = Date.now();

    // Process any queued operations for this user
    await errorRecoveryUtilities.processQueuedOperations(userId);

    // Get updated queue status
    const queuedOperations = errorRecoveryUtilities.getQueuedOperations(userId);

    return NextResponse.json({
      success: true,
      message: "Processed queued operations",
      queuedOperationsCount: queuedOperations.length,
      queuedOperations,
      duration: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error("[FOLDER_RECOVERY_API] Process queue error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error processing queued operations",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * Handle get status operation
 */
async function handleGetStatus(userId: string) {
  try {
    const healthStatus = await folderHealthMonitor.checkUserFolderHealth(
      userId
    );
    const queuedOperations = errorRecoveryUtilities.getQueuedOperations(userId);
    const errorMetrics = folderErrorHandler.getErrorMetrics();

    return NextResponse.json({
      success: true,
      status: {
        health: healthStatus,
        queuedOperations: queuedOperations.length,
        errorMetrics: {
          totalErrors: errorMetrics.totalErrors,
          activeIssues: errorMetrics.activeIssues,
          lastUpdated: errorMetrics.lastUpdated,
        },
      },
      timestamp: new Date(),
    });
  } catch (error: any) {
    console.error("[FOLDER_RECOVERY_API] Get status error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error getting status",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * Handle get health operation
 */
async function handleGetHealth(userId: string) {
  try {
    const healthStatus = await folderHealthMonitor.checkUserFolderHealth(
      userId
    );

    return NextResponse.json({
      success: true,
      healthStatus,
      recommendations: generateRecommendations(healthStatus),
    });
  } catch (error: any) {
    console.error("[FOLDER_RECOVERY_API] Get health error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error getting health status",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * Handle get queue operation
 */
async function handleGetQueue(userId: string) {
  try {
    const queuedOperations = errorRecoveryUtilities.getQueuedOperations(userId);
    const recoveryStats = errorRecoveryUtilities.getRecoveryStats();

    return NextResponse.json({
      success: true,
      queue: {
        userOperations: queuedOperations,
        userCount: queuedOperations.length,
        globalStats: recoveryStats,
      },
    });
  } catch (error: any) {
    console.error("[FOLDER_RECOVERY_API] Get queue error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error getting queue status",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * Handle get metrics operation
 */
async function handleGetMetrics(userId: string) {
  try {
    const errorMetrics = folderErrorHandler.getErrorMetrics();
    const recoveryStats = errorRecoveryUtilities.getRecoveryStats();
    const monitoringStats = folderHealthMonitor.getMonitoringStats();

    return NextResponse.json({
      success: true,
      metrics: {
        errors: errorMetrics,
        recovery: recoveryStats,
        monitoring: monitoringStats,
      },
    });
  } catch (error: any) {
    console.error("[FOLDER_RECOVERY_API] Get metrics error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Error getting metrics",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * Generate user-friendly recommendations based on health status
 */
function generateRecommendations(healthStatus: any): string[] {
  const recommendations: string[] = [];

  if (!healthStatus.isHealthy) {
    if (healthStatus.missingFolders.length > 0) {
      recommendations.push(
        'Some folders are missing. Click "Recover Folders" to fix this automatically.'
      );
    }

    if (healthStatus.corruptedFolders.length > 0) {
      recommendations.push(
        "Some folders appear to be corrupted. Contact support for assistance."
      );
    }

    if (!healthStatus.permissionsOk) {
      recommendations.push(
        "Permission issues detected. Try logging out and back in."
      );
    }

    if (
      healthStatus.issues.some(
        (issue: any) => issue.type === FolderErrorType.QUOTA_EXCEEDED
      )
    ) {
      recommendations.push(
        "Storage quota exceeded. Consider upgrading your plan or deleting unused files."
      );
    }
  } else {
    recommendations.push("Your folders are healthy and working correctly.");
  }

  return recommendations;
}
