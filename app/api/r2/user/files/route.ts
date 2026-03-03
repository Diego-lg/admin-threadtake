import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { R2Config } from "@/lib/r2-config";
import { UserFolderService } from "@/services/user-folder-service";
import { UserFolderPaths } from "@/lib/r2-user-storage";

/**
 * Query parameters for user file listing
 */
interface UserFilesQuery {
  prefix?: string;
  contentType?: "mockups" | "profile-pictures" | "assets" | "exports";
  page?: string;
  pageSize?: string;
  sortBy?: "name" | "date" | "size";
  sortOrder?: "asc" | "desc";
  search?: string;
}

/**
 * Response interface for user file listing
 */
interface UserFilesResponse {
  files: Array<{
    key: string;
    url: string;
    name: string;
    size: number;
    lastModified: Date;
    contentType?: string;
    folder: string;
  }>;
  folders: Array<{
    name: string;
    prefix: string;
    fileCount: number;
  }>;
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    pageSize: number;
  };
  currentPrefix: string;
  userStats: {
    totalFiles: number;
    totalSize: number;
    folderExists: boolean;
  };
}

// GET handler for listing user files
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
        { status: 500 },
      );
    }

    // 3. Parse query parameters
    const { searchParams } = new URL(req.url);
    const query: UserFilesQuery = {
      prefix: searchParams.get("prefix") || undefined,
      contentType: (searchParams.get("contentType") as any) || undefined,
      page: searchParams.get("page") || "0",
      pageSize: searchParams.get("pageSize") || "50",
      sortBy: (searchParams.get("sortBy") as any) || "date",
      sortOrder: (searchParams.get("sortOrder") as any) || "desc",
      search: searchParams.get("search") || undefined,
    };

    const page = parseInt(query.page || "0");
    const pageSize = Math.min(parseInt(query.pageSize || "50"), 100); // Limit to 100 items per page
    const userId = session.user.id;

    // 4. Authorization check for accessing other users' files (admin only)
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
      return new NextResponse("Forbidden: Cannot access other users' files", {
        status: 403,
      });
    }

    // 5. Ensure user folder exists
    await UserFolderService.ensureUserFolderExists(effectiveUserId);

    // 6. Determine the prefix based on content type
    let effectivePrefix = query.prefix;
    if (query.contentType && !query.prefix) {
      switch (query.contentType) {
        case "mockups":
          effectivePrefix = UserFolderPaths.getMockupsPath(effectiveUserId);
          break;
        case "profile-pictures":
          effectivePrefix =
            UserFolderPaths.getProfilePicturesPath(effectiveUserId);
          break;
        case "assets":
          effectivePrefix = UserFolderPaths.getAssetsPath(effectiveUserId);
          break;
        case "exports":
          effectivePrefix = UserFolderPaths.getExportsPath(effectiveUserId);
          break;
        default:
          effectivePrefix = UserFolderPaths.getUserBasePath(effectiveUserId);
      }
    } else if (!effectivePrefix) {
      effectivePrefix = UserFolderPaths.getUserBasePath(effectiveUserId);
    }

    // 7. List files with pagination
    const result = await UserFolderService.listUserFilesPaginated(
      effectiveUserId,
      effectivePrefix,
      page,
      pageSize,
    );

    // 8. Get user folder metadata
    const userStats =
      await UserFolderService.getUserFolderMetadata(effectiveUserId);

    // 9. Format response
    const config = R2Config.getConfig();
    let files = result.files.map((file: any) => {
      const relativePath = file.key.replace(effectivePrefix, "");
      const pathParts = relativePath.split("/");
      const fileName = pathParts.pop() || relativePath;
      const folder = pathParts.join("/") || "root";

      return {
        key: file.key,
        url: `${config.publicBucketUrl}/${file.key}`,
        name: fileName,
        size: file.size,
        lastModified: file.lastModified,
        contentType: file.key.split(".").pop(),
        folder,
      };
    });

    // Apply search filter if provided
    if (query.search) {
      const searchTerm = query.search.toLowerCase();
      files = files.filter(
        (file) =>
          file.name.toLowerCase().includes(searchTerm) ||
          file.folder.toLowerCase().includes(searchTerm),
      );
    }

    // Apply sorting
    files.sort((a, b) => {
      let comparison = 0;

      switch (query.sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "size":
          comparison = a.size - b.size;
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

    // Extract folders from the file listing
    const folderMap = new Map<string, number>();
    files.forEach((file) => {
      if (file.folder !== "root") {
        folderMap.set(file.folder, (folderMap.get(file.folder) || 0) + 1);
      }
    });

    const folders = Array.from(folderMap.entries())
      .map(([name, fileCount]) => ({
        name,
        prefix: `${effectivePrefix}/${name}/`,
        fileCount,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Add standard user folders even if empty (these are created by default)
    const standardFolders = [
      "mockups",
      "profile-pictures",
      "assets",
      "exports",
    ];
    const existingFolderNames = new Set(folders.map((f) => f.name));

    standardFolders.forEach((folderName) => {
      if (!existingFolderNames.has(folderName)) {
        // Check if this standard folder exists in R2
        const standardPrefix = `${effectivePrefix}/${folderName}`;
        folders.push({
          name: folderName,
          prefix: `${standardPrefix}/`,
          fileCount: 0,
        });
      }
    });

    // Sort again to include new folders
    folders.sort((a, b) => a.name.localeCompare(b.name));

    const response: UserFilesResponse = {
      files,
      folders,
      pagination: {
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        totalCount: result.totalCount,
        pageSize,
      },
      currentPrefix: effectivePrefix,
      userStats: {
        totalFiles: userStats.totalFiles,
        totalSize: userStats.totalSize,
        folderExists: userStats.folderExists,
      },
    };

    console.log(
      `[R2_USER_FILES_GET] Listed files for user ${effectiveUserId}:`,
      {
        contentType: query.contentType,
        fileCount: files.length,
        folderCount: folders.length,
        page,
        pageSize,
        search: query.search,
      },
    );

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[R2_USER_FILES_GET] Error:", error);
    return new NextResponse(`Internal Server Error: ${error.message}`, {
      status: 500,
    });
  }
}

// DELETE handler for deleting user files
export async function DELETE(req: Request) {
  try {
    // 1. Check Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // 2. Parse request body
    const body = await req.json();
    const { fileKeys, userId: targetUserId } = body;

    if (!fileKeys || !Array.isArray(fileKeys) || fileKeys.length === 0) {
      return new NextResponse("Missing or invalid fileKeys array", {
        status: 400,
      });
    }

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
      return new NextResponse("Forbidden: Cannot delete other users' files", {
        status: 403,
      });
    }

    // 4. Validate R2 configuration
    if (!R2Config.validateConfig()) {
      return new NextResponse(
        "Server configuration error: R2 settings missing",
        { status: 500 },
      );
    }

    // 5. Delete files
    const deleteResults = await Promise.allSettled(
      fileKeys.map(async (fileKey: string) => {
        const hasAccess = await UserFolderService.validateUserFileAccess(
          effectiveUserId,
          fileKey,
        );
        if (!hasAccess) {
          throw new Error(`Access denied to file: ${fileKey}`);
        }

        return await UserFolderService.deleteUserFile(effectiveUserId, fileKey);
      }),
    );

    // 6. Process results
    const successful = deleteResults.filter(
      (result) => result.status === "fulfilled" && result.value === true,
    ).length;

    const failed = deleteResults.filter(
      (result) =>
        result.status === "rejected" ||
        (result.status === "fulfilled" && result.value === false),
    );

    const errors = failed.map((result) =>
      result.status === "rejected" ? result.reason.message : "Unknown error",
    );

    console.log(
      `[R2_USER_FILES_DELETE] Deleted files for user ${effectiveUserId}:`,
      {
        totalRequested: fileKeys.length,
        successful,
        failed: failed.length,
        errors: errors.slice(0, 5), // Log first 5 errors
      },
    );

    return NextResponse.json({
      success: true,
      deleted: successful,
      failed: failed.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("[R2_USER_FILES_DELETE] Error:", error);
    return new NextResponse(`Internal Server Error: ${error.message}`, {
      status: 500,
    });
  }
}
