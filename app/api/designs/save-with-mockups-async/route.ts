import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import prismadb from "@/lib/prismadb";
import { UserRole } from "@prisma/client";
import { MockupJobManager } from "@/lib/mockup-job-manager";
import { processJobImmediately } from "@/lib/mockup-worker";
import { UserFolderService } from "@/services/user-folder-service";
import { v4 as uuidv4 } from "uuid";

// Define the expected shape of the NextAuth token
interface NextAuthToken {
  id: string;
  email: string;
  role: UserRole;
  name?: string | null;
  image?: string | null;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
}

// POST /api/designs/save-with-mockups-async - Create a new saved design with async mockup generation
export async function POST(req: Request) {
  console.log("[DESIGNS_SAVE_ASYNC] Request received");

  try {
    // 1. Authenticate the user
    const authHeader = req.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new NextResponse("Authorization header missing or invalid", {
        status: 401,
      });
    }

    const token = authHeader.split(" ")[1];
    let decodedPayload: NextAuthToken | null = null;

    // Verify token (simplified for this example)
    try {
      const nextAuthSecret = process.env.NEXTAUTH_SECRET;
      if (nextAuthSecret) {
        const nextAuthToken = await getToken({
          req: req as any,
          secret: nextAuthSecret,
          secureCookie: process.env.NODE_ENV === "production",
        });

        if (nextAuthToken) {
          decodedPayload = nextAuthToken as NextAuthToken;
        }
      }
    } catch (error) {
      console.error("[DESIGNS_SAVE_ASYNC] Token verification error:", error);
    }

    if (!decodedPayload) {
      return new NextResponse("Invalid or expired token", { status: 401 });
    }

    const userId = decodedPayload.id;
    if (!userId) {
      return new NextResponse("User ID not found in token", { status: 401 });
    }

    // 2. Parse request body
    const body = await req.json();
    const {
      productId,
      colorId,
      sizeId,
      designImageUrl,
      canvasImageUrl,
      description,
      customText,
      shirtColorHex,
      isLogoMode,
      logoScale,
      logoOffsetX,
      logoOffsetY,
      logoTargetPart,
    } = body;

    if (!designImageUrl) {
      return new NextResponse("Design image URL is required", { status: 400 });
    }

    console.log("[DESIGNS_SAVE_ASYNC] Image URLs received:");
    console.log("  - designImageUrl (for mockups):", designImageUrl);
    console.log(
      "  - canvasImageUrl (for display):",
      canvasImageUrl || "Not provided"
    );
    console.log("[DESIGNS_SAVE_ASYNC] Creating mockup job for user:", userId);

    // For display in the UI, use canvasImageUrl if available, otherwise fall back to designImageUrl
    const imageForDisplay = canvasImageUrl || designImageUrl;

    // 3. Ensure user folder structure exists for mockups
    await UserFolderService.ensureUserFolderExists(userId);

    // 4. Create a design ID for organizing mockups
    const designId = uuidv4();

    // 5. Create a mockup generation job with design ID
    const job = await MockupJobManager.createJob(userId, designImageUrl, {
      designId, // Add design ID for folder organization
      productId,
      colorId,
      sizeId,
      description,
      customText,
      shirtColorHex,
      isLogoMode,
      logoScale,
      logoOffsetX,
      logoOffsetY,
      logoTargetPart,
      uploadedLogoUrl: body.uploadedLogoUrl,
      uploadedPatternUrl: body.uploadedPatternUrl,
    });

    // 6. Start processing the job in the background
    // In production, you'd use a proper job queue
    // For now, we'll process it immediately but asynchronously
    processJobImmediately(job.id).catch((error) => {
      console.error("[DESIGNS_SAVE_ASYNC] Error processing job:", error);
    });

    // 7. Return the job ID immediately
    console.log(
      "[DESIGNS_SAVE_ASYNC] Created job:",
      job.id,
      "for design:",
      designId
    );

    return NextResponse.json({
      success: true,
      jobId: job.id,
      designId,
      message:
        "Design saved successfully. Mockups are being generated in the background.",
      estimatedTime: job.estimatedTimeRemaining,
    });
  } catch (error) {
    console.error("[DESIGNS_SAVE_ASYNC] Error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
