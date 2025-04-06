import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import prismadb from "@/lib/prismadb";
import { UserRole } from "@prisma/client";

// Define the expected shape of the JWT payload
interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

// POST /api/designs - Create a new saved design for the logged-in user
export async function POST(req: Request) {
  try {
    // 1. Get Authorization header
    // Access header directly from the request object
    const authHeader = req.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new NextResponse("Authorization header missing or invalid", {
        status: 401,
      });
    }

    // 2. Extract token
    const token = authHeader.split(" ")[1];

    // 3. Verify token
    let decodedPayload: JwtPayload;
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new Error("JWT_SECRET environment variable is not set!");
      }
      decodedPayload = jwt.verify(token, jwtSecret) as JwtPayload;
    } catch (error) {
      console.error("JWT Verification Error:", error);
      return new NextResponse("Invalid or expired token", { status: 401 });
    }

    // 4. Use userId from token
    const userId = decodedPayload.userId;
    if (!userId) {
      return new NextResponse("User ID not found in token", { status: 401 });
    }

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

    if (!productId || !colorId || !sizeId) {
      return new NextResponse(
        "Product ID, Color ID, and Size ID are required",
        { status: 400 }
      );
    }

    // Validate that the provided IDs exist
    const productExists = await prismadb.product.findUnique({
      where: { id: productId },
    });
    if (!productExists) {
      return new NextResponse(`Product with ID ${productId} not found`, {
        status: 404,
      });
    }

    const colorExists = await prismadb.color.findUnique({
      where: { id: colorId },
    });
    if (!colorExists) {
      return new NextResponse(`Color with ID ${colorId} not found`, {
        status: 404,
      });
    }

    const sizeExists = await prismadb.size.findUnique({
      where: { id: sizeId },
    });
    if (!sizeExists) {
      return new NextResponse(`Size with ID ${sizeId} not found`, {
        status: 404,
      });
    }

    const savedDesign = await prismadb.savedDesign.create({
      data: {
        userId: userId, // Use userId from verified token
        productId,
        colorId,
        sizeId,
        customText: customText || null,
        designImageUrl: designImageUrl || null,
        uploadedLogoUrl: uploadedLogoUrl || null,
        uploadedPatternUrl: uploadedPatternUrl || null,
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
          ? tags.filter((tag) => typeof tag === "string")
          : [],
        // viewCount defaults to 0 in schema, no need to set here
        // --- End save Phase 1 Fields ---
        // --- Save Phase 2 Mockup Field ---
        mockupImageUrl: mockupImageUrl || null,
        // --- End save Phase 2 Field ---
        // --- Save Phase 3 Usage Rights ---
        usageRights: usageRights || null, // Save usage rights string
        // --- End save Phase 3 Field ---
      },
    });

    return NextResponse.json(savedDesign);
  } catch (error) {
    console.error("[DESIGNS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

// GET /api/designs - Get all saved designs for the logged-in user
export async function GET(req: Request) {
  try {
    // 1. Get Authorization header
    // Access header directly from the request object
    const authHeader = req.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new NextResponse("Authorization header missing or invalid", {
        status: 401,
      });
    }

    // 2. Extract token
    const token = authHeader.split(" ")[1];

    // 3. Verify token
    let decodedPayload: JwtPayload;
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new Error("JWT_SECRET environment variable is not set!");
      }
      decodedPayload = jwt.verify(token, jwtSecret) as JwtPayload;
    } catch (error) {
      console.error("JWT Verification Error:", error);
      return new NextResponse("Invalid or expired token", { status: 401 });
    }

    // 4. Use userId from token
    const userId = decodedPayload.userId;
    if (!userId) {
      return new NextResponse("User ID not found in token", { status: 401 });
    }

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

    return NextResponse.json(savedDesigns);
  } catch (error) {
    console.error("[DESIGNS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
