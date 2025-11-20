#!/usr/bin/env node

/**
 * Comprehensive fix script for all identified issues
 * This script addresses:
 * 1. Prisma client regeneration
 * 2. Database schema synchronization
 * 3. Environment variable validation
 * 4. Dependency issues
 * 5. Configuration problems
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🚀 Starting comprehensive issue fix...");
console.log("=====================================");

const issues = {
  prisma: false,
  env: false,
  dependencies: false,
  migrations: false,
  config: false,
};

async function fixPrismaIssues() {
  console.log("\n📦 Fixing Prisma issues...");
  try {
    // Generate Prisma client
    console.log("  - Generating Prisma client...");
    execSync("npx prisma generate", { stdio: "inherit", cwd: __dirname });

    // Apply migrations
    console.log("  - Applying database migrations...");
    execSync("npx prisma migrate deploy", { stdio: "inherit", cwd: __dirname });

    // Push schema changes
    console.log("  - Synchronizing database schema...");
    execSync("npx prisma db push", { stdio: "inherit", cwd: __dirname });

    issues.prisma = true;
    console.log("✅ Prisma issues fixed");
  } catch (error) {
    console.error("❌ Prisma fix failed:", error.message);
  }
}

function checkEnvironmentVariables() {
  console.log("\n🔍 Checking environment variables...");

  const requiredEnvVars = [
    "DATABASE_URL",
    "NEXTAUTH_SECRET",
    "R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_PUBLIC_BUCKET_URL",
  ];

  const missingVars = [];

  requiredEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });

  if (missingVars.length === 0) {
    issues.env = true;
    console.log("✅ All required environment variables are set");
  } else {
    console.error("❌ Missing environment variables:");
    missingVars.forEach((varName) => {
      console.error(`   - ${varName}`);
    });
    console.log("\n📝 Please set these variables in your .env file");
  }
}

function checkDependencies() {
  console.log("\n📦 Checking dependencies...");
  try {
    // Check if node_modules exists
    if (!fs.existsSync(path.join(__dirname, "node_modules"))) {
      console.log("  - Installing dependencies...");
      execSync("npm install", { stdio: "inherit", cwd: __dirname });
    }

    // Check for critical dependencies
    const packageJson = require("./package.json");
    const criticalDeps = ["@prisma/client", "next", "react", "react-dom"];

    let allDepsPresent = true;
    criticalDeps.forEach((dep) => {
      if (!packageJson.dependencies[dep]) {
        console.error(`   - Missing critical dependency: ${dep}`);
        allDepsPresent = false;
      }
    });

    if (allDepsPresent) {
      issues.dependencies = true;
      console.log("✅ All critical dependencies are present");
    } else {
      console.log("📝 Run: npm install to fix missing dependencies");
    }
  } catch (error) {
    console.error("❌ Dependency check failed:", error.message);
  }
}

function validateMigrations() {
  console.log("\n🗄️  Validating migrations...");
  try {
    const migrationsDir = path.join(__dirname, "prisma", "migrations");

    if (fs.existsSync(migrationsDir)) {
      const migrations = fs.readdirSync(migrationsDir);
      console.log(`  - Found ${migrations.length} migration(s)`);

      // Check for the specific migration files we expect
      const expectedMigrations = [
        "add_canvas_image_url_to_mockup_job.sql",
        "update_user_storage_paths.sql",
      ];

      let foundMigrations = 0;
      expectedMigrations.forEach((migration) => {
        if (fs.existsSync(path.join(__dirname, "migrations", migration))) {
          foundMigrations++;
        }
      });

      if (foundMigrations === expectedMigrations.length) {
        issues.migrations = true;
        console.log("✅ All expected migrations are present");
      } else {
        console.log(
          `⚠️  Found ${foundMigrations}/${expectedMigrations.length} expected migrations`
        );
      }
    } else {
      console.log("⚠️  No migrations directory found");
    }
  } catch (error) {
    console.error("❌ Migration validation failed:", error.message);
  }
}

function checkConfiguration() {
  console.log("\n⚙️  Checking configuration files...");

  const configFiles = [
    "next.config.mjs",
    "tsconfig.json",
    "middleware.ts",
    "tailwind.config.ts",
  ];

  let allConfigsPresent = true;
  configFiles.forEach((file) => {
    if (!fs.existsSync(path.join(__dirname, file))) {
      console.error(`   - Missing config file: ${file}`);
      allConfigsPresent = false;
    }
  });

  if (allConfigsPresent) {
    issues.config = true;
    console.log("✅ All configuration files are present");
  } else {
    console.log("📝 Please ensure all configuration files are present");
  }
}

async function runAllFixes() {
  await fixPrismaIssues();
  checkEnvironmentVariables();
  checkDependencies();
  validateMigrations();
  checkConfiguration();

  console.log("\n📊 Fix Summary");
  console.log("===============");
  Object.entries(issues).forEach(([issue, fixed]) => {
    const status = fixed ? "✅ FIXED" : "❌ NEEDS ATTENTION";
    console.log(`${issue.padEnd(12)}: ${status}`);
  });

  const allFixed = Object.values(issues).every((status) => status === true);

  if (allFixed) {
    console.log("\n🎉 All issues have been fixed!");
    console.log("📝 Next steps:");
    console.log("   1. Restart your development server: npm run dev");
    console.log("   2. Test the application functionality");
    console.log("   3. Verify all features work correctly");
  } else {
    console.log("\n⚠️  Some issues still need attention");
    console.log("📝 Please review the errors above and fix them manually");
  }
}

// Run all fixes
runAllFixes().catch(console.error);
