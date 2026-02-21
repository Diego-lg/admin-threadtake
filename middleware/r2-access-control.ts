import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import {
  R2Security,
  FileOperationContext,
  SecurityValidationResult,
  RateLimitConfig,
} from "@/lib/r2-security";
import { R2AuditLogger } from "@/lib/r2-audit-logger";
import { R2SecurityMonitor } from "@/lib/r2-security-monitor";
import { UserFolderService } from "@/services/user-folder-service";

/**
 * Edge-compatible function to get user ID from session cookie
 * For server sessions (database-backed), we just check if the session cookie exists
 * The actual session validation is done by the API routes
 */
function getUserIdFromCookie(req: NextRequest): string | undefined {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) {
    return undefined;
  }

  // Check for NextAuth session cookies
  // The actual session validation happens in API routes
  const hasSessionCookie =
    cookieHeader.includes("next-auth.session-token") ||
    cookieHeader.includes("__Secure-next-auth.session-token");

  if (!hasSessionCookie) {
    return undefined;
  }

  // For server sessions, we cannot decode the session in middleware
  // We just return a placeholder - the API route will validate the actual session
  return "session-user";
}

/**
 * R2 Access Control Middleware Configuration
 */
export interface R2AccessControlConfig {
  enableRateLimiting: boolean;
  enableAuditLogging: boolean;
  enableSecurityMonitoring: boolean;
  enablePathValidation: boolean;
  enableUserIsolation: boolean;
  rateLimitConfig: RateLimitConfig;
  adminOverrideEnabled: boolean;
  allowedAdminOperations: string[];
}

/**
 * Default configuration
 */
const defaultConfig: R2AccessControlConfig = {
  enableRateLimiting: true,
  enableAuditLogging: true,
  enableSecurityMonitoring: true,
  enablePathValidation: true,
  enableUserIsolation: true,
  rateLimitConfig: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 200, // INCREASED from 100
    skipSuccessfulRequests: true, // ADDED - skip successful requests
    skipFailedRequests: false,
  },
  adminOverrideEnabled: true,
  allowedAdminOperations: ["read", "write", "delete", "list"],
};

/**
 * Current configuration
 */
let currentConfig: R2AccessControlConfig = { ...defaultConfig };

/**
 * Configure R2 access control middleware
 * @param config Configuration options
 */
export function configureR2AccessControl(
  config: Partial<R2AccessControlConfig>,
): void {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * Extract resource path from request
 * @param request NextRequest object
 * @returns Resource path
 */
function extractResourcePath(request: NextRequest): string {
  const url = new URL(request.url);
  const pathname = url.pathname;

  console.log("[R2_ACCESS_CONTROL] extractResourcePath:", {
    pathname,
    search: url.search,
    method: request.method,
  });

  // Special handling for user files endpoints
  if (
    pathname === "/api/r2/user/files" ||
    pathname.startsWith("/api/r2/user/files/")
  ) {
    console.log(
      "[R2_ACCESS_CONTROL] User files endpoint detected, returning user-files path",
    );
    return "user-files";
  }

  // Extract resource path from URL
  // For example: /api/r2/user/files?path=mockups/design123/default
  const searchParams = url.searchParams;
  const pathParam =
    searchParams.get("path") ||
    searchParams.get("key") ||
    searchParams.get("fileKey");

  if (pathParam) {
    console.log("[R2_ACCESS_CONTROL] Found pathParam:", pathParam);
    return pathParam;
  }

  // Try to extract from pathname
  // For example: /api/r2/user/files/mockups/design123/default
  const pathParts = pathname.split("/");
  const r2Index = pathParts.indexOf("r2");
  console.log(
    "[R2_ACCESS_CONTROL] Path parts:",
    pathParts,
    "r2Index:",
    r2Index,
  );

  if (r2Index !== -1 && pathParts.length > r2Index + 3) {
    const extractedPath = pathParts.slice(r2Index + 3).join("/");
    console.log(
      "[R2_ACCESS_CONTROL] Extracted path from pathname:",
      extractedPath,
    );
    return extractedPath;
  }

  console.log(
    "[R2_ACCESS_CONTROL] No resource path found, returning empty string",
  );
  return "";
}

/**
 * Extract operation type from request
 * @param request NextRequest object
 * @returns Operation type
 */
function extractOperationType(
  request: NextRequest,
): "read" | "write" | "delete" | "list" {
  const method = request.method;
  const url = new URL(request.url);

  // Determine operation based on HTTP method and URL
  switch (method) {
    case "GET":
      // Check if it's a list operation
      if (url.searchParams.has("list") || url.pathname.includes("/list")) {
        return "list";
      }
      return "read";
    case "POST":
    case "PUT":
    case "PATCH":
      return "write";
    case "DELETE":
      return "delete";
    default:
      return "read"; // Default to read for unknown methods
  }
}

/**
 * Get client IP address from request
 * @param request NextRequest object
 * @returns IP address
 */
function getClientIPAddress(request: NextRequest): string {
  // Try to get IP from various headers
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIP = request.headers.get("x-real-ip");
  const clientIP = request.headers.get("x-client-ip");
  const cfConnectingIP = request.headers.get("cf-connecting-ip"); // Cloudflare

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  if (realIP) {
    return realIP;
  }
  if (clientIP) {
    return clientIP;
  }
  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  // Fallback to request IP
  return request.ip || "unknown";
}

/**
 * Create file operation context from request
 * @param request NextRequest object
 * @param userId User ID
 * @param userRole User role
 * @returns File operation context
 */
function createFileOperationContext(
  request: NextRequest,
  userId: string,
  userRole: UserRole,
): FileOperationContext {
  return {
    userId,
    operation: extractOperationType(request),
    resourcePath: extractResourcePath(request),
    userAgent: request.headers.get("user-agent") || undefined,
    ipAddress: getClientIPAddress(request),
    isAdmin: userRole === UserRole.ADMIN,
  };
}

/**
 * Apply security headers to response
 * @param response NextResponse object
 * @returns Response with security headers
 */
function applySecurityHeaders(response: NextResponse): NextResponse {
  const headers = R2Security.generateSecurityHeaders();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * Handle rate limiting
 * @param request NextRequest object
 * @param userId User ID
 * @returns NextResponse if rate limited, null otherwise
 */
async function handleRateLimiting(
  request: NextRequest,
  userId: string,
): Promise<NextResponse | null> {
  if (!currentConfig.enableRateLimiting) {
    return null;
  }

  const identifier = userId || getClientIPAddress(request);
  const isRateLimited = await R2Security.checkRateLimit(
    identifier,
    currentConfig.rateLimitConfig,
  );

  if (isRateLimited) {
    const rateLimitStatus = await R2Security.getRateLimitStatus(
      identifier,
      currentConfig.rateLimitConfig,
    );
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        message: "Too many requests. Please try again later.",
        retryAfter: rateLimitStatus?.resetTime
          ? Math.ceil((rateLimitStatus.resetTime - Date.now()) / 1000)
          : 60,
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit":
            currentConfig.rateLimitConfig.maxRequests.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": rateLimitStatus?.resetTime
            ? rateLimitStatus.resetTime.toString()
            : (Date.now() + 60000).toString(),
          "Retry-After": rateLimitStatus?.resetTime
            ? Math.ceil(
                (rateLimitStatus.resetTime - Date.now()) / 1000,
              ).toString()
            : "60",
        },
      },
    );
  }

  return null;
}

/**
 * Validate user access to resource
 * @param context File operation context
 * @returns Validation result
 */
function validateUserAccess(
  context: FileOperationContext,
): SecurityValidationResult {
  // Check if user isolation is enabled
  if (!currentConfig.enableUserIsolation) {
    return { isValid: true, errors: [], warnings: [], riskLevel: "low" };
  }

  // Validate user access
  return R2Security.validateUserAccess(context);
}

/**
 * Validate resource path
 * @param resourcePath Resource path
 * @returns Validation result
 */
function validateResourcePath(resourcePath: string): SecurityValidationResult {
  if (!currentConfig.enablePathValidation) {
    return { isValid: true, errors: [], warnings: [], riskLevel: "low" };
  }

  return R2Security.validatePath(resourcePath);
}

/**
 * Check admin override
 * @param userRole User role
 * @param operation Operation type
 * @returns True if admin override is allowed
 */
function checkAdminOverride(userRole: UserRole, operation: string): boolean {
  if (!currentConfig.adminOverrideEnabled || userRole !== UserRole.ADMIN) {
    return false;
  }

  return currentConfig.allowedAdminOperations.includes(operation);
}

/**
 * R2 Access Control Middleware
 * @param request NextRequest object
 * @returns NextResponse or null if request should proceed
 */
export async function r2AccessControlMiddleware(
  request: NextRequest,
): Promise<NextResponse | null> {
  // Only apply to R2 API routes
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/r2/")) {
    return null;
  }

  try {
    // Get user session - for server sessions, check if session cookie exists
    // The actual session validation is done by the API routes
    let userId: string | undefined;
    let userRole: UserRole | undefined = UserRole.USER;

    // Check for session cookie - for server sessions we can't decode in middleware
    userId = getUserIdFromCookie(request);

    // Check if user is authenticated
    if (!userId) {
      const response = NextResponse.json(
        { error: "Unauthenticated", message: "Authentication required" },
        { status: 401 },
      );
      return applySecurityHeaders(response);
    }

    console.log(
      "[R2_ACCESS_CONTROL] Session cookie found, allowing request through:",
      {
        userId,
        pathname: new URL(request.url).pathname,
      },
    );

    // Create file operation context
    // Note: userRole will be validated by the API route
    const context = createFileOperationContext(
      request,
      userId,
      userRole || UserRole.USER,
    );

    console.log("[R2_ACCESS_CONTROL] Created context:", {
      userId: context.userId,
      operation: context.operation,
      resourcePath: context.resourcePath,
      isAdmin: context.isAdmin,
    });

    // Handle rate limiting
    const rateLimitResponse = await handleRateLimiting(request, userId);
    if (rateLimitResponse) {
      // Log rate limit exceeded
      if (currentConfig.enableAuditLogging) {
        R2AuditLogger.log(context, "blocked", "Rate limit exceeded");
      }
      return applySecurityHeaders(rateLimitResponse);
    }

    // Validate resource path - skip for endpoints that don't require it
    const url = new URL(request.url);
    const skipPathValidation = [
      "/api/r2/generate-upload-url",
      "/api/r2/user/storage-stats",
      "/api/r2/user/files",
      "/api/r2/upload-with-resolution",
      "/api/r2/upload-batch",
      "/api/r2/folder-recovery",
      "/api/r2/conflicts",
      "/api/r2/manager",
    ].some((path) => url.pathname.startsWith(path));

    console.log(
      "[R2_ACCESS_CONTROL] Skip path validation:",
      skipPathValidation,
    );

    if (!skipPathValidation) {
      const pathValidation = validateResourcePath(context.resourcePath);
      console.log("[R2_ACCESS_CONTROL] Path validation result:", {
        isValid: pathValidation.isValid,
        errors: pathValidation.errors,
        warnings: pathValidation.warnings,
        riskLevel: pathValidation.riskLevel,
      });

      if (!pathValidation.isValid) {
        const response = NextResponse.json(
          {
            error: "Invalid resource path",
            message: pathValidation.errors.join(", "),
            riskLevel: pathValidation.riskLevel,
          },
          { status: 400 },
        );

        // Log path validation failure
        if (currentConfig.enableAuditLogging) {
          R2AuditLogger.log(
            context,
            "blocked",
            `Invalid resource path: ${pathValidation.errors.join(", ")}`,
          );
        }

        return applySecurityHeaders(response);
      }
    }

    // Validate user access - only for operations that require resource path validation
    console.log("[R2_ACCESS_CONTROL] Validating user access...");

    // Skip resource path validation for endpoints that don't require it
    const requestUrl2 = new URL(request.url);
    const skipResourceValidation = [
      "/api/r2/generate-upload-url",
      "/api/r2/user/storage-stats",
      "/api/r2/user/files",
      "/api/r2/upload-with-resolution",
      "/api/r2/upload-batch",
      "/api/r2/folder-recovery",
      "/api/r2/conflicts",
      "/api/r2/manager",
    ].some((path) => requestUrl2.pathname.startsWith(path));

    console.log(
      "[R2_ACCESS_CONTROL] Skip resource validation:",
      skipResourceValidation,
    );

    let accessValidation: SecurityValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      riskLevel: "low",
    };

    if (!skipResourceValidation) {
      accessValidation = validateUserAccess(context);
    }

    console.log("[R2_ACCESS_CONTROL] Access validation result:", {
      isValid: accessValidation.isValid,
      errors: accessValidation.errors,
      warnings: accessValidation.warnings,
      riskLevel: accessValidation.riskLevel,
    });

    if (!accessValidation.isValid) {
      // Check for admin override
      if (checkAdminOverride(userRole || UserRole.USER, context.operation)) {
        // Log admin override
        if (currentConfig.enableAuditLogging) {
          R2AuditLogger.log(context, "success", undefined, {
            adminOverride: true,
          });
        }
        return null; // Allow request to proceed
      }

      const response = NextResponse.json(
        {
          error: "Access denied",
          message: accessValidation.errors.join(", "),
          riskLevel: accessValidation.riskLevel,
        },
        { status: 403 },
      );

      // Log access denied
      if (currentConfig.enableAuditLogging) {
        R2AuditLogger.log(
          context,
          "blocked",
          `Access denied: ${accessValidation.errors.join(", ")}`,
        );
      }

      return applySecurityHeaders(response);
    }

    // Log successful access
    if (currentConfig.enableAuditLogging) {
      R2AuditLogger.log(context, "success");
    }

    // Process for security monitoring
    if (currentConfig.enableSecurityMonitoring) {
      R2SecurityMonitor.processOperation(context, "success");
    }

    // Add rate limit headers to response - Note: We can't modify the response here
    // since we're returning null to allow the request to proceed
    // The rate limit headers will be added by the API route handlers if needed

    return null; // Allow request to proceed
  } catch (error) {
    console.error("[R2_ACCESS_CONTROL] Error:", error);

    // Create context for logging
    const context: FileOperationContext = {
      userId: "unknown",
      operation: extractOperationType(request),
      resourcePath: extractResourcePath(request),
      userAgent: request.headers.get("user-agent") || undefined,
      ipAddress: getClientIPAddress(request),
    };

    // Log error
    if (currentConfig.enableAuditLogging) {
      R2AuditLogger.log(
        context,
        "failure",
        error instanceof Error ? error.message : "Unknown error",
      );
    }

    // Process for security monitoring
    if (currentConfig.enableSecurityMonitoring) {
      R2SecurityMonitor.processOperation(
        context,
        "failure",
        error instanceof Error ? error.message : "Unknown error",
      );
    }

    const response = NextResponse.json(
      {
        error: "Internal server error",
        message: "An error occurred while processing your request",
      },
      { status: 500 },
    );
    return applySecurityHeaders(response);
  }
}

/**
 * Wrapper function to use with Next.js middleware
 * @param request NextRequest object
 * @returns NextResponse or null
 */
export function withR2AccessControl(
  request: NextRequest,
): Promise<NextResponse | null> {
  return r2AccessControlMiddleware(request);
}
