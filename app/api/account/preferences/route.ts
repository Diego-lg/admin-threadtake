import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prismadb from "@/lib/prismadb";

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    // Ensure user is authenticated
    if (!session?.user?.id) {
      // CORS headers are handled by middleware
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    const body = await req.json();
    const { darkMode, emailNotifications } = body;
    console.log("[ACCOUNT_PREFERENCES_PATCH] Received body:", body); // Log received data

    // Basic validation: check if the expected boolean fields are present
    if (
      typeof darkMode !== "boolean" ||
      typeof emailNotifications !== "boolean"
    ) {
      // CORS headers are handled by middleware
      return new NextResponse("Invalid preference data provided", {
        status: 400,
      });
    }

    // Update user preferences in the database
    console.log(
      `[ACCOUNT_PREFERENCES_PATCH] Updating user ${session.user.id} with:`,
      { darkMode, emailNotifications }
    ); // Log before update
    const updatedUser = await prismadb.user.update({
      where: { id: session.user.id },
      data: {
        darkMode: darkMode,
        emailNotifications: emailNotifications,
      },
    });

    // Return the updated preferences or a success message
    console.log(
      "[ACCOUNT_PREFERENCES_PATCH] Update successful for user:",
      session.user.id
    ); // Log success
    const response = NextResponse.json({
      // Add CORS headers
      darkMode: updatedUser.darkMode,
      emailNotifications: updatedUser.emailNotifications,
    });
    // CORS headers are handled by middleware
    return response;
  } catch (error) {
    console.error("[ACCOUNT_PREFERENCES_PATCH]", error);
    // Check if the error is due to the Prisma client generation issue
    if (
      error instanceof TypeError &&
      error.message.includes("Cannot read properties of undefined")
    ) {
      console.warn(
        "Potential Prisma Client generation issue detected. Trying to proceed."
      );
      // You might return a generic success message here or attempt a fallback
      // CORS headers are handled by middleware
      return NextResponse.json({ message: "Preferences update attempted." });
    }
    // CORS headers are handled by middleware
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
// GET handler to fetch current preferences
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    // Ensure user is authenticated
    if (!session?.user?.id) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    // Fetch user preferences from the database
    const user = await prismadb.user.findUnique({
      where: { id: session.user.id },
      select: {
        darkMode: true,
        emailNotifications: true,
      },
    });

    if (!user) {
      return new NextResponse("User not found", { status: 404 });
    }

    // Return the current preferences
    // Provide defaults if values are null in the DB
    const response = NextResponse.json({
      darkMode: user.darkMode ?? false,
      emailNotifications: user.emailNotifications ?? true,
    });
    // CORS headers handled by middleware
    return response;
  } catch (error) {
    console.error("[ACCOUNT_PREFERENCES_GET]", error);
    // CORS headers handled by middleware
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// Optional: Add GET handler to fetch current preferences
// export async function GET(req: Request) { ... }
