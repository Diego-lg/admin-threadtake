import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prismadb from "@/lib/prismadb";

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { name, image } = body;

    // Validate that name is provided (required field)
    if (!name || name.trim() === "") {
      return new NextResponse("Display name is required", { status: 400 });
    }

    // Update user profile
    const updatedUser = await prismadb.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        name: name.trim(),
        ...(image && { image }), // Only update image if provided
      },
    });

    // Return success response
    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        image: updatedUser.image,
      },
    });
  } catch (error) {
    console.error("[USER_PROFILE_PATCH] Error:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Get user profile
    const user = await prismadb.user.findUnique({
      where: {
        id: session.user.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        bio: true,
        portfolioUrl: true,
        profileCardBackground: true,
        isCreator: true,
      },
    });

    if (!user) {
      return new NextResponse("User not found", { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: {
        ...user,
        // Profile is complete if user has a name set
        hasCompletedProfile: !!user.name,
      },
    });
  } catch (error) {
    console.error("[USER_PROFILE_GET] Error:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
