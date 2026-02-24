import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DesignStatus } from "@prisma/client";

// POST /api/designs/pending - Create a pending design
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return new NextResponse("Unauthorized - Please sign in to save designs", {
        status: 401,
      });
    }

    const userId = session.user.id;
    const body = await req.json();

    const {
      designId,
      productId,
      sizeId,
      colorId,
      customText,
      shirtColorHex,
      isLogoMode,
      logoScale,
      logoOffsetX,
      logoOffsetY,
      logoTargetPart,
      designImageUrl,
      status = "PENDING",
    } = body;

    // Transform URLs if needed
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

    // Validate sizeId and colorId if provided - only use them if they exist in the database
    let validatedColorId: string | null = null;
    let validatedSizeId: string | null = null;

    if (colorId) {
      const colorExists = await prismadb.color.findUnique({
        where: { id: colorId },
      });
      if (colorExists) {
        validatedColorId = colorId;
      } else {
        console.warn(
          `[DESIGNS_PENDING_POST] Color ID ${colorId} not found, setting to null`,
        );
      }
    }

    if (sizeId) {
      const sizeExists = await prismadb.size.findUnique({
        where: { id: sizeId },
      });
      if (sizeExists) {
        validatedSizeId = sizeId;
      } else {
        console.warn(
          `[DESIGNS_PENDING_POST] Size ID ${sizeId} not found, setting to null`,
        );
      }
    }

    // Create the pending design
    const pendingDesign = await prismadb.savedDesign.create({
      data: {
        id: designId,
        userId: userId,
        status: DesignStatus.PENDING,
        productId,
        colorId: validatedColorId,
        sizeId: validatedSizeId,
        customText: customText || null,
        designImageUrl: finalDesignImageUrl,
        shirtColorHex: shirtColorHex || null,
        isLogoMode: isLogoMode || false,
        logoScale: logoScale || null,
        logoOffsetX: logoOffsetX || null,
        logoOffsetY: logoOffsetY || null,
        logoTargetPart: logoTargetPart || null,
        progress: 0,
      },
    });

    return NextResponse.json(pendingDesign);
  } catch (error) {
    console.error("[DESIGNS_PENDING_POST] Full error:", error);
    if (error instanceof Error) {
      console.error("[DESIGNS_PENDING_POST] Error message:", error.message);
      console.error("[DESIGNS_PENDING_POST] Error stack:", error.stack);
    }
    return new NextResponse(
      "Internal Error: " +
        (error instanceof Error ? error.message : "Unknown error"),
      { status: 500 },
    );
  }
}

// GET /api/designs/pending - Get all pending designs for the logged-in user
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return new NextResponse("Unauthorized - Please sign in to view designs", {
        status: 401,
      });
    }

    const userId = session.user.id;

    // Only show pending designs from the last 2 hours to avoid showing old stuck designs
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    // Get all pending/processing designs for the user using Prisma query builder
    const pendingDesigns = await prismadb.savedDesign.findMany({
      where: {
        userId: userId,
        status: {
          in: [DesignStatus.PENDING, DesignStatus.PROCESSING],
        },
        createdAt: {
          gte: twoHoursAgo,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        customText: true,
        designImageUrl: true,
        status: true,
        progress: true,
        error: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ pendingDesigns });
  } catch (error) {
    console.error("[DESIGNS_PENDING_GET] Full error:", error);
    if (error instanceof Error) {
      console.error("[DESIGNS_PENDING_GET] Error message:", error.message);
      console.error("[DESIGNS_PENDING_GET] Error stack:", error.stack);
    }
    return new NextResponse(
      "Internal Error: " +
        (error instanceof Error ? error.message : "Unknown error"),
      { status: 500 },
    );
  }
}
