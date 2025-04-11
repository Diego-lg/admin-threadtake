import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import bcrypt from "bcrypt";
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

    // Ensure user is authenticated and we have an ID
    if (!session?.user?.id) {
      // Ensure user is authenticated
      return addCorsHeaders(
        new NextResponse("Unauthenticated", { status: 401 })
      );
    }

    const body = await req.json();
    const { currentPassword, newPassword } = body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return addCorsHeaders(
        new NextResponse("Current and new passwords are required", {
          status: 400,
        })
      );
    }

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return addCorsHeaders(
        new NextResponse("New password must be at least 8 characters long", {
          // Add CORS headers
          status: 400,
        })
      );
    }

    // Fetch the current user from the database, including the password hash
    const user = await prismadb.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user || !user.hashedPassword) {
      // User not found or password not set (e.g., OAuth user)
      return addCorsHeaders(
        new NextResponse("User not found or password not set", {
          // Add CORS headers
          status: 404,
        })
      );
    }

    // Compare the provided current password with the stored hash
    const isCurrentPasswordCorrect = await bcrypt.compare(
      currentPassword,
      user.hashedPassword
    );

    if (!isCurrentPasswordCorrect) {
      return addCorsHeaders(
        new NextResponse("Incorrect current password", { status: 403 })
      ); // Forbidden
    }

    // Hash the new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12); // Salt rounds = 12

    // Update the user's password in the database
    await prismadb.user.update({
      where: { id: session.user.id },
      data: { hashedPassword: hashedNewPassword },
    });

    return addCorsHeaders(
      NextResponse.json({ message: "Password updated successfully" })
    );
  } catch (error) {
    console.error("[ACCOUNT_PASSWORD_PATCH]", error);
    return addCorsHeaders(
      new NextResponse("Internal Server Error", { status: 500 })
    );
  }
}
