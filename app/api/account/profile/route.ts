import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth"; // Updated import path
import prismadb from "@/lib/prismadb";
import { UserFolderService } from "@/services/user-folder-service";

// Helper function to add CORS headers
function addCorsHeaders(response: NextResponse) {
  response.headers.set(
    "Access-Control-Allow-Origin",
    process.env.FRONTEND_STORE_URL || "*",
  ); // Allow specific origin or all
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  response.headers.set("Access-Control-Allow-Credentials", "true");
  return response;
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  return addCorsHeaders(response);
}

// GET /api/account/profile - Fetch current user's profile
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return addCorsHeaders(
        NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
      );
    }

    const user = await prismadb.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        bio: true,
        portfolioUrl: true,
        profileCardBackground: true,
        isCreator: true,
        hasCompletedProfileSetup: true,
        createdAt: true,
      },
    });

    if (!user) {
      return addCorsHeaders(
        NextResponse.json({ error: "User not found" }, { status: 404 }),
      );
    }

    const response = NextResponse.json(user);
    return addCorsHeaders(response);
  } catch (error) {
    console.error("[ACCOUNT_PROFILE_GET]", error);
    return addCorsHeaders(
      NextResponse.json({ error: "Internal Server Error" }, { status: 500 }),
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    // Ensure user is authenticated and we have an ID
    // Adjust 'session.user.id' if your session structure is different
    if (!session?.user?.id) {
      return addCorsHeaders(
        new NextResponse("Unauthenticated", { status: 401 }),
      );
    }

    const body = await req.json();
    const { name, bio, portfolioUrl } = body; // Destructure fields (Removed background - Phase 2 Rev)

    // Validate input (name is required, others are optional strings)
    if (
      name !== undefined &&
      (typeof name !== "string" || name.trim().length === 0)
    ) {
      return addCorsHeaders(
        new NextResponse("Name must be a non-empty string", { status: 400 }),
      );
    }
    if (bio !== undefined && typeof bio !== "string") {
      return addCorsHeaders(
        new NextResponse("Bio must be a string", { status: 400 }),
      );
    }
    if (portfolioUrl !== undefined && typeof portfolioUrl !== "string") {
      // Basic check, could add URL validation later
      return addCorsHeaders(
        new NextResponse("Portfolio URL must be a string", { status: 400 }),
      );
    }
    // Removed background validation (Phase 2 Rev)

    // Prepare update data - only include fields that were actually provided
    const updateData: {
      name?: string;
      bio?: string | null;
      portfolioUrl?: string | null;
      // profileCardBackground?: string | null; // Removed type for background (Phase 2 Rev)
    } = {};
    if (name !== undefined) updateData.name = name.trim();
    if (bio !== undefined) updateData.bio = bio.trim() || null; // Store empty string as null
    if (portfolioUrl !== undefined)
      updateData.portfolioUrl = portfolioUrl.trim() || null; // Store empty string as null
    // Removed background population logic (Phase 2 Rev)

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return addCorsHeaders(
        new NextResponse("No fields provided for update", { status: 400 }),
      );
    }

    // Get the current user data before update to check for name change
    const currentUser = await prismadb.user.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    });

    const oldName = currentUser?.name;
    const newName = updateData.name;

    // Check if name is being changed
    const isNameChange = newName !== undefined && oldName !== newName;

    // Update user in the database
    const updatedUser = await prismadb.user.update({
      where: { id: session.user.id },
      data: updateData, // Use the dynamically built updateData object
    });

    // If name changed, rename the R2 folder
    if (isNameChange && oldName && newName) {
      try {
        console.log(
          `[PROFILE_API] Name changed from "${oldName}" to "${newName}". Renaming R2 folder for user ${session.user.id}`,
        );

        const renameResult =
          await UserFolderService.renameUserFolderOnNameChange(
            session.user.id,
            oldName,
            newName,
          );

        if (renameResult.success) {
          console.log(
            `[PROFILE_API] Successfully renamed folder for user ${session.user.id}: ${renameResult.filesCopied} files copied`,
          );
        } else {
          console.error(
            `[PROFILE_API] Failed to rename folder for user ${session.user.id}: ${renameResult.error}`,
          );
          // Don't fail the request, just log the error
        }
      } catch (folderError) {
        console.error(
          `[PROFILE_API] Error renaming user folder on name change:`,
          folderError,
        );
        // Don't fail the request if folder rename fails
      }
    }

    // Return the updated user data (excluding sensitive fields if necessary)
    // You might want to select specific fields to return
    const response = NextResponse.json({
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      bio: updatedUser.bio,
      portfolioUrl: updatedUser.portfolioUrl,
      // profileCardBackground: updatedUser.profileCardBackground, // Removed background from response (Phase 2 Rev)
      // Add other fields you want to return, avoid returning password hash etc.
    });
    return addCorsHeaders(response);
  } catch (error) {
    console.error("[ACCOUNT_PROFILE_PATCH]", error);
    // Consider more specific error handling (e.g., Prisma errors)
    return addCorsHeaders(
      new NextResponse("Internal Server Error", { status: 500 }),
    );
  }
}

// Optional: Add GET handler if you need to fetch profile data separately
// export async function GET(req: Request) { ... }
