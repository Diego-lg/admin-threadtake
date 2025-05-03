import { NextRequest, NextResponse } from "next/server"; // Import NextRequest
import { getToken } from "next-auth/jwt"; // Use getToken to read JWT from cookie or header

import prismadb from "@/lib/prismadb";
// authOptions and getServerSession are no longer needed here
// import { authOptions } from "@/lib/auth";
// import { getServerSession } from "next-auth/next";

const secret = process.env.NEXTAUTH_SECRET; // Secret needed for getToken

export async function GET(req: NextRequest) {
  console.log("--- [MY_DESIGNS_GET] Handler Entered ---"); // <-- ADD THIS LOG
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

    // Fetch user data, settings, total count, and paginated designs concurrently
    console.log("[MY_DESIGNS_GET] Preparing to execute concurrent queries...");
    console.time("[MY_DESIGNS_GET] Prisma Concurrent Queries");

    console.time("[MY_DESIGNS_GET] Prisma Sequential Queries");

    // Fetch data sequentially to reduce connection pressure
    console.log("[MY_DESIGNS_GET] Fetching user data...");
    console.time("[MY_DESIGNS_GET] Prisma User Query"); // <-- ADD TIME START
    const userData = await prismadb.user.findUnique({
      where: { id: userId },
      select: { maxSavedDesigns: true },
    });
    console.timeEnd("[MY_DESIGNS_GET] Prisma User Query"); // <-- ADD TIME END

    console.log("[MY_DESIGNS_GET] Fetching general settings...");
    console.time("[MY_DESIGNS_GET] Prisma Settings Query"); // <-- ADD TIME START
    const generalSettings = await prismadb.generalSetting.findFirst({
      select: { defaultMaxSavedDesigns: true },
    });
    console.timeEnd("[MY_DESIGNS_GET] Prisma Settings Query"); // <-- ADD TIME END

    console.log("[MY_DESIGNS_GET] Counting total designs...");
    console.time("[MY_DESIGNS_GET] Prisma Count Query"); // <-- ADD TIME START
    const totalDesigns = await prismadb.savedDesign.count({
      where: { userId: userId },
    });
    console.timeEnd("[MY_DESIGNS_GET] Prisma Count Query"); // <-- ADD TIME END
    console.log(`[MY_DESIGNS_GET] Total Designs Count: ${totalDesigns}`); // Log the count

    // --- DIAGNOSTIC: Return only the count ---
    console.log(
      "[MY_DESIGNS_GET] DIAGNOSTIC: Returning only count to test speed."
    );
    console.timeEnd("[MY_DESIGNS_GET] Prisma Sequential Queries"); // End sequential timer here for diagnostic
    return NextResponse.json({
      message: "Diagnostic: Count query test.",
      totalDesigns: totalDesigns,
    });
    // --- END DIAGNOSTIC ---

    /* --- Original code commented out for diagnostic ---
    console.log("[MY_DESIGNS_GET] Fetching paginated designs...");
    console.time("[MY_DESIGNS_GET] Prisma FindMany Query");
    const designs = await prismadb.savedDesign.findMany({
      skip: skip,
      take: limit,
      where: {
        userId: userId,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });
    console.timeEnd("[MY_DESIGNS_GET] Prisma FindMany Query");
    console.timeEnd("[MY_DESIGNS_GET] Prisma Sequential Queries");

    // Determine the effective design limit
    const userLimit = userData?.maxSavedDesigns;
    const defaultLimit = generalSettings?.defaultMaxSavedDesigns ?? 10; // Fallback default
    const effectiveLimit = userLimit ?? defaultLimit;

    console.log(`[MY_DESIGNS_GET] User ID: ${userId}`);
    console.log(`[MY_DESIGNS_GET] Fetched User Limit: ${userLimit}`);
    console.log(
      `[MY_DESIGNS_GET] Fetched Default Limit: ${generalSettings?.defaultMaxSavedDesigns}`
    );
    console.log(`[MY_DESIGNS_GET] Effective Limit: ${effectiveLimit}`);
    console.log(`[MY_DESIGNS_GET] Total Designs Count: ${totalDesigns}`);
    console.log(
      `[MY_DESIGNS_GET] Fetched Designs Count (page ${page}): ${designs.length}`
    );

    // Return designs, pagination info, total count, and the effective limit
    return NextResponse.json({
      designs: designs,
      currentPage: page,
      totalDesigns: totalDesigns,
      limit: effectiveLimit,
    });
    */
  } catch (error) {
    console.error("[MY_DESIGNS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
