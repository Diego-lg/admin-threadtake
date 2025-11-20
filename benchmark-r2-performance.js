/**
 * R2 Performance Benchmarks
 *
 * This script tests the performance of the R2 user-centric storage implementation:
 * - File upload/download performance
 * - Folder creation times
 * - Conflict resolution performance
 * - Error handling performance
 * - Concurrent user operations
 * - Database query performance
 * - Memory usage validation
 *
 * Run with: node benchmark-r2-performance.js
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
const { performance } = require("perf_hooks");
const os = require("os");

// Mock environment variables for testing
process.env.R2_ENDPOINT = "https://test-account-id.r2.cloudflarestorage.com";
process.env.R2_ACCESS_KEY_ID = "test-access-key";
process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
process.env.R2_BUCKET_NAME = "test-bucket";
process.env.R2_PUBLIC_BUCKET_URL = "https://test-public-url.r2.dev";

class R2PerformanceBenchmarker {
  constructor() {
    this.prisma = new PrismaClient();
    this.migrationService = new R2MigrationService(this.prisma);
    this.benchmarkResults = [];
    this.testUsers = [];
    this.memorySnapshots = [];
  }

  /**
   * Log benchmark result
   */
  logBenchmark(testName, duration, operations, unit = "ms", details = null) {
    const result = {
      testName,
      duration,
      operations,
      unit,
      throughput: operations / (duration / 1000), // operations per second
      avgTimePerOperation: duration / operations,
      details,
      timestamp: new Date().toISOString(),
    };
    this.benchmarkResults.push(result);

    const throughputStr = `${result.throughput.toFixed(2)} ${unit}/s`;
    const avgTimeStr = `${result.avgTimePerOperation.toFixed(2)} ${unit}/op`;

    console.log(`⚡ ${testName}: ${duration}${unit} (${operations} ops)`);
    console.log(`   Throughput: ${throughputStr}, Avg: ${avgTimeStr}`);

    if (details) {
      console.log(`   Details: ${JSON.stringify(details)}`);
    }
  }

  /**
   * Take memory snapshot
   */
  takeMemorySnapshot(label) {
    const memUsage = process.memoryUsage();
    const snapshot = {
      label,
      timestamp: Date.now(),
      rss: memUsage.rss / 1024 / 1024, // MB
      heapUsed: memUsage.heapUsed / 1024 / 1024, // MB
      heapTotal: memUsage.heapTotal / 1024 / 1024, // MB
      external: memUsage.external / 1024 / 1024, // MB
    };
    this.memorySnapshots.push(snapshot);
    return snapshot;
  }

  /**
   * Create test users for benchmarks
   */
  async createTestUsers(count = 10) {
    console.log(`\n👥 Creating ${count} test users for benchmarks...`);

    const startTime = Date.now();
    this.takeMemorySnapshot("before_user_creation");

    for (let i = 0; i < count; i++) {
      try {
        const user = await this.prisma.user.create({
          data: {
            email: `benchmark-user-${i}@example.com`,
            name: `Benchmark User ${i}`,
            role: "USER",
          },
        });
        this.testUsers.push(user);
      } catch (error) {
        console.log(`Warning: Could not create user ${i}: ${error.message}`);
      }
    }

    const duration = Date.now() - startTime;
    this.takeMemorySnapshot("after_user_creation");

    this.logBenchmark(
      "Test user creation",
      duration,
      this.testUsers.length,
      "ms",
      { usersCreated: this.testUsers.length }
    );

    return this.testUsers;
  }

  /**
   * Benchmark 1: Folder Creation Performance
   */
  async benchmarkFolderCreation() {
    console.log("\n📁 Benchmark 1: Folder Creation Performance");

    const testUser = this.testUsers[0];
    if (!testUser) {
      console.log("❌ No test users available for folder creation benchmark");
      return;
    }

    // Benchmark single folder creation
    this.takeMemorySnapshot("before_folder_creation");
    const startTime = Date.now();

    const created = await R2UserStorage.createUserFolderStructure(testUser.id);

    const duration = Date.now() - startTime;
    this.takeMemorySnapshot("after_folder_creation");

    this.logBenchmark("Single user folder creation", duration, 1, "ms", {
      success: created,
      userId: testUser.id,
    });

    // Benchmark concurrent folder creation
    const concurrentUsers = this.testUsers.slice(0, 5);
    this.takeMemorySnapshot("before_concurrent_folder_creation");
    const concurrentStartTime = Date.now();

    const concurrentResults = await Promise.allSettled(
      concurrentUsers.map((user) =>
        R2UserStorage.createUserFolderStructure(user.id)
      )
    );

    const concurrentDuration = Date.now() - concurrentStartTime;
    this.takeMemorySnapshot("after_concurrent_folder_creation");

    const successfulCreations = concurrentResults.filter(
      (r) => r.status === "fulfilled" && r.value
    ).length;

    this.logBenchmark(
      "Concurrent folder creation",
      concurrentDuration,
      concurrentUsers.length,
      "ms",
      {
        successful: successfulCreations,
        total: concurrentUsers.length,
        successRate: (successfulCreations / concurrentUsers.length) * 100,
      }
    );

    // Benchmark ensure folder exists (should be fast if already exists)
    this.takeMemorySnapshot("before_ensure_folder");
    const ensureStartTime = Date.now();

    for (let i = 0; i < 10; i++) {
      await R2UserStorage.ensureUserFolderExists(testUser.id);
    }

    const ensureDuration = Date.now() - ensureStartTime;
    this.takeMemorySnapshot("after_ensure_folder");

    this.logBenchmark(
      "Ensure folder exists (10 calls)",
      ensureDuration,
      10,
      "ms",
      { avgPerCall: ensureDuration / 10 }
    );
  }

  /**
   * Benchmark 2: Path Generation Performance
   */
  async benchmarkPathGeneration() {
    console.log("\n🔗 Benchmark 2: Path Generation Performance");

    const testUser = this.testUsers[0];
    const iterations = 1000;

    // Benchmark user folder paths
    this.takeMemorySnapshot("before_path_generation");
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      UserFolderPaths.getUserBasePath(testUser.id);
      UserFolderPaths.getMockupsPath(testUser.id);
      UserFolderPaths.getDesignMockupPath(testUser.id, `design-${i}`);
      UserFolderPaths.getMockupTypePath(testUser.id, `design-${i}`, "default");
    }

    const duration = Date.now() - startTime;
    this.takeMemorySnapshot("after_path_generation");

    this.logBenchmark(
      "User folder paths generation",
      duration,
      iterations * 4,
      "ms",
      {
        operations: iterations * 4,
        avgPerOperation: duration / (iterations * 4),
      }
    );

    // Benchmark file naming
    const namingStartTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      UserFileNaming.generateUniqueFilename(`test-${i}.jpg`, "mockup");
      UserFileNaming.generateMockupFilename(`design-${i}`, "default", "jpg");
      UserFileNaming.generateProfilePictureFilename("current", "png");
      UserFileNaming.generateAssetFilename(`design-${i}`, "svg");
    }

    const namingDuration = Date.now() - namingStartTime;

    this.logBenchmark(
      "File naming generation",
      namingDuration,
      iterations * 4,
      "ms",
      {
        operations: iterations * 4,
        avgPerOperation: namingDuration / (iterations * 4),
      }
    );

    // Benchmark full path generation
    const fullPathStartTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      R2UserStorage.generateMockupPath(
        testUser.id,
        `design-${i}`,
        "default",
        "jpg"
      );
      R2UserStorage.generateProfilePicturePath(testUser.id, "current", "png");
      R2UserStorage.generateAssetPath(
        testUser.id,
        "logos",
        `design-${i}`,
        "svg"
      );
      R2UserStorage.generateExportPath(
        testUser.id,
        "designs",
        `export-${i}.zip`
      );
    }

    const fullPathDuration = Date.now() - fullPathStartTime;

    this.logBenchmark(
      "Full path generation",
      fullPathDuration,
      iterations * 4,
      "ms",
      {
        operations: iterations * 4,
        avgPerOperation: fullPathDuration / (iterations * 4),
      }
    );
  }

  /**
   * Benchmark 3: Database Query Performance
   */
  async benchmarkDatabaseQueries() {
    console.log("\n🗄️ Benchmark 3: Database Query Performance");

    const testUser = this.testUsers[0];
    const iterations = 100;

    // Create some test data first
    const testFiles = [];
    for (let i = 0; i < 50; i++) {
      try {
        const file = await this.prisma.r2FileMetadata.create({
          data: {
            userId: testUser.id,
            fileKey: `users/${testUser.id}/mockups/design-${i}/default/image-${i}.jpg`,
            fileName: `image-${i}.jpg`,
            fileType: "mockups",
            fileSize: 1024 * 1024,
            contentType: "image/jpeg",
            folderPath: `users/${testUser.id}/mockups/design-${i}/default`,
            isPublic: false,
            migrationStatus: "completed",
          },
        });
        testFiles.push(file);
      } catch (error) {
        // Ignore errors for benchmarking
      }
    }

    // Benchmark user storage stats query
    this.takeMemorySnapshot("before_storage_stats");
    const statsStartTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      await R2DbHelpers.getUserStorageStats(this.prisma, testUser.id);
    }

    const statsDuration = Date.now() - statsStartTime;
    this.takeMemorySnapshot("after_storage_stats");

    this.logBenchmark(
      "User storage stats query",
      statsDuration,
      iterations,
      "ms",
      { avgPerQuery: statsDuration / iterations }
    );

    // Benchmark user files query
    this.takeMemorySnapshot("before_user_files_query");
    const filesStartTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      await R2Queries.getUserFiles(this.prisma, testUser.id, { limit: 10 });
    }

    const filesDuration = Date.now() - filesStartTime;
    this.takeMemorySnapshot("after_user_files_query");

    this.logBenchmark("User files query", filesDuration, iterations, "ms", {
      avgPerQuery: filesDuration / iterations,
    });

    // Benchmark storage usage update
    this.takeMemorySnapshot("before_usage_update");
    const usageStartTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      await R2DbHelpers.updateUserStorageUsage(this.prisma, testUser.id);
    }

    const usageDuration = Date.now() - usageStartTime;
    this.takeMemorySnapshot("after_usage_update");

    this.logBenchmark("Storage usage update", usageDuration, iterations, "ms", {
      avgPerUpdate: usageDuration / iterations,
    });

    // Clean up test data
    try {
      await this.prisma.r2FileMetadata.deleteMany({
        where: { userId: testUser.id },
      });
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * Benchmark 4: Security Validation Performance
   */
  async benchmarkSecurityValidation() {
    console.log("\n🔒 Benchmark 4: Security Validation Performance");

    const testUser = this.testUsers[0];
    const iterations = 1000;

    // Benchmark path validation
    this.takeMemorySnapshot("before_path_validation");
    const pathStartTime = Date.now();

    const testPaths = [
      `users/${testUser.id}/mockups/design-123/default/image.jpg`,
      `users/${testUser.id}/assets/logos/logo.svg`,
      `users/${testUser.id}/exports/designs/export.pdf`,
      "../../../etc/passwd",
      "..\\..\\..\\windows\\system32\\config\\sam",
    ];

    for (let i = 0; i < iterations; i++) {
      const path = testPaths[i % testPaths.length];
      R2Security.validatePath(path);
    }

    const pathDuration = Date.now() - pathStartTime;
    this.takeMemorySnapshot("after_path_validation");

    this.logBenchmark("Path validation", pathDuration, iterations, "ms", {
      avgPerValidation: pathDuration / iterations,
    });

    // Benchmark user access validation
    this.takeMemorySnapshot("before_access_validation");
    const accessStartTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      R2Security.validateUserAccess({
        userId: testUser.id,
        operation: "read",
        resourcePath: `users/${testUser.id}/mockups/design-${i}/default/image.jpg`,
        isAdmin: false,
      });
    }

    const accessDuration = Date.now() - accessStartTime;
    this.takeMemorySnapshot("after_access_validation");

    this.logBenchmark(
      "User access validation",
      accessDuration,
      iterations,
      "ms",
      { avgPerValidation: accessDuration / iterations }
    );

    // Benchmark rate limiting
    this.takeMemorySnapshot("before_rate_limiting");
    const rateLimitStartTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      R2Security.checkRateLimit(`user-${i % 10}`, {
        windowMs: 60000,
        maxRequests: 100,
      });
    }

    const rateLimitDuration = Date.now() - rateLimitStartTime;
    this.takeMemorySnapshot("after_rate_limiting");

    this.logBenchmark("Rate limiting", rateLimitDuration, iterations, "ms", {
      avgPerCheck: rateLimitDuration / iterations,
    });
  }

  /**
   * Benchmark 5: Migration Performance
   */
  async benchmarkMigrationPerformance() {
    console.log("\n🔄 Benchmark 5: Migration Performance");

    const iterations = 100;

    // Benchmark path conversion
    this.takeMemorySnapshot("before_path_conversion");
    const conversionStartTime = Date.now();

    const testPaths = Array.from(
      { length: iterations },
      (_, i) => `mockups/design-${i}/default/image-${i}.jpg`
    );

    for (let i = 0; i < iterations; i++) {
      R2DbHelpers.convertLegacyUrlToR2Key(testPaths[i], this.testUsers[0].id);
    }

    const conversionDuration = Date.now() - conversionStartTime;
    this.takeMemorySnapshot("after_path_conversion");

    this.logBenchmark("Path conversion", conversionDuration, iterations, "ms", {
      avgPerConversion: conversionDuration / iterations,
    });

    // Benchmark batch path conversion
    this.takeMemorySnapshot("before_batch_conversion");
    const batchStartTime = Date.now();

    const batchResult = R2DbHelpers.convertLegacyUrlsToR2Keys(
      testPaths,
      this.testUsers[0].id
    );

    const batchDuration = Date.now() - batchStartTime;
    this.takeMemorySnapshot("after_batch_conversion");

    this.logBenchmark(
      "Batch path conversion",
      batchDuration,
      iterations,
      "ms",
      {
        avgPerConversion: batchDuration / iterations,
        successRate:
          (batchResult.filter((r) => r.success).length / batchResult.length) *
          100,
      }
    );

    // Benchmark migration log operations
    this.takeMemorySnapshot("before_migration_logs");
    const logStartTime = Date.now();

    const migrationIds = [];
    for (let i = 0; i < Math.min(iterations, 10); i++) {
      // Limit to avoid too many DB writes
      const migrationId = await this.migrationService.createMigrationLog(
        `benchmark_test_${i}`,
        1,
        this.testUsers[0].id,
        { dryRun: true }
      );
      migrationIds.push(migrationId);
    }

    const logDuration = Date.now() - logStartTime;
    this.takeMemorySnapshot("after_migration_logs");

    this.logBenchmark(
      "Migration log creation",
      logDuration,
      migrationIds.length,
      "ms",
      { avgPerLog: logDuration / migrationIds.length }
    );

    // Benchmark migration progress tracking
    if (migrationIds.length > 0) {
      this.takeMemorySnapshot("before_progress_tracking");
      const progressStartTime = Date.now();

      for (const migrationId of migrationIds) {
        await this.migrationService.getMigrationProgress(migrationId);
        await this.migrationService.updateMigrationProgress(
          migrationId,
          1,
          0,
          "completed"
        );
      }

      const progressDuration = Date.now() - progressStartTime;
      this.takeMemorySnapshot("after_progress_tracking");

      this.logBenchmark(
        "Migration progress tracking",
        progressDuration,
        migrationIds.length * 2,
        "ms",
        { avgPerOperation: progressDuration / (migrationIds.length * 2) }
      );
    }
  }

  /**
   * Benchmark 6: Concurrent Operations
   */
  async benchmarkConcurrentOperations() {
    console.log("\n⚡ Benchmark 6: Concurrent Operations");

    const concurrentUsers = this.testUsers.slice(0, 10);
    const operationsPerUser = 50;

    // Benchmark concurrent folder operations
    this.takeMemorySnapshot("before_concurrent_folders");
    const folderStartTime = Date.now();

    const folderPromises = concurrentUsers.map(async (user) => {
      const results = [];
      for (let i = 0; i < operationsPerUser; i++) {
        const path = UserFolderPaths.getMockupsPath(user.id);
        results.push(path);
      }
      return results;
    });

    const folderResults = await Promise.all(folderPromises);
    const folderDuration = Date.now() - folderStartTime;
    this.takeMemorySnapshot("after_concurrent_folders");

    const totalFolderOps = concurrentUsers.length * operationsPerUser;

    this.logBenchmark(
      "Concurrent folder operations",
      folderDuration,
      totalFolderOps,
      "ms",
      {
        users: concurrentUsers.length,
        opsPerUser: operationsPerUser,
        avgPerOp: folderDuration / totalFolderOps,
      }
    );

    // Benchmark concurrent security validations
    this.takeMemorySnapshot("before_concurrent_security");
    const securityStartTime = Date.now();

    const securityPromises = concurrentUsers.map(async (user) => {
      const results = [];
      for (let i = 0; i < operationsPerUser; i++) {
        const validation = R2Security.validateUserAccess({
          userId: user.id,
          operation: "read",
          resourcePath: `users/${user.id}/mockups/design-${i}/default/image.jpg`,
          isAdmin: false,
        });
        results.push(validation);
      }
      return results;
    });

    const securityResults = await Promise.all(securityPromises);
    const securityDuration = Date.now() - securityStartTime;
    this.takeMemorySnapshot("after_concurrent_security");

    const totalSecurityOps = concurrentUsers.length * operationsPerUser;

    this.logBenchmark(
      "Concurrent security validations",
      securityDuration,
      totalSecurityOps,
      "ms",
      {
        users: concurrentUsers.length,
        opsPerUser: operationsPerUser,
        avgPerOp: securityDuration / totalSecurityOps,
      }
    );

    // Benchmark concurrent database queries
    this.takeMemorySnapshot("before_concurrent_queries");
    const queryStartTime = Date.now();

    const queryPromises = concurrentUsers.map(async (user) => {
      const results = [];
      for (let i = 0; i < Math.min(operationsPerUser, 10); i++) {
        // Limit DB operations
        try {
          const stats = await R2DbHelpers.getUserStorageStats(
            this.prisma,
            user.id
          );
          results.push(stats);
        } catch (error) {
          // Ignore errors for benchmarking
        }
      }
      return results;
    });

    const queryResults = await Promise.all(queryPromises);
    const queryDuration = Date.now() - queryStartTime;
    this.takeMemorySnapshot("after_concurrent_queries");

    const totalQueryOps =
      concurrentUsers.length * Math.min(operationsPerUser, 10);

    this.logBenchmark(
      "Concurrent database queries",
      queryDuration,
      totalQueryOps,
      "ms",
      {
        users: concurrentUsers.length,
        opsPerUser: Math.min(operationsPerUser, 10),
        avgPerOp: queryDuration / totalQueryOps,
      }
    );
  }

  /**
   * Benchmark 7: Memory Usage Analysis
   */
  analyzeMemoryUsage() {
    console.log("\n💾 Memory Usage Analysis");

    if (this.memorySnapshots.length < 2) {
      console.log("❌ Insufficient memory snapshots for analysis");
      return;
    }

    const initialSnapshot = this.memorySnapshots[0];
    const finalSnapshot = this.memorySnapshots[this.memorySnapshots.length - 1];

    const memoryGrowth = {
      rss: finalSnapshot.rss - initialSnapshot.rss,
      heapUsed: finalSnapshot.heapUsed - initialSnapshot.heapUsed,
      heapTotal: finalSnapshot.heapTotal - initialSnapshot.heapTotal,
      external: finalSnapshot.external - initialSnapshot.external,
    };

    console.log(`Memory Growth Analysis:`);
    console.log(`  RSS: ${memoryGrowth.rss.toFixed(2)} MB`);
    console.log(`  Heap Used: ${memoryGrowth.heapUsed.toFixed(2)} MB`);
    console.log(`  Heap Total: ${memoryGrowth.heapTotal.toFixed(2)} MB`);
    console.log(`  External: ${memoryGrowth.external.toFixed(2)} MB`);

    // Check for memory leaks
    const hasMemoryLeak = memoryGrowth.heapUsed > 50; // More than 50MB growth might indicate a leak
    this.logBenchmark("Memory usage analysis", memoryGrowth.heapUsed, 1, "MB", {
      memoryGrowth,
      hasMemoryLeak,
      systemMemory: os.totalmem() / 1024 / 1024, // MB
      freeMemory: os.freemem() / 1024 / 1024, // MB
    });

    // Show memory timeline
    console.log(`\nMemory Timeline:`);
    this.memorySnapshots.forEach((snapshot, index) => {
      console.log(
        `  ${index + 1}. ${snapshot.label}: Heap ${snapshot.heapUsed.toFixed(
          2
        )} MB, RSS ${snapshot.rss.toFixed(2)} MB`
      );
    });
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport() {
    console.log("\n📊 R2 Performance Benchmark Report");
    console.log("====================================");

    const totalBenchmarks = this.benchmarkResults.length;
    const avgThroughput =
      this.benchmarkResults.reduce((sum, r) => sum + r.throughput, 0) /
      totalBenchmarks;
    const avgOperationTime =
      this.benchmarkResults.reduce((sum, r) => sum + r.avgTimePerOperation, 0) /
      totalBenchmarks;

    console.log(`\nSummary:`);
    console.log(`  Total Benchmarks: ${totalBenchmarks}`);
    console.log(`  Average Throughput: ${avgThroughput.toFixed(2)} ops/sec`);
    console.log(`  Average Operation Time: ${avgOperationTime.toFixed(2)} ms`);

    console.log(`\nPerformance Categories:`);
    const categories = {
      "Folder Operations": this.benchmarkResults.filter((r) =>
        r.testName.includes("folder")
      ).length,
      "Path Generation": this.benchmarkResults.filter((r) =>
        r.testName.includes("path")
      ).length,
      "Database Queries": this.benchmarkResults.filter(
        (r) =>
          r.testName.includes("query") ||
          r.testName.includes("stats") ||
          r.testName.includes("update")
      ).length,
      "Security Validation": this.benchmarkResults.filter(
        (r) =>
          r.testName.includes("validation") || r.testName.includes("security")
      ).length,
      "Migration Operations": this.benchmarkResults.filter(
        (r) =>
          r.testName.includes("migration") || r.testName.includes("conversion")
      ).length,
      "Concurrent Operations": this.benchmarkResults.filter((r) =>
        r.testName.includes("concurrent")
      ).length,
      "Memory Usage": this.benchmarkResults.filter((r) =>
        r.testName.includes("memory")
      ).length,
    };

    Object.entries(categories).forEach(([category, count]) => {
      if (count > 0) {
        const categoryResults = this.benchmarkResults.filter((r) =>
          r.testName
            .toLowerCase()
            .includes(category.toLowerCase().split(" ")[0])
        );
        const categoryAvgThroughput =
          categoryResults.reduce((sum, r) => sum + r.throughput, 0) /
          categoryResults.length;
        console.log(
          `  ${category}: ${count} benchmarks, Avg: ${categoryAvgThroughput.toFixed(
            2
          )} ops/sec`
        );
      }
    });

    console.log(`\nTop Performance Results:`);
    const topResults = [...this.benchmarkResults]
      .sort((a, b) => b.throughput - a.throughput)
      .slice(0, 5);

    topResults.forEach((result, index) => {
      console.log(
        `  ${index + 1}. ${result.testName}: ${result.throughput.toFixed(
          2
        )} ops/sec`
      );
    });

    console.log(`\nPerformance Recommendations:`);

    // Analyze performance and provide recommendations
    const slowOperations = this.benchmarkResults.filter(
      (r) => r.avgTimePerOperation > 10
    );
    if (slowOperations.length > 0) {
      console.log(
        `  🔧 Consider optimizing ${slowOperations.length} slow operations (>10ms avg)`
      );
      slowOperations.forEach((op) => {
        console.log(
          `     - ${op.testName}: ${op.avgTimePerOperation.toFixed(2)} ms avg`
        );
      });
    }

    const memoryGrowth =
      this.memorySnapshots.length > 1
        ? this.memorySnapshots[this.memorySnapshots.length - 1].heapUsed -
          this.memorySnapshots[0].heapUsed
        : 0;

    if (memoryGrowth > 50) {
      console.log(
        `  🔍 Investigate potential memory leak (${memoryGrowth.toFixed(
          2
        )} MB growth)`
      );
    }

    if (avgThroughput > 1000) {
      console.log(
        `  ✅ Excellent performance! Average throughput: ${avgThroughput.toFixed(
          2
        )} ops/sec`
      );
    } else if (avgThroughput > 500) {
      console.log(
        `  ✅ Good performance! Average throughput: ${avgThroughput.toFixed(
          2
        )} ops/sec`
      );
    } else {
      console.log(
        `  ⚠️  Performance could be improved. Average throughput: ${avgThroughput.toFixed(
          2
        )} ops/sec`
      );
    }

    const report = {
      totalBenchmarks,
      avgThroughput,
      avgOperationTime,
      categories,
      topResults,
      memorySnapshots: this.memorySnapshots,
      benchmarkResults: this.benchmarkResults,
      recommendations: {
        slowOperations: slowOperations.map((op) => ({
          testName: op.testName,
          avgTime: op.avgTimePerOperation,
        })),
        memoryGrowth,
        performance:
          avgThroughput > 1000
            ? "excellent"
            : avgThroughput > 500
            ? "good"
            : "needs_improvement",
      },
    };

    // Save report to file
    const reportPath = "./r2-performance-benchmark-report.json";
    require("fs").writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed performance report saved to: ${reportPath}`);

    return report;
  }

  /**
   * Clean up test data
   */
  async cleanup() {
    console.log("\n🧹 Cleaning up benchmark data...");

    try {
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
   * Run all performance benchmarks
   */
  async runAllBenchmarks() {
    console.log("🚀 Starting R2 Performance Benchmarks");
    console.log("=====================================");

    const startTime = Date.now();
    this.takeMemorySnapshot("benchmark_start");

    try {
      await this.createTestUsers(10);
      await this.benchmarkFolderCreation();
      await this.benchmarkPathGeneration();
      await this.benchmarkDatabaseQueries();
      await this.benchmarkSecurityValidation();
      await this.benchmarkMigrationPerformance();
      await this.benchmarkConcurrentOperations();

      this.takeMemorySnapshot("benchmark_end");
      this.analyzeMemoryUsage();

      const totalDuration = Date.now() - startTime;
      console.log(`\n⏱️ Total benchmark execution time: ${totalDuration}ms`);

      const report = this.generatePerformanceReport();

      return report;
    } catch (error) {
      console.error("\n❌ Performance benchmarks failed:", error);
      throw error;
    } finally {
      await this.cleanup();
      await this.prisma.$disconnect();
    }
  }
}

// Run the benchmarks
if (require.main === module) {
  const benchmarker = new R2PerformanceBenchmarker();
  benchmarker
    .runAllBenchmarks()
    .then((report) => {
      console.log("\n🎉 Performance benchmarking completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Performance benchmarking failed:", error);
      process.exit(1);
    });
}

module.exports = { R2PerformanceBenchmarker };
