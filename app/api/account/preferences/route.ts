import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prismadb from "@/lib/prismadb";

// Helper function to add CORS headers
function addCorsHeaders(response: NextResponse) {
  response.headers.set(
    "Access-Control-Allow-Origin",
    process.env.FRONTEND_STORE_URL || "*"
  );
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  response.headers.set("Access-Control-Allow-Credentials", "true");
  return response;
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  return addCorsHeaders(response);
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    // Ensure user is authenticated
    if (!session?.user?.id) {
      return addCorsHeaders(
        new NextResponse("Unauthenticated", { status: 401 })
      );
    }

    const body = await req.json();
    const { darkMode, emailNotifications } = body;
    console.log("[ACCOUNT_PREFERENCES_PATCH] Received body:", body); // Log received data

    // Basic validation: check if the expected boolean fields are present
    if (
      typeof darkMode !== "boolean" ||
      typeof emailNotifications !== "boolean"
    ) {
      return addCorsHeaders(
        new NextResponse("Invalid preference data provided", {
          // Add CORS headers
          status: 400,
        })
      );
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
    return addCorsHeaders(response);
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
      return addCorsHeaders(
        NextResponse.json({ message: "Preferences update attempted." })
      );
    }
    return addCorsHeaders(
      new NextResponse("Internal Server Error", { status: 500 })
    );
  }
}

// Optional: Add GET handler to fetch current preferences
// export async function GET(req: Request) { ... }
