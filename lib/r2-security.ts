import { UserFolderPaths } from "./r2-user-storage";
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZES } from "./r2-file-helpers";
import { UserRole, PrismaClient } from "@prisma/client";

// Initialize Prisma client for database-based rate limiting
const prisma = new PrismaClient();

/**
 * Security validation result interface
 */
export interface SecurityValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
}

/**
 * File operation context for security validation
 */
export interface FileOperationContext {
  userId: string;
  operation: "read" | "write" | "delete" | "list";
  resourcePath: string;
  userAgent?: string;
  ipAddress?: string;
  isAdmin?: boolean;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

/**
 * Rate limiting entry
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
  lastAccess: number;
}

/**
 * Hybrid rate limit store - uses Prisma database for persistence
 * Falls back to in-memory for development/fallback scenarios
 */
const rateLimitStore = new Map<string, RateLimitEntry>();
const USE_DATABASE_RATE_LIMITING =
  process.env.USE_DATABASE_RATE_LIMITING === "true";

/**
 * Security validation utilities for R2 operations
 */
export class R2Security {
  /**
   * Validate and sanitize a file path to prevent path traversal attacks
   * @param path The file path to validate
   * @returns Sanitized and validated path
   */
  static validatePath(path: string): SecurityValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let riskLevel: "low" | "medium" | "high" | "critical" = "low";

    // Check for null/undefined/empty path
    if (!path || typeof path !== "string") {
      errors.push("Path is required and must be a string");
      riskLevel = "critical";
      return { isValid: false, errors, warnings, riskLevel };
    }

    // Check for path traversal attempts
    const traversalPatterns = [
      /\.\.[\/\\]/, // ../ or ..\
      /^[\/\\]/, // Starting with / or \
      /[\/\\]\.\.[\/\\]/, // /../ or /..\ in middle
      /[\/\\]\.\.$/, // Ending with /.. or /..
    ];

    for (const pattern of traversalPatterns) {
      if (pattern.test(path)) {
        errors.push("Path traversal detected in file path");
        riskLevel = "critical";
      }
    }

    // Check for encoded path traversal attempts
    const encodedTraversalPatterns = [
      /%2e%2e[\/\\]/i, // %2e%2e/ or %2e%2e\
      /%2e%2e%2f/i, // %2e%2e%2f (../)
      /%2e%2e%5c/i, // %2e%2e%5c (..\)
      /\.\.%2f/i, // .%2f (./)
      /\.\.%5c/i, // .%5c (.\)
    ];

    for (const pattern of encodedTraversalPatterns) {
      if (pattern.test(path)) {
        errors.push("Encoded path traversal detected in file path");
        riskLevel = "critical";
      }
    }

    // Check for null bytes
    if (path.includes("\0")) {
      errors.push("Null byte detected in file path");
      riskLevel = "critical";
    }

    // Check for suspicious characters
    const suspiciousChars = /[<>:"|?*\x00-\x1f]/;
    if (suspiciousChars.test(path)) {
      warnings.push("Suspicious characters detected in file path");
      if (riskLevel === "low") riskLevel = "medium";
    }

    // Check for excessively long paths
    if (path.length > 1024) {
      errors.push("Path exceeds maximum allowed length");
      riskLevel = "high";
    }

    // Check for Windows reserved names (if applicable)
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
    const pathParts = path.split(/[\/\\]/);
    for (const part of pathParts) {
      if (reservedNames.test(part)) {
        errors.push(`Reserved name detected in path: ${part}`);
        riskLevel = "high";
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      riskLevel,
    };
  }

  /**
   * Validate and sanitize a filename
   * @param filename The filename to validate
   * @returns Sanitized and validated filename
   */
  static validateFilename(filename: string): SecurityValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let riskLevel: "low" | "medium" | "high" | "critical" = "low";

    // Check for null/undefined/empty filename
    if (!filename || typeof filename !== "string") {
      errors.push("Filename is required and must be a string");
      riskLevel = "critical";
      return { isValid: false, errors, warnings, riskLevel };
    }

    // Check for path traversal in filename
    const pathValidation = this.validatePath(filename);
    if (!pathValidation.isValid) {
      errors.push(...pathValidation.errors);
      riskLevel = pathValidation.riskLevel;
    }

    // Check for excessively long filename
    if (filename.length > 255) {
      errors.push("Filename exceeds maximum allowed length");
      riskLevel = "high";
    }

    // Check for empty filename
    if (filename.trim() === "") {
      errors.push("Filename cannot be empty");
      riskLevel = "high";
    }

    // Check for Windows reserved names
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
    if (reservedNames.test(filename)) {
      errors.push(`Reserved name detected: ${filename}`);
      riskLevel = "high";
    }

    // Check for suspicious extensions
    const dangerousExtensions = [
      ".exe",
      ".bat",
      ".cmd",
      ".com",
      ".pif",
      ".scr",
      ".vbs",
      ".js",
      ".jar",
      ".app",
      ".deb",
      ".pkg",
      ".dmg",
      ".rpm",
      ".deb",
      ".msi",
      ".php",
      ".asp",
      ".aspx",
      ".jsp",
      ".sh",
      ".ps1",
      ".py",
      ".rb",
      ".pl",
    ];
    const extension = filename
      .toLowerCase()
      .substring(filename.lastIndexOf("."));
    if (dangerousExtensions.includes(extension)) {
      warnings.push(`Potentially dangerous file extension: ${extension}`);
      if (riskLevel === "low") riskLevel = "medium";
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      riskLevel,
    };
  }

  /**
   * Validate file type and size
   * @param file The file to validate
   * @param fileType The expected file type category
   * @returns Validation result
   */
  static validateFileType(
    file: File,
    fileType: keyof typeof ALLOWED_EXTENSIONS,
  ): SecurityValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let riskLevel: "low" | "medium" | "high" | "critical" = "low";

    // Check file size
    const maxSize = MAX_FILE_SIZES[fileType] || MAX_FILE_SIZES.default;
    if (file.size > maxSize) {
      errors.push(
        `File size (${Math.round(
          file.size / 1024 / 1024,
        )}MB) exceeds maximum allowed size (${Math.round(
          maxSize / 1024 / 1024,
        )}MB)`,
      );
      riskLevel = "high";
    }

    // Check file extension
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const allowedExtensions =
      ALLOWED_EXTENSIONS[fileType] || ALLOWED_EXTENSIONS.default;
    if (!allowedExtensions.includes(extension as any)) {
      errors.push(
        `File extension .${extension} is not allowed. Allowed extensions: ${allowedExtensions.join(
          ", ",
        )}`,
      );
      riskLevel = "high";
    }

    // Check MIME type
    const allowedMimeTypes = this.getAllowedMimeTypes(fileType);
    if (!allowedMimeTypes.includes(file.type)) {
      warnings.push(
        `File MIME type (${file.type}) doesn't match expected type for .${extension} files`,
      );
      if (riskLevel === "low") riskLevel = "medium";
    }

    // Check for empty files
    if (file.size === 0) {
      errors.push("File is empty");
      riskLevel = "medium";
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      riskLevel,
    };
  }

  /**
   * Get allowed MIME types for a file type
   * @param fileType The file type category
   * @returns Array of allowed MIME types
   */
  private static getAllowedMimeTypes(
    fileType: keyof typeof ALLOWED_EXTENSIONS,
  ): string[] {
    const mimeTypes: Record<string, string[]> = {
      profilePicture: ["image/jpeg", "image/png", "image/webp"],
      mockup: ["image/jpeg", "image/png", "image/webp"],
      asset: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/svg+xml",
        "application/pdf",
      ],
      export: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
        "application/zip",
      ],
      default: ["image/jpeg", "image/png", "image/webp"],
    };

    return mimeTypes[fileType] || mimeTypes.default;
  }

  /**
   * Validate user access to a resource
   * @param context The file operation context
   * @returns Validation result
   */
  static validateUserAccess(
    context: FileOperationContext,
  ): SecurityValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let riskLevel: "low" | "medium" | "high" | "critical" = "low";

    // Check if user ID is valid
    if (!context.userId || typeof context.userId !== "string") {
      errors.push("Invalid user ID");
      riskLevel = "critical";
      return { isValid: false, errors, warnings, riskLevel };
    }

    // Check if resource path is valid
    const pathValidation = this.validatePath(context.resourcePath);
    if (!pathValidation.isValid) {
      errors.push(...pathValidation.errors);
      riskLevel = pathValidation.riskLevel;
    }

    // Check if user is trying to access another user's folder
    const userBasePath = UserFolderPaths.getUserBasePath(context.userId);
    if (!context.resourcePath.startsWith(userBasePath) && !context.isAdmin) {
      errors.push("Access denied: User can only access their own folders");
      riskLevel = "high";
    }

    // Check for suspicious user agent
    if (context.userAgent) {
      const suspiciousPatterns = [/bot/i, /crawler/i, /spider/i, /scraper/i];
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(context.userAgent)) {
          warnings.push("Suspicious user agent detected");
          if (riskLevel === "low") riskLevel = "medium";
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      riskLevel,
    };
  }

  /**
   * Check if a request should be rate limited using database
   * @param identifier Unique identifier for rate limiting (e.g., user ID or IP)
   * @param config Rate limiting configuration
   * @returns True if request should be rate limited
   */
  static async checkRateLimitDb(
    identifier: string,
    config: RateLimitConfig,
  ): Promise<boolean> {
    try {
      const now = Date.now();
      const windowEnd = now + config.windowMs;

      // Upsert rate limit entry
      await prisma.rateLimit.upsert({
        where: { identifier },
        update: {
          count: { increment: 1 },
          lastAccess: new Date(now),
          resetTime: new Date(windowEnd),
        },
        create: {
          identifier,
          count: 1,
          resetTime: new Date(windowEnd),
          lastAccess: new Date(now),
        },
      });

      // Get current count and check limit
      const entry = await prisma.rateLimit.findUnique({
        where: { identifier },
      });

      if (entry && entry.count > config.maxRequests) {
        return true;
      }

      return false;
    } catch (error) {
      // Fallback to in-memory on database error
      return this.checkRateLimitMemory(identifier, config);
    }
  }

  /**
   * Check if a request should be rate limited (in-memory fallback)
   * @param identifier Unique identifier for rate limiting (e.g., user ID or IP)
   * @param config Rate limiting configuration
   * @returns True if request should be rate limited
   */
  static checkRateLimitMemory(
    identifier: string,
    config: RateLimitConfig,
  ): boolean {
    const now = Date.now();
    const entry = rateLimitStore.get(identifier);

    // If no entry exists, create one
    if (!entry || now > entry.resetTime) {
      rateLimitStore.set(identifier, {
        count: 1,
        resetTime: now + config.windowMs,
        lastAccess: now,
      });
      return false;
    }

    // Increment count
    entry.count++;
    entry.lastAccess = now;

    // Check if limit exceeded
    if (entry.count > config.maxRequests) {
      return true;
    }

    return false;
  }

  /**
   * Check if a request should be rate limited (public method)
   * @param identifier Unique identifier for rate limiting (e.g., user ID or IP)
   * @param config Rate limiting configuration
   * @returns True if request should be rate limited
   */
  static async checkRateLimit(
    identifier: string,
    config: RateLimitConfig,
  ): Promise<boolean> {
    if (USE_DATABASE_RATE_LIMITING) {
      return this.checkRateLimitDb(identifier, config);
    }
    return this.checkRateLimitMemory(identifier, config);
  }

  /**
   * Get current rate limit status from database
   * @param identifier Unique identifier for rate limiting
   * @param config Rate limiting configuration
   * @returns Rate limit status
   */
  static async getRateLimitStatusDb(
    identifier: string,
    config: RateLimitConfig,
  ): Promise<{
    count: number;
    limit: number;
    remaining: number;
    resetTime: number;
  } | null> {
    try {
      const now = Date.now();
      const nowDate = new Date(now);

      // Clean up expired entries
      await prisma.rateLimit.deleteMany({
        where: {
          resetTime: { lt: nowDate },
        },
      });

      const entry = await prisma.rateLimit.findUnique({
        where: { identifier },
      });

      if (!entry) return null;

      if (now > entry.resetTime.getTime()) {
        await prisma.rateLimit.delete({ where: { identifier } });
        return null;
      }

      return {
        count: entry.count,
        limit: config.maxRequests,
        remaining: Math.max(0, config.maxRequests - entry.count),
        resetTime: entry.resetTime.getTime(),
      };
    } catch (error) {
      // Fallback to in-memory on database error
      return this.getRateLimitStatusMemory(identifier, config);
    }
  }

  /**
   * Get current rate limit status (in-memory fallback)
   * @param identifier Unique identifier for rate limiting
   * @param config Rate limiting configuration
   * @returns Rate limit status
   */
  static getRateLimitStatusMemory(
    identifier: string,
    config: RateLimitConfig,
  ): {
    count: number;
    limit: number;
    remaining: number;
    resetTime: number;
  } | null {
    const entry = rateLimitStore.get(identifier);
    if (!entry) return null;

    const now = Date.now();
    if (now > entry.resetTime) {
      rateLimitStore.delete(identifier);
      return null;
    }

    return {
      count: entry.count,
      limit: config.maxRequests,
      remaining: Math.max(0, config.maxRequests - entry.count),
      resetTime: entry.resetTime,
    };
  }

  /**
   * Get current rate limit status (public method)
   * @param identifier Unique identifier for rate limiting
   * @param config Rate limiting configuration
   * @returns Rate limit status
   */
  static async getRateLimitStatus(
    identifier: string,
    config: RateLimitConfig,
  ): Promise<{
    count: number;
    limit: number;
    remaining: number;
    resetTime: number;
  } | null> {
    if (USE_DATABASE_RATE_LIMITING) {
      return this.getRateLimitStatusDb(identifier, config);
    }
    return this.getRateLimitStatusMemory(identifier, config);
  }

  /**
   * Clean up expired rate limit entries from database
   */
  static async cleanupRateLimitStoreDb(): Promise<void> {
    try {
      const now = Date.now();
      const nowDate = new Date(now);
      await prisma.rateLimit.deleteMany({
        where: {
          resetTime: { lt: nowDate },
        },
      });
    } catch (error) {
      // Fallback to in-memory cleanup on database error
      this.cleanupRateLimitStoreMemory();
    }
  }

  /**
   * Clean up expired rate limit entries (in-memory fallback)
   */
  static cleanupRateLimitStoreMemory(): void {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }

  /**
   * Clean up expired rate limit entries (public method)
   */
  static async cleanupRateLimitStore(): Promise<void> {
    if (USE_DATABASE_RATE_LIMITING) {
      return this.cleanupRateLimitStoreDb();
    }
    this.cleanupRateLimitStoreMemory();
  }

  /**
   * Generate a secure content security policy header
   * @returns CSP header value
   */
  static generateContentSecurityPolicy(): string {
    return [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "media-src 'self'",
      "object-src 'none'",
      "frame-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; ");
  }

  /**
   * Generate security headers for R2 responses
   * @returns Record of security headers
   */
  static generateSecurityHeaders(): Record<string, string> {
    return {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy": this.generateContentSecurityPolicy(),
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    };
  }
}
