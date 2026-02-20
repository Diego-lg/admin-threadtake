import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prismadb from "@/lib/prismadb";

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

    // Update the user's profile
    const updatedUser = await prismadb.user.update({
      where: { id: session.user.id },
      data: {
        name: displayName.trim(),
        hasCompletedProfileSetup: true,
      },
    });

    console.log(
      `[COMPLETE_PROFILE_API] User ${updatedUser.id} completed their profile setup with name: ${displayName.trim()}`,
    );

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
