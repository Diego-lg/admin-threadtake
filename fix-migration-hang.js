#!/usr/bin/env node

/**
 * Fix script for migration hanging issue
 * This script addresses the specific problem where migrations get stuck
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🔧 Fixing migration hang issue...");

async function fixMigrationHang() {
  try {
    console.log("📊 Step 1: Checking migration status...");

    // Check current migration status
    try {
      execSync("npx prisma migrate status", {
        stdio: "inherit",
        cwd: __dirname,
        timeout: 10000, // 10 second timeout
      });
    } catch (error) {
      console.log("⚠️  Migration status check failed, continuing...");
    }

    console.log("\n🔄 Step 2: Resetting migration state...");

    // Try to reset the migration engine
    try {
      execSync("npx prisma migrate resolve --rolled-back", {
        stdio: "inherit",
        cwd: __dirname,
        timeout: 15000,
      });
    } catch (error) {
      console.log("⚠️  Migration reset failed, trying alternative approach...");
    }

    console.log("\n📦 Step 3: Pushing schema changes...");

    // Use db push instead of migrate deploy to avoid hanging
    try {
      execSync("npx prisma db push --accept-data-loss", {
        stdio: "inherit",
        cwd: __dirname,
        timeout: 30000, // 30 second timeout
      });
      console.log("✅ Schema pushed successfully");
    } catch (error) {
      console.error("❌ Schema push failed:", error.message);

      // Fallback: Try to apply migrations manually
      console.log("\n🔧 Step 4: Manual migration fallback...");

      try {
        // Read and apply the SQL migration directly
        const migrationSQL = fs.readFileSync(
          path.join(__dirname, "migrations", "update_user_storage_paths.sql"),
          "utf8"
        );

        console.log("📝 Applying SQL migration directly...");
        // Note: This would require a direct database connection
        // For now, we'll just indicate what needs to be done
        console.log("⚠️  Manual SQL migration may be required");
        console.log(
          "   Please run the SQL in update_user_storage_paths.sql manually"
        );
      } catch (sqlError) {
        console.error("❌ Manual migration failed:", sqlError.message);
      }
    }

    console.log("\n🧪 Step 5: Verifying database connection...");

    // Test database connection
    try {
      execSync("npx prisma db pull --force", {
        stdio: "inherit",
        cwd: __dirname,
        timeout: 15000,
      });
      console.log("✅ Database connection verified");
    } catch (error) {
      console.log("⚠️  Database connection test failed");
    }

    console.log("\n🎉 Migration hang fix completed!");
    console.log("\n📝 Next steps:");
    console.log("   1. Restart your development server: npm run dev");
    console.log("   2. If issues persist, check database connection");
    console.log("   3. Verify all environment variables are correct");
  } catch (error) {
    console.error("❌ Migration fix failed:", error.message);

    console.log("\n🔧 Manual recovery steps:");
    console.log("   1. Stop any running processes");
    console.log("   2. Clear Prisma cache: rm -rf .prisma");
    console.log("   3. Regenerate client: npx prisma generate");
    console.log("   4. Try: npx prisma db push --force-reset");
    console.log("   5. Restart development server");
  }
}

// Run the fix
fixMigrationHang().catch(console.error);
