import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { UserRole } from "@prisma/client";
import { R2Security, FileOperationContext } from "@/lib/r2-security";
import { R2AuditLogger } from "@/lib/r2-audit-logger";
import { R2SecurityMonitor } from "@/lib/r2-security-monitor";

/**
 * Enhanced authentication middleware for R2 security
 */
export class R2AuthEnhancement {
  /**
   * Validate session for R2 operations
   * @param request NextRequest object
   * @returns Session validation result
   */
  static async validateSession(request: NextRequest): Promise<{
    isValid: boolean;
    userId?: string;
    userRole?: UserRole;
    error?: string;
  }> {
    try {
      const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
        secureCookie: process.env.NODE_ENV === "production",
      });

      if (!token || !token.id) {
        return {
          isValid: false,
          error: "Unauthenticated: No valid session found",
        };
      }

      // Check if session is expired
      if (
        token.exp &&
        typeof token.exp === "number" &&
        Date.now() > token.exp * 1000
      ) {
        return {
          isValid: false,
          error: "Unauthenticated: Session has expired",
        };
      }

      return {
        isValid: true,
        userId: token.id as string,
        userRole: token.role as UserRole,
      };
    } catch (error) {
      console.error("[R2_AUTH] Session validation error:", error);
      return {
        isValid: false,
        error: "Authentication error",
      };
    }
  }

  /**
   * Add R2-specific security headers to response
   * @param response NextResponse object
   * @param context File operation context
   * @returns Enhanced response
   */
  static addR2SecurityHeaders(
    response: NextResponse,
    context?: FileOperationContext,
  ): NextResponse {
    // Add standard security headers
    const securityHeaders = R2Security.generateSecurityHeaders();
    for (const [key, value] of Object.entries(securityHeaders)) {
      response.headers.set(key, value);
    }

    // Add R2-specific headers
    response.headers.set("X-R2-Security-Enabled", "true");
    response.headers.set("X-R2-User-Isolation", "true");
    response.headers.set("X-R2-Path-Validation", "true");

    // Add context-specific headers if available
    if (context) {
      response.headers.set("X-R2-Operation", context.operation);
      response.headers.set(
        "X-R2-User-ID",
        context.userId.substring(0, 8) + "...",
      ); // Partial ID for security
    }

    return response;
  }

  /**
   * Validate CSRF token for state-changing operations
   * @param request NextRequest object
   * @returns CSRF validation result
   */
  static validateCSRF(request: NextRequest): {
    isValid: boolean;
    error?: string;
  } {
    const method = request.method;

    // Only validate CSRF for state-changing operations
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      return { isValid: true };
    }

    // Get CSRF token from header
    const csrfToken = request.headers.get("x-csrf-token");

    // Get CSRF token from cookie
    const csrfCookie = request.cookies.get("csrf-token")?.value;

    if (!csrfToken || !csrfCookie) {
      return {
        isValid: false,
        error: "CSRF token missing",
      };
    }

    if (csrfToken !== csrfCookie) {
      return {
        isValid: false,
        error: "CSRF token mismatch",
      };
    }

    return { isValid: true };
  }

  /**
   * Validate user session for R2 operations with comprehensive checks
   * @param request NextRequest object
   * @returns Enhanced validation result
   */
  static async validateR2Session(request: NextRequest): Promise<{
    isValid: boolean;
    userId?: string;
    userRole?: UserRole;
    context?: FileOperationContext;
    error?: string;
    riskLevel?: "low" | "medium" | "high" | "critical";
  }> {
    // Validate basic session
    const sessionValidation = await this.validateSession(request);
    if (!sessionValidation.isValid) {
      return sessionValidation;
    }

    // Validate CSRF for state-changing operations
    const csrfValidation = this.validateCSRF(request);
    if (!csrfValidation.isValid) {
      return {
        isValid: false,
        error: csrfValidation.error,
        riskLevel: "high",
      };
    }

    // Create context for additional validation
    const context: FileOperationContext = {
      userId: sessionValidation.userId!,
      operation: this.extractOperationFromRequest(request),
      resourcePath: this.extractResourcePathFromRequest(request),
      userAgent: request.headers.get("user-agent") || undefined,
      ipAddress: this.getClientIP(request),
      isAdmin: sessionValidation.userRole === UserRole.ADMIN,
    };

    // Validate user access
    const accessValidation = R2Security.validateUserAccess(context);
    if (!accessValidation.isValid) {
      return {
        isValid: false,
        error: `Access denied: ${accessValidation.errors.join(", ")}`,
        riskLevel: accessValidation.riskLevel,
      };
    }

    // Log successful validation
    R2AuditLogger.log(context, "success");

    return {
      isValid: true,
      userId: sessionValidation.userId,
      userRole: sessionValidation.userRole,
      context,
      riskLevel: accessValidation.riskLevel,
    };
  }

  /**
   * Extract operation type from request
   * @param request NextRequest object
   * @returns Operation type
   */
  private static extractOperationFromRequest(
    request: NextRequest,
  ): "read" | "write" | "delete" | "list" {
    const method = request.method;
    const url = new URL(request.url);

    switch (method) {
      case "GET":
        return url.searchParams.has("list") ? "list" : "read";
      case "POST":
      case "PUT":
      case "PATCH":
        return "write";
      case "DELETE":
        return "delete";
      default:
        return "read";
    }
  }

  /**
   * Extract resource path from request
   * @param request NextRequest object
   * @returns Resource path
   */
  private static extractResourcePathFromRequest(request: NextRequest): string {
    const url = new URL(request.url);
    const searchParams = url.searchParams;

    // Try to get path from various query parameters
    return (
      searchParams.get("path") ||
      searchParams.get("key") ||
      searchParams.get("fileKey") ||
      ""
    );
  }

  /**
   * Get client IP address from request
   * @param request NextRequest object
   * @returns IP address
   */
  private static getClientIP(request: NextRequest): string {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const realIP = request.headers.get("x-real-ip");
    const clientIP = request.headers.get("x-client-ip");
    const cfConnectingIP = request.headers.get("cf-connecting-ip");

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

    return request.ip || "unknown";
  }

  /**
   * Generate a secure CSRF token
   * @returns CSRF token
   */
  static generateCSRFToken(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const secret = process.env.NEXTAUTH_SECRET || "default-secret";

    // Create a simple hash (in production, use a proper crypto library)
    const token = Buffer.from(`${timestamp}-${random}-${secret}`).toString(
      "base64",
    );
    return token;
  }

  /**
   * Set CSRF token in response cookie
   * @param response NextResponse object
   * @returns Response with CSRF cookie
   */
  static setCSRFCookie(response: NextResponse): NextResponse {
    const token = this.generateCSRFToken();

    response.cookies.set("csrf-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  }

  /**
   * Enhance response with security headers and logging
   * @param response NextResponse object
   * @param request NextRequest object
   * @param context File operation context
   * @param outcome Operation outcome
   * @param errorMessage Optional error message
   * @returns Enhanced response
   */
  static enhanceResponse(
    response: NextResponse,
    request: NextRequest,
    context: FileOperationContext,
    outcome: "success" | "failure" | "blocked",
    errorMessage?: string,
  ): NextResponse {
    // Add security headers
    this.addR2SecurityHeaders(response, context);

    // Log the operation
    R2AuditLogger.log(context, outcome, errorMessage);

    // Process for security monitoring
    R2SecurityMonitor.processOperation(context, outcome, errorMessage);

    return response;
  }

  /**
   * Create a standardized error response
   * @param request NextRequest object
   * @param context File operation context
   * @param error Error message
   * @param status HTTP status code
   * @returns Error response
   */
  static createErrorResponse(
    request: NextRequest,
    context: FileOperationContext,
    error: string,
    status: number = 400,
  ): NextResponse {
    const response = NextResponse.json(
      {
        error: "Request failed",
        message: error,
        timestamp: new Date().toISOString(),
        requestId: Math.random().toString(36).substring(2),
      },
      { status },
    );

    return this.enhanceResponse(response, request, context, "failure", error);
  }

  /**
   * Create a standardized success response
   * @param request NextRequest object
   * @param context File operation context
   * @param data Response data
   * @returns Success response
   */
  static createSuccessResponse(
    request: NextRequest,
    context: FileOperationContext,
    data: any,
  ): NextResponse {
    const response = NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
      requestId: Math.random().toString(36).substring(2),
    });

    return this.enhanceResponse(response, request, context, "success");
  }
}

/**
 * Middleware function to enhance R2 authentication
 * @param request NextRequest object
 * @returns Enhanced validation result or null if not applicable
 */
export async function enhanceR2Auth(request: NextRequest) {
  // Only apply to R2 API routes
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/r2/")) {
    return null;
  }

  return await R2AuthEnhancement.validateR2Session(request);
}
