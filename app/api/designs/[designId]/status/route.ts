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

    // Validate status if provided
    const validStatuses = ["PENDING", "PROCESSING", "COMPLETE", "FAILED"];
    if (status && !validStatuses.includes(status)) {
      return new NextResponse(
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        {
          status: 400,
        },
      );
    }

    // Build update data
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (typeof progress === "number") {
      updates.push(`progress = $${paramIndex++}`);
      values.push(progress);
    }

    if (error !== undefined) {
      updates.push(`error = $${paramIndex++}`);
      values.push(error);
    }

    if (updates.length === 0) {
      return new NextResponse("No fields to update", { status: 400 });
    }

    // Add the designId and userId to the values array
    values.push(designId, userId);

    // Use raw query to update the design status
    const updatedDesign = await prismadb.$queryRaw`
      UPDATE "SavedDesign"
      SET ${updates.join(", ")}
      WHERE id = ${designId} AND "userId" = ${userId}
      RETURNING id, "customText", "designImageUrl", status, progress, error, "createdAt", "updatedAt"
    `;

    return NextResponse.json(updatedDesign);
  } catch (error) {
    console.error("[DESIGN_STATUS_PATCH]", error);

    // Check if design not found
    if (
      error instanceof Error &&
      error.message.includes("Record to update not found")
    ) {
      return new NextResponse("Design not found", { status: 404 });
    }

    return new NextResponse("Internal Error", { status: 500 });
  }
}
