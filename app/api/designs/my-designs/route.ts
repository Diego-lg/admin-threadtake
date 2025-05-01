import { NextRequest, NextResponse } from "next/server"; // Import NextRequest
import { getToken } from "next-auth/jwt"; // Use getToken to read JWT from cookie or header

import prismadb from "@/lib/prismadb";
// authOptions and getServerSession are no longer needed here
// import { authOptions } from "@/lib/auth";
// import { getServerSession } from "next-auth/next";

const secret = process.env.NEXTAUTH_SECRET; // Secret needed for getToken

export async function GET(req: NextRequest) {
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
