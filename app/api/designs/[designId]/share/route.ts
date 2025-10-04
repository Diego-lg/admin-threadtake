import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { updateSharingStatus } from "@/actions/saved-designs"; // Import the function

const secret = process.env.NEXTAUTH_SECRET;

export async function POST(
  req: NextRequest,
  { params }: { params: { designId: string } }
) {
  try {
    console.log(
      `[API SHARE] Received POST request for design ${params.designId}`
    );

    // 1. Check if NEXTAUTH_SECRET is defined
    if (!secret) {
      console.error("[API SHARE] Missing NEXTAUTH_SECRET environment variable");
      return new NextResponse("Server configuration error", { status: 500 });
    }

    // 2. Get token using NextAuth's getToken (reads from cookie or Authorization header)
    console.log("[API SHARE] Attempting to get NextAuth token...");
    const token = await getToken({ req, secret });

    if (!token) {
      console.error(
        "[API SHARE] Authentication failed: getToken returned NULL"
      );
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    // 3. Extract user ID from token
    const userIdFromToken = token?.id || token?.sub;

    if (!userIdFromToken) {
      console.error(
        "[API SHARE] Authentication failed: userIdFromToken is missing"
      );
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    const userId = userIdFromToken as string;
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
        { status: 400 }
      );
    }
    console.log(`[API SHARE] Requested sharing status: ${isShared}`);

    // 6. Call the existing updateSharingStatus function
    // Note: updateSharingStatus already handles ownership verification
    const result = await updateSharingStatus(userId, designId, isShared); // Pass userId as first argument

    // 7. Return response based on the result
    if (result.success) {
      console.log(
        `[API SHARE] Successfully updated sharing status for design ${designId}`
      );
      return NextResponse.json(result.data || { success: true }); // Return data if available
    } else {
      console.error(
        `[API SHARE] Failed to update sharing status for design ${designId}: ${result.error}`
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
