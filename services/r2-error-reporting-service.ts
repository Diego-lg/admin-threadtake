import {
  FolderError,
  FolderErrorType,
  ErrorSeverity,
  ErrorMetrics,
  FolderHealthStatus,
} from "../lib/r2-folder-error-types";
import { folderErrorHandler } from "../lib/r2-folder-error-handler";
import { folderHealthMonitor } from "./r2-folder-health-monitor";
import { errorRecoveryUtilities } from "../lib/r2-error-recovery-utilities";
import { v4 as uuidv4 } from "uuid";

/**
 * Error report data structure
 */
export interface ErrorReport {
  id: string;
  timestamp: Date;
  reportType: "individual" | "summary" | "health" | "recovery";
  userId?: string;
  data: any;
  summary: string;
  details: string;
  severity: ErrorSeverity;
  resolved: boolean;
  resolutionDetails?: string;
  notified: boolean;
  metadata: Record<string, any>;
}

/**
 * Error reporting configuration
 */
export interface ErrorReportingConfig {
  enableNotifications: boolean;
  enableAutoReports: boolean;
  reportInterval: number; // in minutes
  retentionDays: number;
  notifyOnSeverity: ErrorSeverity[];
  recipients: string[];
}

/**
 * Comprehensive error reporting service for R2 folder operations
 */
export class R2ErrorReportingService {
  private static instance: R2ErrorReportingService;
  private reports: Map<string, ErrorReport> = new Map();
  private config: ErrorReportingConfig = {
    enableNotifications: false,
    enableAutoReports: true,
    reportInterval: 60, // 1 hour
    retentionDays: 30,
    notifyOnSeverity: [ErrorSeverity.HIGH, ErrorSeverity.CRITICAL],
    recipients: [],
  };
  private reportingInterval: NodeJS.Timeout | null = null;
  private isReporting = false;

  private constructor() {
    // Start automatic reporting if enabled
    if (this.config.enableAutoReports) {
      this.startAutoReporting();
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): R2ErrorReportingService {
    if (!R2ErrorReportingService.instance) {
      R2ErrorReportingService.instance = new R2ErrorReportingService();
    }
    return R2ErrorReportingService.instance;
  }

  /**
   * Configure error reporting
   */
  configureReporting(config: Partial<ErrorReportingConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart auto-reporting with new configuration
    if (this.config.enableAutoReports) {
      this.stopAutoReporting();
      this.startAutoReporting();
    } else {
      this.stopAutoReporting();
    }
  }

  /**
   * Report an individual error
   */
  reportError(
    error: FolderError,
    additionalData?: Record<string, any>
  ): string {
    const reportId = uuidv4();
    const report: ErrorReport = {
      id: reportId,
      timestamp: new Date(),
      reportType: "individual",
      userId: error.userId,
      data: { error, ...additionalData },
      summary: `${error.type}: ${error.message}`,
      details: this.generateErrorDetails(error),
      severity: error.severity,
      resolved: false,
      notified: false,
      metadata: {
        recoverable: error.recoverable,
        suggestedRecovery: error.suggestedRecovery,
        folderPath: error.folderPath,
        context: error.context,
      },
    };

    this.reports.set(reportId, report);
    console.log(`[ERROR_REPORTING] Reported error: ${report.summary}`);

    // Check if notification is needed
    if (this.shouldNotify(error)) {
      this.sendNotification(report);
    }

    return reportId;
  }

  /**
   * Report a health status check
   */
  reportHealthStatus(healthStatus: FolderHealthStatus): string {
    const reportId = uuidv4();
    const report: ErrorReport = {
      id: reportId,
      timestamp: new Date(),
      reportType: "health",
      userId: healthStatus.userId,
      data: { healthStatus },
      summary: `Health check for user ${healthStatus.userId}: ${
        healthStatus.isHealthy ? "Healthy" : "Issues detected"
      }`,
      details: this.generateHealthDetails(healthStatus),
      severity: healthStatus.isHealthy
        ? ErrorSeverity.LOW
        : ErrorSeverity.MEDIUM,
      resolved: healthStatus.isHealthy,
      notified: false,
      metadata: {
        missingFolders: healthStatus.missingFolders,
        corruptedFolders: healthStatus.corruptedFolders,
        permissionsOk: healthStatus.permissionsOk,
        totalSize: healthStatus.totalSize,
        fileCount: healthStatus.fileCount,
      },
    };

    this.reports.set(reportId, report);
    console.log(`[ERROR_REPORTING] Reported health status: ${report.summary}`);

    return reportId;
  }

  /**
   * Report a recovery operation
   */
  reportRecovery(userId: string, operation: string, result: any): string {
    const reportId = uuidv4();
    const report: ErrorReport = {
      id: reportId,
      timestamp: new Date(),
      reportType: "recovery",
      userId,
      data: { operation, result },
      summary: `Recovery operation '${operation}' for user ${userId}: ${
        result.success ? "Success" : "Failed"
      }`,
      details: this.generateRecoveryDetails(operation, result),
      severity: result.success ? ErrorSeverity.LOW : ErrorSeverity.MEDIUM,
      resolved: result.success,
      notified: false,
      metadata: {
        operation,
        duration: result.duration,
        attempts: result.attempts,
        strategy: result.strategy,
      },
    };

    this.reports.set(reportId, report);
    console.log(`[ERROR_REPORTING] Reported recovery: ${report.summary}`);

    return reportId;
  }

  /**
   * Generate a comprehensive summary report
   */
  generateSummaryReport(): ErrorReport {
    const reportId = uuidv4();
    const timestamp = new Date();

    // Get current metrics
    const errorMetrics = folderErrorHandler.getErrorMetrics();
    const recoveryStats = errorRecoveryUtilities.getRecoveryStats();
    const monitoringStats = folderHealthMonitor.getMonitoringStats();
    const healthIssues = folderHealthMonitor.getUsersWithHealthIssues();

    // Calculate report period
    const reportPeriod = this.config.reportInterval;
    const reportStart = new Date(
      timestamp.getTime() - reportPeriod * 60 * 1000
    );

    // Get reports from the period
    const periodReports = Array.from(this.reports.values()).filter(
      (report) => report.timestamp >= reportStart
    );

    // Generate summary data
    const summaryData = {
      period: {
        start: reportStart,
        end: timestamp,
        duration: reportPeriod,
      },
      errors: {
        total: errorMetrics.totalErrors,
        byType: errorMetrics.errorsByType,
        bySeverity: errorMetrics.errorsBySeverity,
        recoveryRate: errorMetrics.recoverySuccessRate,
        averageRecoveryTime: errorMetrics.averageRecoveryTime,
      },
      health: {
        totalUsers: monitoringStats.totalUsers,
        healthyUsers: monitoringStats.healthyUsers,
        usersWithIssues: monitoringStats.usersWithIssues,
        issueRate:
          monitoringStats.totalUsers > 0
            ? (monitoringStats.usersWithIssues / monitoringStats.totalUsers) *
              100
            : 0,
      },
      recovery: {
        queuedOperations: recoveryStats.queuedOperations,
        activeRecoveries: recoveryStats.activeRecoveries,
        queuedByUser: recoveryStats.queuedByUser,
      },
      reports: {
        total: periodReports.length,
        byType: this.groupReportsByType(periodReports),
        unresolved: periodReports.filter((r) => !r.resolved).length,
      },
    };

    const report: ErrorReport = {
      id: reportId,
      timestamp,
      reportType: "summary",
      data: summaryData,
      summary: `Error reporting summary for the last ${reportPeriod} minutes`,
      details: this.generateSummaryDetails(summaryData),
      severity: this.calculateSummarySeverity(summaryData),
      resolved:
        summaryData.errors.total === 0 &&
        summaryData.health.usersWithIssues === 0,
      notified: false,
      metadata: {
        reportPeriod,
        generatedAt: timestamp,
      },
    };

    this.reports.set(reportId, report);
    console.log(
      `[ERROR_REPORTING] Generated summary report: ${report.summary}`
    );

    return report;
  }

  /**
   * Get reports by various filters
   */
  getReports(
    filters: {
      userId?: string;
      reportType?: string;
      severity?: ErrorSeverity;
      resolved?: boolean;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    } = {}
  ): ErrorReport[] {
    let reports = Array.from(this.reports.values());

    // Apply filters
    if (filters.userId) {
      reports = reports.filter((r) => r.userId === filters.userId);
    }

    if (filters.reportType) {
      reports = reports.filter((r) => r.reportType === filters.reportType);
    }

    if (filters.severity) {
      reports = reports.filter((r) => r.severity === filters.severity);
    }

    if (filters.resolved !== undefined) {
      reports = reports.filter((r) => r.resolved === filters.resolved);
    }

    if (filters.startDate) {
      reports = reports.filter((r) => r.timestamp >= filters.startDate!);
    }

    if (filters.endDate) {
      reports = reports.filter((r) => r.timestamp <= filters.endDate!);
    }

    // Sort by timestamp (newest first)
    reports.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply limit
    if (filters.limit) {
      reports = reports.slice(0, filters.limit);
    }

    return reports;
  }

  /**
   * Get a specific report by ID
   */
  getReport(reportId: string): ErrorReport | null {
    return this.reports.get(reportId) || null;
  }

  /**
   * Mark a report as resolved
   */
  resolveReport(reportId: string, resolutionDetails?: string): boolean {
    const report = this.reports.get(reportId);
    if (!report) return false;

    report.resolved = true;
    report.resolutionDetails = resolutionDetails || "Manually resolved";

    console.log(`[ERROR_REPORTING] Resolved report: ${reportId}`);
    return true;
  }

  /**
   * Delete old reports based on retention policy
   */
  cleanupOldReports(): number {
    const cutoffDate = new Date(
      Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000
    );
    let deletedCount = 0;

    for (const [reportId, report] of this.reports.entries()) {
      if (report.timestamp < cutoffDate) {
        this.reports.delete(reportId);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[ERROR_REPORTING] Cleaned up ${deletedCount} old reports`);
    }

    return deletedCount;
  }

  /**
   * Start automatic reporting
   */
  private startAutoReporting(): void {
    if (this.isReporting) return;

    console.log(
      `[ERROR_REPORTING] Starting automatic reporting (interval: ${this.config.reportInterval} minutes)`
    );
    this.isReporting = true;

    this.reportingInterval = setInterval(() => {
      this.generateSummaryReport();
      this.cleanupOldReports();
    }, this.config.reportInterval * 60 * 1000);
  }

  /**
   * Stop automatic reporting
   */
  private stopAutoReporting(): void {
    if (!this.isReporting) return;

    console.log("[ERROR_REPORTING] Stopping automatic reporting");
    this.isReporting = false;

    if (this.reportingInterval) {
      clearInterval(this.reportingInterval);
      this.reportingInterval = null;
    }
  }

  /**
   * Check if notification should be sent
   */
  private shouldNotify(error: FolderError): boolean {
    return (
      this.config.enableNotifications &&
      this.config.notifyOnSeverity.includes(error.severity)
    );
  }

  /**
   * Send notification (placeholder implementation)
   */
  private sendNotification(report: ErrorReport): void {
    console.log(`[ERROR_REPORTING] NOTIFICATION: ${report.summary}`);

    // In a real implementation, this would send emails, Slack messages, etc.
    // For now, we'll just log it
    report.notified = true;
  }

  /**
   * Generate detailed error information
   */
  private generateErrorDetails(error: FolderError): string {
    let details = `Error Type: ${error.type}\n`;
    details += `Severity: ${error.severity}\n`;
    details += `Message: ${error.message}\n`;
    details += `Timestamp: ${error.timestamp.toISOString()}\n`;

    if (error.userId) {
      details += `User ID: ${error.userId}\n`;
    }

    if (error.folderPath) {
      details += `Folder Path: ${error.folderPath}\n`;
    }

    if (error.recoverable) {
      details += `Recoverable: Yes\n`;
      details += `Suggested Recovery: ${error.suggestedRecovery}\n`;
    }

    if (error.context) {
      details += `Context: ${JSON.stringify(error.context, null, 2)}\n`;
    }

    if (error.originalError) {
      details += `Original Error: ${error.originalError.message}\n`;
    }

    return details;
  }

  /**
   * Generate detailed health information
   */
  private generateHealthDetails(healthStatus: FolderHealthStatus): string {
    let details = `User ID: ${healthStatus.userId}\n`;
    details += `Healthy: ${healthStatus.isHealthy}\n`;
    details += `Last Checked: ${healthStatus.lastChecked.toISOString()}\n`;
    details += `Total Files: ${healthStatus.fileCount}\n`;
    details += `Total Size: ${healthStatus.totalSize} bytes\n`;
    details += `Permissions OK: ${healthStatus.permissionsOk}\n`;

    if (healthStatus.missingFolders.length > 0) {
      details += `Missing Folders: ${healthStatus.missingFolders.join(", ")}\n`;
    }

    if (healthStatus.corruptedFolders.length > 0) {
      details += `Corrupted Folders: ${healthStatus.corruptedFolders.join(
        ", "
      )}\n`;
    }

    if (healthStatus.issues.length > 0) {
      details += `Issues:\n`;
      healthStatus.issues.forEach((issue, index) => {
        details += `  ${index + 1}. ${issue.type}: ${issue.message}\n`;
      });
    }

    return details;
  }

  /**
   * Generate detailed recovery information
   */
  private generateRecoveryDetails(operation: string, result: any): string {
    let details = `Operation: ${operation}\n`;
    details += `Success: ${result.success}\n`;

    if (result.duration) {
      details += `Duration: ${result.duration}ms\n`;
    }

    if (result.attempts) {
      details += `Attempts: ${result.attempts}\n`;
    }

    if (result.strategy) {
      details += `Strategy: ${result.strategy}\n`;
    }

    if (result.error) {
      details += `Error: ${result.error.message}\n`;
    }

    if (result.details) {
      details += `Details: ${JSON.stringify(result.details, null, 2)}\n`;
    }

    return details;
  }

  /**
   * Generate detailed summary information
   */
  private generateSummaryDetails(data: any): string {
    let details = `Report Period: ${data.period.duration} minutes\n`;
    details += `Start: ${data.period.start.toISOString()}\n`;
    details += `End: ${data.period.end.toISOString()}\n\n`;

    details += `Errors:\n`;
    details += `  Total: ${data.errors.total}\n`;
    details += `  Recovery Rate: ${data.errors.recoveryRate}%\n`;
    details += `  Average Recovery Time: ${data.errors.averageRecoveryTime}ms\n\n`;

    details += `Health:\n`;
    details += `  Total Users: ${data.health.totalUsers}\n`;
    details += `  Healthy Users: ${data.health.healthyUsers}\n`;
    details += `  Users with Issues: ${data.health.usersWithIssues}\n`;
    details += `  Issue Rate: ${data.health.issueRate}%\n\n`;

    details += `Recovery:\n`;
    details += `  Queued Operations: ${data.recovery.queuedOperations}\n`;
    details += `  Active Recoveries: ${data.recovery.activeRecoveries}\n\n`;

    details += `Reports:\n`;
    details += `  Total: ${data.reports.total}\n`;
    details += `  Unresolved: ${data.reports.unresolved}\n`;

    return details;
  }

  /**
   * Group reports by type
   */
  private groupReportsByType(reports: ErrorReport[]): Record<string, number> {
    const groups: Record<string, number> = {};

    reports.forEach((report) => {
      groups[report.reportType] = (groups[report.reportType] || 0) + 1;
    });

    return groups;
  }

  /**
   * Calculate summary severity based on data
   */
  private calculateSummarySeverity(data: any): ErrorSeverity {
    // If there are critical errors, return critical
    if (data.errors.bySeverity?.critical > 0) {
      return ErrorSeverity.CRITICAL;
    }

    // If there are high severity errors, return high
    if (data.errors.bySeverity?.high > 0) {
      return ErrorSeverity.HIGH;
    }

    // If issue rate is high, return medium
    if (data.health.issueRate > 20) {
      return ErrorSeverity.MEDIUM;
    }

    // Otherwise, return low
    return ErrorSeverity.LOW;
  }

  /**
   * Get reporting statistics
   */
  getReportingStats(): {
    totalReports: number;
    reportsByType: Record<string, number>;
    reportsBySeverity: Record<string, number>;
    unresolvedReports: number;
    oldestReport: Date | null;
    newestReport: Date | null;
  } {
    const reports = Array.from(this.reports.values());

    if (reports.length === 0) {
      return {
        totalReports: 0,
        reportsByType: {},
        reportsBySeverity: {},
        unresolvedReports: 0,
        oldestReport: null,
        newestReport: null,
      };
    }

    const reportsByType: Record<string, number> = {};
    const reportsBySeverity: Record<string, number> = {};

    reports.forEach((report) => {
      reportsByType[report.reportType] =
        (reportsByType[report.reportType] || 0) + 1;
      reportsBySeverity[report.severity] =
        (reportsBySeverity[report.severity] || 0) + 1;
    });

    const sortedReports = reports.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    return {
      totalReports: reports.length,
      reportsByType,
      reportsBySeverity,
      unresolvedReports: reports.filter((r) => !r.resolved).length,
      oldestReport: sortedReports[0].timestamp,
      newestReport: sortedReports[sortedReports.length - 1].timestamp,
    };
  }
}

// Export singleton instance
export const errorReportingService = R2ErrorReportingService.getInstance();
