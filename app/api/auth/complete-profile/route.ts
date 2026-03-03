import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prismadb from "@/lib/prismadb";
import { UserFolderService } from "@/services/user-folder-service";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { displayName } = body;

    if (
      !displayName ||
      typeof displayName !== "string" ||
      displayName.trim().length === 0
    ) {
      return new NextResponse("Display name is required", { status: 400 });
    }

    const trimmedName = displayName.trim();

    // Update the user's profile
    const updatedUser = await prismadb.user.update({
      where: { id: session.user.id },
      data: {
        name: trimmedName,
        hasCompletedProfileSetup: true,
      },
    });

    console.log(
      `[COMPLETE_PROFILE_API] User ${updatedUser.id} completed their profile setup with name: ${trimmedName}`,
    );

    // Create name-based R2 folder for the user
    try {
      const folderCreated = await UserFolderService.ensureNameBasedFolder(
        updatedUser.id,
        trimmedName,
      );

      if (folderCreated) {
        console.log(
          `[COMPLETE_PROFILE_API] Successfully created name-based folder for user ${updatedUser.id}: users/${trimmedName.toLowerCase().replace(/[^a-z0-9]/g, "-")}/`,
        );
      } else {
        console.warn(
          `[COMPLETE_PROFILE_API] Failed to create name-based folder for user ${updatedUser.id}`,
        );
      }
    } catch (folderError) {
      // Don't fail the request if folder creation fails - log the error
      console.error(
        `[COMPLETE_PROFILE_API] Error creating name-based folder:`,
        folderError,
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        hasCompletedProfileSetup: updatedUser.hasCompletedProfileSetup,
      },
    });
  } catch (error) {
    console.error("[COMPLETE_PROFILE_API] Error:", error);
    return new NextResponse(
      JSON.stringify({ error: "Internal Server Error" }),
      { status: 500 },
    );
  }
}
