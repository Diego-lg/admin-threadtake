const { PrismaClient } = require("@prisma/client");

async function testMockupJobTable() {
  console.log("Testing MockupJob table creation...");

  const prisma = new PrismaClient();

  try {
    // Test 1: Check if table exists by trying to query it
    console.log("\n1. Testing table existence...");
    const count = await prisma.mockupJob.count();
    console.log(`✅ MockupJob table exists! Currently has ${count} records.`);

    // Test 2: Try to create a test record
    console.log("\n2. Testing record creation...");
    const testJob = await prisma.mockupJob.create({
      data: {
        id: "test-job-" + Date.now(),
        status: "pending",
        progress: 0,
        userId: "test-user-id",
        imageUrl: "https://example.com/test-image.png",
        description: "Test mockup job",
        shirtColorHex: "#FF0000",
        isLogoMode: false,
        logoScale: 1.0,
        logoOffsetX: 0,
        logoOffsetY: 0,
        logoTargetPart: "front",
        estimatedTimeRemaining: 60,
      },
    });
    console.log(`✅ Successfully created test job with ID: ${testJob.id}`);

    // Test 3: Query the test record
    console.log("\n3. Testing record retrieval...");
    const retrievedJob = await prisma.mockupJob.findUnique({
      where: { id: testJob.id },
    });

    if (retrievedJob) {
      console.log(
        `✅ Successfully retrieved job: Status=${retrievedJob.status}, Progress=${retrievedJob.progress}`
      );
    } else {
      throw new Error("Failed to retrieve created job");
    }

    // Test 4: Update the test record
    console.log("\n4. Testing record update...");
    const updatedJob = await prisma.mockupJob.update({
      where: { id: testJob.id },
      data: {
        status: "processing",
        progress: 50,
        mockupResults: { test: "result" },
      },
    });
    console.log(
      `✅ Successfully updated job: Status=${updatedJob.status}, Progress=${updatedJob.progress}`
    );

    // Test 5: Clean up - delete the test record
    console.log("\n5. Testing record deletion...");
    await prisma.mockupJob.delete({
      where: { id: testJob.id },
    });
    console.log("✅ Successfully deleted test job");

    console.log("\n🎉 All tests passed! MockupJob table is working correctly.");
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error("Full error:", error);

    if (error.message.includes("does not exist")) {
      console.log("\n💡 The MockupJob table does not exist yet.");
      console.log(
        "Please run the SQL in create-mockup-job-table.sql in your Supabase dashboard."
      );
    }

    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testMockupJobTable();
