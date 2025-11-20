import {
  FolderError,
  FolderErrorType,
  ErrorSeverity,
  RecoveryStrategy,
  ErrorRecoveryOptions,
  ErrorRecoveryResult,
  FolderOperationContext,
  ErrorMetrics,
  BackgroundTaskStatus,
} from "./r2-folder-error-types";
import { R2UserStorage, UserFolderPaths } from "./r2-user-storage";
import { R2Config } from "./r2-config";
import { v4 as uuidv4 } from "uuid";

/**
 * Comprehensive R2 folder error handler with automatic recovery
 */
export class R2FolderErrorHandler {
  private static instance: R2FolderErrorHandler;
  private errorMetrics: ErrorMetrics;
  private activeRecoveries: Map<string, BackgroundTaskStatus> = new Map();
  private errorQueue: Map<string, FolderError[]> = new Map();
  private defaultRecoveryOptions: ErrorRecoveryOptions = {
    maxRetries: 3,
    retryDelay: 1000,
    exponentialBackoff: true,
    maxBackoffDelay: 30000,
    fallbackEnabled: true,
    queueOperations: true,
  };

  private constructor() {
    this.errorMetrics = {
      totalErrors: 0,
      errorsByType: {} as Record<FolderErrorType, number>,
      errorsBySeverity: {} as Record<ErrorSeverity, number>,
      recoverySuccessRate: 0,
      averageRecoveryTime: 0,
      activeIssues: 0,
      lastUpdated: new Date(),
    };

    // Initialize error counters
    Object.values(FolderErrorType).forEach((type) => {
      this.errorMetrics.errorsByType[type] = 0;
    });
    Object.values(ErrorSeverity).forEach((severity) => {
      this.errorMetrics.errorsBySeverity[severity] = 0;
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(): R2FolderErrorHandler {
    if (!R2FolderErrorHandler.instance) {
      R2FolderErrorHandler.instance = new R2FolderErrorHandler();
    }
    return R2FolderErrorHandler.instance;
  }

  /**
   * Classify and create a folder error
   */
  private createFolderError(
    type: FolderErrorType,
    message: string,
    originalError?: Error,
    context?: Partial<FolderOperationContext>
  ): FolderError {
    const severity = this.determineErrorSeverity(type, originalError);
    const recoverable = this.isErrorRecoverable(type);
    const suggestedRecovery = this.suggestRecoveryStrategy(type, severity);

    const error: FolderError = {
      type,
      severity,
      message,
      userId: context?.userId,
      folderPath: context?.folderPath,
      originalError,
      timestamp: new Date(),
      context,
      recoverable,
      suggestedRecovery,
    };

    this.updateErrorMetrics(error);
    return error;
  }

  /**
   * Determine error severity based on type and original error
   */
  private determineErrorSeverity(
    type: FolderErrorType,
    originalError?: Error
  ): ErrorSeverity {
    switch (type) {
      case FolderErrorType.MISSING_USER_FOLDER:
      case FolderErrorType.MISSING_SUBFOLDER:
        return ErrorSeverity.MEDIUM;
      case FolderErrorType.PERMISSION_DENIED:
      case FolderErrorType.CORRUPTED_STRUCTURE:
        return ErrorSeverity.HIGH;
      case FolderErrorType.QUOTA_EXCEEDED:
        return ErrorSeverity.HIGH;
      case FolderErrorType.CONCURRENT_CREATION:
        return ErrorSeverity.LOW;
      case FolderErrorType.NETWORK_ERROR:
      case FolderErrorType.TIMEOUT_ERROR:
        return ErrorSeverity.MEDIUM;
      case FolderErrorType.VALIDATION_ERROR:
        return ErrorSeverity.LOW;
      case FolderErrorType.CREATION_FAILED:
        return ErrorSeverity.HIGH;
      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  /**
   * Check if error is recoverable
   */
  private isErrorRecoverable(type: FolderErrorType): boolean {
    switch (type) {
      case FolderErrorType.MISSING_USER_FOLDER:
      case FolderErrorType.MISSING_SUBFOLDER:
      case FolderErrorType.CONCURRENT_CREATION:
      case FolderErrorType.NETWORK_ERROR:
      case FolderErrorType.TIMEOUT_ERROR:
        return true;
      case FolderErrorType.PERMISSION_DENIED:
      case FolderErrorType.QUOTA_EXCEEDED:
      case FolderErrorType.CORRUPTED_STRUCTURE:
        return false;
      case FolderErrorType.CREATION_FAILED:
        return true; // Can retry with different approach
      case FolderErrorType.VALIDATION_ERROR:
        return false; // Requires user input
      default:
        return true;
    }
  }

  /**
   * Suggest recovery strategy based on error type and severity
   */
  private suggestRecoveryStrategy(
    type: FolderErrorType,
    severity: ErrorSeverity
  ): RecoveryStrategy {
    switch (type) {
      case FolderErrorType.MISSING_USER_FOLDER:
      case FolderErrorType.MISSING_SUBFOLDER:
        return RecoveryStrategy.AUTOMATIC;
      case FolderErrorType.CONCURRENT_CREATION:
        return RecoveryStrategy.QUEUE;
      case FolderErrorType.NETWORK_ERROR:
      case FolderErrorType.TIMEOUT_ERROR:
        return RecoveryStrategy.RETRY;
      case FolderErrorType.CREATION_FAILED:
        return severity === ErrorSeverity.HIGH
          ? RecoveryStrategy.FALLBACK
          : RecoveryStrategy.RETRY;
      case FolderErrorType.PERMISSION_DENIED:
      case FolderErrorType.QUOTA_EXCEEDED:
      case FolderErrorType.CORRUPTED_STRUCTURE:
        return RecoveryStrategy.MANUAL;
      case FolderErrorType.VALIDATION_ERROR:
        return RecoveryStrategy.MANUAL;
      default:
        return RecoveryStrategy.AUTOMATIC;
    }
  }

  /**
   * Update error metrics
   */
  private updateErrorMetrics(error: FolderError): void {
    this.errorMetrics.totalErrors++;
    this.errorMetrics.errorsByType[error.type]++;
    this.errorMetrics.errorsBySeverity[error.severity]++;
    this.errorMetrics.activeIssues++;
    this.errorMetrics.lastUpdated = new Date();
  }

  /**
   * Handle missing user folder with automatic creation
   */
  async handleMissingUserFolder(
    userId: string,
    context?: Partial<FolderOperationContext>
  ): Promise<ErrorRecoveryResult> {
    const startTime = Date.now();
    const operationContext: FolderOperationContext = {
      userId,
      operation: "create_user_folder",
      startTime: new Date(),
      ...context,
    };

    try {
      console.log(
        `[FOLDER_ERROR_HANDLER] Handling missing user folder for ${userId}`
      );

      // Check if folder already exists (race condition)
      const folderExists = await R2UserStorage.userFolderExists(userId);
      if (folderExists) {
        return {
          success: true,
          strategy: RecoveryStrategy.AUTOMATIC,
          attempts: 1,
          duration: Date.now() - startTime,
          details: {
            message: "Folder already exists (race condition resolved)",
          },
        };
      }

      // Attempt to create folder structure
      const created = await R2UserStorage.createUserFolderStructure(userId);

      if (created) {
        // Verify creation was successful
        const verified = await R2UserStorage.userFolderExists(userId);
        if (verified) {
          return {
            success: true,
            strategy: RecoveryStrategy.AUTOMATIC,
            attempts: 1,
            duration: Date.now() - startTime,
            details: { message: "User folder created successfully" },
          };
        }
      }

      // If automatic creation failed, try with retry
      return await this.retryFolderCreation(userId, operationContext);
    } catch (error: any) {
      const folderError = this.createFolderError(
        FolderErrorType.CREATION_FAILED,
        `Failed to create user folder for ${userId}: ${error.message}`,
        error,
        operationContext
      );

      return {
        success: false,
        strategy: RecoveryStrategy.AUTOMATIC,
        attempts: 1,
        duration: Date.now() - startTime,
        error: folderError,
      };
    }
  }

  /**
   * Retry folder creation with exponential backoff
   */
  private async retryFolderCreation(
    userId: string,
    context: FolderOperationContext,
    options: Partial<ErrorRecoveryOptions> = {}
  ): Promise<ErrorRecoveryResult> {
    const finalOptions = { ...this.defaultRecoveryOptions, ...options };
    const startTime = Date.now();
    let attempts = 0;
    let delay = finalOptions.retryDelay;

    while (attempts < finalOptions.maxRetries) {
      attempts++;

      try {
        // Wait before retry (except for first attempt)
        if (attempts > 1) {
          await this.sleep(delay);
        }

        console.log(
          `[FOLDER_ERROR_HANDLER] Retry attempt ${attempts}/${finalOptions.maxRetries} for user ${userId}`
        );

        // Check if folder exists (might have been created by another process)
        const folderExists = await R2UserStorage.userFolderExists(userId);
        if (folderExists) {
          return {
            success: true,
            strategy: RecoveryStrategy.RETRY,
            attempts,
            duration: Date.now() - startTime,
            details: { message: "Folder found during retry" },
          };
        }

        // Attempt creation
        const created = await R2UserStorage.createUserFolderStructure(userId);
        if (created) {
          const verified = await R2UserStorage.userFolderExists(userId);
          if (verified) {
            return {
              success: true,
              strategy: RecoveryStrategy.RETRY,
              attempts,
              duration: Date.now() - startTime,
              details: { message: "Folder created during retry" },
            };
          }
        }

        // Update delay for exponential backoff
        if (finalOptions.exponentialBackoff) {
          delay = Math.min(delay * 2, finalOptions.maxBackoffDelay);
        }
      } catch (error: any) {
        console.error(
          `[FOLDER_ERROR_HANDLER] Retry attempt ${attempts} failed:`,
          error
        );

        // If this is the last attempt, return failure
        if (attempts === finalOptions.maxRetries) {
          const folderError = this.createFolderError(
            FolderErrorType.CREATION_FAILED,
            `Failed to create user folder after ${attempts} attempts: ${error.message}`,
            error,
            context
          );

          return {
            success: false,
            strategy: RecoveryStrategy.RETRY,
            attempts,
            duration: Date.now() - startTime,
            error: folderError,
          };
        }
      }
    }

    // Should not reach here, but just in case
    const folderError = this.createFolderError(
      FolderErrorType.CREATION_FAILED,
      `Failed to create user folder after ${attempts} attempts`,
      undefined,
      context
    );

    return {
      success: false,
      strategy: RecoveryStrategy.RETRY,
      attempts,
      duration: Date.now() - startTime,
      error: folderError,
    };
  }

  /**
   * Handle concurrent folder creation attempts
   */
  async handleConcurrentCreation(
    userId: string,
    context?: Partial<FolderOperationContext>
  ): Promise<ErrorRecoveryResult> {
    const startTime = Date.now();
    const taskId = uuidv4();

    try {
      console.log(
        `[FOLDER_ERROR_HANDLER] Handling concurrent creation for user ${userId}`
      );

      // Create background task status
      const taskStatus: BackgroundTaskStatus = {
        taskId,
        userId,
        taskType: "folder_creation",
        status: "pending",
        progress: 0,
        startTime: new Date(),
      };

      this.activeRecoveries.set(taskId, taskStatus);

      // Wait a bit for other process to complete
      await this.sleep(2000);

      // Check if folder was created by another process
      const folderExists = await R2UserStorage.userFolderExists(userId);
      if (folderExists) {
        taskStatus.status = "completed";
        taskStatus.endTime = new Date();
        taskStatus.progress = 100;

        return {
          success: true,
          strategy: RecoveryStrategy.QUEUE,
          attempts: 1,
          duration: Date.now() - startTime,
          details: { message: "Folder created by concurrent process" },
        };
      }

      // If still not created, try to create it
      taskStatus.status = "running";
      taskStatus.progress = 50;

      const created = await R2UserStorage.createUserFolderStructure(userId);

      if (created) {
        const verified = await R2UserStorage.userFolderExists(userId);
        if (verified) {
          taskStatus.status = "completed";
          taskStatus.endTime = new Date();
          taskStatus.progress = 100;

          return {
            success: true,
            strategy: RecoveryStrategy.QUEUE,
            attempts: 1,
            duration: Date.now() - startTime,
            details: {
              message: "Folder created after waiting for concurrent process",
            },
          };
        }
      }

      // If still failed, queue for retry
      await this.queueFolderCreation(userId, context);

      taskStatus.status = "completed";
      taskStatus.endTime = new Date();
      taskStatus.progress = 100;

      return {
        success: true,
        strategy: RecoveryStrategy.QUEUE,
        attempts: 1,
        duration: Date.now() - startTime,
        details: { message: "Folder creation queued for retry" },
      };
    } catch (error: any) {
      const folderError = this.createFolderError(
        FolderErrorType.CONCURRENT_CREATION,
        `Failed to handle concurrent creation for ${userId}: ${error.message}`,
        error,
        {
          userId,
          operation: "concurrent_creation",
          startTime: new Date(),
          ...context,
        }
      );

      return {
        success: false,
        strategy: RecoveryStrategy.QUEUE,
        attempts: 1,
        duration: Date.now() - startTime,
        error: folderError,
      };
    } finally {
      this.activeRecoveries.delete(taskId);
    }
  }

  /**
   * Queue folder creation for later retry
   */
  private async queueFolderCreation(
    userId: string,
    context?: Partial<FolderOperationContext>
  ): Promise<void> {
    const error = this.createFolderError(
      FolderErrorType.MISSING_USER_FOLDER,
      `Folder creation queued for user ${userId}`,
      undefined,
      {
        userId,
        operation: "queued_creation",
        startTime: new Date(),
        ...context,
      }
    );

    // Add to error queue for this user
    if (!this.errorQueue.has(userId)) {
      this.errorQueue.set(userId, []);
    }
    this.errorQueue.get(userId)!.push(error);

    console.log(
      `[FOLDER_ERROR_HANDLER] Queued folder creation for user ${userId}`
    );
  }

  /**
   * Process queued folder creations
   */
  async processQueuedCreations(): Promise<void> {
    console.log(
      `[FOLDER_ERROR_HANDLER] Processing ${this.errorQueue.size} queued folder creations`
    );

    for (const [userId, errors] of this.errorQueue.entries()) {
      try {
        // Check if folder already exists
        const folderExists = await R2UserStorage.userFolderExists(userId);
        if (folderExists) {
          this.errorQueue.delete(userId);
          console.log(
            `[FOLDER_ERROR_HANDLER] Folder already exists for user ${userId}, clearing queue`
          );
          continue;
        }

        // Attempt to create folder
        const created = await R2UserStorage.createUserFolderStructure(userId);
        if (created) {
          const verified = await R2UserStorage.userFolderExists(userId);
          if (verified) {
            this.errorQueue.delete(userId);
            console.log(
              `[FOLDER_ERROR_HANDLER] Successfully created folder for queued user ${userId}`
            );
          }
        }
      } catch (error) {
        console.error(
          `[FOLDER_ERROR_HANDLER] Failed to process queued creation for user ${userId}:`,
          error
        );
      }
    }
  }

  /**
   * Handle permission denied errors
   */
  async handlePermissionDenied(
    userId: string,
    folderPath: string,
    context?: Partial<FolderOperationContext>
  ): Promise<ErrorRecoveryResult> {
    const startTime = Date.now();

    const folderError = this.createFolderError(
      FolderErrorType.PERMISSION_DENIED,
      `Permission denied for user ${userId} accessing ${folderPath}`,
      undefined,
      {
        userId,
        folderPath,
        operation: "permission_check",
        startTime: new Date(),
        ...context,
      }
    );

    console.error(
      `[FOLDER_ERROR_HANDLER] Permission denied for user ${userId}: ${folderPath}`
    );

    // Permission errors typically require manual intervention
    // Log the error and return failure
    return {
      success: false,
      strategy: RecoveryStrategy.MANUAL,
      attempts: 1,
      duration: Date.now() - startTime,
      error: folderError,
      details: {
        message: "Permission denied - requires administrator intervention",
        userId,
        folderPath,
      },
    };
  }

  /**
   * Handle quota exceeded errors
   */
  async handleQuotaExceeded(
    userId: string,
    context?: Partial<FolderOperationContext>
  ): Promise<ErrorRecoveryResult> {
    const startTime = Date.now();

    const folderError = this.createFolderError(
      FolderErrorType.QUOTA_EXCEEDED,
      `Storage quota exceeded for user ${userId}`,
      undefined,
      { userId, operation: "quota_check", startTime: new Date(), ...context }
    );

    console.error(`[FOLDER_ERROR_HANDLER] Quota exceeded for user ${userId}`);

    // Quota errors require manual intervention or upgrade
    return {
      success: false,
      strategy: RecoveryStrategy.MANUAL,
      attempts: 1,
      duration: Date.now() - startTime,
      error: folderError,
      details: {
        message: "Storage quota exceeded - requires upgrade or cleanup",
        userId,
      },
    };
  }

  /**
   * Get error metrics
   */
  getErrorMetrics(): ErrorMetrics {
    return { ...this.errorMetrics };
  }

  /**
   * Get active recovery tasks
   */
  getActiveRecoveries(): BackgroundTaskStatus[] {
    return Array.from(this.activeRecoveries.values());
  }

  /**
   * Get queued errors for a user
   */
  getQueuedErrors(userId: string): FolderError[] {
    return this.errorQueue.get(userId) || [];
  }

  /**
   * Clear error metrics
   */
  clearErrorMetrics(): void {
    this.errorMetrics = {
      totalErrors: 0,
      errorsByType: {} as Record<FolderErrorType, number>,
      errorsBySeverity: {} as Record<ErrorSeverity, number>,
      recoverySuccessRate: 0,
      averageRecoveryTime: 0,
      activeIssues: 0,
      lastUpdated: new Date(),
    };

    Object.values(FolderErrorType).forEach((type) => {
      this.errorMetrics.errorsByType[type] = 0;
    });
    Object.values(ErrorSeverity).forEach((severity) => {
      this.errorMetrics.errorsBySeverity[severity] = 0;
    });
  }

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const folderErrorHandler = R2FolderErrorHandler.getInstance();
