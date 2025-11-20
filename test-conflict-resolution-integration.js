/**
 * Integration test for R2 Conflict Resolution System
 * This test verifies the end-to-end functionality of the conflict resolution system
 */

const {
  R2ConflictResolver,
  ConflictResolutionStrategy,
} = require("./lib/r2-conflict-resolver");

async function testConflictResolutionIntegration() {
  console.log("🧪 Starting Conflict Resolution Integration Tests...\n");

  // Test 1: Basic Conflict Detection
  console.log("Test 1: Basic Conflict Detection");
  try {
    const resolver = new R2ConflictResolver();

    // Mock a conflict scenario
    const mockConflict = {
      originalName: "test-file.jpg",
      conflictingPath: "users/test-user/mockups/test-file.jpg",
      conflictType: "exact_name_match",
      existingFiles: [
        {
          key: "users/test-user/mockups/test-file.jpg",
          name: "test-file.jpg",
          size: 1024,
          lastModified: new Date(),
          isDuplicate: true,
        },
      ],
      suggestedResolutions: [],
      defaultStrategy: ConflictResolutionStrategy.TIMESTAMP,
    };

    // Test timestamp resolution
    const timestampResolution = await resolver.resolveConflict(
      "test-user",
      mockConflict,
      ConflictResolutionStrategy.TIMESTAMP
    );

    console.log("✅ Timestamp resolution:", timestampResolution.resolvedName);
    console.log("✅ Strategy:", timestampResolution.strategy);
    console.log(
      "✅ Requires user input:",
      timestampResolution.requiresUserInput
    );

    // Test UUID resolution
    const uuidResolution = await resolver.resolveConflict(
      "test-user",
      mockConflict,
      ConflictResolutionStrategy.UUID
    );

    console.log("✅ UUID resolution:", uuidResolution.resolvedName);
    console.log("✅ Strategy:", uuidResolution.strategy);

    // Test sequential resolution
    const sequentialResolution = await resolver.resolveConflict(
      "test-user",
      mockConflict,
      ConflictResolutionStrategy.SEQUENTIAL
    );

    console.log("✅ Sequential resolution:", sequentialResolution.resolvedName);
    console.log("✅ Strategy:", sequentialResolution.strategy);

    console.log("✅ Test 1 passed\n");
  } catch (error) {
    console.error("❌ Test 1 failed:", error.message);
    return false;
  }

  // Test 2: Content Hash Generation
  console.log("Test 2: Content Hash Generation");
  try {
    const resolver = new R2ConflictResolver();
    const content1 = Buffer.from("test content");
    const content2 = Buffer.from("test content");
    const content3 = Buffer.from("different content");

    const hash1 = resolver.generateContentHash(content1);
    const hash2 = resolver.generateContentHash(content2);
    const hash3 = resolver.generateContentHash(content3);

    console.log("✅ Hash 1:", hash1);
    console.log("✅ Hash 2:", hash2);
    console.log("✅ Hash 3:", hash3);

    if (hash1 === hash2) {
      console.log("✅ Same content produces same hash");
    } else {
      throw new Error("Same content should produce same hash");
    }

    if (hash1 !== hash3) {
      console.log("✅ Different content produces different hash");
    } else {
      throw new Error("Different content should produce different hash");
    }

    console.log("✅ Test 2 passed\n");
  } catch (error) {
    console.error("❌ Test 2 failed:", error.message);
    return false;
  }

  // Test 3: Configuration Management
  console.log("Test 3: Configuration Management");
  try {
    const resolver = new R2ConflictResolver();

    // Test default configuration
    const defaultConfig = resolver.getConfig();
    console.log("✅ Default strategy:", defaultConfig.defaultStrategy);
    console.log(
      "✅ Version control enabled:",
      defaultConfig.enableVersionControl
    );
    console.log("✅ Max versions:", defaultConfig.maxVersions);

    // Test configuration update
    resolver.updateConfig({
      defaultStrategy: ConflictResolutionStrategy.UUID,
      maxVersions: 5,
    });

    const updatedConfig = resolver.getConfig();
    console.log("✅ Updated strategy:", updatedConfig.defaultStrategy);
    console.log("✅ Updated max versions:", updatedConfig.maxVersions);

    if (updatedConfig.defaultStrategy === ConflictResolutionStrategy.UUID) {
      console.log("✅ Configuration update successful");
    } else {
      throw new Error("Configuration update failed");
    }

    console.log("✅ Test 3 passed\n");
  } catch (error) {
    console.error("❌ Test 3 failed:", error.message);
    return false;
  }

  // Test 4: Batch Conflict Resolution
  console.log("Test 4: Batch Conflict Resolution");
  try {
    const resolver = new R2ConflictResolver();

    const mockConflicts = [
      {
        originalName: "file1.jpg",
        conflictingPath: "users/test-user/mockups/file1.jpg",
        conflictType: "exact_name_match",
        existingFiles: [],
        suggestedResolutions: [],
        defaultStrategy: ConflictResolutionStrategy.TIMESTAMP,
      },
      {
        originalName: "file2.jpg",
        conflictingPath: "users/test-user/mockups/file2.jpg",
        conflictType: "exact_name_match",
        existingFiles: [],
        suggestedResolutions: [],
        defaultStrategy: ConflictResolutionStrategy.TIMESTAMP,
      },
    ];

    const batchResult = await resolver.resolveBatchConflicts(
      "test-user",
      mockConflicts,
      ConflictResolutionStrategy.TIMESTAMP
    );

    console.log("✅ Total files:", batchResult.totalFiles);
    console.log("✅ Resolutions:", batchResult.resolutions.length);
    console.log("✅ Errors:", batchResult.errors.length);
    console.log("✅ Skipped:", batchResult.skipped.length);

    if (batchResult.totalFiles === 2 && batchResult.resolutions.length === 2) {
      console.log("✅ Batch resolution successful");
    } else {
      throw new Error("Batch resolution failed");
    }

    console.log("✅ Test 4 passed\n");
  } catch (error) {
    console.error("❌ Test 4 failed:", error.message);
    return false;
  }

  // Test 5: Error Handling
  console.log("Test 5: Error Handling");
  try {
    const resolver = new R2ConflictResolver();

    // Test invalid strategy for rename (should require custom name)
    try {
      await resolver.resolveConflict(
        "test-user",
        {
          originalName: "test.jpg",
          conflictingPath: "test.jpg",
          conflictType: "exact_name_match",
          existingFiles: [],
          suggestedResolutions: [],
          defaultStrategy: ConflictResolutionStrategy.RENAME,
        },
        ConflictResolutionStrategy.RENAME
      );
      throw new Error("Should have thrown error for missing custom name");
    } catch (error) {
      if (error.message.includes("Custom name is required")) {
        console.log("✅ Properly validates required custom name");
      } else {
        throw error;
      }
    }

    // Test valid rename with custom name
    const renameResult = await resolver.resolveConflict(
      "test-user",
      {
        originalName: "test.jpg",
        conflictingPath: "test.jpg",
        conflictType: "exact_name_match",
        existingFiles: [],
        suggestedResolutions: [],
        defaultStrategy: ConflictResolutionStrategy.RENAME,
      },
      ConflictResolutionStrategy.RENAME,
      "custom-name.jpg"
    );

    if (renameResult.resolvedName === "custom-name.jpg") {
      console.log("✅ Custom name resolution works correctly");
    } else {
      throw new Error("Custom name resolution failed");
    }

    console.log("✅ Test 5 passed\n");
  } catch (error) {
    console.error("❌ Test 5 failed:", error.message);
    return false;
  }

  console.log("🎉 All conflict resolution integration tests passed!");
  return true;
}

// Run the tests
if (require.main === module) {
  testConflictResolutionIntegration()
    .then((success) => {
      if (success) {
        console.log("\n✅ All tests completed successfully!");
        process.exit(0);
      } else {
        console.log("\n❌ Some tests failed!");
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error("\n💥 Test suite crashed:", error);
      process.exit(1);
    });
}

module.exports = { testConflictResolutionIntegration };
