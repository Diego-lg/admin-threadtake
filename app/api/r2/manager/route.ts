import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { R2BucketManager } from "@/lib/r2-bucket-manager";
import { R2FileDatabaseManager } from "@/lib/r2-bucket-manager";
import prisma from "@/lib/prismadb";

/**
 * GET /api/r2/manager
 * Get storage statistics and cleanup recommendations
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "stats";

    switch (action) {
      case "stats": {
        const [r2Stats, dbSummary, recommendations] = await Promise.all([
          R2BucketManager.getStorageStats(userId),
          R2FileDatabaseManager.getUserStorageSummary(userId),
          R2BucketManager.getCleanupRecommendations(userId),
        ]);

        return NextResponse.json({
          success: true,
          data: {
            r2Stats,
            dbSummary,
            recommendations,
            bucketStatus: R2BucketManager.getBucketStatus(),
          },
        });
      }

      case "list": {
        const prefix = searchParams.get("prefix") || `users/${userId}`;
        const maxKeys = parseInt(searchParams.get("maxKeys") || "100");
        const continuationToken = searchParams.get("token") || undefined;

        const result = await R2BucketManager.listFiles({
          prefix,
          maxKeys,
          continuationToken,
        });

        return NextResponse.json({
          success: true,
          data: {
            files: result.files.map((f) => ({
              ...f,
              sizeFormatted: R2BucketManager.formatBytes(f.size),
            })),
            nextToken: result.nextToken,
            isTruncated: result.isTruncated,
          },
        });
      }

      case "recommendations": {
        const recommendations =
          await R2BucketManager.getCleanupRecommendations(userId);
        return NextResponse.json({
          success: true,
          data: recommendations,
        });
      }

      case "bucket-status": {
        const status = R2BucketManager.getBucketStatus();
        return NextResponse.json({
          success: true,
          data: status,
        });
      }

      case "user-files": {
        const limit = parseInt(searchParams.get("limit") || "50");
        const offset = parseInt(searchParams.get("offset") || "0");
        const orderBy = searchParams.get("orderBy") || "createdAt";
        const orderDirection = searchParams.get("orderDirection") || "desc";

        const result = await R2FileDatabaseManager.getUserFiles(userId, {
          limit,
          offset,
          orderBy: orderBy as "createdAt" | "fileSize" | "fileName",
          orderDirection: orderDirection as "asc" | "desc",
        });

        return NextResponse.json({
          success: true,
          data: {
            files: result.files,
            total: result.total,
          },
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error: any) {
    console.error("[R2_MANAGER_API] GET Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/r2/manager
 * Perform cleanup operations
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { action, criteria } = body;

    switch (action) {
      case "cleanup": {
        // Validate cleanup criteria
        const cleanupCriteria = {
          olderThanDays: criteria?.olderThanDays,
          largerThanBytes: criteria?.largerThanBytes,
          folderPaths: criteria?.folderPaths?.map((p: string) =>
            p.startsWith(`users/${userId}`) ? p : `users/${userId}/${p}`,
          ),
          maxFiles: criteria?.maxFiles || 100,
          dryRun: criteria?.dryRun || false,
        };

        const result = await R2BucketManager.cleanupOldFiles(cleanupCriteria);

        // Log cleanup action (using console for now - r2AuditLog model not in schema)
        console.log(`[R2_MANAGER] Cleanup action by user ${userId}:`, {
          criteria: cleanupCriteria,
          result: {
            deletedCount: result.deletedCount,
            freedSpace: result.freedSpace,
            dryRun: result.dryRun,
          },
        });

        return NextResponse.json({
          success: result.success,
          data: {
            deletedCount: result.deletedCount,
            freedSpace: result.freedSpace,
            freedSpaceFormatted: R2BucketManager.formatBytes(result.freedSpace),
            deletedFiles: result.deletedFiles.map((f) => ({
              ...f,
              sizeFormatted: R2BucketManager.formatBytes(f.size),
            })),
            errors: result.errors,
            dryRun: result.dryRun,
          },
        });
      }

      case "delete-file": {
        const { fileKey } = body;

        if (!fileKey) {
          return NextResponse.json(
            { error: "fileKey is required" },
            { status: 400 },
          );
        }

        // Verify ownership
        if (!fileKey.startsWith(`users/${userId}`)) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Soft delete in database first
        await R2FileDatabaseManager.softDeleteFile(fileKey);

        // Delete from R2
        await R2BucketManager.deleteFile(fileKey);

        // Log deletion (using console for now - r2AuditLog model not in schema)
        console.log(`[R2_MANAGER] File deleted by user ${userId}:`, {
          fileKey,
        });

        return NextResponse.json({
          success: true,
          data: { message: "File deleted successfully", fileKey },
        });
      }

      case "delete-files": {
        const { fileKeys } = body;

        if (!Array.isArray(fileKeys) || fileKeys.length === 0) {
          return NextResponse.json(
            { error: "fileKeys array is required" },
            { status: 400 },
          );
        }

        // Verify ownership for all files
        const unauthorizedFiles = fileKeys.filter(
          (key: string) => !key.startsWith(`users/${userId}`),
        );
        if (unauthorizedFiles.length > 0) {
          return NextResponse.json(
            { error: "Access denied for some files" },
            { status: 403 },
          );
        }

        // Soft delete in database first
        for (const key of fileKeys) {
          await R2FileDatabaseManager.softDeleteFile(key);
        }

        // Delete from R2
        const deleteResult = await R2BucketManager.deleteFiles(fileKeys);

        // Log batch deletion (using console for now - r2AuditLog model not in schema)
        console.log(`[R2_MANAGER] Batch delete by user ${userId}:`, {
          requestedCount: fileKeys.length,
          deletedCount: deleteResult.deleted.length,
          failedCount: deleteResult.failed.length,
        });

        return NextResponse.json({
          success: deleteResult.failed.length === 0,
          data: {
            deleted: deleteResult.deleted,
            failed: deleteResult.failed,
            deletedCount: deleteResult.deleted.length,
          },
        });
      }

      case "cleanup-orphaned": {
        // Get referenced files from database
        const referencedKeys =
          await R2FileDatabaseManager.getReferencedFileKeys();

        const result = await R2BucketManager.cleanupOrphanedFiles(
          referencedKeys,
          criteria?.dryRun || false,
        );

        return NextResponse.json({
          success: result.success,
          data: {
            deletedCount: result.deletedCount,
            freedSpace: result.freedSpace,
            freedSpaceFormatted: R2BucketManager.formatBytes(result.freedSpace),
            dryRun: result.dryRun,
            errors: result.errors,
          },
        });
      }

      case "delete-versions": {
        const { fileKey } = body;

        if (!fileKey) {
          return NextResponse.json(
            { error: "fileKey is required" },
            { status: 400 },
          );
        }

        // Verify ownership
        if (!fileKey.startsWith(`users/${userId}`)) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        const result = await R2BucketManager.deleteFileVersions(fileKey);

        return NextResponse.json({
          success: result.errors.length === 0,
          data: {
            deleted: result.deleted,
            errors: result.errors,
          },
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error: any) {
    console.error("[R2_MANAGER_API] POST Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
