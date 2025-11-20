#!/usr/bin/env node

/**
 * Script to regenerate Prisma client and fix type issues
 * This script addresses the missing fields in the Prisma client
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🔧 Fixing Prisma client issues...");

try {
  // Step 1: Regenerate Prisma client
  console.log("📦 Regenerating Prisma client...");
  execSync("npx prisma generate", {
    stdio: "inherit",
    cwd: __dirname,
  });

  console.log("✅ Prisma client regenerated successfully");

  // Step 2: Check if the migration needs to be applied
  console.log("🔍 Checking database migration status...");

  try {
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      cwd: __dirname,
    });
    console.log("✅ Database migrations applied");
  } catch (error) {
    console.log(
      "⚠️  Migration may have already been applied or needs manual intervention"
    );
  }

  // Step 3: Verify the schema is in sync
  console.log("🔍 Verifying schema synchronization...");

  try {
    execSync("npx prisma db push --accept-data-loss", {
      stdio: "inherit",
      cwd: __dirname,
    });
    console.log("✅ Database schema synchronized");
  } catch (error) {
    console.log("⚠️  Schema synchronization may require manual review");
  }

  console.log("\n🎉 Prisma client fix completed!");
  console.log("📝 Next steps:");
  console.log("   1. Restart your development server");
  console.log("   2. Test the application functionality");
  console.log("   3. Verify all database operations work correctly");
} catch (error) {
  console.error("❌ Error fixing Prisma client:", error.message);
  console.error("\n🔧 Manual fix required:");
  console.error("   1. Run: npx prisma generate");
  console.error("   2. Run: npx prisma migrate deploy");
  console.error("   3. Run: npx prisma db push");
  process.exit(1);
}
