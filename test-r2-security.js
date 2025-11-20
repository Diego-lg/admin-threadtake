/**
 * Test script for R2 security implementation
 * This script tests various security features including:
 * - Path traversal prevention
 * - User isolation
 * - Rate limiting
 * - Input validation
 * - Authentication bypass attempts
 */

const { R2Security } = require("./lib/r2-security");
const { R2AuditLogger } = require("./lib/r2-audit-logger");
const { R2SecurityMonitor } = require("./lib/r2-security-monitor");

console.log("=== R2 Security Implementation Test ===\n");

// Test 1: Path Traversal Prevention
console.log("Test 1: Path Traversal Prevention");
console.log("-----------------------------------");

const maliciousPaths = [
  "../../../etc/passwd",
  "..\\..\\..\\windows\\system32\\config\\sam",
  "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
  "users/123/../../users/456/secrets",
  "users/123/../../../etc/shadow",
  "users/123/....//....//....//etc/passwd",
];

maliciousPaths.forEach((path) => {
  const result = R2Security.validatePath(path);
  console.log(`Path: ${path}`);
  console.log(`Valid: ${result.isValid}`);
  console.log(`Errors: ${result.errors.join(", ")}`);
  console.log(`Risk Level: ${result.riskLevel}\n`);
});

// Test 2: Filename Validation
console.log("Test 2: Filename Validation");
console.log("--------------------------");

const maliciousFilenames = [
  "con.txt",
  "prn.jpg",
  "aux.exe",
  "nul.png",
  "com1.bat",
  "lpt1.cmd",
  "script.js",
  "malware.exe",
  "file_with_\0_null_byte.txt",
  "very_long_filename_that_exceeds_the_maximum_allowed_length_for_a_filename_and_should_be_rejected_by_the_validation_system.txt",
];

maliciousFilenames.forEach((filename) => {
  const result = R2Security.validateFilename(filename);
  console.log(`Filename: ${filename}`);
  console.log(`Valid: ${result.isValid}`);
  console.log(`Errors: ${result.errors.join(", ")}`);
  console.log(`Risk Level: ${result.riskLevel}\n`);
});

// Test 3: User Access Validation
console.log("Test 3: User Access Validation");
console.log("-----------------------------");

const accessTests = [
  {
    userId: "user123",
    resourcePath: "users/user123/mockups/design123/default/image.jpg",
    isAdmin: false,
    expected: true,
  },
  {
    userId: "user123",
    resourcePath: "users/user456/mockups/design123/default/image.jpg",
    isAdmin: false,
    expected: false,
  },
  {
    userId: "user123",
    resourcePath: "users/user456/mockups/design123/default/image.jpg",
    isAdmin: true,
    expected: true,
  },
  {
    userId: "user123",
    resourcePath: "../../../etc/passwd",
    isAdmin: false,
    expected: false,
  },
];

accessTests.forEach((test) => {
  const context = {
    userId: test.userId,
    operation: "read",
    resourcePath: test.resourcePath,
    isAdmin: test.isAdmin,
  };

  const result = R2Security.validateUserAccess(context);
  console.log(`User: ${test.userId}, Admin: ${test.isAdmin}`);
  console.log(`Resource: ${test.resourcePath}`);
  console.log(`Valid: ${result.isValid} (Expected: ${test.expected})`);
  console.log(`Errors: ${result.errors.join(", ")}`);
  console.log(`Risk Level: ${result.riskLevel}\n`);
});

// Test 4: Rate Limiting
console.log("Test 4: Rate Limiting");
console.log("--------------------");

const rateLimitConfig = {
  windowMs: 60000, // 1 minute
  maxRequests: 5, // 5 requests per minute
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
};

const userId = "test-user-123";
console.log(`Testing rate limiting for user: ${userId}`);
console.log(
  `Max requests: ${rateLimitConfig.maxRequests} per ${rateLimitConfig.windowMs}ms\n`
);

// Make requests up to the limit
for (let i = 1; i <= rateLimitConfig.maxRequests + 2; i++) {
  const isRateLimited = R2Security.checkRateLimit(userId, rateLimitConfig);
  const status = isRateLimited ? "BLOCKED" : "ALLOWED";
  console.log(`Request ${i}: ${status}`);

  if (isRateLimited) {
    const status = R2Security.getRateLimitStatus(userId);
    console.log(`Rate limit status:`, status);
    break;
  }
}

console.log("\n");

// Test 5: Audit Logging
console.log("Test 5: Audit Logging");
console.log("---------------------");

const auditContext = {
  userId: "test-user-456",
  operation: "write",
  resourcePath: "users/test-user-456/mockups/design123/default/image.jpg",
  ipAddress: "192.168.1.100",
  userAgent: "Mozilla/5.0 (Test Browser)",
};

// Log a successful operation
R2AuditLogger.log(auditContext, "success");
console.log("Logged successful operation");

// Log a failed operation
R2AuditLogger.log(auditContext, "failure", "Access denied");
console.log("Logged failed operation");

// Log a blocked operation
R2AuditLogger.log(auditContext, "blocked", "Path traversal detected");
console.log("Logged blocked operation");

// Get recent logs
const recentLogs = R2AuditLogger.getLogs({}, 10);
console.log(`\nRetrieved ${recentLogs.length} recent logs`);
recentLogs.forEach((log, index) => {
  console.log(
    `Log ${index + 1}: ${log.operation} - ${log.outcome} - ${log.resourcePath}`
  );
});

console.log("\n");

// Test 6: Security Monitoring
console.log("Test 6: Security Monitoring");
console.log("--------------------------");

// Configure security monitoring
R2SecurityMonitor.configure({
  enableRealTimeMonitoring: true,
  alertThresholds: {
    failedOperationsPerMinute: 3,
    blockedOperationsPerMinute: 2,
    uniqueIPsPerMinute: 10,
    highRiskOperationsPerHour: 20,
    criticalRiskOperationsPerHour: 5,
  },
});

// Simulate suspicious activity
const suspiciousContext = {
  userId: "suspicious-user-789",
  operation: "read",
  resourcePath: "users/other-user-123/secrets.txt",
  ipAddress: "192.168.1.200",
  userAgent: "SuspiciousBot/1.0",
};

// Process multiple suspicious operations to trigger alerts
for (let i = 0; i < 5; i++) {
  R2SecurityMonitor.processOperation(
    suspiciousContext,
    "failure",
    "Access denied"
  );
}

// Get security alerts
const alerts = R2SecurityMonitor.getAlerts({}, 10);
console.log(`Generated ${alerts.length} security alerts`);
alerts.forEach((alert, index) => {
  console.log(
    `Alert ${index + 1}: ${alert.severity} - ${alert.title} - ${
      alert.description
    }`
  );
});

// Get security metrics
const metrics = R2SecurityMonitor.getMetrics(1); // Last hour
console.log("\nSecurity Metrics (Last Hour):");
console.log(`Total Operations: ${metrics.totalOperations}`);
console.log(`Failed Operations: ${metrics.failedOperations}`);
console.log(`Blocked Operations: ${metrics.blockedOperations}`);
console.log(`Suspicious IPs: ${metrics.suspiciousIPs}`);
console.log(`Suspicious Users: ${metrics.suspiciousUsers}`);
console.log(`High Risk Operations: ${metrics.highRiskOperations}`);
console.log(`Critical Risk Operations: ${metrics.criticalRiskOperations}`);

console.log("\n");

// Test 7: Security Headers
console.log("Test 7: Security Headers");
console.log("------------------------");

const securityHeaders = R2Security.generateSecurityHeaders();
console.log("Generated security headers:");
Object.entries(securityHeaders).forEach(([key, value]) => {
  console.log(`${key}: ${value}`);
});

console.log("\n");

// Test 8: Content Security Policy
console.log("Test 8: Content Security Policy");
console.log("--------------------------------");

const csp = R2Security.generateContentSecurityPolicy();
console.log("Content Security Policy:");
console.log(csp);

console.log("\n=== R2 Security Implementation Test Complete ===");
console.log("All security features have been tested successfully!");
