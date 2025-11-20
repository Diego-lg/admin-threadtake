#!/usr/bin/env node

/**
 * Emergency fix to get the server running immediately
 * Bypasses migration issues and focuses on core functionality
 */

const { execSync } = require("child_process");

console.log("🚨 EMERGENCY FIX - Getting server running...");

async function emergencyFix() {
  try {
    console.log("\n🔧 Step 1: Force regenerate Prisma client...");
    execSync("npx prisma generate --force", {
      stdio: "inherit",
      cwd: __dirname,
    });

    console.log("\n🔄 Step 2: Force sync schema (bypassing migrations)...");
    try {
      execSync("npx prisma db push --skip-generate", {
        stdio: "inherit",
        cwd: __dirname,
        timeout: 10000,
      });
    } catch (error) {
      console.log("⚠️  Schema sync failed, but continuing...");
    }

    console.log("\n🧹 Step 3: Clear Next.js cache...");
    try {
      execSync("rm -rf .next", { stdio: "inherit", cwd: __dirname });
    } catch (error) {
      console.log("⚠️  Cache clear failed, but continuing...");
    }

    console.log("\n✅ Emergency fix completed!");
    console.log("\n🚀 Start your server now:");
    console.log("   npm run dev");

    console.log("\n⚠️  Notes:");
    console.log("   - Some database features may be limited");
    console.log("   - Run the full migration fix later when convenient");
    console.log("   - Check console for any remaining errors");
  } catch (error) {
    console.error("❌ Emergency fix failed:", error.message);

    console.log("\n🔧 Last resort - Manual steps:");
    console.log("   1. Delete .next folder");
    console.log("   2. Delete node_modules/.prisma folder");
    console.log("   3. Run: npx prisma generate");
    console.log("   4. Run: npm run dev");
  }
}

emergencyFix().catch(console.error);
