import { NextRequest, NextResponse } from "next/server"; // Import NextRequest
import { getToken } from "next-auth/jwt"; // Use getToken to read JWT from cookie or header

import prismadb from "@/lib/prismadb";
// authOptions and getServerSession are no longer needed here
// import { authOptions } from "@/lib/auth";
// import { getServerSession } from "next-auth/next";

const secret = process.env.NEXTAUTH_SECRET; // Secret needed for getToken

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const skip = (page - 1) * limit;

  // Change type to NextRequest
  // --- DEBUGGING VERCEL AUTH ---
  console.log("[MY_DESIGNS_GET] Request received. Checking environment...");
  console.log(
    `[MY_DESIGNS_GET] NEXTAUTH_URL env var: ${process.env.NEXTAUTH_URL}`
  );
  console.log(
    `[MY_DESIGNS_GET] NEXTAUTH_SECRET env var set: ${!!process.env
      .NEXTAUTH_SECRET}`
  );
  // Log incoming cookies
  const cookieHeader = req.headers.get("cookie");
  console.log(
    `[MY_DESIGNS_GET] Incoming Cookie Header: ${cookieHeader || "NONE"}`
  );
  // --- END DEBUGGING ---

  // Check if secret is defined *before* the try block
  if (!secret) {
    console.error(
      "[MY_DESIGNS_GET] Missing NEXTAUTH_SECRET environment variable"
    );
    return new NextResponse("Server configuration error", { status: 500 });
  }

  try {
    console.log("[MY_DESIGNS_GET] Attempting to get token...");
    // Use getToken to extract JWT payload from cookie or Authorization header
    const token = await getToken({ req, secret }); // Pass the defined secret
    console.log(
      "[MY_DESIGNS_GET] Token retrieved:",
      token ? `Token Sub: ${token.sub}, Token ID: ${token.id}` : "Token is NULL" // Log both sub and id if present
    ); // Log token sub claim

    // Check for token and 'sub' claim (standard JWT subject, usually user ID)
    // Or check for 'id' if you added that explicitly in the jwt callback
    const userIdFromToken = token?.id || token?.sub; // Prioritize 'id' if present

    if (!userIdFromToken) {
      console.error(
        "[MY_DESIGNS_GET] Authentication failed: No token or sub/id claim found. Returning 401."
      );
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    console.log(
      `[MY_DESIGNS_GET] Authenticated user ID from token: ${userIdFromToken}`
    );
    const userId = userIdFromToken as string; // Use the ID from the token

    // Fetch designs for the authenticated user using the correct model name
    // Fetch paginated designs FIRST
    console.time("[MY_DESIGNS_GET] Prisma findMany Query"); // Start timer for findMany
    const designs = await prismadb.savedDesign.findMany({
      skip: skip,
      take: limit,
      // Corrected model name
      where: {
        userId: userId,
      },
      orderBy: {
        updatedAt: "desc", // Or createdAt, depending on desired order
      },
      // Select only the fields needed by the frontend component (my-designs-list.tsx)
      // This avoids expensive joins from 'include'
      select: {
        id: true,
        userId: true, // Keep userId if needed elsewhere, though not directly used in list display
        designImageUrl: true,
        productId: true,
        colorId: true,
        sizeId: true,
        customText: true,
        shirtColorHex: true,
        isLogoMode: true,
        logoScale: true,
        logoOffsetX: true,
        logoOffsetY: true,
        logoTargetPart: true,
        uploadedLogoUrl: true,
        uploadedPatternUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    console.timeEnd("[MY_DESIGNS_GET] Prisma findMany Query"); // End timer for findMany

    // Fetch total count for pagination AFTER fetching designs
    console.time("[MY_DESIGNS_GET] Prisma Count Query"); // Start timer for count
    const totalDesigns = await prismadb.savedDesign.count({
      where: {
        userId: userId,
      },
    });
    console.timeEnd("[MY_DESIGNS_GET] Prisma Count Query"); // End timer for count

    return NextResponse.json({
      designs,
      totalDesigns,
      currentPage: page,
      totalPages: Math.ceil(totalDesigns / limit),
    });
  } catch (error) {
    console.error("[MY_DESIGNS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
