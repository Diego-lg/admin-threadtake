/**
 * Folder error types for comprehensive error handling
 */
export enum FolderErrorType {
  MISSING_USER_FOLDER = "missing_user_folder",
  MISSING_SUBFOLDER = "missing_subfolder",
  CREATION_FAILED = "creation_failed",
  PERMISSION_DENIED = "permission_denied",
  CORRUPTED_STRUCTURE = "corrupted_structure",
  CONCURRENT_CREATION = "concurrent_creation",
  QUOTA_EXCEEDED = "quota_exceeded",
  NETWORK_ERROR = "network_error",
  VALIDATION_ERROR = "validation_error",
  TIMEOUT_ERROR = "timeout_error",
  UNKNOWN_ERROR = "unknown_error",
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

/**
 * Recovery strategy types
 */
export enum RecoveryStrategy {
  AUTOMATIC = "automatic",
  RETRY = "retry",
  QUEUE = "queue",
  FALLBACK = "fallback",
  MANUAL = "manual",
}

/**
 * Folder error details
 */
export interface FolderError {
  type: FolderErrorType;
  severity: ErrorSeverity;
  message: string;
  userId?: string;
  folderPath?: string;
  originalError?: Error;
  timestamp: Date;
  context?: Record<string, any>;
  recoverable: boolean;
  suggestedRecovery: RecoveryStrategy;
}

/**
 * Error recovery options
 */
export interface ErrorRecoveryOptions {
  maxRetries: number;
  retryDelay: number;
  exponentialBackoff: boolean;
  maxBackoffDelay: number;
  fallbackEnabled: boolean;
  queueOperations: boolean;
}

/**
 * Folder health status
 */
export interface FolderHealthStatus {
  userId: string;
  isHealthy: boolean;
  lastChecked: Date;
  issues: FolderError[];
  missingFolders: string[];
  corruptedFolders: string[];
  permissionsOk: boolean;
  totalSize: number;
  fileCount: number;
}

/**
 * Error recovery result
 */
export interface ErrorRecoveryResult {
  success: boolean;
  strategy: RecoveryStrategy;
  attempts: number;
  duration: number;
  error?: FolderError;
  details?: Record<string, any>;
}

/**
 * Folder operation context
 */
export interface FolderOperationContext {
  userId: string;
  operation: string;
  folderPath?: string;
  fileId?: string;
  retryCount?: number;
  startTime: Date;
  metadata?: Record<string, any>;
}

/**
 * Error monitoring metrics
 */
export interface ErrorMetrics {
  totalErrors: number;
  errorsByType: Record<FolderErrorType, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  recoverySuccessRate: number;
  averageRecoveryTime: number;
  activeIssues: number;
  lastUpdated: Date;
}

/**
 * Background task status
 */
export interface BackgroundTaskStatus {
  taskId: string;
  userId: string;
  taskType: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  startTime: Date;
  endTime?: Date;
  error?: FolderError;
  result?: any;
}
