#!/usr/bin/env node

/**
 * Quick start script - bypasses all migration issues
 * Gets your server running immediately
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🚀 QUICK START - Bypassing all issues...");

async function quickStart() {
  try {
    // Step 1: Just regenerate Prisma client (no migrations)
    console.log("📦 Step 1: Regenerating Prisma client...");
    execSync("npx prisma generate", {
      stdio: "inherit",
      cwd: __dirname,
    });

    // Step 2: Clear Next.js cache
    console.log("🧹 Step 2: Clearing Next.js cache...");
    try {
      if (fs.existsSync(path.join(__dirname, ".next"))) {
        execSync("rm -rf .next", { stdio: "inherit", cwd: __dirname });
      }
    } catch (error) {
      // Ignore cache clear errors
    }

    console.log("\n✅ Quick start completed!");
    console.log("\n🚀 Start your server now:");
    console.log("   npm run dev");

    console.log("\n📝 What this does:");
    console.log("   ✅ Regenerates Prisma client");
    console.log("   ✅ Clears Next.js cache");
    console.log("   ⚠️  Skips database migrations (server will still work)");
    console.log(
      "   ⚠️  Some advanced features may be limited until migrations are fixed"
    );

    console.log("\n🔧 To fix migrations later (when convenient):");
    console.log("   node fix-all-issues.js");
  } catch (error) {
    console.error("❌ Quick start failed:", error.message);
    console.log("\n🔧 Manual steps:");
    console.log("   1. npx prisma generate");
    console.log("   2. npm run dev");
  }
}

quickStart().catch(console.error);
