import { NextResponse, NextRequest } from "next/server";
// import { getServerSession } from "next-auth/next"; // <-- Use getToken instead
import { getToken } from "next-auth/jwt"; // <-- Import getToken

import prismadb from "@/lib/prismadb";
// import { authOptions } from "@/lib/auth"; // <-- Not needed for getToken directly

export async function GET(req: Request) {
  // --- DEBUGGING VERCEL AUTH ---
  console.log("[MY_DESIGNS_GET] Request received. Checking environment...");
  console.log(
    `[MY_DESIGNS_GET] NEXTAUTH_URL env var: ${process.env.NEXTAUTH_URL}`
  );
  console.log(
    `[MY_DESIGNS_GET] NEXTAUTH_SECRET env var set: ${!!process.env
      .NEXTAUTH_SECRET}`
  );
  // --- END DEBUGGING ---

  try {
    console.log("[MY_DESIGNS_GET] Attempting to get token...");
    // Use getToken to decode the JWT directly from the request
    const nextReq = req as NextRequest; // Cast req to NextRequest
    const token = await getToken({
      req: nextReq,
      secret: process.env.NEXTAUTH_SECRET,
    });
    console.log(
      "[MY_DESIGNS_GET] Token retrieved:",
      token ? `Token sub (user ID): ${token.sub}` : "Token is NULL"
    ); // Log the token or null

    // Check if token exists and has the user ID (usually in 'sub' claim for JWT strategy)
    if (!token?.sub) {
      console.error(
        // Use console.error for failures
        "[MY_DESIGNS_GET] Authentication failed: No token or sub claim found. Returning 401."
      );
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    console.log(
      `[MY_DESIGNS_GET] Authenticated user ID (from token.sub): ${token.sub}`
    );
    const userId = token.sub; // Use the 'sub' claim as the user ID

    // Fetch designs for the authenticated user using the correct model name
    const designs = await prismadb.savedDesign.findMany({
      // Corrected model name
      where: {
        userId: userId,
      },
      orderBy: {
        updatedAt: "desc", // Or createdAt, depending on desired order
      },
      // Include related data needed by the frontend
      include: {
        product: {
          include: {
            images: true, // Include product images
          },
        },
        color: true, // Include color details
        size: true, // Include size details
      },
    });

    return NextResponse.json(designs);
  } catch (error) {
    console.error("[MY_DESIGNS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
