import {
  R2AuditLogger,
  AuditLogEntry,
  AuditStatistics,
} from "./r2-audit-logger";
import { FileOperationContext } from "./r2-security";

/**
 * Security alert interface
 */
export interface SecurityAlert {
  id: string;
  timestamp: Date;
  severity: "low" | "medium" | "high" | "critical";
  type:
    | "suspicious_activity"
    | "potential_breach"
    | "policy_violation"
    | "system_anomaly";
  title: string;
  description: string;
  userId?: string;
  ipAddress?: string;
  resourcePath?: string;
  metadata: Record<string, any>;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

/**
 * Security metrics interface
 */
export interface SecurityMetrics {
  timestamp: Date;
  totalOperations: number;
  failedOperations: number;
  blockedOperations: number;
  suspiciousIPs: number;
  suspiciousUsers: number;
  highRiskOperations: number;
  criticalRiskOperations: number;
  alertsBySeverity: Record<string, number>;
  alertsByType: Record<string, number>;
  topRiskFactors: Array<{ factor: string; count: number }>;
}

/**
 * Security monitoring configuration
 */
export interface SecurityMonitorConfig {
  enableRealTimeMonitoring: boolean;
  alertThresholds: {
    failedOperationsPerMinute: number;
    blockedOperationsPerMinute: number;
    uniqueIPsPerMinute: number;
    highRiskOperationsPerHour: number;
    criticalRiskOperationsPerHour: number;
  };
  suspiciousPatterns: {
    rapidFileAccess: number; // Files accessed per minute
    unusualFileTypes: string[];
    unusualAccessTimes: { start: number; end: number }; // Hours (0-23)
    crossUserAccessAttempts: number;
  };
  notificationChannels: {
    email: boolean;
    webhook: boolean;
    console: boolean;
  };
}

/**
 * In-memory alert storage
 */
const alertStore: SecurityAlert[] = [];
const MAX_IN_MEMORY_ALERTS = 1000;

/**
 * Default monitoring configuration
 */
const defaultConfig: SecurityMonitorConfig = {
  enableRealTimeMonitoring: true,
  alertThresholds: {
    failedOperationsPerMinute: 50, // INCREASED from 10
    blockedOperationsPerMinute: 20, // INCREASED from 5
    uniqueIPsPerMinute: 50, // INCREASED from 20
    highRiskOperationsPerHour: 100, // INCREASED from 50
    criticalRiskOperationsPerHour: 25, // INCREASED from 10
  },
  suspiciousPatterns: {
    rapidFileAccess: 200, // INCREASED from 100
    unusualFileTypes: [".exe", ".bat", ".cmd", ".scr", ".vbs", ".php"], // REMOVED .js
    unusualAccessTimes: { start: 1, end: 4 }, // CHANGED from 2-5 to 1-4
    crossUserAccessAttempts: 5, // INCREASED from 3
  },
  notificationChannels: {
    email: false,
    webhook: false,
    console: true,
  },
};

/**
 * Current monitoring configuration
 */
let currentConfig: SecurityMonitorConfig = { ...defaultConfig };

/**
 * Tracking variables for real-time monitoring
 */
const operationTracker = {
  operations: [] as Array<{
    timestamp: Date;
    userId: string;
    ipAddress: string;
    operation: string;
  }>,
  lastCleanup: Date.now(),
};

/**
 * Security monitoring utilities for R2 operations
 */
export class R2SecurityMonitor {
  /**
   * Configure security monitoring
   * @param config Monitoring configuration
   */
  static configure(config: Partial<SecurityMonitorConfig>): void {
    currentConfig = { ...currentConfig, ...config };
  }

  /**
   * Process an audit log entry for security monitoring
   * @param context File operation context
   * @param outcome Operation outcome
   * @param errorMessage Optional error message
   */
  static processOperation(
    context: FileOperationContext,
    outcome: "success" | "failure" | "blocked",
    errorMessage?: string
  ): void {
    if (!currentConfig.enableRealTimeMonitoring) return;

    // Track the operation
    this.trackOperation(context, outcome);

    // Check for suspicious patterns
    this.checkSuspiciousPatterns(context, outcome, errorMessage);

    // Clean up old tracking data periodically
    this.cleanupTrackingData();
  }

  /**
   * Get security alerts
   * @param filter Optional filter
   * @param limit Maximum number of alerts to return
   * @returns Array of security alerts
   */
  static getAlerts(
    filter: {
      severity?: string;
      type?: string;
      acknowledged?: boolean;
      startDate?: Date;
      endDate?: Date;
    } = {},
    limit: number = 100
  ): SecurityAlert[] {
    let filteredAlerts = [...alertStore];

    // Apply filters
    if (filter.severity) {
      filteredAlerts = filteredAlerts.filter(
        (alert) => alert.severity === filter.severity
      );
    }
    if (filter.type) {
      filteredAlerts = filteredAlerts.filter(
        (alert) => alert.type === filter.type
      );
    }
    if (filter.acknowledged !== undefined) {
      filteredAlerts = filteredAlerts.filter(
        (alert) => alert.acknowledged === filter.acknowledged
      );
    }
    if (filter.startDate) {
      filteredAlerts = filteredAlerts.filter(
        (alert) => alert.timestamp >= filter.startDate!
      );
    }
    if (filter.endDate) {
      filteredAlerts = filteredAlerts.filter(
        (alert) => alert.timestamp <= filter.endDate!
      );
    }

    // Sort by timestamp (newest first)
    filteredAlerts.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );

    // Apply limit
    return filteredAlerts.slice(0, limit);
  }

  /**
   * Get security metrics
   * @param timeRangeHours Time range in hours
   * @returns Security metrics
   */
  static getMetrics(timeRangeHours: number = 24): SecurityMetrics {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - timeRangeHours);

    // Get audit logs for the time range
    const auditLogs = R2AuditLogger.getLogs(
      {
        startDate,
        endDate,
      },
      10000
    );

    // Get alerts for the time range
    const alerts = this.getAlerts({ startDate, endDate }, 1000);

    // Calculate metrics
    const metrics: SecurityMetrics = {
      timestamp: new Date(),
      totalOperations: auditLogs.length,
      failedOperations: auditLogs.filter((log) => log.outcome === "failure")
        .length,
      blockedOperations: auditLogs.filter((log) => log.outcome === "blocked")
        .length,
      suspiciousIPs: this.getSuspiciousIPs(auditLogs).length,
      suspiciousUsers: this.getSuspiciousUsers(auditLogs).length,
      highRiskOperations: auditLogs.filter((log) => log.riskLevel === "high")
        .length,
      criticalRiskOperations: auditLogs.filter(
        (log) => log.riskLevel === "critical"
      ).length,
      alertsBySeverity: {},
      alertsByType: {},
      topRiskFactors: [],
    };

    // Count alerts by severity
    for (const alert of alerts) {
      metrics.alertsBySeverity[alert.severity] =
        (metrics.alertsBySeverity[alert.severity] || 0) + 1;
      metrics.alertsByType[alert.type] =
        (metrics.alertsByType[alert.type] || 0) + 1;
    }

    // Get top risk factors
    metrics.topRiskFactors = this.getTopRiskFactors(auditLogs);

    return metrics;
  }

  /**
   * Acknowledge an alert
   * @param alertId Alert ID
   * @param acknowledgedBy User who acknowledged the alert
   * @returns True if alert was acknowledged
   */
  static acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = alertStore.find((a) => a.id === alertId);
    if (!alert) return false;

    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();

    return true;
  }

  /**
   * Create a security alert
   * @param severity Alert severity
   * @param type Alert type
   * @param title Alert title
   * @param description Alert description
   * @param metadata Additional metadata
   */
  static createAlert(
    severity: "low" | "medium" | "high" | "critical",
    type:
      | "suspicious_activity"
      | "potential_breach"
      | "policy_violation"
      | "system_anomaly",
    title: string,
    description: string,
    metadata: Record<string, any> = {}
  ): void {
    const alert: SecurityAlert = {
      id: this.generateId(),
      timestamp: new Date(),
      severity,
      type,
      title,
      description,
      userId: metadata.userId,
      ipAddress: metadata.ipAddress,
      resourcePath: metadata.resourcePath,
      metadata,
      acknowledged: false,
    };

    // Store the alert
    alertStore.push(alert);

    // Remove oldest alerts if we exceed the limit
    if (alertStore.length > MAX_IN_MEMORY_ALERTS) {
      alertStore.splice(0, alertStore.length - MAX_IN_MEMORY_ALERTS);
    }

    // Send notifications
    this.sendNotifications(alert);
  }

  /**
   * Track an operation for real-time monitoring
   * @param context File operation context
   * @param outcome Operation outcome
   */
  private static trackOperation(
    context: FileOperationContext,
    outcome: "success" | "failure" | "blocked"
  ): void {
    operationTracker.operations.push({
      timestamp: new Date(),
      userId: context.userId,
      ipAddress: context.ipAddress || "unknown",
      operation: context.operation,
    });
  }

  /**
   * Check for suspicious patterns
   * @param context File operation context
   * @param outcome Operation outcome
   * @param errorMessage Optional error message
   */
  private static checkSuspiciousPatterns(
    context: FileOperationContext,
    outcome: "success" | "failure" | "blocked",
    errorMessage?: string
  ): void {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

    // Get recent operations
    const recentOperations = operationTracker.operations.filter(
      (op) => op.timestamp >= oneMinuteAgo
    );

    // Check for rapid file access
    const userOperations = recentOperations.filter(
      (op) => op.userId === context.userId
    );
    if (
      userOperations.length > currentConfig.suspiciousPatterns.rapidFileAccess
    ) {
      this.createAlert(
        "medium",
        "suspicious_activity",
        "Rapid File Access Detected",
        `User ${context.userId} accessed ${userOperations.length} files in the last minute`,
        {
          userId: context.userId,
          ipAddress: context.ipAddress,
          operationCount: userOperations.length,
          timeWindow: "1 minute",
        }
      );
    }

    // Check for unusual access times
    const hour = now.getHours();
    if (
      hour >= currentConfig.suspiciousPatterns.unusualAccessTimes.start &&
      hour <= currentConfig.suspiciousPatterns.unusualAccessTimes.end
    ) {
      this.createAlert(
        "low",
        "suspicious_activity",
        "Unusual Access Time",
        `User ${context.userId} accessed files during unusual hours (${hour}:00)`,
        {
          userId: context.userId,
          ipAddress: context.ipAddress,
          accessHour: hour,
        }
      );
    }

    // Check for multiple failed operations
    const failedOperations = userOperations.filter((op) =>
      recentOperations.some(
        (ro) => ro.userId === op.userId && ro.timestamp >= oneMinuteAgo
      )
    );
    if (
      failedOperations.length >=
      currentConfig.alertThresholds.failedOperationsPerMinute
    ) {
      this.createAlert(
        "high",
        "potential_breach",
        "Multiple Failed Operations",
        `User ${context.userId} had ${failedOperations.length} failed operations in the last minute`,
        {
          userId: context.userId,
          ipAddress: context.ipAddress,
          failedCount: failedOperations.length,
          timeWindow: "1 minute",
        }
      );
    }

    // Check for blocked operations
    const blockedOperations = userOperations.filter((op) =>
      recentOperations.some(
        (ro) => ro.userId === op.userId && ro.timestamp >= oneMinuteAgo
      )
    );
    if (
      blockedOperations.length >=
      currentConfig.alertThresholds.blockedOperationsPerMinute
    ) {
      this.createAlert(
        "high",
        "potential_breach",
        "Multiple Blocked Operations",
        `User ${context.userId} had ${blockedOperations.length} blocked operations in the last minute`,
        {
          userId: context.userId,
          ipAddress: context.ipAddress,
          blockedCount: blockedOperations.length,
          timeWindow: "1 minute",
        }
      );
    }

    // Check for suspicious file types
    if (context.resourcePath) {
      const extension = context.resourcePath
        .toLowerCase()
        .substring(context.resourcePath.lastIndexOf("."));
      if (
        currentConfig.suspiciousPatterns.unusualFileTypes.includes(extension)
      ) {
        this.createAlert(
          "medium",
          "policy_violation",
          "Suspicious File Type",
          `User ${context.userId} attempted to access a suspicious file type: ${extension}`,
          {
            userId: context.userId,
            ipAddress: context.ipAddress,
            resourcePath: context.resourcePath,
            fileType: extension,
          }
        );
      }
    }

    // Check for security-related error messages
    if (errorMessage) {
      const securityErrors = [
        "access denied",
        "unauthorized",
        "forbidden",
        "path traversal",
        "invalid credentials",
        "authentication failed",
        "csrf",
        "xss",
      ];
      if (
        securityErrors.some((error) =>
          errorMessage.toLowerCase().includes(error)
        )
      ) {
        this.createAlert(
          "high",
          "potential_breach",
          "Security Violation Detected",
          `Security-related error: ${errorMessage}`,
          {
            userId: context.userId,
            ipAddress: context.ipAddress,
            resourcePath: context.resourcePath,
            errorMessage,
          }
        );
      }
    }
  }

  /**
   * Get suspicious IP addresses
   * @param auditLogs Array of audit logs
   * @returns Array of suspicious IP addresses
   */
  private static getSuspiciousIPs(auditLogs: AuditLogEntry[]): string[] {
    const ipCounts: Record<
      string,
      { total: number; failed: number; blocked: number }
    > = {};

    for (const log of auditLogs) {
      if (!log.ipAddress) continue;

      if (!ipCounts[log.ipAddress]) {
        ipCounts[log.ipAddress] = { total: 0, failed: 0, blocked: 0 };
      }

      ipCounts[log.ipAddress].total++;
      if (log.outcome === "failure") ipCounts[log.ipAddress].failed++;
      if (log.outcome === "blocked") ipCounts[log.ipAddress].blocked++;
    }

    // An IP is suspicious if it has a high failure rate or many blocked operations
    return Object.entries(ipCounts)
      .filter(([_, counts]) => {
        const failureRate = counts.failed / counts.total;
        const blockRate = counts.blocked / counts.total;
        return failureRate > 0.5 || blockRate > 0.2 || counts.blocked > 5;
      })
      .map(([ip]) => ip);
  }

  /**
   * Get suspicious users
   * @param auditLogs Array of audit logs
   * @returns Array of suspicious user IDs
   */
  private static getSuspiciousUsers(auditLogs: AuditLogEntry[]): string[] {
    const userCounts: Record<
      string,
      { total: number; failed: number; blocked: number; highRisk: number }
    > = {};

    for (const log of auditLogs) {
      if (!userCounts[log.userId]) {
        userCounts[log.userId] = {
          total: 0,
          failed: 0,
          blocked: 0,
          highRisk: 0,
        };
      }

      userCounts[log.userId].total++;
      if (log.outcome === "failure") userCounts[log.userId].failed++;
      if (log.outcome === "blocked") userCounts[log.userId].blocked++;
      if (log.riskLevel === "high" || log.riskLevel === "critical")
        userCounts[log.userId].highRisk++;
    }

    // A user is suspicious if they have many failed/blocked operations or high-risk operations
    return Object.entries(userCounts)
      .filter(([_, counts]) => {
        const failureRate = counts.failed / counts.total;
        const blockRate = counts.blocked / counts.total;
        return (
          failureRate > 0.3 ||
          blockRate > 0.1 ||
          counts.blocked > 3 ||
          counts.highRisk > 5
        );
      })
      .map(([userId]) => userId);
  }

  /**
   * Get top risk factors
   * @param auditLogs Array of audit logs
   * @returns Array of top risk factors
   */
  private static getTopRiskFactors(
    auditLogs: AuditLogEntry[]
  ): Array<{ factor: string; count: number }> {
    const riskFactors: Record<string, number> = {};

    for (const log of auditLogs) {
      // Count by risk level
      riskFactors[`Risk Level: ${log.riskLevel}`] =
        (riskFactors[`Risk Level: ${log.riskLevel}`] || 0) + 1;

      // Count by operation type
      riskFactors[`Operation: ${log.operation}`] =
        (riskFactors[`Operation: ${log.operation}`] || 0) + 1;

      // Count by outcome
      riskFactors[`Outcome: ${log.outcome}`] =
        (riskFactors[`Outcome: ${log.outcome}`] || 0) + 1;

      // Count by resource type
      riskFactors[`Resource Type: ${log.resourceType}`] =
        (riskFactors[`Resource Type: ${log.resourceType}`] || 0) + 1;
    }

    return Object.entries(riskFactors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([factor, count]) => ({ factor, count }));
  }

  /**
   * Clean up old tracking data
   */
  private static cleanupTrackingData(): void {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Clean up if last cleanup was more than 5 minutes ago
    if (now - operationTracker.lastCleanup > 5 * 60 * 1000) {
      operationTracker.operations = operationTracker.operations.filter(
        (op) => op.timestamp.getTime() > oneHourAgo
      );
      operationTracker.lastCleanup = now;
    }
  }

  /**
   * Send notifications for an alert
   * @param alert Security alert
   */
  private static sendNotifications(alert: SecurityAlert): void {
    const message = `[SECURITY ALERT] ${alert.severity.toUpperCase()}: ${
      alert.title
    } - ${alert.description}`;

    // Console notification
    if (currentConfig.notificationChannels.console) {
      if (alert.severity === "critical" || alert.severity === "high") {
        console.error(message);
      } else if (alert.severity === "medium") {
        console.warn(message);
      } else {
        console.log(message);
      }
    }

    // Email notification (placeholder)
    if (currentConfig.notificationChannels.email) {
      console.log("[EMAIL_NOTIFICATION]", message);
    }

    // Webhook notification (placeholder)
    if (currentConfig.notificationChannels.webhook) {
      console.log("[WEBHOOK_NOTIFICATION]", message);
    }
  }

  /**
   * Generate a unique ID for alerts
   * @returns Unique ID
   */
  private static generateId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
