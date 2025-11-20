import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { R2Config } from "@/lib/r2-config";
import { UserFolderService } from "@/services/user-folder-service";
import { UserFolderPaths, ExportType } from "@/lib/r2-user-storage";
import { v4 as uuidv4 } from "uuid";

/**
 * Query parameters for export listing
 */
interface ExportsQuery {
  exportType?: ExportType;
  page?: string;
  pageSize?: string;
  sortBy?: "name" | "date" | "size" | "type";
  sortOrder?: "asc" | "desc";
  search?: string;
}

/**
 * Response interface for export listing
 */
interface ExportsResponse {
  exports: Array<{
    id: string;
    name: string;
    url: string;
    key: string;
    size: number;
    lastModified: Date;
    exportType: ExportType;
    contentType: string;
    downloadCount?: number;
  }>;
  exportTypes: Array<{
    type: ExportType;
    count: number;
    totalSize: number;
  }>;
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    pageSize: number;
  };
  stats: {
    totalExports: number;
    totalSize: number;
    totalTypes: number;
  };
}

// GET handler for listing user exports
export async function GET(req: Request) {
  try {
    // 1. Check Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // 2. Validate R2 configuration
    if (!R2Config.validateConfig()) {
      return new NextResponse(
        "Server configuration error: R2 settings missing",
        { status: 500 }
      );
    }

    // 3. Parse query parameters
    const { searchParams } = new URL(req.url);
    const query: ExportsQuery = {
      exportType: (searchParams.get("exportType") as ExportType) || undefined,
      page: searchParams.get("page") || "0",
      pageSize: searchParams.get("pageSize") || "50",
      sortBy: (searchParams.get("sortBy") as any) || "date",
      sortOrder: (searchParams.get("sortOrder") as any) || "desc",
      search: searchParams.get("search") || undefined,
    };

    const page = parseInt(query.page || "0");
    const pageSize = Math.min(parseInt(query.pageSize || "50"), 100);
    const userId = session.user.id;

    // 4. Authorization check for accessing other users' exports (admin only)
    const targetUserId = searchParams.get("userId");
    const effectiveUserId =
      targetUserId && session.user.role === UserRole.ADMIN
        ? targetUserId
        : userId;

    if (
      targetUserId &&
      targetUserId !== userId &&
      session.user.role !== UserRole.ADMIN
    ) {
      return new NextResponse("Forbidden: Cannot access other users' exports", {
        status: 403,
      });
    }

    // 5. Ensure user folder exists
    await UserFolderService.ensureUserFolderExists(effectiveUserId);

    // 6. Determine the prefix for exports
    let effectivePrefix = UserFolderPaths.getExportsPath(effectiveUserId);

    if (query.exportType) {
      effectivePrefix = UserFolderPaths.getExportTypePath(
        effectiveUserId,
        query.exportType
      );
    }

    // 7. List export files
    const result = await UserFolderService.listUserFilesPaginated(
      effectiveUserId,
      effectivePrefix,
      page,
      pageSize
    );

    // 8. Format export response
    const config = R2Config.getConfig();
    let exports = result.files.map((file: any) => {
      const relativePath = file.key.replace(
        UserFolderPaths.getExportsPath(effectiveUserId) + "/",
        ""
      );
      const pathParts = relativePath.split("/");

      // Extract export type from path
      const exportType = pathParts[0] as ExportType;
      const fileName = pathParts.slice(1).join("/");
      const contentType = fileName.split(".").pop() || "unknown";

      return {
        id: file.key,
        name: fileName,
        url: `${config.publicBucketUrl}/${file.key}`,
        key: file.key,
        size: file.size,
        lastModified: file.lastModified,
        exportType,
        contentType,
        downloadCount: 0, // TODO: Implement download tracking if needed
      };
    });

    // 9. Apply search filter if provided
    if (query.search) {
      const searchTerm = query.search.toLowerCase();
      exports = exports.filter(
        (exportItem: any) =>
          exportItem.name.toLowerCase().includes(searchTerm) ||
          exportItem.exportType.toLowerCase().includes(searchTerm)
      );
    }

    // 10. Apply sorting
    exports.sort((a: any, b: any) => {
      let comparison = 0;

      switch (query.sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "size":
          comparison = a.size - b.size;
          break;
        case "type":
          comparison = a.exportType.localeCompare(b.exportType);
          break;
        case "date":
        default:
          comparison =
            new Date(a.lastModified).getTime() -
            new Date(b.lastModified).getTime();
          break;
      }

      return query.sortOrder === "asc" ? comparison : -comparison;
    });

    // 11. Get export type statistics
    const exportTypes: ExportType[] = ["designs", "collections"];
    const exportTypeStats = await Promise.all(
      exportTypes.map(async (type) => {
        const typePrefix = UserFolderPaths.getExportTypePath(
          effectiveUserId,
          type
        );
        const typeResult = await UserFolderService.listUserFilesPaginated(
          effectiveUserId,
          typePrefix,
          0,
          1000
        );

        return {
          type,
          count: typeResult.files.length,
          totalSize: typeResult.files.reduce(
            (sum: number, file: any) => sum + file.size,
            0
          ),
        };
      })
    );

    // 12. Calculate overall statistics
    const totalExports = exports.length;
    const totalSize = exports.reduce((sum, e) => sum + e.size, 0);

    const response: ExportsResponse = {
      exports,
      exportTypes: exportTypeStats,
      pagination: {
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        totalCount: exports.length,
        pageSize,
      },
      stats: {
        totalExports,
        totalSize,
        totalTypes: exportTypeStats.filter((t) => t.count > 0).length,
      },
    };

    console.log(
      `[R2_USER_EXPORTS_GET] Listed exports for user ${effectiveUserId}:`,
      {
        exportType: query.exportType,
        exportCount: exports.length,
        typeCount: exportTypeStats.length,
        page,
        pageSize,
      }
    );

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[R2_USER_EXPORTS_GET] Error:", error);
    return new NextResponse(`Internal Server Error: ${error.message}`, {
      status: 500,
    });
  }
}

// POST handler for creating exports
export async function POST(req: Request) {
  try {
    // 1. Check Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // 2. Parse request body
    const body = await req.json();
    const { exportType, filename, content, designIds, format } = body;

    if (!exportType || !filename) {
      return new NextResponse("Missing required fields: exportType, filename", {
        status: 400,
      });
    }

    const userId = session.user.id;

    // 3. Validate R2 configuration
    if (!R2Config.validateConfig()) {
      return new NextResponse(
        "Server configuration error: R2 settings missing",
        { status: 500 }
      );
    }

    // 4. Ensure user folder exists
    await UserFolderService.ensureUserFolderExists(userId);

    // 5. Generate path for the export
    const pathInfo = await UserFolderService.getExportPath(
      userId,
      exportType,
      filename
    );

    // 6. Create export content based on type
    let exportContent: Buffer;
    let contentType: string;

    switch (exportType) {
      case "designs":
        if (!designIds || !Array.isArray(designIds)) {
          return new NextResponse("Missing designIds for designs export", {
            status: 400,
          });
        }

        // Create a JSON export of designs
        const designsData = {
          exportId: uuidv4(),
          exportedAt: new Date().toISOString(),
          userId,
          designIds,
          format: format || "json",
        };

        exportContent = Buffer.from(JSON.stringify(designsData, null, 2));
        contentType = "application/json";
        break;

      case "collections":
        // Create a collection export (could be a zip file in a real implementation)
        const collectionsData = {
          exportId: uuidv4(),
          exportedAt: new Date().toISOString(),
          userId,
          content: content || {},
          format: format || "json",
        };

        exportContent = Buffer.from(JSON.stringify(collectionsData, null, 2));
        contentType = "application/json";
        break;

      default:
        return new NextResponse(`Unsupported export type: ${exportType}`, {
          status: 400,
        });
    }

    // 7. Upload export to R2
    const client = R2Config.getS3Client();
    const r2Config = R2Config.getConfig();

    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const putCommand = new PutObjectCommand({
      Bucket: r2Config.bucketName,
      Key: pathInfo.key,
      Body: exportContent,
      ContentType: contentType,
      Metadata: {
        originalFilename: filename,
        exportType,
        userId,
      },
    });

    await client.send(putCommand);

    console.log(`[R2_USER_EXPORTS_POST] Created export for user ${userId}:`, {
      exportType,
      filename,
      key: pathInfo.key,
      size: exportContent.length,
      contentType,
    });

    // 8. Return response
    return NextResponse.json({
      success: true,
      export: {
        id: pathInfo.key,
        name: filename,
        url: pathInfo.publicUrl,
        key: pathInfo.key,
        size: exportContent.length,
        exportType,
        contentType,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("[R2_USER_EXPORTS_POST] Error:", error);
    return new NextResponse(`Internal Server Error: ${error.message}`, {
      status: 500,
    });
  }
}

// DELETE handler for deleting exports
export async function DELETE(req: Request) {
  try {
    // 1. Check Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // 2. Parse request body
    const body = await req.json();
    const { exportKeys, exportType, userId: targetUserId } = body;

    const userId = session.user.id;
    const effectiveUserId =
      targetUserId && session.user.role === UserRole.ADMIN
        ? targetUserId
        : userId;

    // 3. Authorization check
    if (
      targetUserId &&
      targetUserId !== userId &&
      session.user.role !== UserRole.ADMIN
    ) {
      return new NextResponse("Forbidden: Cannot delete other users' exports", {
        status: 403,
      });
    }

    // 4. Determine which files to delete
    let keysToDelete: string[] = [];

    if (exportKeys && Array.isArray(exportKeys)) {
      // Delete specific export files
      keysToDelete = exportKeys;
    } else if (exportType) {
      // Delete all exports of a specific type
      const typePrefix = UserFolderPaths.getExportTypePath(
        effectiveUserId,
        exportType
      );
      const result = await UserFolderService.listUserFilesPaginated(
        effectiveUserId,
        typePrefix,
        0,
        1000
      );
      keysToDelete = result.files.map((file: any) => file.key);
    } else {
      return new NextResponse("Must provide either exportKeys or exportType", {
        status: 400,
      });
    }

    if (keysToDelete.length === 0) {
      return NextResponse.json({
        success: true,
        deleted: 0,
        message: "No exports found to delete",
      });
    }

    // 5. Validate R2 configuration
    if (!R2Config.validateConfig()) {
      return new NextResponse(
        "Server configuration error: R2 settings missing",
        { status: 500 }
      );
    }

    // 6. Delete export files
    const deleteResults = await Promise.allSettled(
      keysToDelete.map(async (fileKey: string) => {
        const hasAccess = await UserFolderService.validateUserFileAccess(
          effectiveUserId,
          fileKey
        );
        if (!hasAccess) {
          throw new Error(`Access denied to export: ${fileKey}`);
        }

        return await UserFolderService.deleteUserFile(effectiveUserId, fileKey);
      })
    );

    // 7. Process results
    const successful = deleteResults.filter(
      (result) => result.status === "fulfilled" && result.value === true
    ).length;

    const failed = deleteResults.filter(
      (result) =>
        result.status === "rejected" ||
        (result.status === "fulfilled" && result.value === false)
    );

    const errors = failed.map((result) =>
      result.status === "rejected" ? result.reason.message : "Unknown error"
    );

    console.log(
      `[R2_USER_EXPORTS_DELETE] Deleted exports for user ${effectiveUserId}:`,
      {
        exportType,
        totalRequested: keysToDelete.length,
        successful,
        failed: failed.length,
        errors: errors.slice(0, 5),
      }
    );

    return NextResponse.json({
      success: true,
      deleted: successful,
      failed: failed.length,
      exportType,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("[R2_USER_EXPORTS_DELETE] Error:", error);
    return new NextResponse(`Internal Server Error: ${error.message}`, {
      status: 500,
    });
  }
}
