import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { R2Config } from "@/lib/r2-config";
import { UserFolderService } from "@/services/user-folder-service";
import { UserFolderPaths, MockupType } from "@/lib/r2-user-storage";
import prismadb from "@/lib/prismadb";

/**
 * Query parameters for mockup listing
 */
interface MockupsQuery {
  designId?: string;
  mockupType?: MockupType;
  page?: string;
  pageSize?: string;
  sortBy?: "date" | "design" | "type";
  sortOrder?: "asc" | "desc";
}

/**
 * Response interface for mockup listing
 */
interface MockupsResponse {
  mockups: Array<{
    id: string;
    designId: string;
    mockupType: MockupType;
    url: string;
    key: string;
    size: number;
    lastModified: Date;
    design?: {
      id: string;
      description?: string;
      createdAt: Date;
    };
  }>;
  designs: Array<{
    id: string;
    description?: string;
    mockupCount: number;
    createdAt: Date;
    lastModified: Date;
  }>;
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    pageSize: number;
  };
  stats: {
    totalMockups: number;
    totalDesigns: number;
    totalSize: number;
  };
}

// GET handler for listing user mockups
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
    const query: MockupsQuery = {
      designId: searchParams.get("designId") || undefined,
      mockupType: (searchParams.get("mockupType") as MockupType) || undefined,
      page: searchParams.get("page") || "0",
      pageSize: searchParams.get("pageSize") || "50",
      sortBy: (searchParams.get("sortBy") as any) || "date",
      sortOrder: (searchParams.get("sortOrder") as any) || "desc",
    };

    const page = parseInt(query.page || "0");
    const pageSize = Math.min(parseInt(query.pageSize || "50"), 100);
    const userId = session.user.id;

    // 4. Authorization check for accessing other users' mockups (admin only)
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
      return new NextResponse("Forbidden: Cannot access other users' mockups", {
        status: 403,
      });
    }

    // 5. Ensure user folder exists
    await UserFolderService.ensureUserFolderExists(effectiveUserId);

    // 6. Determine the prefix for mockups
    let effectivePrefix = UserFolderPaths.getMockupsPath(effectiveUserId);

    if (query.designId) {
      effectivePrefix = UserFolderPaths.getDesignMockupPath(
        effectiveUserId,
        query.designId
      );
    }

    if (query.mockupType && query.designId) {
      effectivePrefix = UserFolderPaths.getMockupTypePath(
        effectiveUserId,
        query.designId,
        query.mockupType
      );
    }

    // 7. List mockup files
    const result = await UserFolderService.listUserFilesPaginated(
      effectiveUserId,
      effectivePrefix,
      page,
      pageSize
    );

    // 8. Format mockup response
    const config = R2Config.getConfig();
    const mockups = result.files.map((file: any) => {
      const pathParts = file.key.split("/");
      const mockupType = pathParts[pathParts.length - 2] as MockupType;
      const designId = pathParts[pathParts.length - 3];

      return {
        id: file.key,
        designId,
        mockupType,
        url: `${config.publicBucketUrl}/${file.key}`,
        key: file.key,
        size: file.size,
        lastModified: file.lastModified,
      };
    });

    // 9. Get associated design information
    const designIds = [...new Set(mockups.map((m) => m.designId))];
    const designs = await prismadb.savedDesign.findMany({
      where: {
        id: { in: designIds },
        userId: effectiveUserId,
      },
      select: {
        id: true,
        description: true,
        createdAt: true,
      },
    });

    const designMap = new Map(designs.map((d) => [d.id, d]));

    // 10. Attach design information to mockups
    const mockupsWithDesign = mockups.map((mockup) => ({
      ...mockup,
      design: designMap.get(mockup.designId),
    }));

    // 11. Apply sorting
    mockupsWithDesign.sort((a, b) => {
      let comparison = 0;

      switch (query.sortBy) {
        case "design":
          comparison = (a.design?.description || "").localeCompare(
            b.design?.description || ""
          );
          break;
        case "type":
          comparison = a.mockupType.localeCompare(b.mockupType);
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

    // 12. Get design summary information
    const designSummary = await Promise.all(
      designIds.map(async (designId) => {
        const designPrefix = UserFolderPaths.getDesignMockupPath(
          effectiveUserId,
          designId
        );
        const designResult = await UserFolderService.listUserFilesPaginated(
          effectiveUserId,
          designPrefix,
          0,
          1000 // Get all mockups for this design
        );

        const design = designMap.get(designId);
        const lastModified =
          designResult.files.length > 0
            ? new Date(
                Math.max(
                  ...designResult.files.map((f: any) =>
                    new Date(f.lastModified).getTime()
                  )
                )
              )
            : design?.createdAt || new Date();

        return {
          id: designId,
          description: design?.description || undefined,
          mockupCount: designResult.files.length,
          createdAt: design?.createdAt || new Date(),
          lastModified,
        };
      })
    );

    // 13. Calculate statistics
    const totalMockups = mockupsWithDesign.length;
    const totalSize = mockupsWithDesign.reduce((sum, m) => sum + m.size, 0);
    const totalDesigns = designIds.length;

    const response: MockupsResponse = {
      mockups: mockupsWithDesign as any,
      designs: designSummary as any,
      pagination: {
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        totalCount: result.totalCount,
        pageSize,
      },
      stats: {
        totalMockups,
        totalDesigns,
        totalSize,
      },
    };

    console.log(
      `[R2_USER_MOCKUPS_GET] Listed mockups for user ${effectiveUserId}:`,
      {
        designId: query.designId,
        mockupType: query.mockupType,
        mockupCount: mockupsWithDesign.length,
        designCount: designIds.length,
        page,
        pageSize,
      }
    );

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[R2_USER_MOCKUPS_GET] Error:", error);
    return new NextResponse(`Internal Server Error: ${error.message}`, {
      status: 500,
    });
  }
}

// DELETE handler for deleting mockups
export async function DELETE(req: Request) {
  try {
    // 1. Check Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // 2. Parse request body
    const body = await req.json();
    const { mockupKeys, designId, userId: targetUserId } = body;

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
      return new NextResponse("Forbidden: Cannot delete other users' mockups", {
        status: 403,
      });
    }

    // 4. Validate R2 configuration
    if (!R2Config.validateConfig()) {
      return new NextResponse(
        "Server configuration error: R2 settings missing",
        { status: 500 }
      );
    }

    // 5. Determine which files to delete
    let keysToDelete: string[] = [];

    if (mockupKeys && Array.isArray(mockupKeys)) {
      // Delete specific mockup files
      keysToDelete = mockupKeys;
    } else if (designId) {
      // Delete all mockups for a specific design
      const designPrefix = UserFolderPaths.getDesignMockupPath(
        effectiveUserId,
        designId
      );
      const result = await UserFolderService.listUserFilesPaginated(
        effectiveUserId,
        designPrefix,
        0,
        1000
      );
      keysToDelete = result.files.map((file: any) => file.key);
    } else {
      return new NextResponse("Must provide either mockupKeys or designId", {
        status: 400,
      });
    }

    if (keysToDelete.length === 0) {
      return NextResponse.json({
        success: true,
        deleted: 0,
        message: "No mockups found to delete",
      });
    }

    // 6. Delete mockup files
    const deleteResults = await Promise.allSettled(
      keysToDelete.map(async (fileKey: string) => {
        const hasAccess = await UserFolderService.validateUserFileAccess(
          effectiveUserId,
          fileKey
        );
        if (!hasAccess) {
          throw new Error(`Access denied to mockup: ${fileKey}`);
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

    // 8. If all mockups for a design were deleted, optionally clean up the design
    if (designId && successful === keysToDelete.length) {
      try {
        // Check if design has any other references before considering cleanup
        const design = await prismadb.savedDesign.findUnique({
          where: { id: designId },
          select: { id: true },
        });

        if (design) {
          console.log(
            `[R2_USER_MOCKUPS_DELETE] Design ${designId} still exists in database, keeping record`
          );
        }
      } catch (error) {
        console.error(
          `[R2_USER_MOCKUPS_DELETE] Error checking design ${designId}:`,
          error
        );
      }
    }

    console.log(
      `[R2_USER_MOCKUPS_DELETE] Deleted mockups for user ${effectiveUserId}:`,
      {
        designId,
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
      designId,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("[R2_USER_MOCKUPS_DELETE] Error:", error);
    return new NextResponse(`Internal Server Error: ${error.message}`, {
      status: 500,
    });
  }
}
