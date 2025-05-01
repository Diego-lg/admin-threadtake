import { NextResponse } from "next/server"; // Remove NextRequest import if not needed elsewhere
import { getServerSession } from "next-auth/next"; // <-- Revert back

import prismadb from "@/lib/prismadb";
import { authOptions } from "@/lib/auth"; // <-- Restore import

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
  // Log incoming cookies
  const cookieHeader = req.headers.get("cookie");
  console.log(
    `[MY_DESIGNS_GET] Incoming Cookie Header: ${cookieHeader || "NONE"}`
  );
  // --- END DEBUGGING ---

  try {
    console.log("[MY_DESIGNS_GET] Attempting to get session...");
    // Revert back to using getServerSession
    const session = await getServerSession(authOptions);
    console.log(
      "[MY_DESIGNS_GET] Session retrieved:",
      session ? `User ID: ${session.user?.id}` : "Session is NULL" // Log only essential info or null
    ); // Log the session object concisely

    // Revert check back to session.user.id
    if (!session?.user?.id) {
      console.error(
        // Use console.error for failures
        "[MY_DESIGNS_GET] Authentication failed: No session or user ID found. Returning 401."
      );
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    console.log(`[MY_DESIGNS_GET] Authenticated user ID: ${session.user.id}`);
    const userId = session.user.id; // Revert back to using session.user.id

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
