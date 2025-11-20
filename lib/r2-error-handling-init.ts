import { folderHealthMonitor } from "../services/r2-folder-health-monitor";
import { errorReportingService } from "../services/r2-error-reporting-service";
import { folderErrorHandler } from "./r2-folder-error-handler";
import { errorRecoveryUtilities } from "./r2-error-recovery-utilities";
import { ErrorSeverity } from "./r2-folder-error-types";

/**
 * Initialize R2 error handling services
 */
export class R2ErrorHandlingInit {
  private static initialized = false;

  /**
   * Initialize all error handling services
   */
  static async initialize(): Promise<void> {
    if (R2ErrorHandlingInit.initialized) {
      console.log("[R2_ERROR_HANDLING_INIT] Already initialized");
      return;
    }

    try {
      console.log(
        "[R2_ERROR_HANDLING_INIT] Initializing R2 error handling services..."
      );

      // Configure error reporting
      errorReportingService.configureReporting({
        enableNotifications: process.env.NODE_ENV === "production",
        enableAutoReports: true,
        reportInterval: 60, // 1 hour
        retentionDays: 30,
        notifyOnSeverity: [ErrorSeverity.HIGH, ErrorSeverity.CRITICAL],
        recipients: process.env.ERROR_REPORT_RECIPIENTS?.split(",") || [],
      });

      // Start folder health monitoring
      await folderHealthMonitor.startMonitoring();

      // Process any queued recoveries
      await folderErrorHandler.processQueuedCreations();

      R2ErrorHandlingInit.initialized = true;
      console.log(
        "[R2_ERROR_HANDLING_INIT] Successfully initialized R2 error handling services"
      );
    } catch (error) {
      console.error(
        "[R2_ERROR_HANDLING_INIT] Failed to initialize R2 error handling services:",
        error
      );
      throw error;
    }
  }

  /**
   * Get initialization status
   */
  static isInitialized(): boolean {
    return R2ErrorHandlingInit.initialized;
  }

  /**
   * Get service status
   */
  static getServiceStatus(): {
    initialized: boolean;
    healthMonitoring: boolean;
    errorReporting: boolean;
    errorHandling: boolean;
    recoveryUtilities: boolean;
  } {
    return {
      initialized: R2ErrorHandlingInit.initialized,
      healthMonitoring: folderHealthMonitor.getMonitoringStats().isMonitoring,
      errorReporting: true, // Error reporting is always available once initialized
      errorHandling: true, // Error handler is always available
      recoveryUtilities: true, // Recovery utilities are always available
    };
  }

  /**
   * Shutdown all error handling services
   */
  static async shutdown(): Promise<void> {
    if (!R2ErrorHandlingInit.initialized) {
      return;
    }

    try {
      console.log(
        "[R2_ERROR_HANDLING_INIT] Shutting down R2 error handling services..."
      );

      // Stop folder health monitoring
      folderHealthMonitor.stopMonitoring();

      // Clear error metrics
      folderErrorHandler.clearErrorMetrics();

      // Clear recovery queues
      errorRecoveryUtilities.clearAllQueues();

      R2ErrorHandlingInit.initialized = false;
      console.log(
        "[R2_ERROR_HANDLING_INIT] Successfully shut down R2 error handling services"
      );
    } catch (error) {
      console.error("[R2_ERROR_HANDLING_INIT] Error during shutdown:", error);
    }
  }

  /**
   * Get comprehensive status report
   */
  static getStatusReport(): {
    services: any;
    health: any;
    errors: any;
    recovery: any;
    reports: any;
  } {
    return {
      services: R2ErrorHandlingInit.getServiceStatus(),
      health: folderHealthMonitor.getMonitoringStats(),
      errors: folderErrorHandler.getErrorMetrics(),
      recovery: errorRecoveryUtilities.getRecoveryStats(),
      reports: errorReportingService.getReportingStats(),
    };
  }
}

// Auto-initialize in production environment
if (process.env.NODE_ENV === "production") {
  R2ErrorHandlingInit.initialize().catch((error) => {
    console.error(
      "[R2_ERROR_HANDLING_INIT] Auto-initialization failed:",
      error
    );
  });
}

// Export for manual initialization
export default R2ErrorHandlingInit;
