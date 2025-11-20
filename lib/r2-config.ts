import { S3Client } from "@aws-sdk/client-s3";

/**
 * R2 Configuration interface
 */
export interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBucketUrl: string;
  accountId: string;
}

/**
 * R2 Configuration class for centralized R2 management
 */
export class R2Config {
  private static config: R2Config | null = null;
  private static s3Client: S3Client | null = null;

  /**
   * Get R2 configuration from environment variables
   * @returns R2 configuration object
   */
  static getConfig(): R2Config {
    if (this.config) {
      return this.config;
    }

    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME;
    const publicBucketUrl = process.env.R2_PUBLIC_BUCKET_URL;
    const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    // Validate required environment variables
    const missingVars = [];
    if (!endpoint) missingVars.push("R2_ENDPOINT");
    if (!accessKeyId) missingVars.push("R2_ACCESS_KEY_ID");
    if (!secretAccessKey) missingVars.push("R2_SECRET_ACCESS_KEY");
    if (!bucketName) missingVars.push("R2_BUCKET_NAME");
    if (!publicBucketUrl) missingVars.push("R2_PUBLIC_BUCKET_URL");

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required R2 environment variables: ${missingVars.join(", ")}`
      );
    }

    // Extract account ID from endpoint if cloudflare account ID is not provided
    const accountId =
      cloudflareAccountId ||
      endpoint?.split(".")[0]?.replace("https://", "") ||
      "";

    this.config = {
      endpoint: endpoint!,
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
      bucketName: bucketName!,
      publicBucketUrl: publicBucketUrl!,
      accountId,
    };

    return this.config;
  }

  /**
   * Get S3 client configured for R2
   * @returns S3Client instance
   */
  static getS3Client(): S3Client {
    if (this.s3Client) {
      return this.s3Client;
    }

    const config = this.getConfig();

    this.s3Client = new S3Client({
      region: "auto", // R2 specific setting
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    return this.s3Client;
  }

  /**
   * Reset the configuration (useful for testing)
   */
  static resetConfig(): void {
    this.config = null;
    this.s3Client = null;
  }

  /**
   * Validate R2 configuration
   * @returns True if configuration is valid
   */
  static validateConfig(): boolean {
    try {
      this.getConfig();
      return true;
    } catch (error) {
      console.error("[R2_CONFIG] Configuration validation failed:", error);
      return false;
    }
  }

  /**
   * Get configuration status for debugging
   * @returns Configuration status object
   */
  static getConfigStatus(): {
    isValid: boolean;
    hasEndpoint: boolean;
    hasAccessKeyId: boolean;
    hasSecretAccessKey: boolean;
    hasBucketName: boolean;
    hasPublicBucketUrl: boolean;
    hasAccountId: boolean;
  } {
    return {
      isValid: this.validateConfig(),
      hasEndpoint: !!process.env.R2_ENDPOINT,
      hasAccessKeyId: !!process.env.R2_ACCESS_KEY_ID,
      hasSecretAccessKey: !!process.env.R2_SECRET_ACCESS_KEY,
      hasBucketName: !!process.env.R2_BUCKET_NAME,
      hasPublicBucketUrl: !!process.env.R2_PUBLIC_BUCKET_URL,
      hasAccountId: !!(
        process.env.CLOUDFLARE_ACCOUNT_ID ||
        process.env.R2_ENDPOINT?.split(".")[0]?.replace("https://", "")
      ),
    };
  }

  /**
   * Log configuration status (useful for debugging)
   */
  static logConfigStatus(): void {
    const status = this.getConfigStatus();
    console.log("[R2_CONFIG] Configuration Status:", {
      isValid: status.isValid,
      hasEndpoint: status.hasEndpoint,
      hasAccessKeyId: status.hasAccessKeyId,
      hasSecretAccessKey: "***", // Don't log the actual secret
      hasBucketName: status.hasBucketName,
      hasPublicBucketUrl: status.hasPublicBucketUrl,
      hasAccountId: status.hasAccountId,
    });
  }
}

// Export default configuration for backward compatibility
export default R2Config;
