import { NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { randomUUID } from "crypto";
import { getServerSession } from "next-auth/next";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { R2Config } from "@/lib/r2-config";
import {
  R2UserStorage,
  UserFolderPaths,
  UserFolderService,
  AssetType,
  ExportType,
} from "@/lib/r2-user-storage";

/**
 * Query parameters for listing files
 */
interface ListFilesQuery {
  prefix?: string;
  contentType?: "mockups" | "profile-pictures" | "assets" | "exports";
  page?: string;
  pageSize?: string;
  userId?: string; // For admin access to other users' files
}

/**
 * Response interface for file listing
 */
interface FilesListResponse {
  files: Array<{
    key: string;
    url: string;
    lastModified: Date;
    size: number;
    contentType?: string;
  }>;
  folders: Array<{
    name: string;
    prefix: string;
  }>;
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    pageSize: number;
  };
  currentPrefix: string;
}

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
    const query: ListFilesQuery = {
      prefix: searchParams.get("prefix") || undefined,
      contentType: (searchParams.get("contentType") as any) || undefined,
      page: searchParams.get("page") || "0",
      pageSize: searchParams.get("pageSize") || "50",
      userId: searchParams.get("userId") || undefined,
    };

    const page = parseInt(query.page || "0");
    const pageSize = parseInt(query.pageSize || "50");
    const currentUserId = session.user.id;
    const targetUserId = query.userId || currentUserId;

    // 4. Authorization check
    // Users can only access their own files unless they are admins
    if (
      targetUserId !== currentUserId &&
      session.user.role !== UserRole.ADMIN
    ) {
      return new NextResponse("Forbidden: Cannot access other users' files", {
        status: 403,
      });
    }

    // 5. Ensure user folder exists
    await UserFolderService.ensureUserFolderExists(targetUserId);

    // 6. Determine the prefix based on content type
    let effectivePrefix = query.prefix;
    if (query.contentType && !query.prefix) {
      switch (query.contentType) {
        case "mockups":
          effectivePrefix = UserFolderPaths.getMockupsPath(targetUserId);
          break;
        case "profile-pictures":
          effectivePrefix =
            UserFolderPaths.getProfilePicturesPath(targetUserId);
          break;
        case "assets":
          effectivePrefix = UserFolderPaths.getAssetsPath(targetUserId);
          break;
        case "exports":
          effectivePrefix = UserFolderPaths.getExportsPath(targetUserId);
          break;
        default:
          effectivePrefix = UserFolderPaths.getUserBasePath(targetUserId);
      }
    } else if (!effectivePrefix) {
      effectivePrefix = UserFolderPaths.getUserBasePath(targetUserId);
    }

    // 7. List files with pagination
    const result = await UserFolderService.listUserFilesPaginated(
      targetUserId,
      effectivePrefix,
      page,
      pageSize
    );

    // 8. Format response
    const config = R2Config.getConfig();
    const files = result.files.map((file: any) => ({
      key: file.key,
      url: `${config.publicBucketUrl}/${file.key}`,
      lastModified: file.lastModified,
      size: file.size,
      contentType: file.key.split(".").pop(), // Simple content type detection
    }));

    // Extract folders from the file listing
    const foldersSet = new Set<string>();
    result.files.forEach((file: any) => {
      const relativePath = file.key.replace(effectivePrefix, "");
      const pathParts = relativePath.split("/");
      if (pathParts.length > 1) {
        foldersSet.add(pathParts[0]);
      }
    });

    const folders = Array.from(foldersSet)
      .map((folderName) => ({
        name: folderName,
        prefix: `${effectivePrefix}/${folderName}/`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const response: FilesListResponse = {
      files,
      folders,
      pagination: {
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        totalCount: result.totalCount,
        pageSize,
      },
      currentPrefix: effectivePrefix,
    };

    console.log(`[R2_IMAGES_GET] Listed files for user ${targetUserId}:`, {
      contentType: query.contentType,
      fileCount: files.length,
      folderCount: folders.length,
      page,
      pageSize,
    });

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[R2_IMAGES_GET] Error:", error);
    return new NextResponse(`Internal Server Error: ${error.message}`, {
      status: 500,
    });
  }
}

// POST handler for uploading images
export async function POST(req: Request) {
  try {
    // 1. Check Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const userId = session.user.id;

    // 2. Validate R2 configuration
    if (!R2Config.validateConfig()) {
      return new NextResponse(
        "Server configuration error: R2 settings missing",
        { status: 500 }
      );
    }

    // 3. Parse FormData
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const contentType = (formData.get("contentType") as string) || "assets";
    const assetType = (formData.get("assetType") as AssetType) || "uploads";

    if (!file) {
      return new NextResponse("No file provided", { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return new NextResponse("Invalid file type. Only images are allowed", {
        status: 400,
      });
    }

    // 4. Ensure user folder exists
    await UserFolderService.ensureUserFolderExists(userId);

    // 5. Generate path based on content type
    let pathInfo: { key: string; publicUrl: string };
    const fileExtension = file.name.split(".").pop() || "";

    switch (contentType) {
      case "assets":
        pathInfo = await UserFolderService.getAssetPath(
          userId,
          assetType,
          undefined,
          fileExtension
        );
        break;
      case "mockups":
        // For mockups, we need additional parameters
        const designId = formData.get("designId") as string;
        const mockupType = formData.get("mockupType") as any;
        if (!designId || !mockupType) {
          return new NextResponse(
            "Missing required parameters for mockups: designId and mockupType",
            { status: 400 }
          );
        }
        pathInfo = await UserFolderService.getMockupPath(
          userId,
          designId,
          mockupType,
          fileExtension
        );
        break;
      case "profile-pictures":
        const profileType = (formData.get("profileType") as any) || "current";
        pathInfo = await UserFolderService.getProfilePicturePath(
          userId,
          profileType,
          fileExtension
        );
        break;
      case "exports":
        const exportType =
          (formData.get("exportType") as ExportType) || "designs";
        pathInfo = await UserFolderService.getExportPath(
          userId,
          exportType,
          file.name
        );
        break;
      default:
        // Default to assets/uploads
        pathInfo = await UserFolderService.getAssetPath(
          userId,
          "uploads",
          undefined,
          fileExtension
        );
    }

    // 6. Upload to R2
    const client = R2Config.getS3Client();
    const r2Config = R2Config.getConfig();

    const upload = new Upload({
      client,
      params: {
        Bucket: r2Config.bucketName,
        Key: pathInfo.key,
        Body: file.stream(),
        ContentType: file.type,
      },
    });

    await upload.done();

    // 7. Return the URL
    console.log(`[R2_IMAGES_POST] Uploaded file for user ${userId}:`, {
      contentType,
      key: pathInfo.key,
      size: file.size,
      type: file.type,
    });

    return NextResponse.json({
      url: pathInfo.publicUrl,
      key: pathInfo.key,
      contentType,
      size: file.size,
    });
  } catch (error: any) {
    console.error("[R2_IMAGES_POST] Error:", error);
    return new NextResponse(`Internal Server Error: ${error.message}`, {
      status: 500,
    });
  }
}
