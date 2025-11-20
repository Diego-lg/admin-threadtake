import {
  FolderError,
  FolderErrorType,
  ErrorSeverity,
  RecoveryStrategy,
  ErrorRecoveryOptions,
  ErrorRecoveryResult,
  FolderOperationContext,
} from "./r2-folder-error-types";
import { R2UserStorage, UserFolderPaths } from "./r2-user-storage";
import { folderErrorHandler } from "./r2-folder-error-handler";
import { v4 as uuidv4 } from "uuid";

/**
 * Error recovery utilities for R2 folder operations
 */
export class R2ErrorRecoveryUtilities {
  private static instance: R2ErrorRecoveryUtilities;
  private recoveryQueue: Map<string, FolderOperationContext[]> = new Map();
  private activeRecoveries: Map<string, Promise<ErrorRecoveryResult>> =
    new Map();
  private defaultRecoveryOptions: ErrorRecoveryOptions = {
    maxRetries: 5,
    retryDelay: 1000,
    exponentialBackoff: true,
    maxBackoffDelay: 60000,
    fallbackEnabled: true,
    queueOperations: true,
  };

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): R2ErrorRecoveryUtilities {
    if (!R2ErrorRecoveryUtilities.instance) {
      R2ErrorRecoveryUtilities.instance = new R2ErrorRecoveryUtilities();
    }
    return R2ErrorRecoveryUtilities.instance;
  }

  /**
   * Attempt to recover from a folder error with comprehensive strategies
   */
  async recoverFromError(
    error: FolderError,
    options: Partial<ErrorRecoveryOptions> = {}
  ): Promise<ErrorRecoveryResult> {
    const finalOptions = { ...this.defaultRecoveryOptions, ...options };
    const recoveryId = uuidv4();
    const startTime = Date.now();

    console.log(
      `[ERROR_RECOVERY] Starting recovery for ${error.type} - ${error.message}`
    );

    try {
      // Check if recovery is already in progress for this user
      if (error.userId && this.activeRecoveries.has(error.userId)) {
        console.log(
          `[ERROR_RECOVERY] Recovery already in progress for user ${error.userId}`
        );
        return await this.activeRecoveries.get(error.userId)!;
      }

      const recoveryPromise = this.performRecovery(
        error,
        finalOptions,
        recoveryId
      );

      if (error.userId) {
        this.activeRecoveries.set(error.userId, recoveryPromise);
      }

      const result = await recoveryPromise;

      console.log(
        `[ERROR_RECOVERY] Recovery completed for ${error.type}: ${
          result.success ? "SUCCESS" : "FAILED"
        }`
      );
      return result;
    } catch (recoveryError: any) {
      console.error(`[ERROR_RECOVERY] Recovery failed:`, recoveryError);

      return {
        success: false,
        strategy: RecoveryStrategy.MANUAL,
        attempts: 1,
        duration: Date.now() - startTime,
        error: {
          ...error,
          message: `Recovery failed: ${recoveryError.message}`,
          originalError: recoveryError,
        },
      };
    } finally {
      if (error.userId) {
        this.activeRecoveries.delete(error.userId);
      }
    }
  }

  /**
   * Perform the actual recovery based on error type
   */
  private async performRecovery(
    error: FolderError,
    options: ErrorRecoveryOptions,
    recoveryId: string
  ): Promise<ErrorRecoveryResult> {
    switch (error.type) {
      case FolderErrorType.MISSING_USER_FOLDER:
        return await this.recoverMissingUserFolder(error, options);

      case FolderErrorType.MISSING_SUBFOLDER:
        return await this.recoverMissingSubfolder(error, options);

      case FolderErrorType.CREATION_FAILED:
        return await this.recoverCreationFailure(error, options);

      case FolderErrorType.CONCURRENT_CREATION:
        return await this.recoverConcurrentCreation(error, options);

      case FolderErrorType.NETWORK_ERROR:
      case FolderErrorType.TIMEOUT_ERROR:
        return await this.recoverNetworkError(error, options);

      case FolderErrorType.PERMISSION_DENIED:
        return await this.recoverPermissionError(error, options);

      case FolderErrorType.QUOTA_EXCEEDED:
        return await this.recoverQuotaError(error, options);

      case FolderErrorType.CORRUPTED_STRUCTURE:
        return await this.recoverCorruptedStructure(error, options);

      default:
        return await this.recoverUnknownError(error, options);
    }
  }

  /**
   * Recover from missing user folder
   */
  private async recoverMissingUserFolder(
    error: FolderError,
    options: ErrorRecoveryOptions
  ): Promise<ErrorRecoveryResult> {
    if (!error.userId) {
      return {
        success: false,
        strategy: RecoveryStrategy.MANUAL,
        attempts: 1,
        duration: 0,
        error: {
          ...error,
          message: "Cannot recover missing user folder without user ID",
        },
      };
    }

    return await folderErrorHandler.handleMissingUserFolder(error.userId, {
      userId: error.userId,
      operation: "error_recovery",
      startTime: new Date(),
    });
  }

  /**
   * Recover from missing subfolder
   */
  private async recoverMissingSubfolder(
    error: FolderError,
    options: ErrorRecoveryOptions
  ): Promise<ErrorRecoveryResult> {
    if (!error.userId || !error.folderPath) {
      return {
        success: false,
        strategy: RecoveryStrategy.MANUAL,
        attempts: 1,
        duration: 0,
        error: {
          ...error,
          message:
            "Cannot recover missing subfolder without user ID and folder path",
        },
      };
    }

    const startTime = Date.now();
    let attempts = 0;

    while (attempts < options.maxRetries) {
      attempts++;

      try {
        // Wait before retry (except for first attempt)
        if (attempts > 1) {
          const delay = this.calculateDelay(attempts, options);
          await this.sleep(delay);
        }

        console.log(
          `[ERROR_RECOVERY] Attempting to create missing subfolder (attempt ${attempts})`
        );

        // Try to create the specific subfolder
        const folderMarker = `${error.folderPath}/.folder_marker`;
        const client = (await import("./r2-config")).R2Config.getS3Client();
        const config = (await import("./r2-config")).R2Config.getConfig();

        const { PutObjectCommand } = await import("@aws-sdk/client-s3");
        const command = new PutObjectCommand({
          Bucket: config.bucketName,
          Key: folderMarker,
          Body: "",
          ContentType: "application/x-directory",
        });

        await client.send(command);

        // Verify creation
        const exists = await R2UserStorage.fileExists(folderMarker);
        if (exists) {
          return {
            success: true,
            strategy: RecoveryStrategy.AUTOMATIC,
            attempts,
            duration: Date.now() - startTime,
            details: {
              message: `Successfully created missing subfolder: ${error.folderPath}`,
            },
          };
        }
      } catch (attemptError: any) {
        console.error(
          `[ERROR_RECOVERY] Subfolder creation attempt ${attempts} failed:`,
          attemptError
        );

        if (attempts === options.maxRetries) {
          return {
            success: false,
            strategy: RecoveryStrategy.AUTOMATIC,
            attempts,
            duration: Date.now() - startTime,
            error: {
              ...error,
              message: `Failed to create subfolder after ${attempts} attempts: ${attemptError.message}`,
              originalError: attemptError,
            },
          };
        }
      }
    }

    return {
      success: false,
      strategy: RecoveryStrategy.AUTOMATIC,
      attempts,
      duration: Date.now() - startTime,
      error: {
        ...error,
        message: `Failed to create subfolder after ${attempts} attempts`,
      },
    };
  }

  /**
   * Recover from creation failure
   */
  private async recoverCreationFailure(
    error: FolderError,
    options: ErrorRecoveryOptions
  ): Promise<ErrorRecoveryResult> {
    if (!error.userId) {
      return {
        success: false,
        strategy: RecoveryStrategy.MANUAL,
        attempts: 1,
        duration: 0,
        error: {
          ...error,
          message: "Cannot recover creation failure without user ID",
        },
      };
    }

    const startTime = Date.now();
    let attempts = 0;

    while (attempts < options.maxRetries) {
      attempts++;

      try {
        if (attempts > 1) {
          const delay = this.calculateDelay(attempts, options);
          await this.sleep(delay);
        }

        console.log(
          `[ERROR_RECOVERY] Attempting folder creation recovery (attempt ${attempts})`
        );

        // Try to create the complete folder structure
        const created = await R2UserStorage.createUserFolderStructure(
          error.userId
        );

        if (created) {
          const verified = await R2UserStorage.userFolderExists(error.userId);
          if (verified) {
            return {
              success: true,
              strategy: RecoveryStrategy.RETRY,
              attempts,
              duration: Date.now() - startTime,
              details: {
                message: "Successfully recovered from creation failure",
              },
            };
          }
        }
      } catch (attemptError: any) {
        console.error(
          `[ERROR_RECOVERY] Creation recovery attempt ${attempts} failed:`,
          attemptError
        );

        if (attempts === options.maxRetries) {
          return {
            success: false,
            strategy: RecoveryStrategy.RETRY,
            attempts,
            duration: Date.now() - startTime,
            error: {
              ...error,
              message: `Creation recovery failed after ${attempts} attempts: ${attemptError.message}`,
              originalError: attemptError,
            },
          };
        }
      }
    }

    return {
      success: false,
      strategy: RecoveryStrategy.RETRY,
      attempts,
      duration: Date.now() - startTime,
      error: {
        ...error,
        message: `Creation recovery failed after ${attempts} attempts`,
      },
    };
  }

  /**
   * Recover from concurrent creation
   */
  private async recoverConcurrentCreation(
    error: FolderError,
    options: ErrorRecoveryOptions
  ): Promise<ErrorRecoveryResult> {
    if (!error.userId) {
      return {
        success: false,
        strategy: RecoveryStrategy.MANUAL,
        attempts: 1,
        duration: 0,
        error: {
          ...error,
          message: "Cannot recover concurrent creation without user ID",
        },
      };
    }

    return await folderErrorHandler.handleConcurrentCreation(error.userId, {
      userId: error.userId,
      operation: "concurrent_creation_recovery",
      startTime: new Date(),
    });
  }

  /**
   * Recover from network errors
   */
  private async recoverNetworkError(
    error: FolderError,
    options: ErrorRecoveryOptions
  ): Promise<ErrorRecoveryResult> {
    const startTime = Date.now();
    let attempts = 0;

    while (attempts < options.maxRetries) {
      attempts++;

      try {
        if (attempts > 1) {
          const delay = this.calculateDelay(attempts, options);
          await this.sleep(delay);
        }

        console.log(
          `[ERROR_RECOVERY] Attempting network recovery (attempt ${attempts})`
        );

        // Test connectivity by checking if we can access R2
        const config = (await import("./r2-config")).R2Config.getConfig();
        const testKey = `test-connectivity-${Date.now()}`;
        const { PutObjectCommand, DeleteObjectCommand } = await import(
          "@aws-sdk/client-s3"
        );
        const client = (await import("./r2-config")).R2Config.getS3Client();

        // Try to put and delete a test object
        const putCommand = new PutObjectCommand({
          Bucket: config.bucketName,
          Key: testKey,
          Body: "test",
        });

        await client.send(putCommand);

        const deleteCommand = new DeleteObjectCommand({
          Bucket: config.bucketName,
          Key: testKey,
        });

        await client.send(deleteCommand);

        // If we got here, network is working
        return {
          success: true,
          strategy: RecoveryStrategy.RETRY,
          attempts,
          duration: Date.now() - startTime,
          details: { message: "Network connectivity restored" },
        };
      } catch (attemptError: any) {
        console.error(
          `[ERROR_RECOVERY] Network recovery attempt ${attempts} failed:`,
          attemptError
        );

        if (attempts === options.maxRetries) {
          return {
            success: false,
            strategy: RecoveryStrategy.RETRY,
            attempts,
            duration: Date.now() - startTime,
            error: {
              ...error,
              message: `Network recovery failed after ${attempts} attempts: ${attemptError.message}`,
              originalError: attemptError,
            },
          };
        }
      }
    }

    return {
      success: false,
      strategy: RecoveryStrategy.RETRY,
      attempts,
      duration: Date.now() - startTime,
      error: {
        ...error,
        message: `Network recovery failed after ${attempts} attempts`,
      },
    };
  }

  /**
   * Recover from permission errors
   */
  private async recoverPermissionError(
    error: FolderError,
    options: ErrorRecoveryOptions
  ): Promise<ErrorRecoveryResult> {
    // Permission errors typically require manual intervention
    return {
      success: false,
      strategy: RecoveryStrategy.MANUAL,
      attempts: 1,
      duration: 0,
      error: {
        ...error,
        message: "Permission denied - requires administrator intervention",
      },
      details: {
        suggestion: "Check R2 access policies and user permissions",
        requiresAdmin: true,
      },
    };
  }

  /**
   * Recover from quota errors
   */
  private async recoverQuotaError(
    error: FolderError,
    options: ErrorRecoveryOptions
  ): Promise<ErrorRecoveryResult> {
    // Quota errors require manual intervention or upgrade
    return {
      success: false,
      strategy: RecoveryStrategy.MANUAL,
      attempts: 1,
      duration: 0,
      error: {
        ...error,
        message: "Storage quota exceeded - requires upgrade or cleanup",
      },
      details: {
        suggestion: "Upgrade storage plan or clean up existing files",
        requiresAdmin: false,
        userAction: true,
      },
    };
  }

  /**
   * Recover from corrupted structure
   */
  private async recoverCorruptedStructure(
    error: FolderError,
    options: ErrorRecoveryOptions
  ): Promise<ErrorRecoveryResult> {
    // Corrupted structures require manual intervention
    return {
      success: false,
      strategy: RecoveryStrategy.MANUAL,
      attempts: 1,
      duration: 0,
      error: {
        ...error,
        message: "Corrupted folder structure - requires manual intervention",
      },
      details: {
        suggestion: "Manually inspect and repair folder structure",
        requiresAdmin: true,
      },
    };
  }

  /**
   * Recover from unknown errors
   */
  private async recoverUnknownError(
    error: FolderError,
    options: ErrorRecoveryOptions
  ): Promise<ErrorRecoveryResult> {
    const startTime = Date.now();
    let attempts = 0;

    while (attempts < options.maxRetries) {
      attempts++;

      try {
        if (attempts > 1) {
          const delay = this.calculateDelay(attempts, options);
          await this.sleep(delay);
        }

        console.log(
          `[ERROR_RECOVERY] Attempting generic recovery (attempt ${attempts})`
        );

        // Try a generic approach - check if user folder exists and create if needed
        if (error.userId) {
          const exists = await R2UserStorage.userFolderExists(error.userId);
          if (!exists) {
            const created = await R2UserStorage.createUserFolderStructure(
              error.userId
            );
            if (created) {
              return {
                success: true,
                strategy: RecoveryStrategy.AUTOMATIC,
                attempts,
                duration: Date.now() - startTime,
                details: {
                  message: "Generic recovery successful - created user folder",
                },
              };
            }
          } else {
            return {
              success: true,
              strategy: RecoveryStrategy.AUTOMATIC,
              attempts,
              duration: Date.now() - startTime,
              details: {
                message: "Generic recovery successful - folder already exists",
              },
            };
          }
        }

        // If we can't do anything specific, just wait and hope the issue resolves
        return {
          success: false,
          strategy: RecoveryStrategy.MANUAL,
          attempts,
          duration: Date.now() - startTime,
          error: {
            ...error,
            message: "Generic recovery could not resolve the issue",
          },
        };
      } catch (attemptError: any) {
        console.error(
          `[ERROR_RECOVERY] Generic recovery attempt ${attempts} failed:`,
          attemptError
        );

        if (attempts === options.maxRetries) {
          return {
            success: false,
            strategy: RecoveryStrategy.MANUAL,
            attempts,
            duration: Date.now() - startTime,
            error: {
              ...error,
              message: `Generic recovery failed after ${attempts} attempts: ${attemptError.message}`,
              originalError: attemptError,
            },
          };
        }
      }
    }

    return {
      success: false,
      strategy: RecoveryStrategy.MANUAL,
      attempts,
      duration: Date.now() - startTime,
      error: {
        ...error,
        message: `Generic recovery failed after ${attempts} attempts`,
      },
    };
  }

  /**
   * Queue an operation for retry
   */
  queueOperation(context: FolderOperationContext): void {
    if (!context.userId) return;

    if (!this.recoveryQueue.has(context.userId)) {
      this.recoveryQueue.set(context.userId, []);
    }

    this.recoveryQueue.get(context.userId)!.push(context);
    console.log(
      `[ERROR_RECOVERY] Queued operation for user ${context.userId}: ${context.operation}`
    );
  }

  /**
   * Process queued operations
   */
  async processQueuedOperations(userId: string): Promise<void> {
    const queuedOperations = this.recoveryQueue.get(userId);
    if (!queuedOperations || queuedOperations.length === 0) {
      return;
    }

    console.log(
      `[ERROR_RECOVERY] Processing ${queuedOperations.length} queued operations for user ${userId}`
    );

    for (const operation of queuedOperations) {
      try {
        console.log(
          `[ERROR_RECOVERY] Processing queued operation: ${operation.operation}`
        );

        // Attempt to retry the operation
        // This would need to be implemented based on the specific operation type
        // For now, we'll just log it
      } catch (error) {
        console.error(
          `[ERROR_RECOVERY] Failed to process queued operation:`,
          error
        );
      }
    }

    // Clear the queue for this user
    this.recoveryQueue.delete(userId);
  }

  /**
   * Get queued operations for a user
   */
  getQueuedOperations(userId: string): FolderOperationContext[] {
    return this.recoveryQueue.get(userId) || [];
  }

  /**
   * Calculate delay with exponential backoff
   */
  private calculateDelay(
    attempt: number,
    options: ErrorRecoveryOptions
  ): number {
    if (!options.exponentialBackoff) {
      return options.retryDelay;
    }

    const delay = options.retryDelay * Math.pow(2, attempt - 1);
    return Math.min(delay, options.maxBackoffDelay);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clear all recovery queues
   */
  clearAllQueues(): void {
    this.recoveryQueue.clear();
    console.log("[ERROR_RECOVERY] Cleared all recovery queues");
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStats(): {
    queuedOperations: number;
    activeRecoveries: number;
    queuedByUser: Record<string, number>;
  } {
    const queuedByUser: Record<string, number> = {};

    for (const [userId, operations] of this.recoveryQueue.entries()) {
      queuedByUser[userId] = operations.length;
    }

    return {
      queuedOperations: Array.from(this.recoveryQueue.values()).reduce(
        (total, ops) => total + ops.length,
        0
      ),
      activeRecoveries: this.activeRecoveries.size,
      queuedByUser,
    };
  }
}

// Export singleton instance
export const errorRecoveryUtilities = R2ErrorRecoveryUtilities.getInstance();
