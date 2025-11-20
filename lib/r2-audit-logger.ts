import { FileOperationContext } from "./r2-security";
import { UserRole } from "@prisma/client";

/**
 * Audit log entry interface
 */
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId: string;
  userRole?: UserRole;
  operation: "read" | "write" | "delete" | "list";
  resourcePath: string;
  resourceType: "file" | "folder";
  outcome: "success" | "failure" | "blocked";
  ipAddress?: string;
  userAgent?: string;
  errorMessage?: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  additionalData?: Record<string, any>;
}

/**
 * Audit log configuration
 */
export interface AuditLogConfig {
  enableConsoleLogging: boolean;
  enableFileLogging: boolean;
  enableDatabaseLogging: boolean;
  logRetentionDays: number;
  logLevel: "info" | "warn" | "error" | "debug";
  sensitiveDataMasking: boolean;
}

/**
 * Audit log filtering options
 */
export interface AuditLogFilter {
  userId?: string;
  operation?: string;
  outcome?: string;
  startDate?: Date;
  endDate?: Date;
  riskLevel?: string;
  resourcePath?: string;
}

/**
 * Audit statistics
 */
export interface AuditStatistics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  blockedOperations: number;
  operationsByType: Record<string, number>;
  operationsByUser: Record<string, number>;
  highRiskOperations: number;
  criticalRiskOperations: number;
  topErrorMessages: Array<{ message: string; count: number }>;
}

/**
 * In-memory audit log storage (in production, use a database or log service)
 */
const auditLogStore: AuditLogEntry[] = [];
const MAX_IN_MEMORY_LOGS = 10000; // Limit in-memory storage

/**
 * Default audit configuration
 */
const defaultConfig: AuditLogConfig = {
  enableConsoleLogging: true,
  enableFileLogging: false, // Set to true in production
  enableDatabaseLogging: false, // Set to true in production
  logRetentionDays: 90,
  logLevel: "info",
  sensitiveDataMasking: true,
};

/**
 * Current audit configuration
 */
let currentConfig: AuditLogConfig = { ...defaultConfig };

/**
 * Audit logger for R2 operations
 */
export class R2AuditLogger {
  /**
   * Configure audit logging
   * @param config Audit configuration
   */
  static configure(config: Partial<AuditLogConfig>): void {
    currentConfig = { ...currentConfig, ...config };
  }

  /**
   * Log an audit event
   * @param context File operation context
   * @param outcome Operation outcome
   * @param errorMessage Optional error message
   * @param additionalData Optional additional data
   */
  static log(
    context: FileOperationContext,
    outcome: "success" | "failure" | "blocked",
    errorMessage?: string,
    additionalData?: Record<string, any>
  ): void {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      userId: context.userId,
      operation: context.operation,
      resourcePath: context.resourcePath,
      resourceType: this.getResourceType(context.resourcePath),
      outcome,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      errorMessage,
      riskLevel: "low", // Default, will be updated based on context
      additionalData,
    };

    // Determine risk level based on context and outcome
    entry.riskLevel = this.determineRiskLevel(context, outcome, errorMessage);

    // Mask sensitive data if enabled
    if (currentConfig.sensitiveDataMasking) {
      entry.resourcePath = this.maskSensitiveData(entry.resourcePath);
      if (entry.userAgent) {
        entry.userAgent = this.maskSensitiveData(entry.userAgent);
      }
      if (entry.additionalData) {
        entry.additionalData = this.maskObject(entry.additionalData);
      }
    }

    // Store the log entry
    this.storeLogEntry(entry);

    // Log to console if enabled
    if (currentConfig.enableConsoleLogging) {
      this.logToConsole(entry);
    }

    // Log to file if enabled (implementation depends on environment)
    if (currentConfig.enableFileLogging) {
      this.logToFile(entry);
    }

    // Log to database if enabled
    if (currentConfig.enableDatabaseLogging) {
      this.logToDatabase(entry);
    }
  }

  /**
   * Get audit logs with filtering
   * @param filter Filter options
   * @param limit Maximum number of entries to return
   * @param offset Offset for pagination
   * @returns Array of audit log entries
   */
  static getLogs(
    filter: AuditLogFilter = {},
    limit: number = 100,
    offset: number = 0
  ): AuditLogEntry[] {
    let filteredLogs = [...auditLogStore];

    // Apply filters
    if (filter.userId) {
      filteredLogs = filteredLogs.filter((log) => log.userId === filter.userId);
    }
    if (filter.operation) {
      filteredLogs = filteredLogs.filter(
        (log) => log.operation === filter.operation
      );
    }
    if (filter.outcome) {
      filteredLogs = filteredLogs.filter(
        (log) => log.outcome === filter.outcome
      );
    }
    if (filter.startDate) {
      filteredLogs = filteredLogs.filter(
        (log) => log.timestamp >= filter.startDate!
      );
    }
    if (filter.endDate) {
      filteredLogs = filteredLogs.filter(
        (log) => log.timestamp <= filter.endDate!
      );
    }
    if (filter.riskLevel) {
      filteredLogs = filteredLogs.filter(
        (log) => log.riskLevel === filter.riskLevel
      );
    }
    if (filter.resourcePath) {
      filteredLogs = filteredLogs.filter((log) =>
        log.resourcePath.includes(filter.resourcePath!)
      );
    }

    // Sort by timestamp (newest first)
    filteredLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    return filteredLogs.slice(offset, offset + limit);
  }

  /**
   * Get audit statistics
   * @param filter Optional filter
   * @returns Audit statistics
   */
  static getStatistics(filter: AuditLogFilter = {}): AuditStatistics {
    const logs = this.getLogs(filter, 10000); // Get more logs for statistics

    const stats: AuditStatistics = {
      totalOperations: logs.length,
      successfulOperations: logs.filter((log) => log.outcome === "success")
        .length,
      failedOperations: logs.filter((log) => log.outcome === "failure").length,
      blockedOperations: logs.filter((log) => log.outcome === "blocked").length,
      operationsByType: {},
      operationsByUser: {},
      highRiskOperations: logs.filter((log) => log.riskLevel === "high").length,
      criticalRiskOperations: logs.filter((log) => log.riskLevel === "critical")
        .length,
      topErrorMessages: [],
    };

    // Count operations by type
    for (const log of logs) {
      stats.operationsByType[log.operation] =
        (stats.operationsByType[log.operation] || 0) + 1;
      stats.operationsByUser[log.userId] =
        (stats.operationsByUser[log.userId] || 0) + 1;
    }

    // Get top error messages
    const errorMessages = logs
      .filter((log) => log.errorMessage)
      .map((log) => log.errorMessage!)
      .reduce((acc, message) => {
        acc[message] = (acc[message] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    stats.topErrorMessages = Object.entries(errorMessages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([message, count]) => ({ message, count }));

    return stats;
  }

  /**
   * Clean up old log entries based on retention policy
   */
  static cleanupOldLogs(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - currentConfig.logRetentionDays);

    const initialCount = auditLogStore.length;
    for (let i = auditLogStore.length - 1; i >= 0; i--) {
      if (auditLogStore[i].timestamp < cutoffDate) {
        auditLogStore.splice(i, 1);
      }
    }

    const removedCount = initialCount - auditLogStore.length;
    if (removedCount > 0 && currentConfig.enableConsoleLogging) {
      console.log(`[AUDIT] Cleaned up ${removedCount} old log entries`);
    }
  }

  /**
   * Export audit logs to JSON
   * @param filter Filter options
   * @returns JSON string of audit logs
   */
  static exportLogs(filter: AuditLogFilter = {}): string {
    const logs = this.getLogs(filter, 10000);
    return JSON.stringify(logs, null, 2);
  }

  /**
   * Generate a unique ID for log entries
   * @returns Unique ID
   */
  private static generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Determine the resource type from a path
   * @param path Resource path
   * @returns Resource type
   */
  private static getResourceType(path: string): "file" | "folder" {
    // Simple heuristic: if path ends with /, it's a folder
    return path.endsWith("/") ? "folder" : "file";
  }

  /**
   * Determine risk level based on context and outcome
   * @param context File operation context
   * @param outcome Operation outcome
   * @param errorMessage Optional error message
   * @returns Risk level
   */
  private static determineRiskLevel(
    context: FileOperationContext,
    outcome: "success" | "failure" | "blocked",
    errorMessage?: string
  ): "low" | "medium" | "high" | "critical" {
    // Blocked operations are always high risk
    if (outcome === "blocked") {
      return "high";
    }

    // Failed operations with security-related errors are high risk
    if (outcome === "failure" && errorMessage) {
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
        return "high";
      }
    }

    // Delete operations are medium risk
    if (context.operation === "delete") {
      return "medium";
    }

    // Write operations are low to medium risk depending on context
    if (context.operation === "write") {
      // Check if writing to sensitive locations
      const sensitivePaths = ["config", "admin", "system"];
      if (
        sensitivePaths.some((path) =>
          context.resourcePath.toLowerCase().includes(path)
        )
      ) {
        return "medium";
      }
      return "low";
    }

    // Read and list operations are low risk
    return "low";
  }

  /**
   * Store a log entry in memory
   * @param entry Log entry
   */
  private static storeLogEntry(entry: AuditLogEntry): void {
    auditLogStore.push(entry);

    // Remove oldest entries if we exceed the limit
    if (auditLogStore.length > MAX_IN_MEMORY_LOGS) {
      auditLogStore.splice(0, auditLogStore.length - MAX_IN_MEMORY_LOGS);
    }
  }

  /**
   * Log to console
   * @param entry Log entry
   */
  private static logToConsole(entry: AuditLogEntry): void {
    const logLevel =
      entry.outcome === "failure" || entry.riskLevel === "critical"
        ? "error"
        : entry.outcome === "blocked" || entry.riskLevel === "high"
        ? "warn"
        : currentConfig.logLevel;

    const logMessage = `[AUDIT] ${entry.timestamp.toISOString()} - ${
      entry.userId
    } - ${entry.operation.toUpperCase()} - ${
      entry.resourcePath
    } - ${entry.outcome.toUpperCase()} - Risk: ${entry.riskLevel.toUpperCase()}`;

    if (logLevel === "error") {
      console.error(logMessage, entry.errorMessage || "");
    } else if (logLevel === "warn") {
      console.warn(logMessage);
    } else {
      console.log(logMessage);
    }
  }

  /**
   * Log to file (placeholder implementation)
   * @param entry Log entry
   */
  private static logToFile(entry: AuditLogEntry): void {
    // In a real implementation, this would write to a file system
    // This is a placeholder for demonstration
    console.log("[FILE_LOG]", JSON.stringify(entry));
  }

  /**
   * Log to database (placeholder implementation)
   * @param entry Log entry
   */
  private static logToDatabase(entry: AuditLogEntry): void {
    // In a real implementation, this would write to a database
    // This is a placeholder for demonstration
    console.log("[DB_LOG]", JSON.stringify(entry));
  }

  /**
   * Mask sensitive data in a string
   * @param data String to mask
   * @returns Masked string
   */
  private static maskSensitiveData(data: string): string {
    // Simple masking for demonstration
    // In a real implementation, use more sophisticated masking
    return data.replace(
      /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
      "$1***@$2"
    );
  }

  /**
   * Mask sensitive data in an object
   * @param obj Object to mask
   * @returns Masked object
   */
  private static maskObject(obj: Record<string, any>): Record<string, any> {
    const masked: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") {
        masked[key] = this.maskSensitiveData(value);
      } else if (typeof value === "object" && value !== null) {
        masked[key] = this.maskObject(value);
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }
}
