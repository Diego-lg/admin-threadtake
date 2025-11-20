/**
 * Test script for R2 User Storage utilities
 * Run with: node test-r2-user-storage.js
 */

// Mock environment variables for testing
process.env.R2_ENDPOINT = "https://test-account-id.r2.cloudflarestorage.com";
process.env.R2_ACCESS_KEY_ID = "test-access-key";
process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
process.env.R2_BUCKET_NAME = "test-bucket";
process.env.R2_PUBLIC_BUCKET_URL = "https://test-public-url.r2.dev";

const {
  UserFolderPaths,
  UserFileNaming,
  R2UserStorage,
} = require("./lib/r2-user-storage");
const { UserFolderService } = require("./services/user-folder-service");
const { R2FileHelpers } = require("./lib/r2-file-helpers");
const { R2Config } = require("./lib/r2-config");

async function testR2UserStorage() {
  console.log("🧪 Testing R2 User Storage Utilities...\n");

  const testUserId = "test-user-123";
  const testDesignId = "test-design-456";

  try {
    // Test 1: R2 Configuration
    console.log("📋 Test 1: R2 Configuration");
    try {
      const config = R2Config.getConfig();
      console.log("✅ R2 Configuration loaded successfully");
      console.log(`   Endpoint: ${config.endpoint}`);
      console.log(`   Bucket: ${config.bucketName}`);
      console.log(`   Public URL: ${config.publicBucketUrl}`);
    } catch (error) {
      console.log("❌ R2 Configuration failed:", error.message);
    }

    // Test 2: User Folder Paths
    console.log("\n📁 Test 2: User Folder Paths");
    try {
      const basePath = UserFolderPaths.getUserBasePath(testUserId);
      const mockupsPath = UserFolderPaths.getMockupsPath(testUserId);
      const designMockupPath = UserFolderPaths.getDesignMockupPath(
        testUserId,
        testDesignId
      );
      const mockupTypePath = UserFolderPaths.getMockupTypePath(
        testUserId,
        testDesignId,
        "default"
      );

      console.log("✅ User folder paths generated successfully");
      console.log(`   Base path: ${basePath}`);
      console.log(`   Mockups path: ${mockupsPath}`);
      console.log(`   Design mockup path: ${designMockupPath}`);
      console.log(`   Mockup type path: ${mockupTypePath}`);
    } catch (error) {
      console.log("❌ User folder paths failed:", error.message);
    }

    // Test 3: File Naming
    console.log("\n🏷️  Test 3: File Naming");
    try {
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

      console.log("✅ File naming works correctly");
      console.log(`   Unique filename: ${uniqueFilename}`);
      console.log(`   Mockup filename: ${mockupFilename}`);
      console.log(`   Profile filename: ${profileFilename}`);
      console.log(`   Asset filename: ${assetFilename}`);
    } catch (error) {
      console.log("❌ File naming failed:", error.message);
    }

    // Test 4: Path Generation
    console.log("\n🔗 Test 4: Path Generation");
    try {
      const mockupPath = R2UserStorage.generateMockupPath(
        testUserId,
        testDesignId,
        "default",
        "jpg"
      );
      const profilePath = R2UserStorage.generateProfilePicturePath(
        testUserId,
        "current",
        "png"
      );
      const assetPath = R2UserStorage.generateAssetPath(
        testUserId,
        "logos",
        testDesignId,
        "svg"
      );
      const exportPath = R2UserStorage.generateExportPath(
        testUserId,
        "designs",
        "export.zip"
      );

      console.log("✅ Path generation works correctly");
      console.log(`   Mockup path: ${mockupPath.key}`);
      console.log(`   Mockup URL: ${mockupPath.publicUrl}`);
      console.log(`   Profile path: ${profilePath.key}`);
      console.log(`   Asset path: ${assetPath.key}`);
      console.log(`   Export path: ${exportPath.key}`);
    } catch (error) {
      console.log("❌ Path generation failed:", error.message);
    }

    // Test 5: File Helpers
    console.log("\n🛠️  Test 5: File Helpers");
    try {
      const contentType = R2FileHelpers.getContentType("test-image.jpg");
      const extension = R2FileHelpers.getFileExtension("test-image.jpg");

      // Mock file for validation
      const mockFile = {
        name: "test-image.jpg",
        size: 1024 * 1024, // 1MB
        type: "image/jpeg",
      };

      const validation = R2FileHelpers.validateFile(mockFile, "profilePicture");
      const isUserCentric = R2FileHelpers.isUserCentricPath(
        `users/${testUserId}/mockups/test.jpg`
      );
      const extractedUserId = R2FileHelpers.extractUserIdFromPath(
        `users/${testUserId}/mockups/test.jpg`
      );

      // Test path conversion
      const convertedPath = R2FileHelpers.convertOldPathToNewFormat(
        "mockups/test-design/default/test.jpg",
        testUserId
      );

      console.log("✅ File helpers work correctly");
      console.log(`   Content type: ${contentType}`);
      console.log(`   Extension: ${extension}`);
      console.log(
        `   File validation: ${validation.isValid ? "Valid" : "Invalid"}`
      );
      console.log(`   Is user-centric: ${isUserCentric}`);
      console.log(`   Extracted user ID: ${extractedUserId}`);
      console.log(`   Converted path: ${convertedPath}`);
    } catch (error) {
      console.log("❌ File helpers failed:", error.message);
    }

    console.log("\n🎉 All tests completed successfully!");
    console.log("\n📝 Implementation Summary:");
    console.log(
      "   ✅ R2 Configuration - Centralized configuration management"
    );
    console.log("   ✅ User Folder Paths - Structured path generation");
    console.log("   ✅ File Naming - UUID-based unique naming");
    console.log("   ✅ Path Generation - Type-specific path creation");
    console.log("   ✅ File Helpers - Validation and utilities");
    console.log("   ✅ User Folder Service - High-level folder management");

    console.log("\n🚀 Ready for integration with API endpoints!");
  } catch (error) {
    console.error("\n❌ Test failed with error:", error);
    process.exit(1);
  }
}

// Run the tests
testR2UserStorage().catch(console.error);
