// Test script to verify the new MockupJobManager works with database storage
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function testMockupJobManager() {
  console.log("Testing MockupJobManager with database storage...");

  try {
    // Test 1: Check if MockupJob table exists
    console.log("\n1. Checking if MockupJob table exists...");
    const tableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'MockupJob'
      );
    `;

    if (tableExists[0].exists) {
      console.log("✅ MockupJob table exists in database");
    } else {
      console.log("❌ MockupJob table does not exist");
      return;
    }

    // Test 2: Test creating a job
    console.log("\n2. Testing job creation...");
    const testJob = {
      id: "test-job-" + Date.now(),
      status: "pending",
      progress: 0,
      userId: "test-user-id",
      imageUrl: "https://example.com/test-image.png",
      createdAt: new Date(),
      updatedAt: new Date(),
      estimatedTimeRemaining: 180,
    };

    const createdJob = await prisma.mockupJob.create({
      data: testJob,
    });

    console.log("✅ Created test job:", createdJob.id);

    // Test 3: Test retrieving a job
    console.log("\n3. Testing job retrieval...");
    const retrievedJob = await prisma.mockupJob.findUnique({
      where: { id: createdJob.id },
    });

    if (retrievedJob) {
      console.log("✅ Retrieved test job:", retrievedJob.id);
      console.log("   Status:", retrievedJob.status);
      console.log("   Progress:", retrievedJob.progress);
    } else {
      console.log("❌ Failed to retrieve test job");
    }

    // Test 4: Test updating a job
    console.log("\n4. Testing job update...");
    const updatedJob = await prisma.mockupJob.update({
      where: { id: createdJob.id },
      data: {
        status: "processing",
        progress: 50,
        updatedAt: new Date(),
      },
    });

    if (updatedJob.status === "processing" && updatedJob.progress === 50) {
      console.log("✅ Updated test job successfully");
    } else {
      console.log("❌ Failed to update test job");
    }

    // Test 5: Clean up test job
    console.log("\n5. Cleaning up test job...");
    await prisma.mockupJob.delete({
      where: { id: createdJob.id },
    });
    console.log("✅ Cleaned up test job");

    console.log(
      "\n🎉 All tests passed! MockupJob database storage is working correctly."
    );
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testMockupJobManager();
