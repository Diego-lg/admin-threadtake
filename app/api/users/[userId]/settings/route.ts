// backend_threadtake/app/api/users/[userId]/settings/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server"; // Assuming Clerk for admin auth

import prismadb from "@/lib/prismadb";
import { UserRole } from "@prisma/client";

// PATCH /api/users/[userId]/settings - Update a specific user's settings (e.g., maxSavedDesigns)
export async function PATCH(
  req: Request,
  { params }: { params: { userId: string } } // Destructure params to get userId
) {
  try {
    // --- Admin Authentication Check ---
    const { userId: adminUserId, sessionClaims } = auth(); // Rename to avoid conflict with params.userId

    if (!adminUserId || sessionClaims?.metadata?.role !== UserRole.ADMIN) {
      console.warn(
        `[USER_SETTINGS_PATCH] Unauthorized attempt by userId: ${adminUserId}`
      );
      return new NextResponse("Unauthorized: Admin privileges required", {
        status: 403,
      });
    }
    console.log(
      `[USER_SETTINGS_PATCH] Authorized admin user: ${adminUserId} attempting to update user ${params.userId}`
    );
    // --- End Admin Authentication Check ---

    const targetUserId = params.userId; // The ID of the user whose settings are being changed
    if (!targetUserId) {
      return new NextResponse("Target User ID parameter is required", {
        status: 400,
      });
    }

    const body = await req.json();
    const { maxSavedDesigns } = body; // Expecting maxSavedDesigns in the body

    // Validate input: allow null (to reset to default) or a non-negative integer
    if (
      maxSavedDesigns !== null &&
      (typeof maxSavedDesigns !== "number" ||
        maxSavedDesigns < 0 ||
        !Number.isInteger(maxSavedDesigns))
    ) {
      return new NextResponse(
        "Invalid 'maxSavedDesigns' value. Must be null or a non-negative integer.",
        { status: 400 }
      );
    }

    // Check if the target user exists
    const userExists = await prismadb.user.findUnique({
      where: { id: targetUserId },
      select: { id: true }, // Only need to check existence
    });

    if (!userExists) {
      return new NextResponse(`User with ID ${targetUserId} not found`, {
        status: 404,
      });
    }

    // Update the user's maxSavedDesigns field
    const updatedUser = await prismadb.user.update({
      where: { id: targetUserId },
      data: {
        maxSavedDesigns: maxSavedDesigns, // Set to null or the provided integer value
      },
      // Select fields to return (optional, adjust as needed)
      select: {
        id: true,
        email: true,
        maxSavedDesigns: true,
        updatedAt: true,
      },
    });

    console.log(
      `[USER_SETTINGS_PATCH] User ${targetUserId}'s maxSavedDesigns updated to ${
        maxSavedDesigns === null ? "default" : maxSavedDesigns
      } by admin ${adminUserId}`
    );
    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error(
      `[USER_SETTINGS_PATCH] Error updating settings for user ${params.userId}:`,
      error
    );
    return new NextResponse("Internal Error", { status: 500 });
  }
}
