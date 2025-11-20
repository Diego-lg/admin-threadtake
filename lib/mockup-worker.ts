import axios from "axios";
import { MockupJobManager, MockupJob } from "./mockup-job-manager";
import prismadb from "./prismadb";
import { UserFolderService } from "../services/user-folder-service";
import { MockupType } from "./r2-user-storage";
import { R2Config } from "./r2-config";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Background worker to process mockup generation jobs
export async function processMockupJob(jobId: string): Promise<void> {
  const job = await MockupJobManager.getJob(jobId);
  if (!job) {
    console.error(`[MOCKUP_WORKER] Job ${jobId} not found`);
    return;
  }

  console.log(`[MOCKUP_WORKER] Starting processing job ${jobId}`);

  try {
    // Mark job as processing
    await MockupJobManager.startProcessing(jobId);

    // Step 1: Prepare design data (20% progress)
    await MockupJobManager.updateProgress(jobId, 20, "Preparing design data");

    // Validate that the required entities exist
    if (!job.productId || !job.colorId || !job.sizeId) {
      throw new Error("Missing required product, color, or size ID");
    }

    // Check if the entities exist in the database
    const [product, color, size] = await Promise.all([
      prismadb.product.findUnique({ where: { id: job.productId } }),
      prismadb.color.findUnique({ where: { id: job.colorId } }),
      prismadb.size.findUnique({ where: { id: job.sizeId } }),
    ]);

    if (!product) {
      throw new Error(`Product with ID ${job.productId} not found`);
    }
    if (!color) {
      throw new Error(`Color with ID ${job.colorId} not found`);
    }
    if (!size) {
      throw new Error(`Size with ID ${job.sizeId} not found`);
    }

    // Don't save the design immediately - wait until mockups are generated
    // This ensures the mockup image is available when the design is first displayed
    console.log(
      `[MOCKUP_WORKER] Waiting to save design ${jobId} until mockups are generated`
    );

    // Step 2: Generate mockups (20-80% progress)
    await MockupJobManager.updateProgress(
      jobId,
      30,
      "Starting mockup generation"
    );

    console.log(`[MOCKUP_WORKER] Calling mockup service for job ${jobId}`);
    const mockupResponse = await axios.post(
      "http://127.0.0.1:5001/create-mockups-from-url",
      {
        image_url: job.imageUrl,
        overlap: 1300,
        y_shift: 100,
        rotation_angle: -5,
      },
      {
        timeout: 0, // Unlimited timeout for background processing
        headers: {
          Connection: "keep-alive",
          "Keep-Alive": "timeout=600, max=1000",
        },
        responseType: "json",
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024,
      }
    );

    await MockupJobManager.updateProgress(
      jobId,
      70,
      "Mockups generated, processing images"
    );

    const mockupResults = mockupResponse.data;
    console.log(
      `[MOCKUP_WORKER] Mockups generated for job ${jobId}:`,
      mockupResults
    );

    // Step 3: Process and store mockups in user-specific folders
    let processedMockupResults = {
      success: mockupResults?.success || false,
      panel_urls: {} as Record<string, string>,
      errors: mockupResults?.errors || [],
    };

    if (mockupResults?.success && mockupResults.panel_urls) {
      await MockupJobManager.updateProgress(
        jobId,
        80,
        "Storing mockup images in user folders"
      );

      // Ensure user folder exists
      await UserFolderService.ensureUserFolderExists(job.userId);

      // Process each mockup type and store in user-specific folders
      const mockupTypes: MockupType[] = [
        "default",
        "back",
        "sleeve_left",
        "sleeve_right",
      ];

      for (const mockupType of mockupTypes) {
        const mockupUrl = mockupResults.panel_urls[mockupType];

        if (mockupUrl && job.designId) {
          try {
            // Generate path for this mockup type
            const pathInfo = await UserFolderService.getMockupPath(
              job.userId,
              job.designId,
              mockupType,
              "png" // Assume PNG format for mockups
            );

            // Download the mockup image
            const response = await fetch(mockupUrl);
            if (!response.ok) {
              throw new Error(
                `Failed to download mockup: ${response.statusText}`
              );
            }

            const imageBuffer = await response.arrayBuffer();

            // Upload to R2 using presigned URL
            const client = R2Config.getS3Client();
            const r2Config = R2Config.getConfig();

            const putCommand = new PutObjectCommand({
              Bucket: r2Config.bucketName,
              Key: pathInfo.key,
              Body: Buffer.from(imageBuffer),
              ContentType: "image/png",
            });

            const signedUrl = await getSignedUrl(client, putCommand, {
              expiresIn: 300, // 5 minutes
            });

            const uploadResponse = await fetch(signedUrl, {
              method: "PUT",
              body: Buffer.from(imageBuffer),
              headers: {
                "Content-Type": "image/png",
              },
            });

            if (!uploadResponse.ok) {
              throw new Error(
                `Failed to upload mockup to R2: ${uploadResponse.statusText}`
              );
            }

            // Store the new user-specific URL
            processedMockupResults.panel_urls[mockupType] = pathInfo.publicUrl;

            console.log(
              `[MOCKUP_WORKER] Stored ${mockupType} mockup for user ${job.userId}, design ${job.designId}:`,
              { key: pathInfo.key, url: pathInfo.publicUrl }
            );
          } catch (error: any) {
            console.error(
              `[MOCKUP_WORKER] Failed to store ${mockupType} mockup for job ${jobId}:`,
              error
            );
            processedMockupResults.errors.push(
              `Failed to store ${mockupType} mockup: ${error.message}`
            );
          }
        }
      }

      // Set the primary mockup image URL (default view)
      processedMockupResults.panel_urls.default =
        processedMockupResults.panel_urls.default ||
        mockupResults.panel_urls.default;
    }

    const mockupImageUrl = processedMockupResults.panel_urls?.default || null;

    await MockupJobManager.updateProgress(
      jobId,
      90,
      "Preparing to save design"
    );

    // Step 4: Save the design with mockup results (100% progress)
    let savedDesign = null;
    if (mockupImageUrl) {
      // Only save the design if mockup generation was successful
      savedDesign = await prismadb.savedDesign.create({
        data: {
          userId: job.userId,
          productId: job.productId,
          colorId: job.colorId,
          sizeId: job.sizeId,
          designImageUrl: mockupImageUrl, // Use mockup image for display in UI
          mockupImageUrl: mockupImageUrl, // Save mockup image immediately
          description: job.description || "Custom design",
          customText: job.customText || undefined,
          uploadedLogoUrl: job.uploadedLogoUrl || undefined,
          uploadedPatternUrl: job.uploadedPatternUrl || undefined,
          shirtColorHex: job.shirtColorHex || undefined,
          isLogoMode: job.isLogoMode || false,
          logoScale: job.logoScale || undefined,
          logoOffsetX: job.logoOffsetX || undefined,
          logoOffsetY: job.logoOffsetY || undefined,
          logoTargetPart: job.logoTargetPart || undefined,
        },
      });

      console.log(
        `[MOCKUP_WORKER] ✅ Saved design ${savedDesign.id} with mockup for job ${jobId}`
      );
    } else {
      // If mockup generation failed, still save the design but without mockup
      savedDesign = await prismadb.savedDesign.create({
        data: {
          userId: job.userId,
          productId: job.productId,
          colorId: job.colorId,
          sizeId: job.sizeId,
          designImageUrl: job.imageUrl, // Use original image as fallback when no mockup
          mockupImageUrl: null, // No mockup available
          description:
            job.description || "Custom design (mockup generation failed)",
          customText: job.customText || undefined,
          uploadedLogoUrl: job.uploadedLogoUrl || undefined,
          uploadedPatternUrl: job.uploadedPatternUrl || undefined,
          shirtColorHex: job.shirtColorHex || undefined,
          isLogoMode: job.isLogoMode || false,
          logoScale: job.logoScale || undefined,
          logoOffsetX: job.logoOffsetX || undefined,
          logoOffsetY: job.logoOffsetY || undefined,
          logoTargetPart: job.logoTargetPart || undefined,
        },
      });

      console.log(
        `[MOCKUP_WORKER] ⚠️ Saved design ${savedDesign.id} without mockup for job ${jobId}`
      );
    }

    // Complete the job with processed mockup results
    await MockupJobManager.completeJob(
      jobId,
      processedMockupResults,
      savedDesign.id
    );
    console.log(
      `[MOCKUP_WORKER] ✅ Completed job ${jobId} with design ${savedDesign.id}`
    );
  } catch (error: any) {
    console.error(`[MOCKUP_WORKER] ❌ Failed to process job ${jobId}:`, error);

    let errorMessage = "Unknown error occurred";
    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNRESET") {
        errorMessage =
          "Connection to mockup service was reset. The service may be overloaded.";
      } else if (error.code === "ETIMEDOUT") {
        errorMessage = "Mockup generation timed out. Please try again.";
      } else if (error.code === "ECONNREFUSED") {
        errorMessage = "Mockup service is not available.";
      } else {
        errorMessage = error.message || "Failed to generate mockups";
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    await MockupJobManager.failJob(jobId, errorMessage);
  }
}

// Start the background worker
export function startMockupWorker(): void {
  console.log("[MOCKUP_WORKER] Background worker started");

  try {
    // Check for pending jobs every 5 seconds
    const intervalId = setInterval(async () => {
      // For now, we'll implement a simple polling mechanism
      // In a real implementation, you'd use a proper job queue
      console.log("[MOCKUP_WORKER] Checking for pending jobs...");
    }, 5000);

    console.log(
      "[MOCKUP_WORKER] Interval set successfully with ID:",
      intervalId
    );
  } catch (error) {
    console.error("[MOCKUP_WORKER] Error setting up interval:", error);
    if (error instanceof Error) {
      console.error("[MOCKUP_WORKER] Error stack:", error.stack);
    }
  }
}

// Process a single job immediately (for testing)
export async function processJobImmediately(jobId: string): Promise<void> {
  await processMockupJob(jobId);
}
