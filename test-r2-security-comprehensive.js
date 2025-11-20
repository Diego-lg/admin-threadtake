/**
 * Comprehensive R2 Security Validation Tests
 *
 * This script thoroughly tests the security implementation of the R2 user-centric storage:
 * - User isolation enforcement
 * - Path traversal attack prevention
 * - Access control mechanisms
 * - Authentication requirements
 * - Input validation and sanitization
 * - Rate limiting effectiveness
 * - Audit logging completeness
 * - Security monitoring and alerting
 *
 * Run with: node test-r2-security-comprehensive.js
 */

const { PrismaClient } = require("@prisma/client");
const { R2Security } = require("./lib/r2-security");
const { R2AuditLogger } = require("./lib/r2-audit-logger");
const { R2SecurityMonitor } = require("./lib/r2-security-monitor");
const { UserFolderPaths } = require("./lib/r2-user-storage");

class R2SecurityValidator {
  constructor() {
    this.prisma = new PrismaClient();
    this.testResults = [];
    this.securityIncidents = [];
    this.testUsers = [];
  }

  /**
   * Log security test result
   */
  logSecurityTest(
    testName,
    passed,
    message,
    details = null,
    severity = "HIGH"
  ) {
    const result = {
      testName,
      passed,
      message,
      details,
      severity,
      timestamp: new Date().toISOString(),
    };
    this.testResults.push(result);

    const status = passed ? "✅ PASS" : "❌ FAIL";
    const severityIcon =
      severity === "CRITICAL" ? "🔴" : severity === "HIGH" ? "🟠" : "🟡";
    console.log(`${status} ${severityIcon} ${testName}: ${message}`);

    if (!passed) {
      this.securityIncidents.push(result);
      console.log("   Details:", JSON.stringify(details, null, 2));
    }
  }

  /**
   * Create test users for security testing
   */
  async createTestUsers() {
    console.log("\n👥 Creating test users for security validation...");

    try {
      const regularUser = await this.prisma.user.create({
        data: {
          email: "security-test-user@example.com",
          name: "Security Test User",
          role: "USER",
        },
      });

      const adminUser = await this.prisma.user.create({
        data: {
          email: "security-test-admin@example.com",
          name: "Security Test Admin",
          role: "ADMIN",
        },
      });

      this.testUsers.push({ user: regularUser, type: "regular" });
      this.testUsers.push({ user: adminUser, type: "admin" });

      this.logSecurityTest(
        "Test user creation",
        true,
        "Successfully created test users",
        { regularUserId: regularUser.id, adminUserId: adminUser.id }
      );
    } catch (error) {
      this.logSecurityTest(
        "Test user creation",
        false,
        `Failed to create test users: ${error.message}`,
        { error: error.stack },
        "CRITICAL"
      );
    }
  }

  /**
   * Test 1: Path Traversal Attack Prevention
   */
  async testPathTraversalPrevention() {
    console.log("\n🔍 Test 1: Path Traversal Attack Prevention");

    const maliciousPaths = [
      // Basic path traversal
      "../../../etc/passwd",
      "..\\..\\..\\windows\\system32\\config\\sam",

      // URL encoded path traversal
      "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
      "%2e%2e%5c%2e%2e%5c%2e%2e%5cwindows%5csystem32%5cconfig%5csam",

      // Double encoding
      "%252e%252e%252f%252e%252e%252f%252e%252e%252fetc%252fpasswd",

      // Mixed path traversal
      "users/123/../../users/456/secrets",
      "users/123/../../../etc/shadow",
      "users/123/....//....//....//etc/passwd",

      // Unicode and special characters
      "..%c0%af..%c0%af..%c0%afetc%c0%afpasswd",
      "..%c1%9c..%c1%9c..%c1%9cetc%c1%9cpasswd",

      // Null byte injection
      "../../../etc/passwd%00.jpg",
      "users/123/file.txt%00.png",

      // Long path traversal
      "../".repeat(50) + "etc/passwd",
      "..\\".repeat(50) + "windows\\system32\\config\\sam",

      // Alternative path separators
      "../../../etc/passwd",
      "..\\\\..\\\\..\\\\windows\\\\system32\\\\config\\\\sam",
    ];

    let blockedPaths = 0;
    let totalPaths = maliciousPaths.length;

    for (const path of maliciousPaths) {
      const validation = R2Security.validatePath(path);

      if (!validation.isValid) {
        blockedPaths++;
      } else {
        this.logSecurityTest(
          `Path traversal prevention failed for: ${path}`,
          false,
          "Malicious path was not blocked",
          { path, validation },
          "CRITICAL"
        );
      }
    }

    const blockRate = (blockedPaths / totalPaths) * 100;
    this.logSecurityTest(
      "Path traversal attack prevention",
      blockRate >= 95,
      `Blocked ${blockedPaths}/${totalPaths} malicious paths (${blockRate.toFixed(
        1
      )}% block rate)`,
      {
        blockedPaths,
        totalPaths,
        blockRate,
        threshold: "95% minimum required",
      },
      blockRate < 95 ? "CRITICAL" : "HIGH"
    );
  }

  /**
   * Test 2: User Isolation Enforcement
   */
  async testUserIsolationEnforcement() {
    console.log("\n🔒 Test 2: User Isolation Enforcement");

    const regularUser = this.testUsers.find((u) => u.type === "regular")?.user;
    const adminUser = this.testUsers.find((u) => u.type === "admin")?.user;

    if (!regularUser || !adminUser) {
      this.logSecurityTest(
        "User isolation enforcement",
        false,
        "Test users not available",
        {},
        "CRITICAL"
      );
      return;
    }

    const isolationTests = [
      {
        name: "Regular user accessing own files",
        userId: regularUser.id,
        resourcePath: `users/${regularUser.id}/mockups/design123/default/image.jpg`,
        isAdmin: false,
        shouldAllow: true,
      },
      {
        name: "Regular user accessing other user's files",
        userId: regularUser.id,
        resourcePath: `users/${adminUser.id}/mockups/admin-design/default/image.jpg`,
        isAdmin: false,
        shouldAllow: false,
      },
      {
        name: "Admin user accessing other user's files",
        userId: regularUser.id,
        resourcePath: `users/${adminUser.id}/mockups/admin-design/default/image.jpg`,
        isAdmin: true,
        shouldAllow: true,
      },
      {
        name: "Regular user accessing system files",
        userId: regularUser.id,
        resourcePath: "system/config/database.json",
        isAdmin: false,
        shouldAllow: false,
      },
      {
        name: "Regular user accessing root files",
        userId: regularUser.id,
        resourcePath: "root/secrets.txt",
        isAdmin: false,
        shouldAllow: false,
      },
      {
        name: "Regular user accessing malformed user path",
        userId: regularUser.id,
        resourcePath: `users/${regularUser.id}/../../../etc/passwd`,
        isAdmin: false,
        shouldAllow: false,
      },
    ];

    let passedTests = 0;
    let totalTests = isolationTests.length;

    for (const test of isolationTests) {
      const context = {
        userId: test.userId,
        operation: "read",
        resourcePath: test.resourcePath,
        isAdmin: test.isAdmin,
      };

      const validation = R2Security.validateUserAccess(context);
      const testPassed = validation.isValid === test.shouldAllow;

      if (testPassed) {
        passedTests++;
      } else {
        this.logSecurityTest(
          `User isolation test failed: ${test.name}`,
          false,
          `Expected ${test.shouldAllow ? "allow" : "deny"}, got ${
            validation.isValid ? "allow" : "deny"
          }`,
          { test, validation },
          "CRITICAL"
        );
      }
    }

    const successRate = (passedTests / totalTests) * 100;
    this.logSecurityTest(
      "User isolation enforcement",
      successRate >= 95,
      `Passed ${passedTests}/${totalTests} isolation tests (${successRate.toFixed(
        1
      )}% success rate)`,
      {
        passedTests,
        totalTests,
        successRate,
        threshold: "95% minimum required",
      },
      successRate < 95 ? "CRITICAL" : "HIGH"
    );
  }

  /**
   * Test 3: Filename Validation and Sanitization
   */
  async testFilenameValidation() {
    console.log("\n🏷️ Test 3: Filename Validation and Sanitization");

    const maliciousFilenames = [
      // Windows reserved names
      "con.txt",
      "prn.jpg",
      "aux.exe",
      "nul.png",
      "com1.bat",
      "com2.cmd",
      "lpt1.txt",
      "lpt2.jpg",

      // Dangerous extensions
      "script.js",
      "malware.exe",
      "virus.bat",
      "trojan.cmd",
      "backdoor.scr",
      "rootkit.pif",

      // Special characters
      "file_with_\0_null_byte.txt",
      "file_with_\r_carriage_return.txt",
      "file_with_\n_newline.txt",
      "file_with_\t_tab.txt",

      // Very long filename
      "a".repeat(300) + ".txt",

      // Path-like filenames
      "path/like/filename.txt",
      "path\\like\\filename.jpg",
      "absolute/path/filename.png",

      // Hidden files and system files
      ".hidden",
      ".htaccess",
      "web.config",
      ".env",

      // SQL injection attempts
      "file'; DROP TABLE users; --.txt",
      "file' OR '1'='1.jpg",

      // XSS attempts
      "<script>alert('xss')</script>.jpg",
      "javascript:alert('xss').png",

      // Unicode attacks
      "‮file.txt", // Right-to-left override
      "file\u202etxt", // Unicode character
    ];

    let blockedFilenames = 0;
    let totalFilenames = maliciousFilenames.length;

    for (const filename of maliciousFilenames) {
      const validation = R2Security.validateFilename(filename);

      if (!validation.isValid) {
        blockedFilenames++;
      } else {
        this.logSecurityTest(
          `Filename validation failed for: ${filename}`,
          false,
          "Malicious filename was not blocked",
          { filename, validation },
          "HIGH"
        );
      }
    }

    const blockRate = (blockedFilenames / totalFilenames) * 100;
    this.logSecurityTest(
      "Filename validation and sanitization",
      blockRate >= 90,
      `Blocked ${blockedFilenames}/${totalFilenames} malicious filenames (${blockRate.toFixed(
        1
      )}% block rate)`,
      {
        blockedFilenames,
        totalFilenames,
        blockRate,
        threshold: "90% minimum required",
      },
      blockRate < 90 ? "HIGH" : "MEDIUM"
    );
  }

  /**
   * Test 4: Rate Limiting Effectiveness
   */
  async testRateLimitingEffectiveness() {
    console.log("\n⏱️ Test 4: Rate Limiting Effectiveness");

    const rateLimitConfig = {
      windowMs: 60000, // 1 minute
      maxRequests: 5, // 5 requests per minute
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
    };

    const testUserId = "rate-limit-test-user";

    // Test normal usage (within limits)
    let allowedRequests = 0;
    for (let i = 1; i <= rateLimitConfig.maxRequests; i++) {
      const isRateLimited = R2Security.checkRateLimit(
        testUserId,
        rateLimitConfig
      );
      if (!isRateLimited) {
        allowedRequests++;
      }
    }

    this.logSecurityTest(
      "Rate limiting - normal usage",
      allowedRequests === rateLimitConfig.maxRequests,
      `Allowed ${allowedRequests}/${rateLimitConfig.maxRequests} requests within limit`,
      { allowedRequests, expectedRequests: rateLimitConfig.maxRequests },
      "MEDIUM"
    );

    // Test rate limit exceeded
    let blockedRequests = 0;
    for (let i = 0; i < 5; i++) {
      const isRateLimited = R2Security.checkRateLimit(
        testUserId,
        rateLimitConfig
      );
      if (isRateLimited) {
        blockedRequests++;
      }
    }

    this.logSecurityTest(
      "Rate limiting - exceeded limit",
      blockedRequests >= 3,
      `Blocked ${blockedRequests}/5 requests after limit exceeded`,
      { blockedRequests, totalTested: 5 },
      "HIGH"
    );

    // Test different users are isolated
    const user1Requests = [];
    const user2Requests = [];

    for (let i = 0; i < 10; i++) {
      user1Requests.push(R2Security.checkRateLimit("user1", rateLimitConfig));
      user2Requests.push(R2Security.checkRateLimit("user2", rateLimitConfig));
    }

    const user1Allowed = user1Requests.filter((r) => !r).length;
    const user2Allowed = user2Requests.filter((r) => !r).length;
    const usersIsolated =
      user1Allowed === rateLimitConfig.maxRequests &&
      user2Allowed === rateLimitConfig.maxRequests;

    this.logSecurityTest(
      "Rate limiting - user isolation",
      usersIsolated,
      `Different users have separate rate limits (user1: ${user1Allowed}, user2: ${user2Allowed})`,
      {
        user1Allowed,
        user2Allowed,
        expectedPerUser: rateLimitConfig.maxRequests,
      },
      "MEDIUM"
    );

    // Test rate limit status information
    const rateLimitStatus = R2Security.getRateLimitStatus(testUserId);
    this.logSecurityTest(
      "Rate limiting - status information",
      rateLimitStatus && typeof rateLimitStatus.remaining === "number",
      "Rate limit status provides accurate information",
      rateLimitStatus,
      "LOW"
    );
  }

  /**
   * Test 5: Input Validation and Sanitization
   */
  async testInputValidation() {
    console.log("\n🛡️ Test 5: Input Validation and Sanitization");

    const maliciousInputs = [
      // SQL injection
      "'; DROP TABLE users; --",
      "' OR '1'='1",
      "1'; DELETE FROM R2FileMetadata WHERE '1'='1'; --",

      // XSS
      "<script>alert('xss')</script>",
      "javascript:alert('xss')",
      "<img src=x onerror=alert('xss')>",

      // Command injection
      "; ls -la",
      "| cat /etc/passwd",
      "`whoami`",
      "$(id)",

      // LDAP injection
      "*)(&",
      "*)(|(objectClass=*)",

      // NoSQL injection
      { $ne: "" },
      { $gt: "" },

      // Path injection
      "../../../etc/passwd",
      "..\\..\\..\\windows\\system32\\config\\sam",

      // Buffer overflow attempts
      "A".repeat(10000),
      "%".repeat(5000),
    ];

    let sanitizedInputs = 0;
    let totalInputs = maliciousInputs.length;

    for (const input of maliciousInputs) {
      // Test various input validation functions
      const pathValidation = R2Security.validatePath(input);
      const filenameValidation = R2Security.validateFilename(input);

      let isBlocked = !pathValidation.isValid || !filenameValidation.isValid;

      if (isBlocked) {
        sanitizedInputs++;
      } else {
        // Check if input was properly sanitized
        const sanitized = R2Security.sanitizeInput(input);
        if (sanitized !== input && sanitized.length < input.length) {
          sanitizedInputs++;
        } else {
          this.logSecurityTest(
            `Input validation failed for: ${input.substring(0, 50)}...`,
            false,
            "Malicious input was not properly validated or sanitized",
            {
              input: input.substring(0, 100),
              sanitized: sanitized?.substring(0, 100),
            },
            "HIGH"
          );
        }
      }
    }

    const sanitizationRate = (sanitizedInputs / totalInputs) * 100;
    this.logSecurityTest(
      "Input validation and sanitization",
      sanitizationRate >= 85,
      `Properly handled ${sanitizedInputs}/${totalInputs} malicious inputs (${sanitizationRate.toFixed(
        1
      )}% sanitization rate)`,
      {
        sanitizedInputs,
        totalInputs,
        sanitizationRate,
        threshold: "85% minimum required",
      },
      sanitizationRate < 85 ? "HIGH" : "MEDIUM"
    );
  }

  /**
   * Test 6: Audit Logging Completeness
   */
  async testAuditLoggingCompleteness() {
    console.log("\n📋 Test 6: Audit Logging Completeness");

    const regularUser = this.testUsers.find((u) => u.type === "regular")?.user;

    if (!regularUser) {
      this.logSecurityTest(
        "Audit logging completeness",
        false,
        "Test user not available for audit logging",
        {},
        "MEDIUM"
      );
      return;
    }

    // Clear existing logs for clean testing
    R2AuditLogger.clearLogs();

    const auditEvents = [
      {
        context: {
          userId: regularUser.id,
          operation: "read",
          resourcePath: `users/${regularUser.id}/mockups/test.jpg`,
          ipAddress: "192.168.1.100",
          userAgent: "Test Browser/1.0",
        },
        outcome: "success",
        description: "File read successful",
      },
      {
        context: {
          userId: regularUser.id,
          operation: "write",
          resourcePath: `users/${regularUser.id}/mockups/new.jpg`,
          ipAddress: "192.168.1.100",
          userAgent: "Test Browser/1.0",
        },
        outcome: "failure",
        description: "Access denied",
      },
      {
        context: {
          userId: regularUser.id,
          operation: "delete",
          resourcePath: `users/${regularUser.id}/mockups/delete.jpg`,
          ipAddress: "192.168.1.100",
          userAgent: "Test Browser/1.0",
        },
        outcome: "blocked",
        description: "Path traversal detected",
      },
      {
        context: {
          userId: regularUser.id,
          operation: "admin",
          resourcePath: "system/config",
          ipAddress: "192.168.1.100",
          userAgent: "Test Browser/1.0",
        },
        outcome: "blocked",
        description: "Unauthorized admin access attempt",
      },
    ];

    // Log audit events
    let loggedEvents = 0;
    for (const event of auditEvents) {
      try {
        R2AuditLogger.log(event.context, event.outcome, event.description);
        loggedEvents++;
      } catch (error) {
        this.logSecurityTest(
          `Audit logging failed for event: ${event.context.operation}`,
          false,
          `Failed to log audit event: ${error.message}`,
          { event, error: error.stack },
          "HIGH"
        );
      }
    }

    // Retrieve and validate logs
    const retrievedLogs = R2AuditLogger.getLogs({}, 100);

    // Check log completeness
    const logValidationChecks = {
      hasRequiredFields: true,
      hasTimestamps: true,
      hasUserContext: true,
      hasOperationDetails: true,
      hasOutcome: true,
    };

    for (const log of retrievedLogs) {
      if (!log.timestamp || !log.userId || !log.operation || !log.outcome) {
        logValidationChecks.hasRequiredFields = false;
      }
      if (!log.timestamp) logValidationChecks.hasTimestamps = false;
      if (!log.userId) logValidationChecks.hasUserContext = false;
      if (!log.operation) logValidationChecks.hasOperationDetails = false;
      if (!log.outcome) logValidationChecks.hasOutcome = false;
    }

    const allChecksPassed = Object.values(logValidationChecks).every(
      (check) => check
    );
    const logCompletenessRate =
      (retrievedLogs.length / auditEvents.length) * 100;

    this.logSecurityTest(
      "Audit logging completeness",
      allChecksPassed && logCompletenessRate >= 90,
      `Logged ${loggedEvents}/${auditEvents.length} events, retrieved ${
        retrievedLogs.length
      } logs (${logCompletenessRate.toFixed(1)}% completeness)`,
      {
        loggedEvents,
        totalEvents: auditEvents.length,
        retrievedLogs: retrievedLogs.length,
        logValidationChecks,
        completenessRate: logCompletenessRate,
      },
      !allChecksPassed ? "HIGH" : "MEDIUM"
    );
  }

  /**
   * Test 7: Security Monitoring and Alerting
   */
  async testSecurityMonitoring() {
    console.log("\n🚨 Test 7: Security Monitoring and Alerting");

    // Configure security monitoring
    R2SecurityMonitor.configure({
      enableRealTimeMonitoring: true,
      alertThresholds: {
        failedOperationsPerMinute: 3,
        blockedOperationsPerMinute: 2,
        uniqueIPsPerMinute: 10,
        highRiskOperationsPerHour: 5,
        criticalRiskOperationsPerHour: 2,
      },
    });

    const regularUser = this.testUsers.find((u) => u.type === "regular")?.user;

    if (!regularUser) {
      this.logSecurityTest(
        "Security monitoring",
        false,
        "Test user not available for security monitoring",
        {},
        "MEDIUM"
      );
      return;
    }

    // Clear existing alerts
    R2SecurityMonitor.clearAlerts();

    // Simulate suspicious activity
    const suspiciousActivities = [
      {
        context: {
          userId: regularUser.id,
          operation: "read",
          resourcePath: `users/other-user/secrets.txt`,
          ipAddress: "192.168.1.200",
          userAgent: "SuspiciousBot/1.0",
        },
        outcome: "failure",
        description: "Access denied - cross-user access attempt",
      },
      {
        context: {
          userId: regularUser.id,
          operation: "read",
          resourcePath: "system/config/database.json",
          ipAddress: "192.168.1.200",
          userAgent: "SuspiciousBot/1.0",
        },
        outcome: "blocked",
        description: "Blocked - system access attempt",
      },
      {
        context: {
          userId: regularUser.id,
          operation: "write",
          resourcePath: "../../../etc/passwd",
          ipAddress: "192.168.1.200",
          userAgent: "SuspiciousBot/1.0",
        },
        outcome: "blocked",
        description: "Blocked - path traversal attempt",
      },
      {
        context: {
          userId: regularUser.id,
          operation: "delete",
          resourcePath: `users/${regularUser.id}/../../system/files`,
          ipAddress: "192.168.1.200",
          userAgent: "SuspiciousBot/1.0",
        },
        outcome: "blocked",
        description: "Blocked - malicious path attempt",
      },
      {
        context: {
          userId: regularUser.id,
          operation: "admin",
          resourcePath: "admin/panel/users",
          ipAddress: "192.168.1.200",
          userAgent: "SuspiciousBot/1.0",
        },
        outcome: "failure",
        description: "Failed - unauthorized admin access",
      },
    ];

    // Process suspicious activities
    let processedActivities = 0;
    for (const activity of suspiciousActivities) {
      try {
        R2SecurityMonitor.processOperation(
          activity.context,
          activity.outcome,
          activity.description
        );
        processedActivities++;
      } catch (error) {
        this.logSecurityTest(
          `Security monitoring failed for activity: ${activity.context.operation}`,
          false,
          `Failed to process security activity: ${error.message}`,
          { activity, error: error.stack },
          "HIGH"
        );
      }
    }

    // Check for generated alerts
    const alerts = R2SecurityMonitor.getAlerts({}, 20);
    const securityMetrics = R2SecurityMonitor.getMetrics(1); // Last hour

    // Validate alert quality
    const alertValidationChecks = {
      hasAlerts: alerts.length > 0,
      hasSeverity: alerts.every((alert) => alert.severity),
      hasTimestamp: alerts.every((alert) => alert.timestamp),
      hasDescription: alerts.every((alert) => alert.description),
      hasContext: alerts.every((alert) => alert.context),
    };

    const allAlertChecksPassed = Object.values(alertValidationChecks).every(
      (check) => check
    );
    const alertGenerationRate = (alerts.length / processedActivities) * 100;

    this.logSecurityTest(
      "Security monitoring and alerting",
      allAlertChecksPassed && alerts.length >= 3,
      `Generated ${
        alerts.length
      } alerts from ${processedActivities} activities (${alertGenerationRate.toFixed(
        1
      )}% alert rate)`,
      {
        processedActivities,
        generatedAlerts: alerts.length,
        alertGenerationRate,
        alertValidationChecks,
        securityMetrics,
      },
      !allAlertChecksPassed ? "HIGH" : "MEDIUM"
    );
  }

  /**
   * Test 8: Authentication and Authorization
   */
  async testAuthenticationAuthorization() {
    console.log("\n🔐 Test 8: Authentication and Authorization");

    const regularUser = this.testUsers.find((u) => u.type === "regular")?.user;
    const adminUser = this.testUsers.find((u) => u.type === "admin")?.user;

    if (!regularUser || !adminUser) {
      this.logSecurityTest(
        "Authentication and authorization",
        false,
        "Test users not available",
        {},
        "CRITICAL"
      );
      return;
    }

    const authTests = [
      {
        name: "Unauthenticated access denied",
        userId: null,
        resourcePath: `users/${regularUser.id}/mockups/test.jpg`,
        isAdmin: false,
        shouldAllow: false,
      },
      {
        name: "Invalid user ID denied",
        userId: "invalid-user-id",
        resourcePath: `users/${regularUser.id}/mockups/test.jpg`,
        isAdmin: false,
        shouldAllow: false,
      },
      {
        name: "Regular user admin access denied",
        userId: regularUser.id,
        resourcePath: "admin/panel/settings",
        isAdmin: false,
        shouldAllow: false,
      },
      {
        name: "Admin user admin access allowed",
        userId: adminUser.id,
        resourcePath: "admin/panel/settings",
        isAdmin: true,
        shouldAllow: true,
      },
      {
        name: "Admin impersonation blocked",
        userId: regularUser.id,
        resourcePath: `users/${adminUser.id}/sensitive-data.txt`,
        isAdmin: false, // Not actually admin
        shouldAllow: false,
      },
    ];

    let passedAuthTests = 0;
    let totalAuthTests = authTests.length;

    for (const test of authTests) {
      const context = {
        userId: test.userId,
        operation: "read",
        resourcePath: test.resourcePath,
        isAdmin: test.isAdmin,
      };

      const validation = R2Security.validateUserAccess(context);
      const testPassed = validation.isValid === test.shouldAllow;

      if (testPassed) {
        passedAuthTests++;
      } else {
        this.logSecurityTest(
          `Auth test failed: ${test.name}`,
          false,
          `Expected ${test.shouldAllow ? "allow" : "deny"}, got ${
            validation.isValid ? "allow" : "deny"
          }`,
          { test, validation },
          test.name.includes("admin") ? "CRITICAL" : "HIGH"
        );
      }
    }

    const authSuccessRate = (passedAuthTests / totalAuthTests) * 100;
    this.logSecurityTest(
      "Authentication and authorization",
      authSuccessRate >= 95,
      `Passed ${passedAuthTests}/${totalAuthTests} auth tests (${authSuccessRate.toFixed(
        1
      )}% success rate)`,
      {
        passedAuthTests,
        totalAuthTests,
        authSuccessRate,
        threshold: "95% minimum required",
      },
      authSuccessRate < 95 ? "CRITICAL" : "HIGH"
    );
  }

  /**
   * Generate security assessment report
   */
  generateSecurityReport() {
    console.log("\n🛡️ R2 Security Assessment Report");
    console.log("==================================");

    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter((t) => t.passed).length;
    const failedTests = totalTests - passedTests;
    const securityScore = ((passedTests / totalTests) * 100).toFixed(1);

    console.log(`\nSecurity Assessment Summary:`);
    console.log(`  Total Security Tests: ${totalTests}`);
    console.log(`  Passed: ${passedTests} ✅`);
    console.log(`  Failed: ${failedTests} ❌`);
    console.log(`  Security Score: ${securityScore}%`);

    if (failedTests > 0) {
      console.log(`\nSecurity Incidents:`);
      this.securityIncidents.forEach((incident) => {
        const severityIcon =
          incident.severity === "CRITICAL"
            ? "🔴"
            : incident.severity === "HIGH"
            ? "🟠"
            : "🟡";
        console.log(
          `  ${severityIcon} ${incident.testName}: ${incident.message}`
        );
      });
    }

    console.log(`\nSecurity Categories:`);
    const categories = {
      "Path Traversal": this.testResults.filter((t) =>
        t.testName.includes("Path traversal")
      ).length,
      "User Isolation": this.testResults.filter((t) =>
        t.testName.includes("isolation")
      ).length,
      "Input Validation": this.testResults.filter(
        (t) =>
          t.testName.includes("validation") ||
          t.testName.includes("sanitization")
      ).length,
      "Rate Limiting": this.testResults.filter((t) =>
        t.testName.includes("Rate limiting")
      ).length,
      "Audit Logging": this.testResults.filter((t) =>
        t.testName.includes("Audit")
      ).length,
      "Security Monitoring": this.testResults.filter((t) =>
        t.testName.includes("monitoring")
      ).length,
      Authentication: this.testResults.filter((t) =>
        t.testName.includes("Authentication")
      ).length,
    };

    Object.entries(categories).forEach(([category, count]) => {
      if (count > 0) {
        const categoryResults = this.testResults.filter((t) =>
          t.testName.toLowerCase().includes(category.toLowerCase())
        );
        const categoryPassed = categoryResults.filter((t) => t.passed).length;
        const categoryRate = ((categoryPassed / count) * 100).toFixed(1);
        console.log(
          `  ${category}: ${categoryPassed}/${count} passed (${categoryRate}%)`
        );
      }
    });

    console.log(`\nSecurity Recommendations:`);

    if (parseFloat(securityScore) >= 95) {
      console.log(
        `  🛡️ Excellent security posture! Implementation is production-ready.`
      );
    } else if (parseFloat(securityScore) >= 85) {
      console.log(
        `  🔧 Good security posture. Address failed tests for production readiness.`
      );
    } else if (parseFloat(securityScore) >= 70) {
      console.log(
        `  ⚠️  Moderate security posture. Significant improvements needed.`
      );
    } else {
      console.log(
        `  🚨 Critical security issues found. Immediate attention required.`
      );
    }

    const criticalIssues = this.securityIncidents.filter(
      (i) => i.severity === "CRITICAL"
    );
    if (criticalIssues.length > 0) {
      console.log(
        `  🔴 ${criticalIssues.length} critical security issues must be resolved immediately.`
      );
    }

    const highIssues = this.securityIncidents.filter(
      (i) => i.severity === "HIGH"
    );
    if (highIssues.length > 0) {
      console.log(
        `  🟠 ${highIssues.length} high-priority security issues should be addressed soon.`
      );
    }

    const report = {
      totalTests,
      passedTests,
      failedTests,
      securityScore: parseFloat(securityScore),
      categories,
      securityIncidents: this.securityIncidents,
      testResults: this.testResults,
      recommendations: {
        overall:
          parseFloat(securityScore) >= 95
            ? "production_ready"
            : parseFloat(securityScore) >= 85
            ? "needs_minor_fixes"
            : parseFloat(securityScore) >= 70
            ? "needs_major_improvements"
            : "critical_issues",
        criticalIssues: criticalIssues.length,
        highIssues: highIssues.length,
      },
    };

    // Save report to file
    const reportPath = "./r2-security-assessment-report.json";
    require("fs").writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(
      `\n📄 Detailed security assessment report saved to: ${reportPath}`
    );

    return report;
  }

  /**
   * Clean up test data
   */
  async cleanup() {
    console.log("\n🧹 Cleaning up security test data...");

    try {
      // Clean up test users
      for (const testUser of this.testUsers) {
        try {
          await this.prisma.user.delete({
            where: { id: testUser.user.id },
          });
        } catch (error) {
          console.log(
            `Warning: Could not delete user ${testUser.user.id}: ${error.message}`
          );
        }
      }

      // Clear audit logs and security alerts
      R2AuditLogger.clearLogs();
      R2SecurityMonitor.clearAlerts();

      console.log("✅ Security test cleanup completed successfully");
    } catch (error) {
      console.log(`❌ Security test cleanup failed: ${error.message}`);
    }
  }

  /**
   * Run all security validation tests
   */
  async runAllSecurityTests() {
    console.log("🔍 Starting Comprehensive R2 Security Validation");
    console.log("===============================================");

    const startTime = Date.now();

    try {
      await this.createTestUsers();
      await this.testPathTraversalPrevention();
      await this.testUserIsolationEnforcement();
      await this.testFilenameValidation();
      await this.testRateLimitingEffectiveness();
      await this.testInputValidation();
      await this.testAuditLoggingCompleteness();
      await this.testSecurityMonitoring();
      await this.testAuthenticationAuthorization();

      const totalDuration = Date.now() - startTime;
      console.log(`\n⏱️ Total security validation time: ${totalDuration}ms`);

      const report = this.generateSecurityReport();

      return report;
    } catch (error) {
      console.error("\n❌ Security validation failed:", error);
      throw error;
    } finally {
      await this.cleanup();
      await this.prisma.$disconnect();
    }
  }
}

// Run the security validation tests
if (require.main === module) {
  const validator = new R2SecurityValidator();
  validator
    .runAllSecurityTests()
    .then((report) => {
      console.log("\n🎉 R2 security validation completed!");
      const criticalIssues = report.securityIncidents.filter(
        (i) => i.severity === "CRITICAL"
      ).length;
      process.exit(criticalIssues > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error("\n💥 R2 security validation failed:", error);
      process.exit(1);
    });
}

module.exports = { R2SecurityValidator };
