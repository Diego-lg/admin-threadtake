import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { R2Config } from "@/lib/r2-config";
import {
  R2UserStorage,
  UserFolderPaths,
  UserFileNaming,
  AssetType,
  ExportType,
  ProfilePictureType,
  MockupType,
} from "@/lib/r2-user-storage";
import { UserFolderService } from "@/services/user-folder-service";

/**
 * Content types supported for upload
 */
type ContentType =
  | "mockups"
  | "profile-pictures"
  | "assets"
  | "exports"
  | "designs";

/**
 * Request body interface for upload URL generation
 */
interface UploadUrlRequest {
  contentType: ContentType;
  filename: string;
  designId?: string; // For mockups
  assetType?: AssetType; // For assets
  exportType?: ExportType; // For exports
  profileType?: ProfilePictureType; // For profile pictures
  mockupType?: MockupType; // For mockups
}

/**
 * Response interface for upload URL generation
 */
interface UploadUrlResponse {
  presignedUrl: string;
  objectKey: string;
  publicUrl: string;
  expiresAt: string;
}

export async function POST(req: Request) {
  try {
    // 1. Authenticate the user
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

    // 3. Parse and validate request body
    const body: UploadUrlRequest = await req.json();
    console.log("[R2_GENERATE_UPLOAD_URL] Request body received:", body);

    const {
      contentType,
      filename,
      designId,
      assetType,
      exportType,
      profileType,
      mockupType,
    } = body;

    console.log("[R2_GENERATE_UPLOAD_URL] Parsed fields:", {
      contentType,
      filename,
      designId,
      assetType,
      exportType,
      profileType,
      mockupType,
    });

    if (!contentType || !filename) {
      console.log("[R2_GENERATE_UPLOAD_URL] Missing required fields:", {
        hasContentType: !!contentType,
        hasFilename: !!filename,
      });
      return new NextResponse(
        "Missing required fields: contentType and filename",
        { status: 400 }
      );
    }

    // Validate content type
    const validContentTypes: ContentType[] = [
      "mockups",
      "profile-pictures",
      "assets",
      "exports",
      "designs",
    ];
    if (!validContentTypes.includes(contentType)) {
      return new NextResponse(
        `Invalid contentType. Must be one of: ${validContentTypes.join(", ")}`,
        { status: 400 }
      );
    }

    // 4. Ensure user folder structure exists
    await UserFolderService.ensureUserFolderExists(userId);

    // 5. Generate appropriate path based on content type
    let pathInfo: { key: string; publicUrl: string };

    switch (contentType) {
      case "mockups":
        if (!designId || !mockupType) {
          return new NextResponse(
            "Missing required fields for mockups: designId and mockupType",
            { status: 400 }
          );
        }
        const fileExtension = filename.split(".").pop() || "png";
        pathInfo = await UserFolderService.getMockupPath(
          userId,
          designId,
          mockupType,
          fileExtension
        );
        break;

      case "profile-pictures":
        console.log("[R2_GENERATE_UPLOAD_URL] Processing profile picture:", {
          profileType,
          filename,
        });
        if (!profileType) {
          console.log(
            "[R2_GENERATE_UPLOAD_URL] Missing profileType for profile pictures"
          );
          return new NextResponse(
            "Missing required field for profile pictures: profileType",
            { status: 400 }
          );
        }
        const profileExtension = filename.split(".").pop() || "jpg";
        console.log("[R2_GENERATE_UPLOAD_URL] Getting profile picture path:", {
          userId,
          profileType,
          profileExtension,
        });
        pathInfo = await UserFolderService.getProfilePicturePath(
          userId,
          profileType,
          profileExtension
        );
        console.log(
          "[R2_GENERATE_UPLOAD_URL] Profile picture path generated:",
          pathInfo
        );
        break;

      case "assets":
        if (!assetType) {
          return new NextResponse(
            "Missing required field for assets: assetType",
            { status: 400 }
          );
        }
        const assetExtension = filename.split(".").pop() || "";
        pathInfo = await UserFolderService.getAssetPath(
          userId,
          assetType,
          designId,
          assetExtension
        );
        break;

      case "exports":
        if (!exportType) {
          return new NextResponse(
            "Missing required field for exports: exportType",
            { status: 400 }
          );
        }
        pathInfo = await UserFolderService.getExportPath(
          userId,
          exportType,
          filename
        );
        break;

      case "designs":
        // Legacy support for designs - map to user-specific structure
        const designExtension = filename.split(".").pop() || "png";
        const uniqueFilename = UserFileNaming.generateUniqueFilename(
          filename,
          "design"
        );
        const designKey = `${UserFolderPaths.getUserBasePath(
          userId
        )}/designs/${uniqueFilename}`;
        const config = R2Config.getConfig();
        pathInfo = {
          key: designKey,
          publicUrl: `${config.publicBucketUrl}/${designKey}`,
        };
        break;

      default:
        return new NextResponse("Unsupported content type", { status: 400 });
    }

    // 6. Generate presigned URL
    const client = R2Config.getS3Client();
    const r2Config = R2Config.getConfig();

    const command = new PutObjectCommand({
      Bucket: r2Config.bucketName,
      Key: pathInfo.key,
      ContentType: body.contentType || undefined,
    });

    const presignedUrl = await getSignedUrl(client, command, {
      expiresIn: 300, // 5 minutes
    });

    // 7. Calculate expiration time
    const expiresAt = new Date(Date.now() + 300 * 1000).toISOString();

    console.log(
      `[R2_GENERATE_UPLOAD_URL] Generated presigned URL for user ${userId}:`,
      {
        contentType,
        key: pathInfo.key,
        filename,
        expiresAt,
      }
    );

    // 8. Return response
    const response: UploadUrlResponse = {
      presignedUrl,
      objectKey: pathInfo.key,
      publicUrl: pathInfo.publicUrl,
      expiresAt,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[R2_GENERATE_UPLOAD_URL] Error:", error);
    return new NextResponse(`Internal Server Error: ${error.message}`, {
      status: 500,
    });
  }
}
