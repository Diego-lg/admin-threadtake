import { NextRequest, NextResponse } from "next/server"; // Import NextRequest
import prismadb from "@/lib/prismadb"; // Restore prismadb import

// GET /api/creators/[creatorId] - Fetch public profile data for a specific creator

interface RouteParams {
  params: {
    creatorId: string;
  };
}

export async function GET(
  req: NextRequest, // Use NextRequest instead of Request
  context: RouteParams // Keep the explicit interface
) {
  try {
    const { creatorId } = context.params; // Access params via context

    if (!creatorId) {
      return new NextResponse("Creator ID is required", { status: 400 });
    }

    const creatorProfile = await prismadb.user.findUnique({
      where: {
        id: creatorId,
        // Optionally add: isCreator: true, if you only want to fetch profiles marked as creators
      },
      select: {
        // Select only public-safe fields
        id: true,
        name: true,
        image: true,
        bio: true,
        portfolioUrl: true,
        createdAt: true, // Maybe useful to show "Member since..."
        // You could also include counts of related public items if needed, e.g., shared designs
        // _count: {
        //   select: {
        //     savedDesigns: { where: { isShared: true } }
        //   }
        // }
      },
    });

    if (!creatorProfile) {
      return new NextResponse("Creator profile not found", { status: 404 });
    }

    // Note: No CORS headers needed here usually, unless called directly from a different frontend domain
    // than the one serving the main app (which is unlikely for internal API calls).
    // If needed, add the same CORS helper as in the account profile route.
    return NextResponse.json(creatorProfile);
  } catch (error) {
    console.error("[CREATOR_PROFILE_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
