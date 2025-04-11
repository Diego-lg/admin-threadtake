import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth"; // Updated import path
import prismadb from "@/lib/prismadb";

export async function PATCH(
  req: Request,
  { params }: { params: { savedDesignId: string } } // Get params directly
) {
  try {
    console.log(
      `[SHARE API v2] Attempting PATCH for design ${params.savedDesignId}`
    );

    // 1. Authenticate using the admin project's session context
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      console.log(
        "[SHARE API v2] Authentication failed: No valid session found via getServerSession."
      );
      return new NextResponse("Unauthenticated", { status: 401 });
    }
    console.log(`[SHARE API v2] Authenticated user: ${userId}`);

    // 2. Get data from request body
    const body = await req.json();
    const { isShared } = body;
    const savedDesignId = params.savedDesignId; // Get ID from route params

    // 3. Validate input
    if (!savedDesignId) {
      return new NextResponse("Saved Design ID is required", { status: 400 });
    }
    if (typeof isShared !== "boolean") {
      return new NextResponse("isShared must be a boolean value", {
        status: 400,
      });
    }
    console.log(
      `[SHARE API v2] Input validated: designId=${savedDesignId}, isShared=${isShared}`
    );

    // 4. Verify ownership and update database
    const designToUpdate = await prismadb.savedDesign.findUnique({
      where: {
        id: savedDesignId,
        userId: userId, // Verify ownership using authenticated user ID
      },
      select: { id: true }, // Only need to check existence
    });

    if (!designToUpdate) {
      console.log(
        `[SHARE API v2] Design not found (ID: ${savedDesignId}) or user ${userId} not authorized.`
      );
      return new NextResponse("Design not found or unauthorized", {
        status: 404,
      });
    }
    console.log(
      `[SHARE API v2] Ownership verified for design ${savedDesignId}.`
    );

    const updatedDesign = await prismadb.savedDesign.update({
      where: {
        id: savedDesignId,
        userId: userId, // Include userId again for safety
      },
      data: { isShared: isShared },
      select: { id: true, isShared: true }, // Return updated status
    });

    console.log(
      `[SHARE API v2] Successfully updated design ${savedDesignId} sharing status to ${isShared}.`
    );
    return NextResponse.json(updatedDesign);
  } catch (error) {
    console.error("[SHARE API v2] Error:", error);
    // Basic error handling, avoid leaking details
    if (error instanceof Error && error.message.includes("JSON")) {
      return new NextResponse("Invalid request body.", { status: 400 });
    }
    return new NextResponse("Internal error", { status: 500 });
  }
}
