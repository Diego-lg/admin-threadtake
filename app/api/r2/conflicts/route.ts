import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { R2FileHelpers } from "@/lib/r2-file-helpers";
import { ConflictResolutionStrategy } from "@/lib/r2-conflict-resolver";

/**
 * POST /api/r2/conflicts/detect
 * Detect file naming conflicts before upload
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { filename, fileType, additionalPath } = body;

    if (!filename || !fileType) {
      return NextResponse.json(
        { error: "Missing required fields: filename, fileType" },
        { status: 400 }
      );
    }

    const conflict = await R2FileHelpers.detectFileConflict(
      session.user.id,
      fileType,
      filename,
      additionalPath
    );

    return NextResponse.json({
      success: true,
      conflict,
      hasConflict: !!conflict,
    });
  } catch (error) {
    console.error("[API_R2_CONFLICTS] Error detecting conflict:", error);
    return NextResponse.json(
      {
        error: "Failed to detect conflict",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/r2/conflicts/resolve
 * Resolve a file naming conflict
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { conflict, strategy, customName } = body;

    if (!conflict || !strategy) {
      return NextResponse.json(
        { error: "Missing required fields: conflict, strategy" },
        { status: 400 }
      );
    }

    const resolution = await R2FileHelpers.resolveFileConflict(
      session.user.id,
      conflict,
      strategy,
      customName
    );

    return NextResponse.json({
      success: true,
      resolution,
    });
  } catch (error) {
    console.error("[API_R2_CONFLICTS] Error resolving conflict:", error);
    return NextResponse.json(
      {
        error: "Failed to resolve conflict",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
