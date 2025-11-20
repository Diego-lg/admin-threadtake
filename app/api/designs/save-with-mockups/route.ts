import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import prismadb from "@/lib/prismadb";
import { UserRole } from "@prisma/client";
import axios from "axios";
import jwt from "jsonwebtoken";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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

// Helper function to get or create the general settings
async function getGeneralSettings() {
  let settings = await prismadb.generalSetting.findFirst();
  if (!settings) {
    console.log("No general settings found, creating default settings...");
    settings = await prismadb.generalSetting.create({
      data: {},
    });
    console.log("Default general settings created:", settings);
  }
  return settings;
}

// Helper function to download image from URL
async function downloadImage(url: string): Promise<Buffer> {
  const response = await axios.get(url, { responseType: "arraybuffer" });
  return Buffer.from(response.data, "binary");
}

// Helper function to upload image to R2 storage
async function uploadToR2(
  imageBuffer: Buffer,
  filename: string,
  userId: string,
  folder: string = "mockups"
): Promise<string> {
  try {
    // Create a unique filename with user folder structure
    const userFolder = `users/${userId}/${folder}`;
    const fullFilename = `${userFolder}/${filename}`;

    // Get R2 configuration
    const r2Endpoint = process.env.R2_ENDPOINT;
    const r2AccessKey = process.env.R2_ACCESS_KEY_ID;
    const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY;
    const r2Bucket = process.env.R2_BUCKET_NAME;
    const r2PublicUrl = process.env.R2_PUBLIC_BUCKET_URL;

    if (!r2Endpoint || !r2AccessKey || !r2SecretKey || !r2Bucket) {
      console.error("[R2_UPLOAD] Missing R2 configuration");
      throw new Error("R2 configuration missing");
    }

    // Initialize S3 client for R2
    const s3Client = new S3Client({
      region: "auto",
      endpoint: r2Endpoint,
      credentials: {
        accessKeyId: r2AccessKey,
        secretAccessKey: r2SecretKey,
      },
    });

    console.log(
      `[R2_UPLOAD] Uploading ${fullFilename} to R2 bucket ${r2Bucket}`
    );

    // Upload to R2
    const uploadCommand = new PutObjectCommand({
      Bucket: r2Bucket,
      Key: fullFilename,
      Body: imageBuffer,
      ContentType: "image/jpeg",
    });

    try {
      await s3Client.send(uploadCommand);
      console.log(`[R2_UPLOAD] Successfully uploaded to R2: ${fullFilename}`);
    } catch (uploadError) {
      console.error("[R2_UPLOAD] S3 upload error:", uploadError);
      throw new Error(`Failed to upload to R2: ${uploadError}`);
    }

    // Return the public URL
    const publicUrl = `${r2PublicUrl}/${fullFilename}`;
    console.log(`[R2_UPLOAD] Public URL: ${publicUrl}`);

    return publicUrl;
  } catch (error) {
    console.error("[R2_UPLOAD] Error uploading to R2:", error);
    throw error;
  }
}

// Helper function to download and upload mockups to R2
async function processMockupImages(
  mockupResults: any,
  userId: string,
  designId: string
): Promise<{ [key: string]: string }> {
  const processedMockups: { [key: string]: string } = {};

  try {
    console.log(
      "[MOCKUP_PROCESS] Starting mockup processing for user:",
      userId
    );

    // Process different mockup types if they exist
    const mockupTypes = ["default", "back", "sleeve_left", "sleeve_right"];

    for (const mockupType of mockupTypes) {
      let mockupUrl = null;

      // Check for mockup URL in different possible locations
      if (mockupResults.mockups?.panel_urls?.[mockupType]) {
        mockupUrl = mockupResults.mockups.panel_urls[mockupType];
      } else if (mockupResults.panel_urls?.[mockupType]) {
        mockupUrl = mockupResults.panel_urls[mockupType];
      }

      if (mockupUrl) {
        console.log(
          `[MOCKUP_PROCESS] Processing ${mockupType} mockup: ${mockupUrl}`
        );

        // Download the mockup image
        const imageBuffer = await downloadImage(mockupUrl);

        // Generate unique filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `mockup_${mockupType}_${designId}_${timestamp}.jpg`;

        // Upload to R2 in user-specific folder
        const r2Url = await uploadToR2(imageBuffer, filename, userId);

        processedMockups[mockupType] = r2Url;
        console.log(
          `[MOCKUP_PROCESS] Successfully processed ${mockupType} mockup: ${r2Url}`
        );
      }
    }

    return processedMockups;
  } catch (error) {
    console.error("[MOCKUP_PROCESS] Error processing mockups:", error);
    throw error;
  }
}

// Helper function to upload image to temporary host for mockup generation
async function uploadImageForMockups(
  imageBuffer: Buffer,
  filename: string
): Promise<string> {
  // For now, we'll use the image URL directly since the design is already uploaded
  // In a real implementation, you might want to upload to a temporary host
  // For simplicity, we'll return a placeholder and handle the URL directly
  return "placeholder_url";
}

// POST /api/designs/save-with-mockups - Create a new saved design with mockups
export async function POST(req: Request) {
  console.log("[DESIGNS_SAVE_WITH_MOCKUPS] Request received");
  console.log("[DESIGNS_SAVE_WITH_MOCKUPS] Request URL:", req.url);
  console.log("[DESIGNS_SAVE_WITH_MOCKUPS] Request method:", req.method);
  console.log(
    "[DESIGNS_SAVE_WITH_MOCKUPS] Request headers:",
    Object.fromEntries(req.headers.entries())
  );
  console.log(
    "[DESIGNS_SAVE_WITH_MOCKUPS] JWT_SECRET exists:",
    !!process.env.JWT_SECRET
  );

  try {
    // 1. Get Authorization header
    const authHeader = req.headers.get("authorization");
    console.log(
      "[DESIGNS_SAVE_WITH_MOCKUPS] Auth header:",
      authHeader ? "Present" : "Missing"
    );

    if (authHeader) {
      console.log(`  - Auth header length: ${authHeader.length}`);
      console.log(
        `  - Auth header starts with Bearer: ${authHeader.startsWith(
          "Bearer "
        )}`
      );
      if (authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        console.log(`  - Token length: ${token.length}`);
        console.log(`  - Token preview: ${token.substring(0, 20)}...`);
      }
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log(
        "[DESIGNS_SAVE_WITH_MOCKUPS] ❌ Authorization header missing or invalid"
      );
      return new NextResponse("Authorization header missing or invalid", {
        status: 401,
      });
    }

    // 2. Extract token
    const token = authHeader.split(" ")[1];
    console.log(
      `[DESIGNS_SAVE_WITH_MOCKUPS] Extracted token: ${token.substring(
        0,
        20
      )}...`
    );

    // 3. Verify token - try NextAuth first, then fallback to custom JWT
    let decodedPayload: NextAuthToken | null = null;
    try {
      const nextAuthSecret = process.env.NEXTAUTH_SECRET;
      const jwtSecret = process.env.JWT_SECRET;

      console.log(
        "[DESIGNS_SAVE_WITH_MOCKUPS] NEXTAUTH_SECRET exists:",
        !!nextAuthSecret
      );
      console.log(
        "[DESIGNS_SAVE_WITH_MOCKUPS] JWT_SECRET exists:",
        !!jwtSecret
      );

      // First try NextAuth token verification
      if (nextAuthSecret) {
        console.log(
          "[DESIGNS_SAVE_WITH_MOCKUPS] ✅ NEXTAUTH_SECRET found, attempting NextAuth token verification..."
        );

        const nextAuthToken = await getToken({
          req: req as any,
          secret: nextAuthSecret,
          secureCookie: process.env.NODE_ENV === "production",
        });

        if (nextAuthToken) {
          decodedPayload = nextAuthToken as NextAuthToken;
          console.log(
            "[DESIGNS_SAVE_WITH_MOCKUPS] ✅ NextAuth token verification successful"
          );
          console.log(`  - User ID: ${decodedPayload.id}`);
          console.log(`  - Email: ${decodedPayload.email}`);
          console.log(`  - Role: ${decodedPayload.role}`);
        } else {
          console.log(
            "[DESIGNS_SAVE_WITH_MOCKUPS] NextAuth token verification failed, trying custom JWT..."
          );
        }
      }

      // If NextAuth failed, try custom JWT verification
      if (!decodedPayload && jwtSecret) {
        console.log(
          "[DESIGNS_SAVE_WITH_MOCKUPS] ✅ JWT_SECRET found, attempting custom JWT verification..."
        );

        try {
          const customToken = jwt.verify(token, jwtSecret) as any;

          // Transform custom token to match NextAuthToken interface
          decodedPayload = {
            id: customToken.id || customToken.sub,
            email: customToken.email,
            role: customToken.role || "USER",
            name: customToken.name || null,
            image: customToken.image || null,
          };

          console.log(
            "[DESIGNS_SAVE_WITH_MOCKUPS] ✅ Custom JWT verification successful"
          );
          console.log(`  - User ID: ${decodedPayload.id}`);
          console.log(`  - Email: ${decodedPayload.email}`);
          console.log(`  - Role: ${decodedPayload.role}`);
        } catch (jwtError) {
          console.log(
            "[DESIGNS_SAVE_WITH_MOCKUPS] ❌ Custom JWT verification failed:",
            jwtError instanceof Error ? jwtError.message : "Unknown error"
          );
        }
      }

      if (!decodedPayload) {
        console.log(
          "[DESIGNS_SAVE_WITH_MOCKUPS] ❌ All token verification methods failed"
        );
        return new NextResponse("Invalid or expired token", { status: 401 });
      }
    } catch (error) {
      console.error(
        "[DESIGNS_SAVE_WITH_MOCKUPS] ❌ Token Verification Error:",
        error
      );
      if (error instanceof Error) {
        console.error("  - Error type:", error.constructor.name);
        console.error("  - Error message:", error.message);
      } else {
        console.error("  - Unknown error type:", typeof error);
      }
      return new NextResponse("Invalid or expired token", { status: 401 });
    }

    // 4. Use userId from token
    const userId = decodedPayload.id;
    if (!userId) {
      return new NextResponse("User ID not found in token", { status: 401 });
    }

    // --- Design Limit Check ---
    const [user, generalSettings] = await Promise.all([
      prismadb.user.findUnique({
        where: { id: userId },
        select: { maxSavedDesigns: true },
      }),
      getGeneralSettings(),
    ]);

    if (!user) {
      return new NextResponse("User not found", { status: 404 });
    }

    const limit =
      user.maxSavedDesigns ?? generalSettings.defaultMaxSavedDesigns;
    const currentDesignCount = await prismadb.savedDesign.count({
      where: { userId: userId },
    });

    if (currentDesignCount >= limit) {
      console.log(
        `User ${userId} reached design limit (${currentDesignCount}/${limit}).`
      );
      return new NextResponse(
        `You have reached the maximum limit of ${limit} saved designs.`,
        { status: 403 }
      );
    }

    console.log(
      "[DESIGNS_SAVE_WITH_MOCKUPS] Attempting to parse request body..."
    );
    const body = await req.json();
    console.log(
      "[DESIGNS_SAVE_WITH_MOCKUPS] Request body keys:",
      Object.keys(body)
    );
    console.log(
      "[DESIGNS_SAVE_WITH_MOCKUPS] Request body:",
      JSON.stringify(body, null, 2)
    );

    const {
      productId,
      colorId,
      sizeId,
      customText,
      designImageUrl,
      uploadedLogoUrl,
      uploadedPatternUrl,
      shirtColorHex,
      isLogoMode,
      logoScale,
      logoOffsetX,
      logoOffsetY,
      logoTargetPart,
      description,
      tags,
      usageRights,
    } = body;

    console.log("[DESIGNS_SAVE_WITH_MOCKUPS] Extracted values:");
    console.log("  - productId:", productId);
    console.log("  - colorId:", colorId);
    console.log("  - sizeId:", sizeId);
    console.log("  - designImageUrl:", designImageUrl ? "Present" : "Missing");

    if (!productId || !colorId || !sizeId) {
      console.log("[DESIGNS_SAVE_WITH_MOCKUPS] ❌ Missing required IDs");
      return new NextResponse(
        "Product ID, Color ID, and Size ID are required",
        { status: 400 }
      );
    }

    // Validate that the provided IDs exist
    const [productExists, colorExists, sizeExists] = await Promise.all([
      prismadb.product.findUnique({
        where: { id: productId },
        select: { id: true },
      }),
      prismadb.color.findUnique({
        where: { id: colorId },
        select: { id: true },
      }),
      prismadb.size.findUnique({ where: { id: sizeId }, select: { id: true } }),
    ]);

    if (!productExists) {
      return new NextResponse(`Product with ID ${productId} not found`, {
        status: 404,
      });
    }
    if (!colorExists) {
      return new NextResponse(`Color with ID ${colorId} not found`, {
        status: 404,
      });
    }
    if (!sizeExists) {
      return new NextResponse(`Size with ID ${sizeId} not found`, {
        status: 404,
      });
    }

    // Determine which image to use for mockup generation
    const imageForMockup =
      designImageUrl || uploadedLogoUrl || uploadedPatternUrl;

    if (!imageForMockup) {
      return new NextResponse("No image provided for mockup generation", {
        status: 400,
      });
    }

    // Generate mockups
    let mockupResults = null;
    let mockupImageUrl = null;
    let processedMockups: { [key: string]: string } = {};

    try {
      console.log("Starting mockup generation for saved design...");
      console.log("[MOCKUP_GENERATION] This process may take 1-2 minutes...");
      const mockupGenStart = Date.now();

      // Add connection keep-alive and detailed logging
      console.log(
        "[MOCKUP_GENERATION] Making request to mockup service with unlimited timeout..."
      );
      console.log("[MOCKUP_GENERATION] Request details:");
      console.log(`  - URL: http://127.0.0.1:5001/create-mockups-from-url`);
      console.log(`  - Image URL: ${imageForMockup}`);
      console.log(`  - Overlap: 1300, Y-shift: 100, Rotation: -5`);
      console.log(`  - Timeout: unlimited (0)`);
      console.log(`  - Timestamp: ${new Date().toISOString()}`);

      // Monitor memory usage before request
      if (typeof process !== "undefined" && process.memoryUsage) {
        const memUsage = process.memoryUsage();
        console.log("[MOCKUP_GENERATION] Memory usage before request:");
        console.log(`  - RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
        console.log(
          `  - Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`
        );
        console.log(
          `  - Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
        );
      }

      // Implement retry logic for mockup generation
      let mockupResponse = null;
      let lastError: unknown = null;
      const maxRetries = 3;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `[MOCKUP_GENERATION] Attempt ${attempt}/${maxRetries} to generate mockups...`
          );

          mockupResponse = await axios.post(
            "http://127.0.0.1:5001/create-mockups-from-url",
            {
              image_url: imageForMockup,
              overlap: 1300,
              y_shift: 100,
              rotation_angle: -5,
            },
            {
              timeout: 0, // 0 means no timeout (unlimited)
              // Add keep-alive and connection settings
              headers: {
                Connection: "keep-alive",
                "Keep-Alive": "timeout=600, max=1000",
              },
              // Add response type to handle large responses
              responseType: "json",
              // Add max content length limit
              maxContentLength: 50 * 1024 * 1024, // 50MB
              maxBodyLength: 50 * 1024 * 1024, // 50MB
            }
          );

          // If we get here, the request succeeded
          console.log(`[MOCKUP_GENERATION] ✅ Attempt ${attempt} succeeded`);
          break;
        } catch (error: any) {
          lastError = error;
          const isRetryableError =
            error.code === "ECONNRESET" ||
            error.code === "ETIMEDOUT" ||
            error.code === "ECONNREFUSED" ||
            (error.response?.status >= 500 && error.response?.status < 600);

          console.error(
            `[MOCKUP_GENERATION] ❌ Attempt ${attempt} failed:`,
            error.message
          );
          console.error(`[MOCKUP_GENERATION] Error code: ${error.code}`);

          if (isRetryableError && attempt < maxRetries) {
            const delayMs = attempt * 2000; // Exponential backoff: 2s, 4s, 6s
            console.log(`[MOCKUP_GENERATION] Retrying in ${delayMs}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          } else if (!isRetryableError) {
            // Non-retryable error, don't retry
            console.error(
              `[MOCKUP_GENERATION] Non-retryable error, aborting retries`
            );
            break;
          }
        }
      }

      // Check if we successfully got a response
      if (!mockupResponse) {
        throw (
          lastError || new Error("Failed to generate mockups after retries")
        );
      }

      console.log(
        `[MOCKUP_GENERATION] Mockup service request completed in ${
          Date.now() - mockupGenStart
        }ms`
      );

      // Monitor memory usage after request
      if (typeof process !== "undefined" && process.memoryUsage) {
        const memUsage = process.memoryUsage();
        console.log("[MOCKUP_GENERATION] Memory usage after request:");
        console.log(`  - RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
        console.log(
          `  - Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`
        );
        console.log(
          `  - Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
        );
      }

      mockupResults = mockupResponse.data;
      console.log("[MOCKUP_GENERATION] Raw mockup results:", mockupResults);

      if (mockupResults.success) {
        // Process mockups and upload to R2
        console.log(
          "[MOCKUP_GENERATION] Mockups generated successfully, processing for R2 upload..."
        );

        // Generate a temporary design ID for filename generation
        const tempDesignId = `temp_${Date.now()}`;

        // Download mockups from Printful and upload to R2
        processedMockups = await processMockupImages(
          mockupResults,
          userId,
          tempDesignId
        );

        // Set the primary mockup URL (default view)
        if (processedMockups.default) {
          mockupImageUrl = processedMockups.default;
          console.log(
            "[MOCKUP_GENERATION] Primary mockup uploaded to R2:",
            mockupImageUrl
          );
        }

        console.log(
          "[MOCKUP_GENERATION] All mockups processed and uploaded to R2:",
          processedMockups
        );
      } else {
        console.error(
          "[MOCKUP_GENERATION] Mockup generation failed:",
          mockupResults
        );
      }
    } catch (error: unknown) {
      console.error("[MOCKUP_GENERATION] Error during mockup generation:");

      if (axios.isAxiosError(error)) {
        console.error("  - Axios error details:");
        console.error("    - Code:", error.code);
        console.error("    - Status:", error.response?.status);
        console.error("    - Status Text:", error.response?.statusText);
        console.error("    - Request URL:", error.config?.url);
        console.error("    - Request Method:", error.config?.method);
        console.error("    - Request Timeout:", error.config?.timeout);
        console.error("    - Response Data:", error.response?.data);

        // Check for specific error types
        if (error.code === "ECONNRESET") {
          console.error(
            "    - CONNECTION RESET: The server closed the connection unexpectedly"
          );
          console.error("    - This usually happens when:");
          console.error(
            "      1. The request took too long and server timed out"
          );
          console.error("      2. The server ran out of memory");
          console.error("      3. The server process was killed");
          console.error("      4. Network issues between services");
        } else if (error.code === "ETIMEDOUT") {
          console.error("    - TIMEOUT: The request timed out");
        } else if (error.code === "ECONNREFUSED") {
          console.error(
            "    - CONNECTION REFUSED: The mockup service is not running"
          );
        }
      } else if (error instanceof Error) {
        console.error("  - Stack trace:", error.stack);
      }

      // Monitor memory usage after error
      if (typeof process !== "undefined" && process.memoryUsage) {
        const memUsage = process.memoryUsage();
        console.error("[MOCKUP_GENERATION] Memory usage at error:");
        console.error(`  - RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
        console.error(
          `  - Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`
        );
      }

      // Continue with saving the design even if mockups fail
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorType =
        error instanceof Error ? error.constructor.name : "Unknown";
      const errorCode = (error as any)?.code || "UNKNOWN";

      mockupResults = {
        success: false,
        error: `Mockup generation failed: ${errorMessage}`,
        errorType,
        errorCode,
      };
    }

    // Transform URLs to use public R2 URL if needed
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5001";
    const r2Url =
      process.env.R2_PUBLIC_BUCKET_URL ||
      "https://pub-167bcbb6797c48d686d7dacfba94f17f.r2.dev";

    const transformUrl = (url: string | null | undefined): string | null => {
      if (!url) return null;
      return url.replace(backendUrl, r2Url);
    };

    const finalDesignImageUrl = transformUrl(designImageUrl);
    const finalMockupImageUrl = transformUrl(mockupImageUrl);
    const finalUploadedLogoUrl = transformUrl(uploadedLogoUrl);
    const finalUploadedPatternUrl = transformUrl(uploadedPatternUrl);

    // Save the design with mockup
    const savedDesign = await prismadb.savedDesign.create({
      data: {
        userId,
        productId,
        colorId,
        sizeId,
        customText: customText || null,
        designImageUrl: finalDesignImageUrl,
        uploadedLogoUrl: finalUploadedLogoUrl,
        uploadedPatternUrl: finalUploadedPatternUrl,
        shirtColorHex: shirtColorHex || null,
        isLogoMode: isLogoMode || false,
        logoScale: logoScale || null,
        logoOffsetX: logoOffsetX || null,
        logoOffsetY: logoOffsetY || null,
        logoTargetPart: logoTargetPart || null,
        description: description || null,
        tags: Array.isArray(tags)
          ? tags.filter((tag): tag is string => typeof tag === "string")
          : [],
        mockupImageUrl: finalMockupImageUrl,
        usageRights: usageRights || null,
      },
    });

    console.log(
      "[DESIGN_SAVE] Design saved successfully with ID:",
      savedDesign.id
    );
    console.log("[DESIGN_SAVE] Mockup URLs stored:", {
      primary: finalMockupImageUrl,
      allMockups: processedMockups,
    });

    return NextResponse.json({
      ...savedDesign,
      mockupResults,
      processedMockups, // Include all processed mockup URLs
      mockupStorage: "R2", // Indicate where mockups are stored
    });
  } catch (error) {
    console.error("[DESIGNS_SAVE_WITH_MOCKUPS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

// GET /api/designs/save-with-mockups - Handle GET requests (for debugging)
export async function GET(req: Request) {
  return new NextResponse("Method not allowed. Use POST instead.", {
    status: 405,
  });
}
