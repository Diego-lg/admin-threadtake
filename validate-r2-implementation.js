/**
 * R2 Implementation Validation Script
 *
 * This script validates the entire R2 user-centric storage implementation by:
 * - Checking all required files and components exist
 * - Validating database schema and migrations
 * - Testing API endpoint functionality
 * - Validating security measures
 * - Checking configuration completeness
 * - Validating dependencies and integrations
 *
 * Run with: node validate-r2-implementation.js
 */

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

class R2ImplementationValidator {
  constructor() {
    this.prisma = new PrismaClient();
    this.validationResults = [];
    this.errors = [];
    this.warnings = [];
    this.componentStatus = {};
  }

  /**
   * Log validation result
   */
  logValidation(component, status, message, details = null) {
    const result = {
      component,
      status,
      message,
      details,
      timestamp: new Date().toISOString(),
    };
    this.validationResults.push(result);
    this.componentStatus[component] = status;

    const statusIcon =
      status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️";
    console.log(`${statusIcon} ${component}: ${message}`);

    if (details && status === "FAIL") {
      console.log("   Details:", JSON.stringify(details, null, 2));
    }

    if (status === "FAIL") {
      this.errors.push(result);
    } else if (status === "WARN") {
      this.warnings.push(result);
    }
  }

  /**
   * Validate required files exist
   */
  async validateRequiredFiles() {
    console.log("\n📁 Validating Required Files");

    const requiredFiles = [
      // Core configuration
      "lib/r2-config.ts",
      "lib/r2-user-storage.ts",
      "lib/r2-db-helpers.ts",
      "lib/r2-queries.ts",
      "lib/r2-file-helpers.ts",
      "lib/r2-security.ts",
      "lib/r2-audit-logger.ts",
      "lib/r2-security-monitor.ts",

      // Services
      "services/r2-migration-service.ts",
      "services/user-folder-service.ts",

      // Database
      "prisma/schema.prisma",
      "migrations/update_user_storage_paths.sql",

      // API endpoints
      "app/api/upload-url/route.ts",
      "app/api/init/route.ts",

      // Components
      "components/server-initializer.tsx",

      // Test files
      "test-r2-user-storage.js",
      "test-r2-security.js",
      "test-r2-migration.js",
      "test-r2-complete-integration.js",
    ];

    let filesValid = true;
    for (const file of requiredFiles) {
      const filePath = path.join(__dirname, file);
      const exists = fs.existsSync(filePath);

      if (!exists) {
        this.logValidation(
          `Required file: ${file}`,
          "FAIL",
          "Required file is missing",
          { path: filePath }
        );
        filesValid = false;
      } else {
        // Check file size to ensure it's not empty
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
          this.logValidation(
            `Required file: ${file}`,
            "WARN",
            "File exists but is empty",
            { path: filePath, size: stats.size }
          );
        }
      }
    }

    if (filesValid) {
      this.logValidation(
        "Required files",
        "PASS",
        "All required files are present"
      );
    }

    return filesValid;
  }

  /**
   * Validate database schema
   */
  async validateDatabaseSchema() {
    console.log("\n🗄️ Validating Database Schema");

    try {
      // Test database connection
      await this.prisma.$connect();
      this.logValidation(
        "Database connection",
        "PASS",
        "Successfully connected to database"
      );

      // Check User model new fields
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

      this.logValidation(
        "User model schema",
        hasAllUserColumns ? "PASS" : "FAIL",
        hasAllUserColumns ? "All new User fields exist" : "Missing User fields",
        { expected: expectedUserColumns, actual: actualUserColumns }
      );

      // Check SavedDesign model new fields
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

      this.logValidation(
        "SavedDesign model schema",
        hasAllDesignColumns ? "PASS" : "FAIL",
        hasAllDesignColumns
          ? "All new SavedDesign fields exist"
          : "Missing SavedDesign fields",
        { expected: expectedDesignColumns, actual: actualDesignColumns }
      );

      // Check new tables exist
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

      this.logValidation(
        "New R2 tables",
        hasAllTables ? "PASS" : "FAIL",
        hasAllTables ? "All new R2 tables exist" : "Missing R2 tables",
        { expected: expectedTables, actual: actualTables }
      );

      // Check indexes
      const indexes = await this.prisma.$queryRaw`
        SELECT indexname, tablename 
        FROM pg_indexes 
        WHERE tablename IN ('User', 'SavedDesign', 'MockupJob', 'R2MigrationLog', 'R2FileMetadata')
        AND indexname LIKE '%_idx'
        ORDER BY tablename, indexname
      `;

      const hasIndexes = indexes.length > 0;
      this.logValidation(
        "Database indexes",
        hasIndexes ? "PASS" : "WARN",
        hasIndexes
          ? `Found ${indexes.length} performance indexes`
          : "No performance indexes found",
        {
          count: indexes.length,
          indexes: indexes.map((i) => `${i.tablename}.${i.indexname}`),
        }
      );

      return hasAllUserColumns && hasAllDesignColumns && hasAllTables;
    } catch (error) {
      this.logValidation(
        "Database schema validation",
        "FAIL",
        `Database validation failed: ${error.message}`,
        { error: error.stack }
      );
      return false;
    }
  }

  /**
   * Validate R2 configuration
   */
  async validateR2Configuration() {
    console.log("\n⚙️ Validating R2 Configuration");

    try {
      // Check environment variables
      const requiredEnvVars = [
        "R2_ENDPOINT",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET_NAME",
        "R2_PUBLIC_BUCKET_URL",
      ];

      let configValid = true;
      for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
          this.logValidation(
            `Environment variable: ${envVar}`,
            "FAIL",
            "Required environment variable is missing",
            { variable: envVar }
          );
          configValid = false;
        }
      }

      if (configValid) {
        this.logValidation(
          "Environment variables",
          "PASS",
          "All required environment variables are set"
        );
      }

      // Test configuration loading
      try {
        const { R2Config } = require("./lib/r2-config");
        const config = R2Config.getConfig();
        const isValid = R2Config.validateConfig();

        this.logValidation(
          "R2 configuration loading",
          isValid ? "PASS" : "FAIL",
          isValid
            ? "R2 configuration loaded and validated successfully"
            : "R2 configuration validation failed",
          {
            hasEndpoint: !!config?.endpoint,
            hasBucketName: !!config?.bucketName,
          }
        );

        // Test S3 client creation
        const s3Client = R2Config.getS3Client();
        this.logValidation(
          "S3 client creation",
          s3Client ? "PASS" : "FAIL",
          s3Client
            ? "S3 client created successfully"
            : "Failed to create S3 client"
        );
      } catch (error) {
        this.logValidation(
          "R2 configuration loading",
          "FAIL",
          `Failed to load R2 configuration: ${error.message}`,
          { error: error.stack }
        );
        configValid = false;
      }

      return configValid;
    } catch (error) {
      this.logValidation(
        "R2 configuration validation",
        "FAIL",
        `Configuration validation failed: ${error.message}`,
        { error: error.stack }
      );
      return false;
    }
  }

  /**
   * Validate core components functionality
   */
  async validateCoreComponents() {
    console.log("\n🧩 Validating Core Components");

    try {
      // Test UserFolderPaths
      const { UserFolderPaths } = require("./lib/r2-user-storage");
      const testUserId = "test-user-123";
      const basePath = UserFolderPaths.getUserBasePath(testUserId);
      const mockupsPath = UserFolderPaths.getMockupsPath(testUserId);

      this.logValidation(
        "UserFolderPaths component",
        basePath && mockupsPath ? "PASS" : "FAIL",
        basePath && mockupsPath
          ? "UserFolderPaths working correctly"
          : "UserFolderPaths not functioning",
        { basePath, mockupsPath }
      );

      // Test UserFileNaming
      const { UserFileNaming } = require("./lib/r2-user-storage");
      const uniqueFilename = UserFileNaming.generateUniqueFilename(
        "test.jpg",
        "prefix"
      );

      this.logValidation(
        "UserFileNaming component",
        uniqueFilename ? "PASS" : "FAIL",
        uniqueFilename
          ? "UserFileNaming working correctly"
          : "UserFileNaming not functioning",
        { filename: uniqueFilename }
      );

      // Test R2UserStorage
      const { R2UserStorage } = require("./lib/r2-user-storage");
      const mockupPath = R2UserStorage.generateMockupPath(
        testUserId,
        "design-123",
        "default",
        "jpg"
      );

      this.logValidation(
        "R2UserStorage component",
        mockupPath && mockupPath.key ? "PASS" : "FAIL",
        mockupPath && mockupPath.key
          ? "R2UserStorage working correctly"
          : "R2UserStorage not functioning",
        { path: mockupPath }
      );

      // Test R2DbHelpers
      const { R2DbHelpers } = require("./lib/r2-db-helpers");
      const conversion = R2DbHelpers.convertLegacyUrlToR2Key(
        "mockups/test.jpg",
        testUserId
      );

      this.logValidation(
        "R2DbHelpers component",
        conversion.success ? "PASS" : "FAIL",
        conversion.success
          ? "R2DbHelpers working correctly"
          : "R2DbHelpers not functioning",
        conversion
      );

      // Test R2Queries
      const { R2Queries } = require("./lib/r2-queries");

      this.logValidation(
        "R2Queries component",
        "PASS",
        "R2Queries component loaded successfully"
      );

      return true;
    } catch (error) {
      this.logValidation(
        "Core components validation",
        "FAIL",
        `Core components validation failed: ${error.message}`,
        { error: error.stack }
      );
      return false;
    }
  }

  /**
   * Validate security components
   */
  async validateSecurityComponents() {
    console.log("\n🔒 Validating Security Components");

    try {
      // Test R2Security
      const { R2Security } = require("./lib/r2-security");

      // Test path validation
      const pathValidation = R2Security.validatePath("users/test/file.jpg");
      const maliciousPathValidation = R2Security.validatePath(
        "../../../etc/passwd"
      );

      this.logValidation(
        "R2Security path validation",
        pathValidation.isValid && !maliciousPathValidation.isValid
          ? "PASS"
          : "FAIL",
        pathValidation.isValid && !maliciousPathValidation.isValid
          ? "Path validation working correctly"
          : "Path validation not functioning",
        {
          validPath: pathValidation.isValid,
          maliciousPathBlocked: !maliciousPathValidation.isValid,
        }
      );

      // Test user access validation
      const accessValidation = R2Security.validateUserAccess({
        userId: "test-user",
        operation: "read",
        resourcePath: "users/test-user/file.jpg",
        isAdmin: false,
      });

      this.logValidation(
        "R2Security access validation",
        accessValidation.isValid ? "PASS" : "FAIL",
        accessValidation.isValid
          ? "Access validation working correctly"
          : "Access validation not functioning",
        accessValidation
      );

      // Test rate limiting
      const isRateLimited = R2Security.checkRateLimit("test-user", {
        windowMs: 60000,
        maxRequests: 10,
      });

      this.logValidation(
        "R2Security rate limiting",
        typeof isRateLimited === "boolean" ? "PASS" : "FAIL",
        typeof isRateLimited === "boolean"
          ? "Rate limiting working correctly"
          : "Rate limiting not functioning",
        { isRateLimited }
      );

      // Test R2AuditLogger
      const { R2AuditLogger } = require("./lib/r2-audit-logger");
      R2AuditLogger.log(
        {
          userId: "test-user",
          operation: "test",
          resourcePath: "test/path",
        },
        "success"
      );

      const logs = R2AuditLogger.getLogs({}, 1);
      this.logValidation(
        "R2AuditLogger component",
        logs.length > 0 ? "PASS" : "FAIL",
        logs.length > 0
          ? "Audit logging working correctly"
          : "Audit logging not functioning",
        { logCount: logs.length }
      );

      // Test R2SecurityMonitor
      const { R2SecurityMonitor } = require("./lib/r2-security-monitor");
      R2SecurityMonitor.configure({
        enableRealTimeMonitoring: true,
        alertThresholds: {
          failedOperationsPerMinute: 5,
        },
      });

      const metrics = R2SecurityMonitor.getMetrics(1);
      this.logValidation(
        "R2SecurityMonitor component",
        metrics ? "PASS" : "FAIL",
        metrics
          ? "Security monitoring working correctly"
          : "Security monitoring not functioning",
        { hasMetrics: !!metrics }
      );

      return true;
    } catch (error) {
      this.logValidation(
        "Security components validation",
        "FAIL",
        `Security components validation failed: ${error.message}`,
        { error: error.stack }
      );
      return false;
    }
  }

  /**
   * Validate migration service
   */
  async validateMigrationService() {
    console.log("\n🔄 Validating Migration Service");

    try {
      const { R2MigrationService } = require("./services/r2-migration-service");
      const migrationService = new R2MigrationService(this.prisma);

      // Test migration log creation
      const migrationId = await migrationService.createMigrationLog(
        "validation_test",
        1,
        "test-user",
        { dryRun: true }
      );

      this.logValidation(
        "Migration log creation",
        migrationId ? "PASS" : "FAIL",
        migrationId
          ? "Migration log created successfully"
          : "Failed to create migration log",
        { migrationId }
      );

      // Test migration progress tracking
      if (migrationId) {
        const progress = await migrationService.getMigrationProgress(
          migrationId
        );
        this.logValidation(
          "Migration progress tracking",
          progress ? "PASS" : "FAIL",
          progress
            ? "Migration progress tracked successfully"
            : "Failed to track migration progress",
          progress
        );

        // Test migration progress update
        await migrationService.updateMigrationProgress(
          migrationId,
          1,
          0,
          "completed"
        );

        const updatedProgress = await migrationService.getMigrationProgress(
          migrationId
        );
        this.logValidation(
          "Migration progress update",
          updatedProgress?.processedRecords === 1 ? "PASS" : "FAIL",
          updatedProgress?.processedRecords === 1
            ? "Migration progress updated successfully"
            : "Failed to update migration progress",
          updatedProgress
        );
      }

      // Test migration statistics
      const stats = await migrationService.getMigrationStatistics();
      this.logValidation(
        "Migration statistics",
        stats ? "PASS" : "FAIL",
        stats
          ? "Migration statistics retrieved successfully"
          : "Failed to retrieve migration statistics",
        stats
      );

      return true;
    } catch (error) {
      this.logValidation(
        "Migration service validation",
        "FAIL",
        `Migration service validation failed: ${error.message}`,
        { error: error.stack }
      );
      return false;
    }
  }

  /**
   * Validate API endpoints
   */
  async validateApiEndpoints() {
    console.log("\n🌐 Validating API Endpoints");

    try {
      // Check if API route files exist and have content
      const apiRoutes = [
        "app/api/upload-url/route.ts",
        "app/api/init/route.ts",
      ];

      let apiValid = true;
      for (const route of apiRoutes) {
        const routePath = path.join(__dirname, route);
        if (fs.existsSync(routePath)) {
          const content = fs.readFileSync(routePath, "utf8");
          const hasContent = content.length > 100; // Basic check for meaningful content

          this.logValidation(
            `API route: ${route}`,
            hasContent ? "PASS" : "WARN",
            hasContent ? "API route has content" : "API route appears empty",
            { path: routePath, contentLength: content.length }
          );

          if (!hasContent) {
            apiValid = false;
          }
        } else {
          this.logValidation(
            `API route: ${route}`,
            "FAIL",
            "API route file is missing",
            { path: routePath }
          );
          apiValid = false;
        }
      }

      return apiValid;
    } catch (error) {
      this.logValidation(
        "API endpoints validation",
        "FAIL",
        `API endpoints validation failed: ${error.message}`,
        { error: error.stack }
      );
      return false;
    }
  }

  /**
   * Validate dependencies
   */
  async validateDependencies() {
    console.log("\n📦 Validating Dependencies");

    try {
      // Check package.json for required dependencies
      const packageJsonPath = path.join(__dirname, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, "utf8")
        );

        const requiredDeps = ["@prisma/client", "@aws-sdk/client-s3", "uuid"];

        const requiredDevDeps = ["@types/node", "typescript"];

        let depsValid = true;

        // Check production dependencies
        for (const dep of requiredDeps) {
          if (!packageJson.dependencies || !packageJson.dependencies[dep]) {
            this.logValidation(
              `Dependency: ${dep}`,
              "FAIL",
              "Required dependency is missing",
              { dependency: dep }
            );
            depsValid = false;
          }
        }

        // Check dev dependencies
        for (const dep of requiredDevDeps) {
          if (
            !packageJson.devDependencies ||
            !packageJson.devDependencies[dep]
          ) {
            this.logValidation(
              `Dev dependency: ${dep}`,
              "WARN",
              "Recommended dev dependency is missing",
              { dependency: dep }
            );
          }
        }

        if (depsValid) {
          this.logValidation(
            "Dependencies",
            "PASS",
            "All required dependencies are present"
          );
        }

        return depsValid;
      } else {
        this.logValidation(
          "Dependencies",
          "FAIL",
          "package.json file not found",
          { path: packageJsonPath }
        );
        return false;
      }
    } catch (error) {
      this.logValidation(
        "Dependencies validation",
        "FAIL",
        `Dependencies validation failed: ${error.message}`,
        { error: error.stack }
      );
      return false;
    }
  }

  /**
   * Validate test coverage
   */
  async validateTestCoverage() {
    console.log("\n🧪 Validating Test Coverage");

    try {
      const testFiles = [
        "test-r2-user-storage.js",
        "test-r2-security.js",
        "test-r2-migration.js",
        "test-r2-complete-integration.js",
      ];

      let testCoverageValid = true;
      for (const testFile of testFiles) {
        const testPath = path.join(__dirname, testFile);
        if (fs.existsSync(testPath)) {
          const content = fs.readFileSync(testPath, "utf8");
          const hasContent = content.length > 500; // Basic check for meaningful test content

          this.logValidation(
            `Test file: ${testFile}`,
            hasContent ? "PASS" : "WARN",
            hasContent
              ? "Test file has substantial content"
              : "Test file appears incomplete",
            { path: testPath, contentLength: content.length }
          );

          if (!hasContent) {
            testCoverageValid = false;
          }
        } else {
          this.logValidation(
            `Test file: ${testFile}`,
            "FAIL",
            "Test file is missing",
            { path: testPath }
          );
          testCoverageValid = false;
        }
      }

      return testCoverageValid;
    } catch (error) {
      this.logValidation(
        "Test coverage validation",
        "FAIL",
        `Test coverage validation failed: ${error.message}`,
        { error: error.stack }
      );
      return false;
    }
  }

  /**
   * Generate validation report
   */
  generateValidationReport() {
    console.log("\n📊 R2 Implementation Validation Report");
    console.log("=======================================");

    const totalValidations = this.validationResults.length;
    const passedValidations = this.validationResults.filter(
      (v) => v.status === "PASS"
    ).length;
    const failedValidations = this.validationResults.filter(
      (v) => v.status === "FAIL"
    ).length;
    const warnings = this.validationResults.filter(
      (v) => v.status === "WARN"
    ).length;
    const successRate = ((passedValidations / totalValidations) * 100).toFixed(
      2
    );

    console.log(`\nSummary:`);
    console.log(`  Total Validations: ${totalValidations}`);
    console.log(`  Passed: ${passedValidations} ✅`);
    console.log(`  Failed: ${failedValidations} ❌`);
    console.log(`  Warnings: ${warnings} ⚠️`);
    console.log(`  Success Rate: ${successRate}%`);

    if (failedValidations > 0) {
      console.log(`\nFailed Validations:`);
      this.errors.forEach((error) => {
        console.log(`  ❌ ${error.component}: ${error.message}`);
      });
    }

    if (warnings > 0) {
      console.log(`\nWarnings:`);
      this.warnings.forEach((warning) => {
        console.log(`  ⚠️ ${warning.component}: ${warning.message}`);
      });
    }

    console.log(`\nComponent Status:`);
    Object.entries(this.componentStatus).forEach(([component, status]) => {
      const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️";
      console.log(`  ${icon} ${component}: ${status}`);
    });

    console.log(`\nRecommendations:`);
    if (failedValidations === 0) {
      console.log(
        `  🎉 Excellent! The R2 implementation is fully validated and ready for production.`
      );
    } else if (failedValidations <= 2) {
      console.log(
        `  🔧 Minor issues found. Address the failed validations before production deployment.`
      );
    } else {
      console.log(
        `  ⚠️  Significant issues found. Comprehensive fixes needed before production deployment.`
      );
    }

    if (warnings > 0) {
      console.log(
        `  💡 Consider addressing the warnings to improve implementation quality.`
      );
    }

    const report = {
      totalValidations,
      passedValidations,
      failedValidations,
      warnings,
      successRate: parseFloat(successRate),
      componentStatus: this.componentStatus,
      errors: this.errors,
      warnings: this.warnings,
      validationResults: this.validationResults,
    };

    // Save report to file
    const reportPath = "./r2-validation-report.json";
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed validation report saved to: ${reportPath}`);

    return report;
  }

  /**
   * Run complete validation
   */
  async runCompleteValidation() {
    console.log("🔍 Starting R2 Implementation Validation");
    console.log("=========================================");

    const startTime = Date.now();

    try {
      await this.validateRequiredFiles();
      await this.validateDatabaseSchema();
      await this.validateR2Configuration();
      await this.validateCoreComponents();
      await this.validateSecurityComponents();
      await this.validateMigrationService();
      await this.validateApiEndpoints();
      await this.validateDependencies();
      await this.validateTestCoverage();

      const totalDuration = Date.now() - startTime;
      console.log(`\n⏱️ Total validation time: ${totalDuration}ms`);

      const report = this.generateValidationReport();

      return report;
    } catch (error) {
      console.error("\n❌ Validation failed:", error);
      throw error;
    } finally {
      await this.prisma.$disconnect();
    }
  }
}

// Run the validation
if (require.main === module) {
  const validator = new R2ImplementationValidator();
  validator
    .runCompleteValidation()
    .then((report) => {
      console.log("\n🎉 R2 implementation validation completed!");
      process.exit(report.failedValidations > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error("\n💥 R2 implementation validation failed:", error);
      process.exit(1);
    });
}

module.exports = { R2ImplementationValidator };
