import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// PATCH /api/designs/[designId]/status - Update design status
export async function PATCH(
  req: Request,
  { params }: { params: { designId: string } },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return new NextResponse(
        "Unauthorized - Please sign in to update designs",
        {
          status: 401,
        },
      );
    }

    const userId = session.user.id;
    const { designId } = params;

    const body = await req.json();
    const { status, progress, error } = body;

    // Normalize status to uppercase if provided
    const normalizedStatus = status ? status.toUpperCase() : undefined;

    // Validate status if provided
    const validStatuses = ["PENDING", "PROCESSING", "COMPLETE", "FAILED"];
    if (normalizedStatus && !validStatuses.includes(normalizedStatus)) {
      return new NextResponse(
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        {
          status: 400,
        },
      );
    }

    // Build update data object for Prisma
    const updateData: any = {};

    if (normalizedStatus) {
      updateData.status = normalizedStatus;
    }
    if (typeof progress === "number") {
      updateData.progress = progress;
    }
    if (error !== undefined) {
      updateData.error = error;
    }

    if (Object.keys(updateData).length === 0) {
      return new NextResponse("No fields to update", { status: 400 });
    }

    // Use Prisma's built-in update method for safer query
    const updatedDesign = await prismadb.savedDesign.update({
      where: {
        id: designId,
        userId: userId,
      },
      data: updateData,
      select: {
        id: true,
        customText: true,
        designImageUrl: true,
        status: true,
        progress: true,
        error: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updatedDesign);
  } catch (error: any) {
    console.error("[DESIGN_STATUS_PATCH]", error);

    // Check if design not found (Prisma error code P2025)
    if (
      error?.code === "P2025" ||
      (error?.meta?.cause &&
        error.meta.cause.includes("Record to update not found"))
    ) {
      return new NextResponse("Design not found", { status: 404 });
    }

    return new NextResponse("Internal Error", { status: 500 });
  }
}
