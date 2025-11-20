import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { R2Config } from "@/lib/r2-config";
import { UserFolderService } from "@/services/user-folder-service";
import { UserFolderPaths, AssetType } from "@/lib/r2-user-storage";

/**
 * Query parameters for asset listing
 */
interface AssetsQuery {
  assetType?: AssetType;
  designId?: string;
  page?: string;
  pageSize?: string;
  sortBy?: "name" | "date" | "size" | "type";
  sortOrder?: "asc" | "desc";
  search?: string;
}

/**
 * Response interface for asset listing
 */
interface AssetsResponse {
  assets: Array<{
    id: string;
    name: string;
    url: string;
    key: string;
    size: number;
    lastModified: Date;
    assetType: AssetType;
    designId?: string;
    contentType: string;
  }>;
  assetTypes: Array<{
    type: AssetType;
    count: number;
    totalSize: number;
  }>;
  designs: Array<{
    id: string;
    assetCount: number;
    totalSize: number;
  }>;
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    pageSize: number;
  };
  stats: {
    totalAssets: number;
    totalSize: number;
    totalTypes: number;
  };
}

// GET handler for listing user assets
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
    const query: AssetsQuery = {
      assetType: (searchParams.get("assetType") as AssetType) || undefined,
      designId: searchParams.get("designId") || undefined,
      page: searchParams.get("page") || "0",
      pageSize: searchParams.get("pageSize") || "50",
      sortBy: (searchParams.get("sortBy") as any) || "date",
      sortOrder: (searchParams.get("sortOrder") as any) || "desc",
      search: searchParams.get("search") || undefined,
    };

    const page = parseInt(query.page || "0");
    const pageSize = Math.min(parseInt(query.pageSize || "50"), 100);
    const userId = session.user.id;

    // 4. Authorization check for accessing other users' assets (admin only)
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
      return new NextResponse("Forbidden: Cannot access other users' assets", {
        status: 403,
      });
    }

    // 5. Ensure user folder exists
    await UserFolderService.ensureUserFolderExists(effectiveUserId);

    // 6. Determine the prefix for assets
    let effectivePrefix = UserFolderPaths.getAssetsPath(effectiveUserId);

    if (query.assetType) {
      effectivePrefix = UserFolderPaths.getAssetTypePath(
        effectiveUserId,
        query.assetType
      );
    }

    // 7. List asset files
    const result = await UserFolderService.listUserFilesPaginated(
      effectiveUserId,
      effectivePrefix,
      page,
      pageSize
    );

    // 8. Format asset response
    const config = R2Config.getConfig();
    let assets = result.files.map((file: any) => {
      const relativePath = file.key.replace(
        UserFolderPaths.getAssetsPath(effectiveUserId) + "/",
        ""
      );
      const pathParts = relativePath.split("/");

      // Extract asset type and design ID from path
      const assetType = pathParts[0] as AssetType;
      const designId =
        pathParts.length > 2 && pathParts[1] !== "temp"
          ? pathParts[1]
          : undefined;
      const fileName = pathParts.pop() || relativePath;
      const contentType = fileName.split(".").pop() || "unknown";

      return {
        id: file.key,
        name: fileName,
        url: `${config.publicBucketUrl}/${file.key}`,
        key: file.key,
        size: file.size,
        lastModified: file.lastModified,
        assetType,
        designId,
        contentType,
      };
    });

    // 9. Apply filters
    if (query.designId) {
      assets = assets.filter((asset) => asset.designId === query.designId);
    }

    if (query.search) {
      const searchTerm = query.search.toLowerCase();
      assets = assets.filter(
        (asset) =>
          asset.name.toLowerCase().includes(searchTerm) ||
          asset.assetType.toLowerCase().includes(searchTerm) ||
          (asset.designId && asset.designId.toLowerCase().includes(searchTerm))
      );
    }

    // 10. Apply sorting
    assets.sort((a, b) => {
      let comparison = 0;

      switch (query.sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "size":
          comparison = a.size - b.size;
          break;
        case "type":
          comparison = a.assetType.localeCompare(b.assetType);
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

    // 11. Get asset type statistics
    const assetTypes: AssetType[] = ["logos", "patterns", "uploads"];
    const assetTypeStats = await Promise.all(
      assetTypes.map(async (type) => {
        const typePrefix = UserFolderPaths.getAssetTypePath(
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

    // 12. Get design statistics (assets grouped by design)
    const designIds = [
      ...new Set(assets.filter((a) => a.designId).map((a) => a.designId)),
    ];
    const designStats = await Promise.all(
      designIds.map(async (designId) => {
        const designAssets = assets.filter((a) => a.designId === designId);
        return {
          id: designId,
          assetCount: designAssets.length,
          totalSize: designAssets.reduce((sum, a) => sum + a.size, 0),
        };
      })
    );

    // 13. Calculate overall statistics
    const totalAssets = assets.length;
    const totalSize = assets.reduce((sum, a) => sum + a.size, 0);

    const response: AssetsResponse = {
      assets,
      assetTypes: assetTypeStats,
      designs: designStats,
      pagination: {
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        totalCount: assets.length,
        pageSize,
      },
      stats: {
        totalAssets,
        totalSize,
        totalTypes: assetTypeStats.filter((t) => t.count > 0).length,
      },
    };

    console.log(
      `[R2_USER_ASSETS_GET] Listed assets for user ${effectiveUserId}:`,
      {
        assetType: query.assetType,
        designId: query.designId,
        assetCount: assets.length,
        typeCount: assetTypeStats.length,
        page,
        pageSize,
      }
    );

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[R2_USER_ASSETS_GET] Error:", error);
    return new NextResponse(`Internal Server Error: ${error.message}`, {
      status: 500,
    });
  }
}

// POST handler for organizing/moving assets
export async function POST(req: Request) {
  try {
    // 1. Check Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // 2. Parse request body
    const body = await req.json();
    const { operation, assetKeys, targetAssetType, targetDesignId } = body;

    if (!operation || !assetKeys || !Array.isArray(assetKeys)) {
      return new NextResponse("Missing required fields: operation, assetKeys", {
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

    // 5. Process different operations
    let results: any[] = [];

    switch (operation) {
      case "moveToType":
        if (!targetAssetType) {
          return new NextResponse(
            "Missing targetAssetType for moveToType operation",
            {
              status: 400,
            }
          );
        }

        results = await Promise.allSettled(
          assetKeys.map(async (assetKey: string) => {
            // Validate access
            const hasAccess = await UserFolderService.validateUserFileAccess(
              userId,
              assetKey
            );
            if (!hasAccess) {
              throw new Error(`Access denied to asset: ${assetKey}`);
            }

            // Extract filename
            const fileName = assetKey.split("/").pop();
            if (!fileName) {
              throw new Error(`Invalid asset key: ${assetKey}`);
            }

            // Generate new path
            const newPath = await UserFolderService.getAssetPath(
              userId,
              targetAssetType,
              undefined,
              fileName.split(".").pop() || ""
            );

            // In a real implementation, you would copy/move the file here
            // For now, we'll just return the new path information
            return {
              originalKey: assetKey,
              newKey: newPath.key,
              newUrl: newPath.publicUrl,
            };
          })
        );
        break;

      case "moveToDesign":
        if (!targetAssetType || !targetDesignId) {
          return new NextResponse(
            "Missing targetAssetType or targetDesignId for moveToDesign operation",
            {
              status: 400,
            }
          );
        }

        results = await Promise.allSettled(
          assetKeys.map(async (assetKey: string) => {
            // Validate access
            const hasAccess = await UserFolderService.validateUserFileAccess(
              userId,
              assetKey
            );
            if (!hasAccess) {
              throw new Error(`Access denied to asset: ${assetKey}`);
            }

            // Extract filename
            const fileName = assetKey.split("/").pop();
            if (!fileName) {
              throw new Error(`Invalid asset key: ${assetKey}`);
            }

            // Generate new path for design-specific asset
            const newPath = await UserFolderService.getAssetPath(
              userId,
              targetAssetType,
              targetDesignId,
              fileName.split(".").pop() || ""
            );

            // In a real implementation, you would copy/move the file here
            return {
              originalKey: assetKey,
              newKey: newPath.key,
              newUrl: newPath.publicUrl,
              designId: targetDesignId,
            };
          })
        );
        break;

      default:
        return new NextResponse(`Unsupported operation: ${operation}`, {
          status: 400,
        });
    }

    // 6. Process results
    const successful = results.filter(
      (result) => result.status === "fulfilled"
    ).length;
    const failed = results.filter(
      (result) => result.status === "rejected"
    ).length;
    const errors = results
      .filter((result) => result.status === "rejected")
      .map((result) => (result as any).reason.message);

    console.log(
      `[R2_USER_ASSETS_POST] Processed ${operation} for user ${userId}:`,
      {
        totalRequested: assetKeys.length,
        successful,
        failed,
        targetAssetType,
        targetDesignId,
      }
    );

    return NextResponse.json({
      success: true,
      operation,
      processed: successful,
      failed,
      results: results.map((r) =>
        r.status === "fulfilled" ? r.value : r.reason
      ),
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("[R2_USER_ASSETS_POST] Error:", error);
    return new NextResponse(`Internal Server Error: ${error.message}`, {
      status: 500,
    });
  }
}

// DELETE handler for deleting assets
export async function DELETE(req: Request) {
  try {
    // 1. Check Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // 2. Parse request body
    const body = await req.json();
    const { assetKeys, assetType, userId: targetUserId } = body;

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
      return new NextResponse("Forbidden: Cannot delete other users' assets", {
        status: 403,
      });
    }

    // 4. Determine which files to delete
    let keysToDelete: string[] = [];

    if (assetKeys && Array.isArray(assetKeys)) {
      // Delete specific asset files
      keysToDelete = assetKeys;
    } else if (assetType) {
      // Delete all assets of a specific type
      const typePrefix = UserFolderPaths.getAssetTypePath(
        effectiveUserId,
        assetType
      );
      const result = await UserFolderService.listUserFilesPaginated(
        effectiveUserId,
        typePrefix,
        0,
        1000
      );
      keysToDelete = result.files.map((file: any) => file.key);
    } else {
      return new NextResponse("Must provide either assetKeys or assetType", {
        status: 400,
      });
    }

    if (keysToDelete.length === 0) {
      return NextResponse.json({
        success: true,
        deleted: 0,
        message: "No assets found to delete",
      });
    }

    // 5. Validate R2 configuration
    if (!R2Config.validateConfig()) {
      return new NextResponse(
        "Server configuration error: R2 settings missing",
        { status: 500 }
      );
    }

    // 6. Delete asset files
    const deleteResults = await Promise.allSettled(
      keysToDelete.map(async (fileKey: string) => {
        const hasAccess = await UserFolderService.validateUserFileAccess(
          effectiveUserId,
          fileKey
        );
        if (!hasAccess) {
          throw new Error(`Access denied to asset: ${fileKey}`);
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
      `[R2_USER_ASSETS_DELETE] Deleted assets for user ${effectiveUserId}:`,
      {
        assetType,
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
      assetType,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("[R2_USER_ASSETS_DELETE] Error:", error);
    return new NextResponse(`Internal Server Error: ${error.message}`, {
      status: 500,
    });
  }
}
