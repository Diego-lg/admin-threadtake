/**
 * Test script for R2 migration process
 * This script validates the database schema updates and migration functionality
 */

const { PrismaClient } = require("@prisma/client");
const { R2MigrationService } = require("./services/r2-migration-service");
const { R2DbHelpers } = require("./lib/r2-db-helpers");
const { R2Queries } = require("./lib/r2-queries");
const { R2Config } = require("./lib/r2-config");

class R2MigrationTester {
  constructor() {
    this.prisma = new PrismaClient();
    this.migrationService = new R2MigrationService(this.prisma);
    this.testResults = [];
  }

  /**
   * Log test result
   */
  logTest(testName, success, message, details = null) {
    const result = {
      testName,
      success,
      message,
      details,
      timestamp: new Date().toISOString(),
    };
    this.testResults.push(result);

    const status = success ? "✅ PASS" : "❌ FAIL";
    console.log(`${status} ${testName}: ${message}`);

    if (details) {
      console.log("   Details:", JSON.stringify(details, null, 2));
    }
  }

  /**
   * Test database schema updates
   */
  async testDatabaseSchema() {
    console.log("\n🔍 Testing database schema updates...");

    try {
      // Test User model new fields
      const userColumns = await this.prisma.$queryRaw`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'User' 
        AND column_name IN ('profilePictureKey', 'profilePictureHistory', 'r2FolderCreated', 'storageUsageBytes')
        ORDER BY column_name
      `;

      const expectedUserColumns = [
        "profilePictureKey",
        "profilePictureHistory",
        "r2FolderCreated",
        "storageUsageBytes",
      ];
      const actualUserColumns = userColumns.map((col) => col.column_name);

      const hasAllUserColumns = expectedUserColumns.every((col) =>
        actualUserColumns.includes(col)
      );
      this.logTest(
        "User model new fields",
        hasAllUserColumns,
        hasAllUserColumns ? "All new User fields exist" : "Missing User fields",
        { expected: expectedUserColumns, actual: actualUserColumns }
      );

      // Test SavedDesign model new fields
      const designColumns = await this.prisma.$queryRaw`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'SavedDesign' 
        AND column_name IN ('designImageKey', 'mockupImageKey', 'uploadedLogoKey', 'uploadedPatternKey', 'assetKeys', 'mockupKeys', 'migrationStatus', 'migratedAt')
        ORDER BY column_name
      `;

      const expectedDesignColumns = [
        "designImageKey",
        "mockupImageKey",
        "uploadedLogoKey",
        "uploadedPatternKey",
        "assetKeys",
        "mockupKeys",
        "migrationStatus",
        "migratedAt",
      ];
      const actualDesignColumns = designColumns.map((col) => col.column_name);

      const hasAllDesignColumns = expectedDesignColumns.every((col) =>
        actualDesignColumns.includes(col)
      );
      this.logTest(
        "SavedDesign model new fields",
        hasAllDesignColumns,
        hasAllDesignColumns
          ? "All new SavedDesign fields exist"
          : "Missing SavedDesign fields",
        { expected: expectedDesignColumns, actual: actualDesignColumns }
      );

      // Test MockupJob model new fields
      const mockupColumns = await this.prisma.$queryRaw`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'MockupJob' 
        AND column_name IN ('mockupKeys', 'migrationStatus', 'migratedAt')
        ORDER BY column_name
      `;

      const expectedMockupColumns = [
        "mockupKeys",
        "migrationStatus",
        "migratedAt",
      ];
      const actualMockupColumns = mockupColumns.map((col) => col.column_name);

      const hasAllMockupColumns = expectedMockupColumns.every((col) =>
        actualMockupColumns.includes(col)
      );
      this.logTest(
        "MockupJob model new fields",
        hasAllMockupColumns,
        hasAllMockupColumns
          ? "All new MockupJob fields exist"
          : "Missing MockupJob fields",
        { expected: expectedMockupColumns, actual: actualMockupColumns }
      );

      // Test new tables exist
      const newTables = await this.prisma.$queryRaw`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('R2MigrationLog', 'R2FileMetadata')
        ORDER BY table_name
      `;

      const expectedTables = ["R2MigrationLog", "R2FileMetadata"];
      const actualTables = newTables.map((t) => t.table_name);

      const hasAllTables = expectedTables.every((table) =>
        actualTables.includes(table)
      );
      this.logTest(
        "New R2 tables",
        hasAllTables,
        hasAllTables ? "All new R2 tables exist" : "Missing R2 tables",
        { expected: expectedTables, actual: actualTables }
      );

      // Test indexes
      const indexes = await this.prisma.$queryRaw`
        SELECT indexname, tablename 
        FROM pg_indexes 
        WHERE tablename IN ('User', 'SavedDesign', 'MockupJob', 'R2MigrationLog', 'R2FileMetadata')
        AND indexname LIKE '%_idx'
        ORDER BY tablename, indexname
      `;

      const hasIndexes = indexes.length > 0;
      this.logTest(
        "Database indexes",
        hasIndexes,
        hasIndexes ? `Found ${indexes.length} indexes` : "No indexes found",
        {
          count: indexes.length,
          indexes: indexes.map((i) => `${i.tablename}.${i.indexname}`),
        }
      );
    } catch (error) {
      this.logTest("Database schema test", false, `Error: ${error.message}`, {
        error: error.stack,
      });
    }
  }

  /**
   * Test R2 configuration
   */
  async testR2Configuration() {
    console.log("\n🔧 Testing R2 configuration...");

    try {
      const configStatus = R2Config.getConfigStatus();
      const isValid = R2Config.validateConfig();

      this.logTest(
        "R2 configuration validation",
        isValid,
        isValid ? "R2 configuration is valid" : "R2 configuration is invalid",
        configStatus
      );

      // Test configuration retrieval
      try {
        const config = R2Config.getConfig();
        this.logTest(
          "R2 configuration retrieval",
          true,
          "Successfully retrieved R2 configuration",
          { hasEndpoint: !!config.endpoint, hasBucketName: !!config.bucketName }
        );
      } catch (error) {
        this.logTest(
          "R2 configuration retrieval",
          false,
          `Error: ${error.message}`
        );
      }
    } catch (error) {
      this.logTest("R2 configuration test", false, `Error: ${error.message}`, {
        error: error.stack,
      });
    }
  }

  /**
   * Test path conversion utilities
   */
  async testPathConversion() {
    console.log("\n🔄 Testing path conversion utilities...");

    try {
      const testUserId = "test-user-123";
      const testPaths = [
        "mockups/design-123/default/image.jpg",
        "profile-pictures/current/avatar.png",
        "assets/logos/logo.svg",
        "exports/designs/export.pdf",
      ];

      // Test individual path conversion
      testPaths.forEach((path, index) => {
        try {
          const result = R2DbHelpers.convertLegacyUrlToR2Key(path, testUserId);
          const success =
            result.success &&
            result.newPath &&
            result.newPath.includes(testUserId);

          this.logTest(
            `Path conversion ${index + 1}`,
            success,
            success
              ? `Successfully converted: ${path}`
              : `Failed to convert: ${path}`,
            result
          );
        } catch (error) {
          this.logTest(
            `Path conversion ${index + 1}`,
            false,
            `Error: ${error.message}`
          );
        }
      });

      // Test batch conversion
      try {
        const batchResult = R2DbHelpers.convertLegacyUrlsToR2Keys(
          testPaths,
          testUserId
        );
        const allSuccessful = batchResult.every((r) => r.success);

        this.logTest(
          "Batch path conversion",
          allSuccessful,
          allSuccessful
            ? "All paths converted successfully"
            : "Some paths failed to convert",
          {
            total: batchResult.length,
            successful: batchResult.filter((r) => r.success).length,
          }
        );
      } catch (error) {
        this.logTest("Batch path conversion", false, `Error: ${error.message}`);
      }

      // Test file type extraction
      const fileTypeTests = [
        { path: "mockups/design-123/default/image.jpg", expected: "mockups" },
        {
          path: "profile-pictures/current/avatar.png",
          expected: "profile-pictures",
        },
        { path: "assets/logos/logo.svg", expected: "assets" },
        { path: "exports/designs/export.pdf", expected: "exports" },
      ];

      fileTypeTests.forEach((test, index) => {
        const fileType = R2DbHelpers.extractFileTypeFromPath(test.path);
        const success = fileType === test.expected;

        this.logTest(
          `File type extraction ${index + 1}`,
          success,
          success
            ? `Correctly extracted: ${test.path} -> ${fileType}`
            : `Incorrect extraction: ${test.path} -> ${fileType} (expected: ${test.expected})`,
          { path: test.path, actual: fileType, expected: test.expected }
        );
      });
    } catch (error) {
      this.logTest("Path conversion test", false, `Error: ${error.message}`, {
        error: error.stack,
      });
    }
  }

  /**
   * Test migration service functionality
   */
  async testMigrationService() {
    console.log("\n🚀 Testing migration service functionality...");

    try {
      // Test migration log creation
      try {
        const migrationId = await this.migrationService.createMigrationLog(
          "test_migration",
          10,
          "test-user",
          { dryRun: true }
        );

        this.logTest(
          "Migration log creation",
          !!migrationId,
          `Successfully created migration log: ${migrationId}`,
          { migrationId }
        );

        // Test migration progress retrieval
        const progress = await this.migrationService.getMigrationProgress(
          migrationId
        );
        this.logTest(
          "Migration progress retrieval",
          !!progress,
          progress
            ? `Successfully retrieved progress: ${progress.progressPercentage}%`
            : "Failed to retrieve progress",
          progress
        );

        // Test migration progress update
        await this.migrationService.updateMigrationProgress(
          migrationId,
          5,
          0,
          "in_progress",
          undefined,
          "Test step"
        );

        const updatedProgress =
          await this.migrationService.getMigrationProgress(migrationId);
        this.logTest(
          "Migration progress update",
          updatedProgress?.processedRecords === 5,
          updatedProgress
            ? `Successfully updated progress: ${updatedProgress.processedRecords} records`
            : "Failed to update progress",
          updatedProgress
        );
      } catch (error) {
        this.logTest(
          "Migration service operations",
          false,
          `Error: ${error.message}`
        );
      }

      // Test migration statistics
      try {
        const stats = await this.migrationService.getMigrationStatistics();
        this.logTest(
          "Migration statistics",
          true,
          `Retrieved migration statistics: ${stats.totalMigrations} total migrations`,
          stats
        );
      } catch (error) {
        this.logTest("Migration statistics", false, `Error: ${error.message}`);
      }
    } catch (error) {
      this.logTest("Migration service test", false, `Error: ${error.message}`, {
        error: error.stack,
      });
    }
  }

  /**
   * Test database queries with new structure
   */
  async testDatabaseQueries() {
    console.log("\n📊 Testing database queries with new structure...");

    try {
      // Test user storage stats query
      try {
        const stats = await R2DbHelpers.getUserStorageStats(
          this.prisma,
          "test-user"
        );
        this.logTest(
          "User storage stats query",
          true,
          `Successfully queried user storage stats: ${stats.totalFiles} files`,
          stats
        );
      } catch (error) {
        this.logTest(
          "User storage stats query",
          false,
          `Error: ${error.message}`
        );
      }

      // Test migration summary query
      try {
        const summary = await R2DbHelpers.getMigrationSummary(this.prisma);
        this.logTest(
          "Migration summary query",
          true,
          `Successfully retrieved migration summary: ${summary.totalMigrations} migrations`,
          summary
        );
      } catch (error) {
        this.logTest(
          "Migration summary query",
          false,
          `Error: ${error.message}`
        );
      }

      // Test metadata integrity validation
      try {
        const validation = await R2DbHelpers.validateMetadataIntegrity(
          this.prisma
        );
        this.logTest(
          "Metadata integrity validation",
          true,
          `Validated ${validation.totalRecords} records with ${validation.issues.length} issues`,
          validation
        );
      } catch (error) {
        this.logTest(
          "Metadata integrity validation",
          false,
          `Error: ${error.message}`
        );
      }
    } catch (error) {
      this.logTest("Database queries test", false, `Error: ${error.message}`, {
        error: error.stack,
      });
    }
  }

  /**
   * Test backward compatibility
   */
  async testBackwardCompatibility() {
    console.log("\n🔄 Testing backward compatibility...");

    try {
      // Test that legacy queries still work
      try {
        const users = await this.prisma.user.findMany({
          select: {
            id: true,
            email: true,
            image: true, // Legacy field
            createdAt: true,
          },
          take: 5,
        });

        this.logTest(
          "Legacy user queries",
          true,
          `Successfully executed legacy user query: ${users.length} users`,
          { userCount: users.length }
        );
      } catch (error) {
        this.logTest("Legacy user queries", false, `Error: ${error.message}`);
      }

      // Test that legacy saved design queries still work
      try {
        const designs = await this.prisma.savedDesign.findMany({
          select: {
            id: true,
            userId: true,
            designImageUrl: true, // Legacy field
            mockupImageUrl: true, // Legacy field
            createdAt: true,
          },
          take: 5,
        });

        this.logTest(
          "Legacy saved design queries",
          true,
          `Successfully executed legacy saved design query: ${designs.length} designs`,
          { designCount: designs.length }
        );
      } catch (error) {
        this.logTest(
          "Legacy saved design queries",
          false,
          `Error: ${error.message}`
        );
      }

      // Test that legacy mockup job queries still work
      try {
        const jobs = await this.prisma.mockupJob.findMany({
          select: {
            id: true,
            userId: true,
            imageUrl: true, // Legacy field
            status: true,
            createdAt: true,
          },
          take: 5,
        });

        this.logTest(
          "Legacy mockup job queries",
          true,
          `Successfully executed legacy mockup job query: ${jobs.length} jobs`,
          { jobCount: jobs.length }
        );
      } catch (error) {
        this.logTest(
          "Legacy mockup job queries",
          false,
          `Error: ${error.message}`
        );
      }
    } catch (error) {
      this.logTest(
        "Backward compatibility test",
        false,
        `Error: ${error.message}`,
        { error: error.stack }
      );
    }
  }

  /**
   * Test data integrity
   */
  async testDataIntegrity() {
    console.log("\n🛡️ Testing data integrity...");

    try {
      // Test foreign key constraints
      try {
        const foreignKeyChecks = await this.prisma.$queryRaw`
          SELECT 
            tc.table_name, 
            kcu.column_name, 
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name 
          FROM information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY' 
            AND tc.table_name IN ('R2FileMetadata', 'R2MigrationLog')
        `;

        this.logTest(
          "Foreign key constraints",
          foreignKeyChecks.length > 0,
          `Found ${foreignKeyChecks.length} foreign key constraints`,
          foreignKeyChecks
        );
      } catch (error) {
        this.logTest(
          "Foreign key constraints",
          false,
          `Error: ${error.message}`
        );
      }

      // Test data validation
      try {
        const userCount = await this.prisma.user.count();
        const designCount = await this.prisma.savedDesign.count();
        const jobCount = await this.prisma.mockupJob.count();

        this.logTest(
          "Data validation",
          true,
          `Data counts: ${userCount} users, ${designCount} designs, ${jobCount} jobs`,
          { userCount, designCount, jobCount }
        );
      } catch (error) {
        this.logTest("Data validation", false, `Error: ${error.message}`);
      }
    } catch (error) {
      this.logTest("Data integrity test", false, `Error: ${error.message}`, {
        error: error.stack,
      });
    }
  }

  /**
   * Generate test report
   */
  generateTestReport() {
    console.log("\n📋 TEST REPORT");
    console.log("=".repeat(50));

    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter((r) => r.success).length;
    const failedTests = totalTests - passedTests;

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(
      `Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`
    );

    if (failedTests > 0) {
      console.log("\n❌ FAILED TESTS:");
      this.testResults
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`  - ${r.testName}: ${r.message}`);
        });
    }

    console.log("\n📊 Detailed Results:");
    this.testResults.forEach((r) => {
      const status = r.success ? "✅" : "❌";
      console.log(`${status} ${r.testName}: ${r.message}`);
    });

    // Save report to file
    const reportData = {
      summary: {
        totalTests,
        passedTests,
        failedTests,
        successRate: ((passedTests / totalTests) * 100).toFixed(1),
        timestamp: new Date().toISOString(),
      },
      results: this.testResults,
    };

    const fs = require("fs");
    const reportPath = "./r2-migration-test-report.json";
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);

    return {
      success: failedTests === 0,
      summary: reportData.summary,
      results: this.testResults,
    };
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log("🧪 Starting R2 Migration Tests...");
    console.log("=".repeat(50));

    try {
      await this.testDatabaseSchema();
      await this.testR2Configuration();
      await this.testPathConversion();
      await this.testMigrationService();
      await this.testDatabaseQueries();
      await this.testBackwardCompatibility();
      await this.testDataIntegrity();

      return this.generateTestReport();
    } catch (error) {
      console.error("❌ Test suite failed:", error);
      this.logTest("Test suite", false, `Fatal error: ${error.message}`, {
        error: error.stack,
      });
      return this.generateTestReport();
    } finally {
      await this.prisma.$disconnect();
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new R2MigrationTester();
  tester
    .runAllTests()
    .then((report) => {
      console.log("\n🏁 Test suite completed");
      process.exit(report.success ? 0 : 1);
    })
    .catch((error) => {
      console.error("❌ Test suite failed to complete:", error);
      process.exit(1);
    });
}

module.exports = { R2MigrationTester };
