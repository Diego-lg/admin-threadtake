import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import prismadb from "@/lib/prismadb";
import { authOptions } from "@/lib/auth"; // Assuming authOptions are exported from lib/auth

export async function GET(req: Request) {
  try {
    console.log("[MY_DESIGNS_GET] Attempting to get session...");
    const session = await getServerSession(authOptions);
    console.log(
      "[MY_DESIGNS_GET] Session retrieved:",
      JSON.stringify(session, null, 2)
    ); // Log the session object

    if (!session?.user?.id) {
      console.log(
        "[MY_DESIGNS_GET] Authentication failed: No session or user ID found."
      );
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    console.log(`[MY_DESIGNS_GET] Authenticated user ID: ${session.user.id}`);
    const userId = session.user.id;

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
