import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { UserRole, UserStatus } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import prismadb from "@/lib/prismadb";

// --- GET Handler (Fetch User Details) ---
export async function GET(
  req: Request, // req is not directly used here but is part of the signature
  { params }: { params: { userId: string } }
) {
  try {
    // 1. Check for Admin Authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== UserRole.ADMIN) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // 2. Validate userId parameter
    if (!params.userId) {
      return new NextResponse("User ID is required", { status: 400 });
    }

    // 3. Fetch User from DB
    const user = await prismadb.user.findUnique({
      where: {
        id: params.userId,
      },
      select: {
        // Select fields, exclude sensitive ones
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        bio: true, // Include other relevant fields as needed
        portfolioUrl: true,
        isCreator: true,
        // Potentially add counts for orders, designs etc. if needed later
        // _count: { select: { orders: true, savedDesigns: true } }
      },
    });

    // 4. Handle Not Found
    if (!user) {
      return new NextResponse("User not found", { status: 404 });
    }

    // 5. Return User Data
    return NextResponse.json(user);
  } catch (error) {
    console.error("[ADMIN_USER_GET_DETAIL]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

// --- PATCH Handler (Update User Role/Status) ---
export async function PATCH(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    // 1. Check for Admin Authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== UserRole.ADMIN) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // 2. Validate userId parameter
    if (!params.userId) {
      return new NextResponse("User ID is required", { status: 400 });
    }

    // 3. Parse Request Body
    const body = await req.json();
    const { role, status } = body;

    // 4. Validate Input Data (basic validation)
    if (!role && !status) {
      return new NextResponse("Role or Status is required for update", {
        status: 400,
      });
    }
    if (role && !Object.values(UserRole).includes(role)) {
      return new NextResponse(`Invalid role value: ${role}`, { status: 400 });
    }
    if (status && !Object.values(UserStatus).includes(status)) {
      return new NextResponse(`Invalid status value: ${status}`, {
        status: 400,
      });
    }

    // Prevent admin from accidentally locking themselves out or demoting last admin? (Optional advanced check)
    // if (session.user.id === params.userId && (role !== UserRole.ADMIN || status === UserStatus.INACTIVE)) {
    //   // Add logic to check if they are the only admin
    //   return new NextResponse("Cannot modify own admin status or role if last admin.", { status: 400 });
    // }

    // 5. Fetch Target User to Check Role
    const targetUser = await prismadb.user.findUnique({
      where: { id: params.userId },
      select: { role: true }, // Only need the role
    });

    if (!targetUser) {
      return new NextResponse("User not found", { status: 404 });
    }

    // 6. Prevent Modifying Admins
    if (targetUser.role === UserRole.ADMIN) {
      // Specifically prevent deactivating or changing role of an admin
      if (status === UserStatus.INACTIVE || (role && role !== UserRole.ADMIN)) {
        return new NextResponse(
          "Cannot modify another admin account's status or role.",
          { status: 403 }
        );
      }
      // Allow other potential updates for admins if needed in the future, but for now, status/role changes are blocked.
    }

    // 7. Update User in DB (if not an admin or update is allowed)
    const updatedUser = await prismadb.user.update({
      where: {
        id: params.userId,
      },
      data: {
        ...(role && { role: role }), // Conditionally add role to update data
        ...(status && { status: status }), // Conditionally add status
      },
      select: {
        // Return updated user data (excluding sensitive fields)
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        updatedAt: true,
      },
    });

    // 6. Return Updated User Data
    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("[ADMIN_USER_PATCH]", error);
    // Handle potential Prisma errors like record not found during update
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return new NextResponse("User not found", { status: 404 });
    }
    return new NextResponse("Internal error", { status: 500 });
  }
}

// --- DELETE Handler (Delete User) ---
export async function DELETE(
  req: Request, // req is not directly used here but is part of the signature
  { params }: { params: { userId: string } }
) {
  try {
    // 1. Check for Admin Authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== UserRole.ADMIN) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // 2. Validate userId parameter
    if (!params.userId) {
      return new NextResponse("User ID is required", { status: 400 });
    }

    // Prevent admin from deleting themselves? (Optional check)
    if (session.user.id === params.userId) {
      return new NextResponse("Admin cannot delete their own account.", {
        status: 400,
      });
    }

    // 3. Fetch Target User to Check Role
    const targetUserToDelete = await prismadb.user.findUnique({
      where: { id: params.userId },
      select: { role: true }, // Only need the role
    });

    if (!targetUserToDelete) {
      return new NextResponse("User not found", { status: 404 });
    }

    // 4. Prevent Deleting Admins
    if (targetUserToDelete.role === UserRole.ADMIN) {
      return new NextResponse("Cannot delete an admin account.", {
        status: 403,
      });
    }

    // 5. Delete User from DB (if not an admin)
    // Consider implications: What happens to user's orders, designs, etc.?
    // Prisma's default onDelete behavior (Cascade for Account/Session, SetNull for Order) might be sufficient,
    // but review schema relations if specific handling is needed.
    // A soft delete (PATCHing status to DELETED) might be safer.
    await prismadb.user.delete({
      where: {
        id: params.userId,
      },
    });

    // 4. Return Success Response
    return new NextResponse(null, { status: 204 }); // No Content on successful delete
  } catch (error) {
    console.error("[ADMIN_USER_DELETE]", error);
    // Handle potential Prisma errors like record not found during delete
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return new NextResponse("User not found", { status: 404 });
    }
    return new NextResponse("Internal error", { status: 500 });
  }
}
