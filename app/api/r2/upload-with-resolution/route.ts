import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { R2FileHelpers } from "@/lib/r2-file-helpers";
import { ConflictResolutionStrategy } from "@/lib/r2-conflict-resolver";

/**
 * POST /api/r2/upload-with-resolution
 * Upload a single file with automatic conflict resolution
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const fileType = formData.get("fileType") as string;
    const additionalPath = formData.get("additionalPath") as string;
    const conflictStrategy = formData.get(
      "conflictStrategy"
    ) as ConflictResolutionStrategy;
    const detectOnly = formData.get("detectOnly") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
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

    // If detectOnly is true, only detect conflicts without uploading
    if (detectOnly) {
      const conflict = await R2FileHelpers.detectFileConflict(
        session.user.id,
        fileType as "profilePicture" | "mockup" | "asset" | "export",
        file.name,
        additionalPath
      );

      return NextResponse.json({
        success: true,
        conflict,
        hasConflict: !!conflict,
        detectOnly: true,
      });
    }

    // Upload with conflict resolution
    const result = await R2FileHelpers.uploadFileWithConflictResolution(
      session.user.id,
      file,
      fileType as "profilePicture" | "mockup" | "asset" | "export",
      additionalPath,
      conflictStrategy
    );

    return NextResponse.json({
      success: true,
      ...result,
      hadConflict: !!result.conflictResolution,
    });
  } catch (error) {
    console.error(
      "[API_R2_UPLOAD_WITH_RESOLUTION] Error uploading file:",
      error
    );

    // Check if it's a conflict-related error that should be handled differently
    if (
      error instanceof Error &&
      error.message.includes("skipped due to conflict")
    ) {
      return NextResponse.json(
        {
          error: "File upload skipped",
          message: error.message,
          requiresUserAction: true,
        },
        { status: 409 } // Conflict status code
      );
    }

    return NextResponse.json(
      {
        error: "Failed to upload file",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/r2/upload-with-resolution/strategies
 * Get available conflict resolution strategies
 */
export async function GET() {
  try {
    const strategies = Object.values(ConflictResolutionStrategy).map(
      (strategy) => ({
        value: strategy,
        label: strategy
          .replace(/_/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase()),
        description: getStrategyDescription(strategy),
      })
    );

    return NextResponse.json({
      success: true,
      strategies,
    });
  } catch (error) {
    console.error(
      "[API_R2_UPLOAD_WITH_RESOLUTION] Error getting strategies:",
      error
    );
    return NextResponse.json(
      {
        error: "Failed to get strategies",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Get description for a conflict resolution strategy
 */
function getStrategyDescription(strategy: ConflictResolutionStrategy): string {
  switch (strategy) {
    case ConflictResolutionStrategy.TIMESTAMP:
      return "Add a timestamp to the filename to make it unique";
    case ConflictResolutionStrategy.UUID:
      return "Add a unique identifier to the filename";
    case ConflictResolutionStrategy.SEQUENTIAL:
      return "Add a version number (v1, v2, etc.) to the filename";
    case ConflictResolutionStrategy.CONTENT_HASH:
      return "Use content hash to identify identical files";
    case ConflictResolutionStrategy.OVERWRITE:
      return "Replace the existing file with the new one";
    case ConflictResolutionStrategy.RENAME:
      return "Choose a custom name for the file";
    case ConflictResolutionStrategy.SKIP:
      return "Skip uploading this file";
    default:
      return "Unknown strategy";
  }
}
