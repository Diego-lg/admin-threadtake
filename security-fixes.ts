/**
 * Security fixes for the identified issues
 * This file contains the fixes for the overly aggressive security monitoring
 * and resource path extraction problems
 */

import { R2SecurityMonitor } from "./lib/r2-security-monitor";
import {
  R2AccessControlConfig,
  configureR2AccessControl,
} from "./middleware/r2-access-control";
import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";

/**
 * Apply security configuration fixes
 */
export function applySecurityFixes(): void {
  console.log("[SECURITY_FIXES] Applying security configuration fixes...");

  // 1. Fix overly aggressive security monitoring thresholds
  const updatedConfig = {
    enableRealTimeMonitoring: true,
    alertThresholds: {
      failedOperationsPerMinute: 50, // Increased from 10
      blockedOperationsPerMinute: 20, // Increased from 5
      uniqueIPsPerMinute: 50, // Increased from 20
      highRiskOperationsPerHour: 100, // Increased from 50
      criticalRiskOperationsPerHour: 25, // Increased from 10
    },
    suspiciousPatterns: {
      rapidFileAccess: 200, // Increased from 100
      unusualFileTypes: [".exe", ".bat", ".cmd", ".scr", ".vbs", ".php"], // Removed .js as it's common
      unusualAccessTimes: { start: 1, end: 4 }, // Changed from 2-5 to 1-4
      crossUserAccessAttempts: 5, // Increased from 3
    },
    notificationChannels: {
      email: false,
      webhook: false,
      console: true,
    },
  };

  R2SecurityMonitor.configure(updatedConfig);
  console.log("[SECURITY_FIXES] Updated security monitoring thresholds");

  // 2. Fix R2 access control configuration
  const accessControlConfig: Partial<R2AccessControlConfig> = {
    enableRateLimiting: true,
    rateLimitConfig: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 200, // Increased from 100
      skipSuccessfulRequests: true, // Skip successful requests from rate limiting
      skipFailedRequests: false,
    },
  };

  configureR2AccessControl(accessControlConfig);
  console.log("[SECURITY_FIXES] Updated R2 access control rate limits");

  console.log("[SECURITY_FIXES] All security fixes applied successfully");
}

/**
 * Create a diagnostic endpoint to check current security status
 */
export async function getSecurityDiagnostics(): Promise<{
  timestamp: Date;
  securityConfig: any;
  recentAlerts: any;
  recommendations: string[];
}> {
  const metrics = R2SecurityMonitor.getMetrics(1); // Last hour
  const alerts = R2SecurityMonitor.getAlerts({}, 10); // Last 10 alerts

  const recommendations: string[] = [];

  // Analyze current state and provide recommendations
  if (metrics.failedOperations > 20) {
    recommendations.push(
      "High number of failed operations detected - check authentication"
    );
  }

  if (metrics.blockedOperations > 10) {
    recommendations.push(
      "High number of blocked operations - check security policies"
    );
  }

  if (metrics.highRiskOperations > 5) {
    recommendations.push(
      "Multiple high-risk operations - review user activity"
    );
  }

  return {
    timestamp: new Date(),
    securityConfig: {
      thresholds: {
        failedOpsPerMin: 50,
        blockedOpsPerMin: 20,
        maxRequestsPerMin: 200,
      },
    },
    recentAlerts: alerts.map((alert) => ({
      id: alert.id,
      severity: alert.severity,
      type: alert.type,
      title: alert.title,
      timestamp: alert.timestamp,
    })),
    recommendations,
  };
}

/**
 * Fix for the resource path extraction issue
 * This should be applied to the extractResourcePath function
 */
export function fixResourcePathExtraction(request: NextRequest): string {
  const url = new URL(request.url);
  const pathname = url.pathname;

  console.log("[FIXED_RESOURCE_PATH] extractResourcePath:", {
    pathname,
    search: url.search,
    method: request.method,
  });

  // Extract resource path from URL
  const searchParams = url.searchParams;
  const pathParam =
    searchParams.get("path") ||
    searchParams.get("key") ||
    searchParams.get("fileKey");

  if (pathParam) {
    console.log("[FIXED_RESOURCE_PATH] Found pathParam:", pathParam);
    return pathParam;
  }

  // Special handling for user files endpoints
  if (
    pathname === "/api/r2/user/files" ||
    pathname.startsWith("/api/r2/user/files/")
  ) {
    console.log(
      "[FIXED_RESOURCE_PATH] User files endpoint detected, returning user files path"
    );
    return "user-files";
  }

  // Try to extract from pathname
  const pathParts = pathname.split("/");
  const r2Index = pathParts.indexOf("r2");
  console.log(
    "[FIXED_RESOURCE_PATH] Path parts:",
    pathParts,
    "r2Index:",
    r2Index
  );

  if (r2Index !== -1 && pathParts.length > r2Index + 3) {
    const extractedPath = pathParts.slice(r2Index + 3).join("/");
    console.log(
      "[FIXED_RESOURCE_PATH] Extracted path from pathname:",
      extractedPath
    );
    return extractedPath;
  }

  console.log(
    "[FIXED_RESOURCE_PATH] No resource path found, returning empty string"
  );
  return "";
}

/**
 * Enhanced token validation with better error handling
 */
export async function validateTokenWithRetry(request: NextRequest): Promise<{
  valid: boolean;
  token?: any;
  error?: string;
  needsRefresh?: boolean;
}> {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie: process.env.NODE_ENV === "production",
    });

    if (!token || !token.id) {
      return {
        valid: false,
        error: "No valid token found",
        needsRefresh: true,
      };
    }

    // Check if access token is expired
    const expiryTime = token.accessTokenExpiresAt as number;
    if (expiryTime && Date.now() > expiryTime) {
      console.log(
        "[TOKEN_VALIDATION] Access token expired, attempting refresh"
      );
      return {
        valid: false,
        error: "Access token expired",
        needsRefresh: true,
        token, // Return token for potential refresh
      };
    }

    return {
      valid: true,
      token,
    };
  } catch (error: any) {
    console.error("[TOKEN_VALIDATION] Error validating token:", error);
    return {
      valid: false,
      error: error.message,
      needsRefresh: true,
    };
  }
}

/**
 * Apply all fixes at startup
 */
export function initializeSecurityFixes(): void {
  console.log("[SECURITY_FIXES] Initializing security fixes...");

  // Apply configuration fixes
  applySecurityFixes();

  // Add error handling for uncaught exceptions
  process.on("uncaughtException", (error) => {
    console.error("[SECURITY_FIXES] Uncaught exception:", error);
    // Don't crash the server, log and continue
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error(
      "[SECURITY_FIXES] Unhandled rejection at:",
      promise,
      "reason:",
      reason
    );
    // Don't crash the server, log and continue
  });

  console.log("[SECURITY_FIXES] Security fixes initialized successfully");
}
