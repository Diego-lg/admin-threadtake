import { v4 as uuidv4 } from "uuid";
import prismadb from "./prismadb";

export interface MockupJob {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number; // 0-100
  designId?: string;
  userId: string;
  imageUrl: string;
  productId?: string;
  colorId?: string;
  sizeId?: string;
  description?: string;
  customText?: string;
  shirtColorHex?: string;
  isLogoMode?: boolean;
  logoScale?: number;
  logoOffsetX?: number;
  logoOffsetY?: number;
  logoTargetPart?: "front" | "back";
  uploadedLogoUrl?: string;
  uploadedPatternUrl?: string;
  mockupResults?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  estimatedTimeRemaining?: number; // in seconds
}

export class MockupJobManager {
  // Create a new mockup generation job
  static async createJob(
    userId: string,
    imageUrl: string,
    options?: {
      designId?: string;
      productId?: string;
      colorId?: string;
      sizeId?: string;
      description?: string;
      customText?: string;
      shirtColorHex?: string;
      isLogoMode?: boolean;
      logoScale?: number;
      logoOffsetX?: number;
      logoOffsetY?: number;
      logoTargetPart?: "front" | "back";
      uploadedLogoUrl?: string;
      uploadedPatternUrl?: string;
    }
  ): Promise<MockupJob> {
    const jobData = {
      id: uuidv4(),
      status: "pending" as const,
      progress: 0,
      userId,
      imageUrl,
      designId: options?.designId || null,
      productId: options?.productId || null,
      colorId: options?.colorId || null,
      sizeId: options?.sizeId || null,
      description: options?.description || null,
      customText: options?.customText || null,
      shirtColorHex: options?.shirtColorHex || null,
      isLogoMode: options?.isLogoMode || false,
      logoScale: options?.logoScale || null,
      logoOffsetX: options?.logoOffsetX || null,
      logoOffsetY: options?.logoOffsetY || null,
      logoTargetPart: options?.logoTargetPart || null,
      uploadedLogoUrl: options?.uploadedLogoUrl || null,
      uploadedPatternUrl: options?.uploadedPatternUrl || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      estimatedTimeRemaining: 180, // 3 minutes estimate
    };

    try {
      const job = await prismadb.mockupJob.create({
        data: jobData,
      });

      console.log(`[MOCKUP_JOB] Created job ${job.id} for user ${userId}`);
      return this.mapDbJobToInterface(job);
    } catch (error) {
      console.error(`[MOCKUP_JOB] Failed to create job:`, error);
      throw new Error("Failed to create mockup job");
    }
  }

  // Get job by ID
  static async getJob(jobId: string): Promise<MockupJob | null> {
    try {
      const job = await prismadb.mockupJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        return null;
      }

      return this.mapDbJobToInterface(job);
    } catch (error) {
      console.error(`[MOCKUP_JOB] Failed to get job ${jobId}:`, error);
      return null;
    }
  }

  // Update job status and progress
  static async updateJob(
    jobId: string,
    updates: Partial<MockupJob>
  ): Promise<MockupJob | null> {
    try {
      // Filter out fields that shouldn't be directly updated
      const { id, userId, imageUrl, createdAt, ...validUpdates } = updates;

      const updatedJob = await prismadb.mockupJob.update({
        where: { id: jobId },
        data: {
          ...validUpdates,
          updatedAt: new Date(),
          mockupResults: updates.mockupResults
            ? JSON.parse(JSON.stringify(updates.mockupResults))
            : undefined,
        },
      });

      console.log(`[MOCKUP_JOB] Updated job ${jobId}:`, updates);
      return this.mapDbJobToInterface(updatedJob);
    } catch (error) {
      console.error(`[MOCKUP_JOB] Failed to update job ${jobId}:`, error);
      return null;
    }
  }

  // Mark job as processing
  static async startProcessing(jobId: string): Promise<boolean> {
    const job = await this.updateJob(jobId, {
      status: "processing",
      progress: 10,
    });
    return !!job;
  }

  // Update job progress
  static async updateProgress(
    jobId: string,
    progress: number,
    message?: string
  ): Promise<boolean> {
    const job = await this.updateJob(jobId, {
      progress: Math.min(100, Math.max(0, progress)),
    });

    if (job && message) {
      console.log(
        `[MOCKUP_JOB] Job ${jobId} progress: ${progress}% - ${message}`
      );
    }

    return !!job;
  }

  // Complete job successfully
  static async completeJob(
    jobId: string,
    mockupResults: any,
    designId?: string
  ): Promise<boolean> {
    const job = await this.updateJob(jobId, {
      status: "completed",
      progress: 100,
      mockupResults,
      designId,
      estimatedTimeRemaining: 0,
    });

    if (job) {
      console.log(
        `[MOCKUP_JOB] Completed job ${jobId} with design ID ${designId}`
      );
    }

    return !!job;
  }

  // Fail job with error
  static async failJob(jobId: string, error: string): Promise<boolean> {
    const job = await this.updateJob(jobId, {
      status: "failed",
      progress: 0,
      error,
    });

    if (job) {
      console.error(`[MOCKUP_JOB] Failed job ${jobId}:`, error);
    }

    return !!job;
  }

  // Get all jobs for a user
  static async getUserJobs(userId: string): Promise<MockupJob[]> {
    try {
      const jobs = await prismadb.mockupJob.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });

      return jobs.map((job) => this.mapDbJobToInterface(job));
    } catch (error) {
      console.error(`[MOCKUP_JOB] Failed to get user jobs:`, error);
      return [];
    }
  }

  // Clean up old jobs (older than 24 hours)
  static async cleanupOldJobs(): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

      const result = await prismadb.mockupJob.deleteMany({
        where: {
          createdAt: {
            lt: cutoff,
          },
        },
      });

      if (result.count > 0) {
        console.log(`[MOCKUP_JOB] Cleaned up ${result.count} old jobs`);
      }

      return result.count;
    } catch (error) {
      console.error(`[MOCKUP_JOB] Failed to cleanup old jobs:`, error);
      return 0;
    }
  }

  // Get all jobs (for debugging)
  static async getAllJobs(): Promise<MockupJob[]> {
    try {
      const jobs = await prismadb.mockupJob.findMany({
        orderBy: { createdAt: "desc" },
      });

      return jobs.map((job) => this.mapDbJobToInterface(job));
    } catch (error) {
      console.error(`[MOCKUP_JOB] Failed to get all jobs:`, error);
      return [];
    }
  }

  // Helper method to map database job to interface
  private static mapDbJobToInterface(dbJob: any): MockupJob {
    return {
      id: dbJob.id,
      status: dbJob.status as "pending" | "processing" | "completed" | "failed",
      progress: dbJob.progress,
      designId: dbJob.designId || undefined,
      userId: dbJob.userId,
      imageUrl: dbJob.imageUrl,
      productId: dbJob.productId || undefined,
      colorId: dbJob.colorId || undefined,
      sizeId: dbJob.sizeId || undefined,
      description: dbJob.description || undefined,
      customText: dbJob.customText || undefined,
      shirtColorHex: dbJob.shirtColorHex || undefined,
      isLogoMode: dbJob.isLogoMode || undefined,
      logoScale: dbJob.logoScale || undefined,
      logoOffsetX: dbJob.logoOffsetX || undefined,
      logoOffsetY: dbJob.logoOffsetY || undefined,
      logoTargetPart: dbJob.logoTargetPart as "front" | "back" | undefined,
      uploadedLogoUrl: dbJob.uploadedLogoUrl || undefined,
      uploadedPatternUrl: dbJob.uploadedPatternUrl || undefined,
      mockupResults: dbJob.mockupResults || undefined,
      error: dbJob.error || undefined,
      createdAt: dbJob.createdAt,
      updatedAt: dbJob.updatedAt,
      estimatedTimeRemaining: dbJob.estimatedTimeRemaining || undefined,
    };
  }
}

// Auto-cleanup old jobs every hour
setInterval(async () => {
  await MockupJobManager.cleanupOldJobs();
}, 60 * 60 * 1000);
