import { NextRequest, NextResponse } from "next/server"; // Import NextRequest
import { getToken } from "next-auth/jwt"; // Use getToken to read JWT from cookie or header

import prismadb from "@/lib/prismadb";
// authOptions and getServerSession are no longer needed here
// import { authOptions } from "@/lib/auth";
// import { getServerSession } from "next-auth/next";

const secret = process.env.NEXTAUTH_SECRET; // Secret needed for getToken

export async function GET(req: NextRequest) {
  console.log("--- [MY_DESIGNS_GET] Handler Entered ---");
  const { searchParams } = new URL(req.url);
  // --- Cursor Pagination ---
  const cursor = searchParams.get("cursor") || undefined; // Get cursor from query params
  const limit = parseInt(searchParams.get("limit") || "20", 10); // Keep limit
  // const page = parseInt(searchParams.get("page") || "1", 10); // Page no longer needed
  // const skip = (page - 1) * limit; // Skip no longer needed
  // --- End Cursor Pagination ---

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
    // --- SIMPLIFIED TOKEN LOGGING ---
    if (!token) {
      console.error("[MY_DESIGNS_GET] Diagnosis: getToken returned NULL.");
    } else {
      // Check for id or sub specifically
      if (token.id) {
        console.log(
          `[MY_DESIGNS_GET] Diagnosis: Token found with ID: ${token.id}`
        );
      } else if (token.sub) {
        console.log(
          `[MY_DESIGNS_GET] Diagnosis: Token found with Sub: ${token.sub}`
        );
      } else {
        console.error(
          "[MY_DESIGNS_GET] Diagnosis: Token found BUT lacks 'id' AND 'sub' claims."
        );
      }
    }
    // --- END SIMPLIFIED TOKEN LOGGING ---

    // Check for token and 'sub' claim (standard JWT subject, usually user ID)
    // Or check for 'id' if you added that explicitly in the jwt callback
    const userIdFromToken = token?.id || token?.sub; // Prioritize 'id' if present

    if (!userIdFromToken) {
      // The simplified logging above should now clearly state the reason.
      console.error(
        "[MY_DESIGNS_GET] Authentication failed: userIdFromToken is missing (check Diagnosis log above). Returning 401."
      );
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    console.log(
      `[MY_DESIGNS_GET] Authenticated user ID from token: ${userIdFromToken}`
    );
    const userId = userIdFromToken as string; // Use the ID from the token

    // --- Fetch initial data concurrently ---
    console.log("[MY_DESIGNS_GET] Preparing initial concurrent queries...");
    console.time("[MY_DESIGNS_GET] Prisma Initial Concurrent Queries");

    const userPromise = prismadb.user.findUnique({
      where: { id: userId },
      select: { maxSavedDesigns: true },
    });

    const settingsPromise = prismadb.generalSetting.findFirst({
      select: { defaultMaxSavedDesigns: true },
    });

    const countPromise = prismadb.savedDesign.count({
      where: { userId: userId },
    });

    // Execute concurrently
    const [userData, generalSettings, totalDesigns] = await Promise.all([
      userPromise,
      settingsPromise,
      countPromise,
    ]);

    console.timeEnd("[MY_DESIGNS_GET] Prisma Initial Concurrent Queries");
    console.log(
      `[MY_DESIGNS_GET] Fetched User Data: ${JSON.stringify(userData)}`
    );
    console.log(
      `[MY_DESIGNS_GET] Fetched Settings: ${JSON.stringify(generalSettings)}`
    );
    console.log(`[MY_DESIGNS_GET] Total Designs Count: ${totalDesigns}`);
    // --- End Concurrent Fetch ---

    console.log("[MY_DESIGNS_GET] Fetching paginated designs...");
    console.time("[MY_DESIGNS_GET] Prisma FindMany Query");
    const designs = await prismadb.savedDesign.findMany({
      take: limit,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      where: {
        userId: userId,
      },
      orderBy: {
        updatedAt: "desc",
        // id: 'asc' // Optional secondary sort
      },
      include: {
        // Keep the optimized include (no nested images)
        product: { select: { id: true, name: true } },
        color: { select: { id: true, name: true, value: true } },
        size: { select: { id: true, name: true, value: true } },
      },
    });
    console.timeEnd("[MY_DESIGNS_GET] Prisma FindMany Query");

    // Determine the effective design limit
    const userLimit = userData?.maxSavedDesigns;
    const defaultLimit = generalSettings?.defaultMaxSavedDesigns ?? 10;
    const effectiveLimit = userLimit ?? defaultLimit;

    console.log(`[MY_DESIGNS_GET] User ID: ${userId}`);
    console.log(`[MY_DESIGNS_GET] Fetched User Limit: ${userLimit}`);
    console.log(
      `[MY_DESIGNS_GET] Fetched Default Limit: ${generalSettings?.defaultMaxSavedDesigns}`
    );
    console.log(`[MY_DESIGNS_GET] Effective Limit: ${effectiveLimit}`);
    console.log(`[MY_DESIGNS_GET] Total Designs Count: ${totalDesigns}`);
    console.log(
      `[MY_DESIGNS_GET] Fetched Designs Count (limit ${limit}, cursor ${cursor}): ${designs.length}`
    );

    // --- Cursor Pagination: Determine next cursor ---
    let nextCursor: string | undefined = undefined;
    if (designs.length === limit) {
      nextCursor = designs[designs.length - 1].id;
    }
    // --- End Cursor Pagination ---

    // Return designs, pagination info (nextCursor), total count, and the effective limit
    return NextResponse.json({
      designs: designs,
      nextCursor: nextCursor,
      totalDesigns: totalDesigns,
      limit: effectiveLimit,
    });
  } catch (error) {
    console.error("[MY_DESIGNS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
