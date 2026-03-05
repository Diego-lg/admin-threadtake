import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { UserFolderService } from "@/services/user-folder-service";

// Helper function to get or create the general settings
async function getGeneralSettings() {
  let settings = await prismadb.generalSetting.findFirst();
  if (!settings) {
    // If no settings exist, create the first one with defaults
    // This ensures the application has a baseline setting
    console.log("No general settings found, creating default settings...");
    settings = await prismadb.generalSetting.create({
      data: {
        // defaultMaxSavedDesigns will use the @default(10) from schema
      },
    });
    console.log("Default general settings created:", settings);
  }
  return settings;
}

// POST /api/designs - Create a new saved design for the logged-in user
export async function POST(req: Request) {
  try {
    // Get NextAuth session for authentication
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return new NextResponse("Unauthorized - Please sign in to save designs", {
        status: 401,
      });
    }

    const userId = session.user.id;

    // --- Design Limit Check START ---
    // Fetch user details and general settings concurrently
    const [user, generalSettings] = await Promise.all([
      prismadb.user.findUnique({
        where: { id: userId },
        select: { maxSavedDesigns: true }, // Select only the needed field
      }),
      getGeneralSettings(), // Use helper to get/create settings
    ]);

    if (!user) {
      return new NextResponse("User not found", { status: 404 });
    }

    // Determine the applicable limit
    const limit =
      user.maxSavedDesigns ?? generalSettings.defaultMaxSavedDesigns;

    // Get the current count of saved designs for the user
    const currentDesignCount = await prismadb.savedDesign.count({
      where: { userId: userId },
    });

    // Check if the user has reached the limit
    if (currentDesignCount >= limit) {
      console.log(
        `User ${userId} reached design limit (${currentDesignCount}/${limit}).`,
      );
      return new NextResponse(
        `You have reached the maximum limit of ${limit} saved designs.`,
        { status: 403 }, // 403 Forbidden is appropriate here
      );
    }
    console.log(
      `User ${userId} design count: ${currentDesignCount}/${limit}. Proceeding.`,
    );
    // --- Design Limit Check END ---

    const body = await req.json();
    const {
      productId,
      colorId,
      sizeId,
      customText,
      designImageUrl,
      uploadedLogoUrl, // Existing field for logo file URL
      uploadedPatternUrl, // Existing field for pattern file URL
      // --- New configuration fields ---
      shirtColorHex,
      isLogoMode,
      logoScale,
      logoOffsetX,
      logoOffsetY,
      logoTargetPart,
      // --- End new fields ---
      // --- Phase 1 Community Fields ---
      description,
      tags,
      // --- End Phase 1 Fields ---
      // --- Phase 2 Mockup Field ---
      mockupImageUrl,
      // --- End Phase 2 Field ---
      // --- Phase 3 Usage Rights ---
      usageRights,
      // --- End Phase 3 Field ---
    } = body;

    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5001";
    const r2Url =
      process.env.R2_PUBLIC_BUCKET_URL ||
      "https://pub-167bcbb6797c48d686d7dacfba94f17f.r2.dev";

    const transformUrl = (url: string | null | undefined): string | null => {
      if (!url) return null;
      // Replace the local backend URL with the public R2 URL
      return url.replace(backendUrl, r2Url);
    };

    const finalDesignImageUrl = transformUrl(designImageUrl);
    const finalMockupImageUrl = transformUrl(mockupImageUrl);
    const finalUploadedLogoUrl = transformUrl(uploadedLogoUrl);
    const finalUploadedPatternUrl = transformUrl(uploadedPatternUrl);

    if (!productId || !colorId || !sizeId) {
      return new NextResponse(
        "Product ID, Color ID, and Size ID are required",
        { status: 400 },
      );
    }

    // Validate that the provided IDs exist (Keep existing validation)
    const [productExists, colorExists, sizeExists] = await Promise.all([
      prismadb.product.findUnique({
        where: { id: productId },
        select: { id: true },
      }), // Select only id
      prismadb.color.findUnique({
        where: { id: colorId },
        select: { id: true },
      }), // Select only id
      prismadb.size.findUnique({ where: { id: sizeId }, select: { id: true } }), // Select only id
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

    // Proceed with creating the design if limit not reached
    const savedDesign = await prismadb.savedDesign.create({
      data: {
        userId: userId, // Use userId from NextAuth session
        productId,
        colorId,
        sizeId,
        customText: customText || null,
        designImageUrl: finalDesignImageUrl,
        uploadedLogoUrl: finalUploadedLogoUrl,
        uploadedPatternUrl: finalUploadedPatternUrl,
        // --- Save new configuration fields ---
        shirtColorHex: shirtColorHex || null,
        isLogoMode: isLogoMode, // Should be boolean, handle if null/undefined? Assume required for now.
        logoScale: logoScale || null,
        logoOffsetX: logoOffsetX || null,
        logoOffsetY: logoOffsetY || null,
        logoTargetPart: logoTargetPart || null,
        // --- End save new fields ---
        // --- Save Phase 1 Community Fields ---
        description: description || null,
        // Ensure tags is an array, default to empty if not provided or invalid
        tags: Array.isArray(tags)
          ? tags.filter((tag): tag is string => typeof tag === "string") // Type guard for filtering
          : [],
        // viewCount defaults to 0 in schema, no need to set here
        // --- End save Phase 1 Fields ---
        // --- Save Phase 2 Mockup Field ---
        mockupImageUrl: finalMockupImageUrl,
        // --- End save Phase 2 Field ---
        // --- Save Phase 3 Usage Rights ---
        usageRights: usageRights || null, // Save usage rights string
        // --- End save Phase 3 Field ---
      },
    });

    return NextResponse.json(savedDesign);
  } catch (error) {
    console.error("[DESIGNS_POST]", error);
    // Check if the error is a Prisma known request error (e.g., unique constraint violation)
    // This part is optional but can provide more specific error messages if needed.
    // if (error instanceof Prisma.PrismaClientKnownRequestError) {
    //   // Handle specific Prisma errors
    // }
    return new NextResponse("Internal Error", { status: 500 });
  }
}

// GET /api/designs - Get all saved designs for the logged-in user
export async function GET(req: Request) {
  try {
    // Get NextAuth session for authentication
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return new NextResponse("Unauthorized - Please sign in to view designs", {
        status: 401,
      });
    }

    const userId = session.user.id;

    // Get user info for dynamic folder resolution
    const user = await prismadb.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    const savedDesigns = await prismadb.savedDesign.findMany({
      where: {
        userId: userId, // Use userId from verified token
      },
      include: {
        // Include related data needed for display on the frontend
        product: {
          select: {
            id: true,
            name: true,
            images: { take: 1, select: { url: true } },
          }, // Select specific product fields
        },
        color: {
          select: { id: true, name: true, value: true },
        },
        size: {
          select: { id: true, name: true, value: true },
        },
      },
      orderBy: {
        createdAt: "desc", // Show newest first
      },
    });

    // Dynamically resolve image URLs based on user's current folder
    // This handles cases where user changed their name and folder structure changed
    const resolvedDesigns = await Promise.all(
      savedDesigns.map(async (design) => {
        const [
          resolvedDesignImageUrl,
          resolvedMockupImageUrl,
          resolvedUploadedLogoUrl,
          resolvedUploadedPatternUrl,
        ] = await Promise.all([
          UserFolderService.resolveImageUrl(
            design.designImageUrl,
            userId,
            user?.name,
          ),
          UserFolderService.resolveImageUrl(
            design.mockupImageUrl,
            userId,
            user?.name,
          ),
          UserFolderService.resolveImageUrl(
            design.uploadedLogoUrl,
            userId,
            user?.name,
          ),
          UserFolderService.resolveImageUrl(
            design.uploadedPatternUrl,
            userId,
            user?.name,
          ),
        ]);

        return {
          ...design,
          designImageUrl: resolvedDesignImageUrl,
          mockupImageUrl: resolvedMockupImageUrl,
          uploadedLogoUrl: resolvedUploadedLogoUrl,
          uploadedPatternUrl: resolvedUploadedPatternUrl,
        };
      }),
    );

    return NextResponse.json(resolvedDesigns);
  } catch (error) {
    console.error("[DESIGNS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

// Configuration removed to resolve build error.
// Body size limits on Vercel are typically handled by platform limits or vercel.json.
