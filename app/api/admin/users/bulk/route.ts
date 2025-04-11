import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { UserRole, UserStatus } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import prismadb from "@/lib/prismadb";

// Define allowed bulk actions
type BulkAction = "activate" | "deactivate" | "delete";

export async function PATCH(req: Request) {
  try {
    // 1. Check for Admin Authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== UserRole.ADMIN) {
      return new NextResponse("Unauthorized", { status: 403 });
    }
    const currentAdminId = session.user.id;

    // 2. Parse Request Body
    const body = await req.json();
    const { userIds, action } = body as {
      userIds: string[];
      action: BulkAction;
    };

    // 3. Validate Input
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return new NextResponse("User IDs array is required.", { status: 400 });
    }
    if (!action || !["activate", "deactivate", "delete"].includes(action)) {
      return new NextResponse("Invalid action specified.", { status: 400 });
    }

    // 4. Fetch target users to check roles and prevent self-action/admin modification
    const targetUsers = await prismadb.user.findMany({
      where: {
        id: { in: userIds },
      },
      select: { id: true, role: true },
    });

    const targetUserMap = new Map(targetUsers.map((u) => [u.id, u.role]));

    let validUserIds: string[] = [];
    let skippedAdminCount = 0;
    let skippedSelfCount = 0;

    userIds.forEach((id) => {
      const role = targetUserMap.get(id);
      // Skip if user not found (shouldn't happen with valid IDs, but good practice)
      if (!role) return;

      // Prevent deleting/deactivating self
      if (action !== "activate" && id === currentAdminId) {
        skippedSelfCount++;
        return;
      }
      // Prevent deleting/deactivating other admins
      if (action !== "activate" && role === UserRole.ADMIN) {
        skippedAdminCount++;
        return;
      }
      validUserIds.push(id);
    });

    if (validUserIds.length === 0) {
      let message = "No valid users to perform action on.";
      if (skippedAdminCount > 0)
        message += ` Skipped ${skippedAdminCount} admin(s).`;
      if (skippedSelfCount > 0) message += ` Cannot ${action} own account.`;
      return new NextResponse(message, { status: 400 });
    }

    // 5. Perform Bulk Action
    let result;
    let successMessage = "";

    switch (action) {
      case "activate":
        result = await prismadb.user.updateMany({
          where: { id: { in: validUserIds } },
          data: { status: UserStatus.ACTIVE },
        });
        successMessage = `Activated ${result.count} user(s).`;
        break;
      case "deactivate":
        result = await prismadb.user.updateMany({
          where: { id: { in: validUserIds } },
          data: { status: UserStatus.INACTIVE },
        });
        successMessage = `Deactivated ${result.count} user(s).`;
        break;
      case "delete":
        result = await prismadb.user.deleteMany({
          where: { id: { in: validUserIds } },
        });
        successMessage = `Deleted ${result.count} user(s).`;
        break;
    }

    // Add info about skipped users to the success message
    if (skippedAdminCount > 0)
      successMessage += ` Skipped ${skippedAdminCount} admin(s).`;
    if (skippedSelfCount > 0)
      successMessage += ` Cannot ${action} own account.`;

    // 6. Return Response
    return NextResponse.json({ message: successMessage, count: result.count });
  } catch (error) {
    console.error("[ADMIN_USERS_BULK_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
