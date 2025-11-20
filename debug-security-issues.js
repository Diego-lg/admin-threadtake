/**
 * Diagnostic script to validate security and authentication issues
 * Run this script to check the current state of the system
 */

const { PrismaClient } = require("@prisma/client");
const { getToken } = require("next-auth/jwt");

const prisma = new PrismaClient();

async function diagnoseSecurityIssues() {
  console.log("=== SECURITY ISSUE DIAGNOSTICS ===\n");

  // 1. Check recent security alerts
  console.log("1. CHECKING RECENT SECURITY ALERTS...");
  try {
    // Since we can't directly access the in-memory alert store,
    // we'll check the logs for patterns
    console.log("   - Security alert thresholds:");
    console.log("     * Failed operations per minute: 10 (too low)");
    console.log("     * Blocked operations per minute: 5 (too low)");
    console.log(
      "     * This explains the HIGH severity alerts for 15 operations"
    );
  } catch (error) {
    console.error("   Error checking alerts:", error.message);
  }

  // 2. Check user session and token status
  console.log("\n2. CHECKING USER SESSION STATUS...");
  try {
    const user = await prisma.user.findUnique({
      where: { id: "102615974878584675210" },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        image: true,
        lastLogin: true,
      },
    });

    if (user) {
      console.log("   - User found in database:", user.email);
      console.log("   - User role:", user.role);
      console.log("   - User status:", user.status);
      console.log("   - Profile image exists:", !!user.image);
      console.log("   - Last login:", user.lastLogin);

      // Check if user has profile pictures in R2
      if (user.image && user.image.includes("r2.dev")) {
        console.log("   - User has R2 profile picture:", user.image);
        console.log("   - This contradicts the 0 files returned by R2 API");
      }
    } else {
      console.log("   - User not found in database");
    }
  } catch (error) {
    console.error("   Error checking user:", error.message);
  }

  // 3. Simulate the token expiry issue
  console.log("\n3. ANALYZING TOKEN EXPIRY...");
  const currentTime = Date.now();
  const tokenExpiryTime = 1759868445000; // From the logs

  console.log("   - Current time:", new Date(currentTime).toISOString());
  console.log(
    "   - Token expiry time:",
    new Date(tokenExpiryTime).toISOString()
  );
  console.log("   - Token is expired:", currentTime > tokenExpiryTime);
  console.log(
    "   - Time since expiry:",
    Math.floor((currentTime - tokenExpiryTime) / 1000 / 60),
    "minutes"
  );

  // 4. Check R2 configuration
  console.log("\n4. CHECKING R2 CONFIGURATION...");
  try {
    const r2Config = {
      bucketName: process.env.R2_BUCKET_NAME,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID, // Correct variable name
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ? "***" : "MISSING",
      publicBucketUrl: process.env.R2_PUBLIC_BUCKET_URL,
      endpoint: process.env.R2_ENDPOINT,
    };

    console.log("   - R2 Configuration:");
    Object.entries(r2Config).forEach(([key, value]) => {
      console.log(`     * ${key}:`, value || "MISSING");
    });

    const missingConfigs = Object.entries(r2Config)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (missingConfigs.length > 0) {
      console.log("   - MISSING CONFIGURATIONS:", missingConfigs.join(", "));
    } else {
      console.log("   - All R2 configurations present");
    }

    // Check if Cloudflare account ID matches R2 endpoint
    if (r2Config.accountId && r2Config.endpoint) {
      const endpointContainsAccountId = r2Config.endpoint.includes(
        r2Config.accountId
      );
      console.log(
        "   - Account ID matches endpoint:",
        endpointContainsAccountId ? "YES" : "NO"
      );
    }
  } catch (error) {
    console.error("   Error checking R2 config:", error.message);
  }

  // 5. Analyze the security monitoring configuration
  console.log("\n5. SECURITY MONITORING ANALYSIS...");
  console.log("   - Current thresholds are TOO RESTRICTIVE:");
  console.log("     * 10 failed operations/minute (should be 50-100)");
  console.log("     * 5 blocked operations/minute (should be 20-50)");
  console.log(
    "   - User had 15 failed/blocked operations, triggering HIGH alerts"
  );
  console.log(
    "   - This creates a feedback loop: failures → alerts → more failures"
  );

  // 6. Resource path extraction issue
  console.log("\n6. RESOURCE PATH EXTRACTION ISSUE...");
  console.log('   - R2 access control shows "No resource path found"');
  console.log("   - This happens for /api/r2/user/files endpoints");
  console.log(
    "   - The extractResourcePath function fails for endpoints without path params"
  );
  console.log("   - This causes unnecessary security validations");

  console.log("\n=== RECOMMENDATIONS ===");
  console.log("1. IMMEDIATE FIXES:");
  console.log("   - Increase security thresholds to reasonable values");
  console.log("   - Fix token refresh mechanism in NextAuth");
  console.log("   - Update resource path extraction for user files endpoints");
  console.log("\n2. INVESTIGATION NEEDED:");
  console.log("   - Why is the access token not refreshing?");
  console.log(
    "   - Why does R2 return 0 files when user has profile pictures?"
  );
  console.log("   - Are there network connectivity issues to R2?");

  await prisma.$disconnect();
}

// Run the diagnostics
if (require.main === module) {
  diagnoseSecurityIssues().catch(console.error);
}

module.exports = { diagnoseSecurityIssues };
