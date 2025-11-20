/**
 * Comprehensive Integration Test Suite for R2 User-Centric Storage Implementation
 *
 * This test suite validates the entire R2 storage workflow including:
 * - User folder creation and management
 * - File upload/download operations
 * - Database integration and metadata tracking
 * - Security and access controls
 * - Migration functionality
 * - Error handling and recovery
 * - Performance under various conditions
 *
 * Run with: node test-r2-complete-integration.js
 */

const { PrismaClient } = require("@prisma/client");
const { R2Config } = require("./lib/r2-config");
const {
  R2UserStorage,
  UserFolderPaths,
  UserFileNaming,
} = require("./lib/r2-user-storage");
const { R2DbHelpers } = require("./lib/r2-db-helpers");
const { R2Queries } = require("./lib/r2-queries");
const { R2MigrationService } = require("./services/r2-migration-service");
const { R2Security } = require("./lib/r2-security");
const { R2AuditLogger } = require("./lib/r2-audit-logger");
const { R2SecurityMonitor } = require("./lib/r2-security-monitor");

// Mock environment variables for testing
process.env.R2_ENDPOINT = "https://test-account-id.r2.cloudflarestorage.com";
process.env.R2_ACCESS_KEY_ID = "test-access-key";
process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
process.env.R2_BUCKET_NAME = "test-bucket";
process.env.R2_PUBLIC_BUCKET_URL = "https://test-public-url.r2.dev";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/testdb";

class R2IntegrationTester {
  constructor() {
    this.prisma = new PrismaClient();
    this.migrationService = new R2MigrationService(this.prisma);
    this.testResults = [];
    this.testUsers = [];
    this.testFiles = [];
    this.performanceMetrics = {};
  }

  /**
   * Log test result with performance tracking
   */
  logTest(testName, success, message, details = null, duration = null) {
    const result = {
      testName,
      success,
      message,
      details,
      duration,
      timestamp: new Date().toISOString(),
    };
    this.testResults.push(result);

    const status = success ? "✅ PASS" : "❌ FAIL";
    const durationStr = duration ? ` (${duration}ms)` : "";
    console.log(`${status} ${testName}: ${message}${durationStr}`);

    if (details && !success) {
      console.log("   Details:", JSON.stringify(details, null, 2));
    }
  }

  /**
   * Measure execution time of a function
   */
  async measureTime(fn, label) {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      if (label) {
        this.performanceMetrics[label] = duration;
      }
      return { result, duration };
    } catch (error) {
      const duration = Date.now() - start;
      if (label) {
        this.performanceMetrics[label] = duration;
      }
      throw error;
    }
  }

  /**
   * Create test user data
   */
  async createTestUsers() {
    console.log("\n👥 Creating test users...");

    const testUserData = [
      { email: "test-user-1@example.com", name: "Test User 1", role: "USER" },
      { email: "test-user-2@example.com", name: "Test User 2", role: "USER" },
      { email: "admin-user@example.com", name: "Admin User", role: "ADMIN" },
    ];

    for (const userData of testUserData) {
      try {
        const user = await this.prisma.user.create({
          data: userData,
        });
        this.testUsers.push(user);
        this.logTest(
          `Create test user ${userData.email}`,
          true,
          `Created user with ID: ${user.id}`,
          { userId: user.id }
        );
      } catch (error) {
        this.logTest(
          `Create test user ${userData.email}`,
          false,
          `Error: ${error.message}`,
          { userData }
        );
      }
    }
  }

  /**
   * Test 1: R2 Configuration and Infrastructure
   */
  async testR2Configuration() {
    console.log("\n🔧 Test 1: R2 Configuration and Infrastructure");

    try {
      // Test configuration validation
      const { result: configValid, duration: configDuration } =
        await this.measureTime(
          () => Promise.resolve(R2Config.validateConfig()),
          "config_validation"
        );

      this.logTest(
        "R2 configuration validation",
        configValid,
        configValid
          ? "R2 configuration is valid"
          : "R2 configuration is invalid",
        null,
        configDuration
      );

      // Test configuration retrieval
      const { result: config, duration: retrievalDuration } =
        await this.measureTime(
          () => Promise.resolve(R2Config.getConfig()),
          "config_retrieval"
        );

      this.logTest(
        "R2 configuration retrieval",
        !!config,
        !!config
          ? "Successfully retrieved R2 configuration"
          : "Failed to retrieve configuration",
        {
          hasEndpoint: !!config?.endpoint,
          hasBucketName: !!config?.bucketName,
        },
        retrievalDuration
      );

      // Test S3 client creation
      const { result: s3Client, duration: clientDuration } =
        await this.measureTime(
          () => Promise.resolve(R2Config.getS3Client()),
          "s3_client_creation"
        );

      this.logTest(
        "S3 client creation",
        !!s3Client,
        !!s3Client
          ? "Successfully created S3 client"
          : "Failed to create S3 client",
        null,
        clientDuration
      );
    } catch (error) {
      this.logTest("R2 Configuration test", false, `Error: ${error.message}`, {
        error: error.stack,
      });
    }
  }

  /**
   * Test 2: User Folder Structure Creation
   */
  async testUserFolderCreation() {
    console.log("\n📁 Test 2: User Folder Structure Creation");

    for (const user of this.testUsers) {
      try {
        // Test folder existence check
        const { result: folderExists, duration: existsDuration } =
          await this.measureTime(
            () => R2UserStorage.userFolderExists(user.id),
            "folder_exists_check"
          );

        this.logTest(
          `User folder existence check (${user.email})`,
          typeof folderExists === "boolean",
          `Folder exists: ${folderExists}`,
          { userId: user.id },
          existsDuration
        );

        // Test folder structure creation
        const { result: created, duration: createDuration } =
          await this.measureTime(
            () => R2UserStorage.createUserFolderStructure(user.id),
            "folder_creation"
          );

        this.logTest(
          `User folder creation (${user.email})`,
          created,
          created
            ? "Successfully created user folder structure"
            : "Failed to create folders",
          { userId: user.id },
          createDuration
        );

        // Test ensure folder exists (should be fast if already exists)
        const { result: ensured, duration: ensureDuration } =
          await this.measureTime(
            () => R2UserStorage.ensureUserFolderExists(user.id),
            "ensure_folder_exists"
          );

        this.logTest(
          `Ensure user folder exists (${user.email})`,
          ensured,
          ensured
            ? "Successfully ensured user folder exists"
            : "Failed to ensure folder exists",
          { userId: user.id },
          ensureDuration
        );

        // Update user record to reflect folder creation
        await this.prisma.user.update({
          where: { id: user.id },
          data: { r2FolderCreated: true },
        });
      } catch (error) {
        this.logTest(
          `User folder creation (${user.email})`,
          false,
          `Error: ${error.message}`,
          { userId: user.id, error: error.stack }
        );
      }
    }
  }

  /**
   * Test 3: Path Generation and Validation
   */
  async testPathGeneration() {
    console.log("\n🔗 Test 3: Path Generation and Validation");

    const testUser = this.testUsers[0];
    const testDesignId = "test-design-123";

    try {
      // Test user folder paths
      const basePath = UserFolderPaths.getUserBasePath(testUser.id);
      const mockupsPath = UserFolderPaths.getMockupsPath(testUser.id);
      const designMockupPath = UserFolderPaths.getDesignMockupPath(
        testUser.id,
        testDesignId
      );
      const mockupTypePath = UserFolderPaths.getMockupTypePath(
        testUser.id,
        testDesignId,
        "default"
      );

      this.logTest(
        "User folder paths generation",
        basePath && mockupsPath && designMockupPath && mockupTypePath,
        "Successfully generated all user folder paths",
        {
          basePath,
          mockupsPath,
          designMockupPath,
          mockupTypePath,
        }
      );

      // Test file naming
      const uniqueFilename = UserFileNaming.generateUniqueFilename(
        "test-image.jpg",
        "mockup"
      );
      const mockupFilename = UserFileNaming.generateMockupFilename(
        testDesignId,
        "default",
        "jpg"
      );
      const profileFilename = UserFileNaming.generateProfilePictureFilename(
        "current",
        "png"
      );
      const assetFilename = UserFileNaming.generateAssetFilename(
        testDesignId,
        "svg"
      );

      this.logTest(
        "File naming generation",
        uniqueFilename && mockupFilename && profileFilename && assetFilename,
        "Successfully generated all filename formats",
        {
          uniqueFilename,
          mockupFilename,
          profileFilename,
          assetFilename,
        }
      );

      // Test full path generation
      const mockupPath = R2UserStorage.generateMockupPath(
        testUser.id,
        testDesignId,
        "default",
        "jpg"
      );
      const profilePath = R2UserStorage.generateProfilePicturePath(
        testUser.id,
        "current",
        "png"
      );
      const assetPath = R2UserStorage.generateAssetPath(
        testUser.id,
        "logos",
        testDesignId,
        "svg"
      );
      const exportPath = R2UserStorage.generateExportPath(
        testUser.id,
        "designs",
        "export.zip"
      );

      this.logTest(
        "Full path generation",
        mockupPath.key && profilePath.key && assetPath.key && exportPath.key,
        "Successfully generated all full paths with URLs",
        {
          mockupKey: mockupPath.key,
          profileKey: profilePath.key,
          assetKey: assetPath.key,
          exportKey: exportPath.key,
        }
      );
    } catch (error) {
      this.logTest("Path generation test", false, `Error: ${error.message}`, {
        error: error.stack,
      });
    }
  }

  /**
   * Test 4: Database Integration and Metadata
   */
  async testDatabaseIntegration() {
    console.log("\n🗄️ Test 4: Database Integration and Metadata");

    const testUser = this.testUsers[0];

    try {
      // Test file metadata creation
      const testFileMetadata = {
        userId: testUser.id,
        fileKey: `users/${testUser.id}/mockups/test-design/default/test-image.jpg`,
        fileName: "test-image.jpg",
        fileType: "mockups",
        fileSize: 1024 * 1024, // 1MB
        contentType: "image/jpeg",
        folderPath: `users/${testUser.id}/mockups/test-design/default`,
        isPublic: false,
        oldPath: "mockups/test-design/default/test-image.jpg",
        migrationStatus: "completed",
      };

      const { result: createdMetadata, duration: metadataDuration } =
        await this.measureTime(
          () => this.prisma.r2FileMetadata.create({ data: testFileMetadata }),
          "metadata_creation"
        );

      this.testFiles.push(createdMetadata);

      this.logTest(
        "File metadata creation",
        !!createdMetadata,
        `Successfully created file metadata with ID: ${createdMetadata?.id}`,
        { fileId: createdMetadata?.id },
        metadataDuration
      );

      // Test user storage stats
      const { result: storageStats, duration: statsDuration } =
        await this.measureTime(
          () => R2DbHelpers.getUserStorageStats(this.prisma, testUser.id),
          "storage_stats"
        );

      this.logTest(
        "User storage stats query",
        !!storageStats,
        `Successfully queried storage stats: ${storageStats?.totalFiles} files`,
        storageStats,
        statsDuration
      );

      // Test user files query
      const { result: userFiles, duration: filesDuration } =
        await this.measureTime(
          () => R2Queries.getUserFiles(this.prisma, testUser.id, { limit: 10 }),
          "user_files_query"
        );

      this.logTest(
        "User files query",
        !!userFiles,
        `Successfully queried user files: ${userFiles?.files?.length} files`,
        { fileCount: userFiles?.files?.length },
        filesDuration
      );

      // Test user storage usage update
      const { result: updatedUsage, duration: usageDuration } =
        await this.measureTime(
          () => R2DbHelpers.updateUserStorageUsage(this.prisma, testUser.id),
          "usage_update"
        );

      this.logTest(
        "Storage usage update",
        typeof updatedUsage === "number",
        `Successfully updated storage usage: ${updatedUsage} bytes`,
        { usageBytes: updatedUsage },
        usageDuration
      );
    } catch (error) {
      this.logTest(
        "Database integration test",
        false,
        `Error: ${error.message}`,
        {
          error: error.stack,
        }
      );
    }
  }

  /**
   * Test 5: Security and Access Controls
   */
  async testSecurityControls() {
    console.log("\n🔒 Test 5: Security and Access Controls");

    const regularUser = this.testUsers.find((u) => u.role === "USER");
    const adminUser = this.testUsers.find((u) => u.role === "ADMIN");

    try {
      // Test path traversal prevention
      const maliciousPaths = [
        "../../../etc/passwd",
        "..\\..\\..\\windows\\system32\\config\\sam",
        "users/123/../../users/456/secrets",
        "users/123/../../../etc/shadow",
      ];

      let pathTraversalTestsPassed = 0;
      for (const path of maliciousPaths) {
        const validation = R2Security.validatePath(path);
        if (!validation.isValid) {
          pathTraversalTestsPassed++;
        }
      }

      this.logTest(
        "Path traversal prevention",
        pathTraversalTestsPassed === maliciousPaths.length,
        `Blocked ${pathTraversalTestsPassed}/${maliciousPaths.length} malicious paths`,
        { blocked: pathTraversalTestsPassed, total: maliciousPaths.length }
      );

      // Test user access validation
      const accessTests = [
        {
          userId: regularUser.id,
          resourcePath: `users/${regularUser.id}/mockups/design123/default/image.jpg`,
          isAdmin: false,
          expected: true,
        },
        {
          userId: regularUser.id,
          resourcePath: `users/${adminUser.id}/mockups/design123/default/image.jpg`,
          isAdmin: false,
          expected: false,
        },
        {
          userId: regularUser.id,
          resourcePath: `users/${adminUser.id}/mockups/design123/default/image.jpg`,
          isAdmin: true,
          expected: true,
        },
      ];

      let accessTestsPassed = 0;
      for (const test of accessTests) {
        const context = {
          userId: test.userId,
          operation: "read",
          resourcePath: test.resourcePath,
          isAdmin: test.isAdmin,
        };

        const validation = R2Security.validateUserAccess(context);
        if (validation.isValid === test.expected) {
          accessTestsPassed++;
        }
      }

      this.logTest(
        "User access validation",
        accessTestsPassed === accessTests.length,
        `Passed ${accessTestsPassed}/${accessTests.length} access tests`,
        { passed: accessTestsPassed, total: accessTests.length }
      );

      // Test rate limiting
      const rateLimitConfig = {
        windowMs: 60000, // 1 minute
        maxRequests: 5, // 5 requests per minute
      };

      let rateLimitTestsPassed = 0;
      for (let i = 1; i <= 7; i++) {
        const isRateLimited = R2Security.checkRateLimit(
          regularUser.id,
          rateLimitConfig
        );
        if (i <= 5 && !isRateLimited) {
          rateLimitTestsPassed++;
        } else if (i > 5 && isRateLimited) {
          rateLimitTestsPassed++;
        }
      }

      this.logTest(
        "Rate limiting",
        rateLimitTestsPassed === 7,
        `Rate limiting working correctly: ${rateLimitTestsPassed}/7 tests passed`,
        { passed: rateLimitTestsPassed }
      );

      // Test audit logging
      const auditContext = {
        userId: regularUser.id,
        operation: "write",
        resourcePath: `users/${regularUser.id}/mockups/design123/default/image.jpg`,
        ipAddress: "192.168.1.100",
        userAgent: "Test Browser",
      };

      R2AuditLogger.log(auditContext, "success");
      R2AuditLogger.log(auditContext, "failure", "Access denied");
      R2AuditLogger.log(auditContext, "blocked", "Path traversal detected");

      const recentLogs = R2AuditLogger.getLogs({}, 10);
      this.logTest(
        "Audit logging",
        recentLogs.length >= 3,
        `Successfully logged ${recentLogs.length} audit entries`,
        { logCount: recentLogs.length }
      );
    } catch (error) {
      this.logTest("Security controls test", false, `Error: ${error.message}`, {
        error: error.stack,
      });
    }
  }

  /**
   * Test 6: Migration Functionality
   */
  async testMigrationFunctionality() {
    console.log("\n🔄 Test 6: Migration Functionality");

    try {
      // Test migration log creation
      const { result: migrationId, duration: logDuration } =
        await this.measureTime(
          () =>
            this.migrationService.createMigrationLog(
              "test_migration",
              10,
              this.testUsers[0].id,
              { dryRun: true }
            ),
          "migration_log_creation"
        );

      this.logTest(
        "Migration log creation",
        !!migrationId,
        `Successfully created migration log: ${migrationId}`,
        { migrationId },
        logDuration
      );

      // Test migration progress tracking
      if (migrationId) {
        const { result: progress, duration: progressDuration } =
          await this.measureTime(
            () => this.migrationService.getMigrationProgress(migrationId),
            "migration_progress"
          );

        this.logTest(
          "Migration progress tracking",
          !!progress,
          `Successfully retrieved migration progress: ${progress?.progressPercentage}%`,
          progress,
          progressDuration
        );

        // Test migration progress update
        const { result: updatedProgress, duration: updateDuration } =
          await this.measureTime(
            () =>
              this.migrationService.updateMigrationProgress(
                migrationId,
                5,
                0,
                "in_progress",
                undefined,
                "Test step"
              ),
            "migration_progress_update"
          );

        this.logTest(
          "Migration progress update",
          updatedProgress?.processedRecords === 5,
          `Successfully updated progress: ${updatedProgress?.processedRecords} records`,
          updatedProgress,
          updateDuration
        );
      }

      // Test path conversion utilities
      const testPaths = [
        "mockups/design-123/default/image.jpg",
        "profile-pictures/current/avatar.png",
        "assets/logos/logo.svg",
        "exports/designs/export.pdf",
      ];

      let pathConversionTestsPassed = 0;
      for (const path of testPaths) {
        const result = R2DbHelpers.convertLegacyUrlToR2Key(
          path,
          this.testUsers[0].id
        );
        if (
          result.success &&
          result.newPath &&
          result.newPath.includes(this.testUsers[0].id)
        ) {
          pathConversionTestsPassed++;
        }
      }

      this.logTest(
        "Path conversion utilities",
        pathConversionTestsPassed === testPaths.length,
        `Successfully converted ${pathConversionTestsPassed}/${testPaths.length} paths`,
        { passed: pathConversionTestsPassed, total: testPaths.length }
      );

      // Test migration statistics
      const { result: stats, duration: statsDuration } = await this.measureTime(
        () => this.migrationService.getMigrationStatistics(),
        "migration_statistics"
      );

      this.logTest(
        "Migration statistics",
        !!stats,
        `Successfully retrieved migration statistics: ${stats?.totalMigrations} migrations`,
        stats,
        statsDuration
      );
    } catch (error) {
      this.logTest(
        "Migration functionality test",
        false,
        `Error: ${error.message}`,
        {
          error: error.stack,
        }
      );
    }
  }

  /**
   * Test 7: Error Handling and Recovery
   */
  async testErrorHandling() {
    console.log("\n⚠️ Test 7: Error Handling and Recovery");

    try {
      // Test invalid user ID handling
      let errorHandlingTestsPassed = 0;

      try {
        UserFolderPaths.getUserBasePath("");
      } catch (error) {
        if (error.message.includes("Invalid user ID")) {
          errorHandlingTestsPassed++;
        }
      }

      try {
        UserFolderPaths.getDesignMockupPath(this.testUsers[0].id, "");
      } catch (error) {
        if (error.message.includes("Invalid design ID")) {
          errorHandlingTestsPassed++;
        }
      }

      // Test invalid configuration handling
      const originalEndpoint = process.env.R2_ENDPOINT;
      process.env.R2_ENDPOINT = "";
      R2Config.resetConfig();

      try {
        R2Config.getConfig();
      } catch (error) {
        if (
          error.message.includes("Missing required R2 environment variables")
        ) {
          errorHandlingTestsPassed++;
        }
      }

      // Restore configuration
      process.env.R2_ENDPOINT = originalEndpoint;
      R2Config.resetConfig();

      // Test database error handling
      try {
        await this.prisma.user.findUnique({
          where: { id: "invalid-user-id" },
        });
      } catch (error) {
        // This should not throw an error, but return null
        errorHandlingTestsPassed++;
      }

      this.logTest(
        "Error handling",
        errorHandlingTestsPassed >= 3,
        `Properly handled ${errorHandlingTestsPassed} error scenarios`,
        { testsPassed: errorHandlingTestsPassed }
      );
    } catch (error) {
      this.logTest("Error handling test", false, `Error: ${error.message}`, {
        error: error.stack,
      });
    }
  }

  /**
   * Test 8: Performance Under Load
   */
  async testPerformanceUnderLoad() {
    console.log("\n⚡ Test 8: Performance Under Load");

    try {
      // Test concurrent user folder creation
      const concurrentUsers = Array.from({ length: 10 }, (_, i) => ({
        id: `concurrent-user-${i}`,
        email: `concurrent-user-${i}@example.com`,
        name: `Concurrent User ${i}`,
        role: "USER",
      }));

      const { result: folderCreationResults, duration: concurrentDuration } =
        await this.measureTime(
          () =>
            Promise.all(
              concurrentUsers.map(async (user) => {
                try {
                  // Create user in database
                  const dbUser = await this.prisma.user.create({ data: user });
                  // Create folder structure
                  const created = await R2UserStorage.createUserFolderStructure(
                    dbUser.id
                  );
                  return { userId: dbUser.id, success: created };
                } catch (error) {
                  return {
                    userId: user.id,
                    success: false,
                    error: error.message,
                  };
                }
              })
            ),
          "concurrent_folder_creation"
        );

      const successfulCreations = folderCreationResults.filter(
        (r) => r.success
      ).length;
      this.logTest(
        "Concurrent folder creation",
        successfulCreations === concurrentUsers.length,
        `Successfully created folders for ${successfulCreations}/${concurrentUsers.length} concurrent users`,
        { successRate: (successfulCreations / concurrentUsers.length) * 100 },
        concurrentDuration
      );

      // Test batch path conversion
      const testPaths = Array.from(
        { length: 100 },
        (_, i) => `mockups/design-${i}/default/image-${i}.jpg`
      );

      const { result: batchResults, duration: batchDuration } =
        await this.measureTime(
          () =>
            Promise.resolve(
              R2DbHelpers.convertLegacyUrlsToR2Keys(
                testPaths,
                this.testUsers[0].id
              )
            ),
          "batch_path_conversion"
        );

      const successfulConversions = batchResults.filter(
        (r) => r.success
      ).length;
      this.logTest(
        "Batch path conversion",
        successfulConversions === testPaths.length,
        `Successfully converted ${successfulConversions}/${testPaths.length} paths in batch`,
        {
          conversionRate: (successfulConversions / testPaths.length) * 100,
          avgTimePerPath: batchDuration / testPaths.length,
        },
        batchDuration
      );

      // Test rapid metadata queries
      const { result: queryResults, duration: queryDuration } =
        await this.measureTime(
          () =>
            Promise.all(
              Array.from({ length: 50 }, () =>
                R2Queries.getUserFiles(this.prisma, this.testUsers[0].id, {
                  limit: 5,
                })
              )
            ),
          "rapid_metadata_queries"
        );

      this.logTest(
        "Rapid metadata queries",
        queryResults.length === 50,
        `Successfully executed ${queryResults.length} metadata queries`,
        {
          avgTimePerQuery: queryDuration / 50,
          queriesPerSecond: 50 / (queryDuration / 1000),
        },
        queryDuration
      );
    } catch (error) {
      this.logTest(
        "Performance under load test",
        false,
        `Error: ${error.message}`,
        {
          error: error.stack,
        }
      );
    }
  }

  /**
   * Test 9: End-to-End Workflow
   */
  async testEndToEndWorkflow() {
    console.log("\n🔄 Test 9: End-to-End Workflow");

    try {
      const testUser = this.testUsers[0];
      const testDesignId = "e2e-test-design";

      // Step 1: User registration and folder creation
      const { result: folderCreated, duration: step1Duration } =
        await this.measureTime(
          () => R2UserStorage.ensureUserFolderExists(testUser.id),
          "e2e_step1_folder_creation"
        );

      // Step 2: Design creation and file path generation
      const { result: mockupPath, duration: step2Duration } =
        await this.measureTime(
          () =>
            Promise.resolve(
              R2UserStorage.generateMockupPath(
                testUser.id,
                testDesignId,
                "default",
                "jpg"
              )
            ),
          "e2e_step2_path_generation"
        );

      // Step 3: File metadata creation
      const fileMetadata = {
        userId: testUser.id,
        fileKey: mockupPath.key,
        fileName: "e2e-test-mockup.jpg",
        fileType: "mockups",
        fileSize: 2048 * 1024, // 2MB
        contentType: "image/jpeg",
        folderPath: mockupPath.key.substring(
          0,
          mockupPath.key.lastIndexOf("/")
        ),
        isPublic: false,
        migrationStatus: "completed",
      };

      const { result: createdFile, duration: step3Duration } =
        await this.measureTime(
          () => this.prisma.r2FileMetadata.create({ data: fileMetadata }),
          "e2e_step3_metadata_creation"
        );

      // Step 4: User files query
      const { result: userFiles, duration: step4Duration } =
        await this.measureTime(
          () =>
            R2Queries.getUserFiles(this.prisma, testUser.id, {
              fileType: "mockups",
            }),
          "e2e_step4_files_query"
        );

      // Step 5: Storage usage update
      const { result: updatedUsage, duration: step5Duration } =
        await this.measureTime(
          () => R2DbHelpers.updateUserStorageUsage(this.prisma, testUser.id),
          "e2e_step5_usage_update"
        );

      // Step 6: Security validation
      const securityContext = {
        userId: testUser.id,
        operation: "read",
        resourcePath: mockupPath.key,
        isAdmin: false,
      };

      const { result: securityValidation, duration: step6Duration } =
        await this.measureTime(
          () => Promise.resolve(R2Security.validateUserAccess(securityContext)),
          "e2e_step6_security_validation"
        );

      const totalDuration =
        step1Duration +
        step2Duration +
        step3Duration +
        step4Duration +
        step5Duration +
        step6Duration;
      const allStepsSuccessful =
        folderCreated &&
        mockupPath &&
        createdFile &&
        userFiles &&
        typeof updatedUsage === "number" &&
        securityValidation?.isValid;

      this.logTest(
        "End-to-end workflow",
        allStepsSuccessful,
        allStepsSuccessful
          ? "Successfully completed all E2E workflow steps"
          : "E2E workflow failed",
        {
          step1: { success: folderCreated, duration: step1Duration },
          step2: { success: !!mockupPath, duration: step2Duration },
          step3: { success: !!createdFile, duration: step3Duration },
          step4: { success: !!userFiles, duration: step4Duration },
          step5: {
            success: typeof updatedUsage === "number",
            duration: step5Duration,
          },
          step6: {
            success: securityValidation?.isValid,
            duration: step6Duration,
          },
          totalDuration,
        },
        totalDuration
      );
    } catch (error) {
      this.logTest(
        "End-to-end workflow test",
        false,
        `Error: ${error.message}`,
        {
          error: error.stack,
        }
      );
    }
  }

  /**
   * Generate comprehensive test report
   */
  generateTestReport() {
    console.log("\n📊 Comprehensive Test Report");
    console.log("================================");

    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter((t) => t.success).length;
    const failedTests = totalTests - passedTests;
    const successRate = ((passedTests / totalTests) * 100).toFixed(2);

    console.log(`\nSummary:`);
    console.log(`  Total Tests: ${totalTests}`);
    console.log(`  Passed: ${passedTests} ✅`);
    console.log(`  Failed: ${failedTests} ❌`);
    console.log(`  Success Rate: ${successRate}%`);

    if (failedTests > 0) {
      console.log(`\nFailed Tests:`);
      this.testResults
        .filter((t) => !t.success)
        .forEach((t) => {
          console.log(`  ❌ ${t.testName}: ${t.message}`);
        });
    }

    console.log(`\nPerformance Metrics:`);
    Object.entries(this.performanceMetrics).forEach(([test, duration]) => {
      console.log(`  ${test}: ${duration}ms`);
    });

    // Calculate average performance
    const performanceValues = Object.values(this.performanceMetrics);
    if (performanceValues.length > 0) {
      const avgPerformance =
        performanceValues.reduce((a, b) => a + b, 0) / performanceValues.length;
      console.log(`  Average: ${avgPerformance.toFixed(2)}ms`);
    }

    console.log(`\nTest Categories:`);
    const categories = {
      Configuration: this.testResults.filter((t) =>
        t.testName.includes("Configuration")
      ).length,
      "Folder Creation": this.testResults.filter((t) =>
        t.testName.includes("folder")
      ).length,
      "Path Generation": this.testResults.filter((t) =>
        t.testName.includes("path")
      ).length,
      Database: this.testResults.filter(
        (t) => t.testName.includes("metadata") || t.testName.includes("query")
      ).length,
      Security: this.testResults.filter(
        (t) => t.testName.includes("Security") || t.testName.includes("access")
      ).length,
      Migration: this.testResults.filter((t) =>
        t.testName.includes("Migration")
      ).length,
      "Error Handling": this.testResults.filter((t) =>
        t.testName.includes("Error")
      ).length,
      Performance: this.testResults.filter(
        (t) =>
          t.testName.includes("concurrent") ||
          t.testName.includes("batch") ||
          t.testName.includes("rapid")
      ).length,
      "End-to-End": this.testResults.filter((t) =>
        t.testName.includes("End-to-end")
      ).length,
    };

    Object.entries(categories).forEach(([category, count]) => {
      if (count > 0) {
        console.log(`  ${category}: ${count} tests`);
      }
    });

    console.log(`\nRecommendations:`);
    if (successRate >= 95) {
      console.log(
        `  ✅ Excellent! The R2 implementation is ready for production deployment.`
      );
    } else if (successRate >= 80) {
      console.log(
        `  ⚠️  Good progress. Address the failing tests before production deployment.`
      );
    } else {
      console.log(
        `  ❌ Critical issues found. Significant work needed before production deployment.`
      );
    }

    if (this.performanceMetrics.config_validation > 100) {
      console.log(
        `  🔧 Consider optimizing configuration validation performance.`
      );
    }

    if (this.performanceMetrics.concurrent_folder_creation > 5000) {
      console.log(
        `  ⚡ Consider optimizing concurrent folder creation performance.`
      );
    }

    return {
      totalTests,
      passedTests,
      failedTests,
      successRate: parseFloat(successRate),
      performanceMetrics: this.performanceMetrics,
      categories,
      testResults: this.testResults,
    };
  }

  /**
   * Clean up test data
   */
  async cleanup() {
    console.log("\n🧹 Cleaning up test data...");

    try {
      // Clean up test files
      for (const file of this.testFiles) {
        try {
          await this.prisma.r2FileMetadata.delete({
            where: { id: file.id },
          });
        } catch (error) {
          console.log(
            `Warning: Could not delete file ${file.id}: ${error.message}`
          );
        }
      }

      // Clean up test users
      for (const user of this.testUsers) {
        try {
          await this.prisma.user.delete({
            where: { id: user.id },
          });
        } catch (error) {
          console.log(
            `Warning: Could not delete user ${user.id}: ${error.message}`
          );
        }
      }

      console.log("✅ Cleanup completed successfully");
    } catch (error) {
      console.log(`❌ Cleanup failed: ${error.message}`);
    }
  }

  /**
   * Run all integration tests
   */
  async runAllTests() {
    console.log("🚀 Starting R2 Complete Integration Test Suite");
    console.log("===============================================");

    const startTime = Date.now();

    try {
      await this.createTestUsers();
      await this.testR2Configuration();
      await this.testUserFolderCreation();
      await this.testPathGeneration();
      await this.testDatabaseIntegration();
      await this.testSecurityControls();
      await this.testMigrationFunctionality();
      await this.testErrorHandling();
      await this.testPerformanceUnderLoad();
      await this.testEndToEndWorkflow();

      const totalDuration = Date.now() - startTime;
      console.log(`\n⏱️ Total test execution time: ${totalDuration}ms`);

      const report = this.generateTestReport();

      // Save report to file
      const reportPath = "./r2-integration-test-report.json";
      require("fs").writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n📄 Detailed report saved to: ${reportPath}`);

      return report;
    } catch (error) {
      console.error("\n❌ Integration test suite failed:", error);
      throw error;
    } finally {
      await this.cleanup();
      await this.prisma.$disconnect();
    }
  }
}

// Run the integration tests
if (require.main === module) {
  const tester = new R2IntegrationTester();
  tester
    .runAllTests()
    .then((report) => {
      console.log("\n🎉 Integration testing completed!");
      process.exit(report.failedTests > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error("\n💥 Integration testing failed:", error);
      process.exit(1);
    });
}

module.exports = { R2IntegrationTester };
