import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { updateSharingStatus } from "@/actions/saved-designs";

export async function POST(
  req: Request,
  { params }: { params: { designId: string } },
) {
  try {
    console.log(
      `[API SHARE] Received POST request for design ${params.designId}`,
    );

    // 1. Get session using getServerSession
    console.log("[API SHARE] Attempting to get session...");
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      console.error("[API SHARE] Authentication failed: No valid session");
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    const userId = session.user.id;
    console.log(`[API SHARE] Authenticated user: ${userId}`);

    // 4. Get designId from params
    const { designId } = params;
    if (!designId) {
      return new NextResponse("Design ID is required", { status: 400 });
    }

    // 5. Get desired sharing status from request body
    const body = await req.json();
    const { isShared } = body;

    if (typeof isShared !== "boolean") {
      return new NextResponse(
        "Invalid 'isShared' value in request body. Must be true or false.",
        { status: 400 },
      );
    }
    console.log(`[API SHARE] Requested sharing status: ${isShared}`);

    // 6. Call the existing updateSharingStatus function
    // Note: updateSharingStatus already handles ownership verification
    const result = await updateSharingStatus(userId, designId, isShared); // Pass userId as first argument

    // 7. Return response based on the result
    if (result.success) {
      console.log(
        `[API SHARE] Successfully updated sharing status for design ${designId}`,
      );
      return NextResponse.json(result.data || { success: true }); // Return data if available
    } else {
      console.error(
        `[API SHARE] Failed to update sharing status for design ${designId}: ${result.error}`,
      );
      // Map internal errors to appropriate client responses
      if (result.error === "Unauthenticated") {
        return new NextResponse("Unauthenticated", { status: 401 });
      }
      if (result.error === "Design not found or unauthorized") {
        return new NextResponse("Design not found or unauthorized", {
          status: 404,
        });
      }
      // General internal error for other cases
      return new NextResponse(result.error || "Internal Server Error", {
        status: 500,
      });
    }
  } catch (error) {
    console.error("[API SHARE ROUTE ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
