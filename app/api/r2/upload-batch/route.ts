import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { R2FileHelpers } from "@/lib/r2-file-helpers";
import { ConflictResolutionStrategy } from "@/lib/r2-conflict-resolver";

/**
 * POST /api/r2/upload-batch
 * Upload multiple files with batch conflict resolution
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const fileType = formData.get("fileType") as string;
    const additionalPath = formData.get("additionalPath") as string;
    const conflictStrategy = formData.get(
      "conflictStrategy"
    ) as ConflictResolutionStrategy;

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    if (!fileType) {
      return NextResponse.json({ error: "Missing fileType" }, { status: 400 });
    }

    // Validate file type
    const validFileTypes = ["profilePicture", "mockup", "asset", "export"];
    if (!validFileTypes.includes(fileType)) {
      return NextResponse.json(
        {
          error: `Invalid fileType. Must be one of: ${validFileTypes.join(
            ", "
          )}`,
        },
        { status: 400 }
      );
    }

    // Validate conflict strategy if provided
    if (conflictStrategy) {
      const validStrategies = Object.values(ConflictResolutionStrategy);
      if (!validStrategies.includes(conflictStrategy)) {
        return NextResponse.json(
          {
            error: `Invalid conflictStrategy. Must be one of: ${validStrategies.join(
              ", "
            )}`,
          },
          { status: 400 }
        );
      }
    }

    const result = await R2FileHelpers.uploadBatchWithConflictResolution(
      session.user.id,
      files,
      fileType as "profilePicture" | "mockup" | "asset" | "export",
      additionalPath,
      conflictStrategy
    );

    return NextResponse.json({
      success: true,
      ...result,
      summary: {
        total: files.length,
        uploaded: result.results.length,
        conflicts: result.conflicts.length,
        errors: result.errors.length,
      },
    });
  } catch (error) {
    console.error("[API_R2_UPLOAD_BATCH] Error in batch upload:", error);
    return NextResponse.json(
      {
        error: "Failed to upload files",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/r2/upload-batch/resolve-conflicts
 * Resolve conflicts for multiple files before upload
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { conflicts, strategy } = body;

    if (!conflicts || !Array.isArray(conflicts)) {
      return NextResponse.json(
        { error: "Missing or invalid conflicts array" },
        { status: 400 }
      );
    }

    if (!strategy) {
      return NextResponse.json(
        { error: "Missing conflict resolution strategy" },
        { status: 400 }
      );
    }

    const conflictResolver = R2FileHelpers.getConflictResolver();
    const batchResolution = await conflictResolver.resolveBatchConflicts(
      session.user.id,
      conflicts,
      strategy
    );

    return NextResponse.json({
      success: true,
      batchResolution,
    });
  } catch (error) {
    console.error(
      "[API_R2_UPLOAD_BATCH] Error resolving batch conflicts:",
      error
    );
    return NextResponse.json(
      {
        error: "Failed to resolve batch conflicts",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
