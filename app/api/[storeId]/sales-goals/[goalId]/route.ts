import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import prismadb from "@/lib/prismadb";
import { authOptions } from "@/lib/auth";

export async function DELETE(
  req: Request, // req is required even if not used directly
  { params }: { params: { storeId: string; goalId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    if (!params.storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    if (!params.goalId) {
      return new NextResponse("Goal ID is required", { status: 400 });
    }

    // Verify user owns the store associated with the goal
    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: params.storeId,
        userId: userId,
        // Optional: Check if the goal actually belongs to this store
        // salesGoals: { some: { id: params.goalId } } // More robust check
      },
    });

    if (!storeByUserId) {
      // Either store doesn't exist or user doesn't own it
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Delete the goal
    const salesGoal = await prismadb.salesGoal.delete({
      where: {
        id: params.goalId,
        storeId: params.storeId, // Ensure deletion is scoped to the store
      },
    });

    return NextResponse.json(salesGoal); // Return the deleted goal data
  } catch (error) {
    console.error("[SALES_GOAL_DELETE]", error);
    // Handle potential Prisma errors (e.g., record not found)
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return new NextResponse("Goal not found", { status: 404 });
    }
    return new NextResponse("Internal error", { status: 500 });
  }
}

// Optional: Add GET handler to fetch a single goal by ID
// export async function GET(...) { ... }

// Optional: Add PATCH handler to update a single goal (alternative to POST in the main route)
// export async function PATCH(...) { ... }
