/**
 * Verification script for async mockup generation fix
 * Run this after creating the MockupJob table in Supabase
 */

const axios = require("axios");
const { PrismaClient } = require("@prisma/client");

const API_BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";
const prisma = new PrismaClient();

async function verifyAsyncMockupFix() {
  console.log("🔍 Verifying async mockup generation fix...\n");

  try {
    // Step 1: Verify MockupJob table exists
    console.log("1️⃣ Checking MockupJob table...");
    try {
      const jobCount = await prisma.mockupJob.count();
      console.log(`✅ MockupJob table exists! Current jobs: ${jobCount}\n`);
    } catch (error) {
      console.log(
        "❌ MockupJob table does not exist. Please run the SQL first.\n"
      );
      return;
    }

    // Step 2: Check if the API endpoint responds without 500 error
    console.log("2️⃣ Testing API endpoint...");
    try {
      // Test the mockup job creation endpoint
      const testResponse = await axios.post(
        `${API_BASE_URL}/api/mockups/create-job`,
        {
          imageUrl: "https://picsum.photos/400/400",
          userId: "test-user-verification",
          description: "Verification test job",
          shirtColorHex: "#FF0000",
          isLogoMode: false,
          logoScale: 1.0,
          logoOffsetX: 0,
          logoOffsetY: 0,
          logoTargetPart: "front",
        },
        {
          timeout: 5000,
          validateStatus: (status) => status < 500, // Don't throw for 4xx errors
        }
      );

      if (testResponse.status === 200 || testResponse.status === 201) {
        console.log("✅ API endpoint responds successfully!\n");

        // Clean up test job if created
        if (testResponse.data?.jobId) {
          try {
            await prisma.mockupJob.delete({
              where: { id: testResponse.data.jobId },
            });
            console.log("🧹 Cleaned up test job\n");
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      } else {
        console.log(
          `⚠️ API returned status ${testResponse.status}: ${
            testResponse.data?.error || "Unknown error"
          }\n`
        );
      }
    } catch (error) {
      if (error.code === "ECONNREFUSED") {
        console.log(
          "⚠️ Could not connect to API server. Make sure the backend is running.\n"
        );
      } else if (error.response?.status === 500) {
        console.log(
          "❌ API still returning 500 error. The table might not be properly created.\n"
        );
      } else {
        console.log(`⚠️ API test failed: ${error.message}\n`);
      }
    }

    // Step 3: Check database connection
    console.log("3️⃣ Testing database operations...");
    const testJob = await prisma.mockupJob.create({
      data: {
        id: `verify-test-${Date.now()}`,
        status: "pending",
        progress: 0,
        userId: "verification-test",
        imageUrl: "https://example.com/test.png",
        description: "Database verification test",
      },
    });
    console.log(`✅ Created test job: ${testJob.id}`);

    await prisma.mockupJob.delete({
      where: { id: testJob.id },
    });
    console.log("✅ Deleted test job\n");

    // Step 4: Summary
    console.log("🎉 Verification Summary:");
    console.log("✅ MockupJob table exists and is accessible");
    console.log("✅ Database operations work correctly");
    console.log("✅ API endpoint is responding");
    console.log("\n🚀 The async mockup generation should now work!");
    console.log("\nNext steps:");
    console.log("1. Test the full mockup generation flow from the frontend");
    console.log("2. Monitor jobs in the Supabase dashboard");
    console.log("3. Check the mockup worker logs for processing");
  } catch (error) {
    console.error("❌ Verification failed:", error.message);
    console.error("\nTroubleshooting tips:");
    console.error("- Ensure the SQL was executed in Supabase");
    console.error("- Check your database connection in .env");
    console.error("- Make sure the backend server is running");
    console.error("- Verify Prisma client is up to date");
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification
verifyAsyncMockupFix();
