import { NextResponse } from "next/server";
import { MockupJobManager } from "@/lib/mockup-job-manager";
import prismadb from "@/lib/prismadb";

// GET /api/designs/save-with-mockups-async/[jobId] - Get job status
export async function GET(
  req: Request,
  { params }: { params: { jobId: string } }
) {
  const jobId = params.jobId;

  try {
    console.log(`[DESIGNS_SAVE_ASYNC_GET] Looking for job: ${jobId}`);
    const job = await MockupJobManager.getJob(jobId);

    // List all current jobs for debugging
    const allJobs = await MockupJobManager.getAllJobs();
    console.log(
      `[DESIGNS_SAVE_ASYNC_GET] Current jobs in database:`,
      allJobs.map((job) => ({
        id: job.id,
        status: job.status,
        progress: job.progress,
      }))
    );

    if (!job) {
      console.error(`[DESIGNS_SAVE_ASYNC_GET] Job ${jobId} not found`);
      return new NextResponse("Job not found", { status: 404 });
    }

    // If job is completed, return the design details
    let designDetails = null;
    if (job.status === "completed" && job.designId) {
      designDetails = await prismadb.savedDesign.findUnique({
        where: { id: job.designId },
      });
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error,
      designId: job.designId,
      design: designDetails,
      estimatedTimeRemaining: job.estimatedTimeRemaining,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  } catch (error) {
    console.error("[DESIGNS_SAVE_ASYNC_GET] Error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
