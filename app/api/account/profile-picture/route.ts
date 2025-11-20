import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prismadb from "@/lib/prismadb";
import { R2Config } from "@/lib/r2-config";
import {
  UserFolderPaths,
  ProfilePictureType,
  R2UserStorage,
} from "@/lib/r2-user-storage";
import { UserFolderService } from "@/services/user-folder-service";

const SIGNED_URL_EXPIRES_IN = 60 * 5; // 5 minutes for upload URL

// Helper function to add CORS headers (reuse from profile route)
function addCorsHeaders(response: NextResponse) {
  response.headers.set(
    "Access-Control-Allow-Origin",
    process.env.FRONTEND_STORE_URL || "*"
  );
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  response.headers.set("Access-Control-Allow-Credentials", "true");
  return response;
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  return addCorsHeaders(response);
}

// Handle POST request to upload profile picture
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return addCorsHeaders(
        new NextResponse("Unauthenticated", { status: 401 })
      );
    }

    const userId = session.user.id;

    // Validate R2 configuration
    if (!R2Config.validateConfig()) {
      return addCorsHeaders(
        new NextResponse("Server configuration error: R2 settings missing", {
          status: 500,
        })
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const profileType =
      (formData.get("profileType") as ProfilePictureType) || "current";

    if (!file) {
      return addCorsHeaders(
        new NextResponse("No file uploaded", { status: 400 })
      );
    }

    // Basic validation
    if (!file.type.startsWith("image/")) {
      return addCorsHeaders(
        new NextResponse("Invalid file type, please upload an image.", {
          status: 400,
        })
      );
    }

    // Ensure user folder structure exists
    await UserFolderService.ensureUserFolderExists(userId);

    // Fetch current user to get the old image URL
    const currentUser = await prismadb.user.findUnique({
      where: { id: userId },
      select: { image: true },
    });
    const oldImageUrl = currentUser?.image;

    // Generate path for the new profile picture
    const fileExtension = file.name.split(".").pop() || "jpg";
    const pathInfo = await UserFolderService.getProfilePicturePath(
      userId,
      profileType,
      fileExtension
    );

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to R2 using the new user-centric structure
    const client = R2Config.getS3Client();
    const r2Config = R2Config.getConfig();

    // Generate presigned URL for upload
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

    const putCommand = new PutObjectCommand({
      Bucket: r2Config.bucketName,
      Key: pathInfo.key,
      ContentType: file.type,
    });

    const signedUrl = await getSignedUrl(client, putCommand, {
      expiresIn: SIGNED_URL_EXPIRES_IN,
    });

    // Upload the file buffer to the signed URL
    const uploadResponse = await fetch(signedUrl, {
      method: "PUT",
      body: buffer,
      headers: {
        "Content-Type": file.type,
      },
    });

    if (!uploadResponse.ok) {
      let r2Error = "Upload failed";
      try {
        const errorText = await uploadResponse.text();
        console.error("R2 Upload Error Response:", errorText);
        r2Error = `Failed to upload profile picture to R2: ${
          uploadResponse.statusText
        } - ${errorText.substring(0, 100)}`;
      } catch (error) {
        r2Error = `Failed to upload profile picture to R2: ${uploadResponse.statusText}`;
      }
      throw new Error(r2Error);
    }

    console.log(
      `[PROFILE_PICTURE_POST] Successfully uploaded profile picture for user ${userId}:`,
      {
        key: pathInfo.key,
        url: pathInfo.publicUrl,
        profileType,
        size: file.size,
      }
    );

    // If this is a "current" profile picture, update the user record
    let updatedUser = null;
    if (profileType === "current") {
      updatedUser = await prismadb.user.update({
        where: { id: userId },
        data: {
          image: pathInfo.publicUrl,
        },
        select: { name: true, email: true, image: true, role: true },
      });
    }

    // TODO: Implement old image deletion using the new folder structure
    // This would involve extracting the key from the old URL and using UserFolderService.deleteUserFile

    // Return response
    const responseData = {
      success: true,
      profileType,
      imageUrl: pathInfo.publicUrl,
      imageKey: pathInfo.key,
      user: updatedUser
        ? {
            name: updatedUser.name,
            email: updatedUser.email,
            image: updatedUser.image,
            role: updatedUser.role,
          }
        : null,
    };

    const response = NextResponse.json(responseData);
    return addCorsHeaders(response);
  } catch (error: any) {
    console.error("[PROFILE_PICTURE_POST] Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    const statusCode =
      errorMessage.includes("R2") || errorMessage.includes("Failed to upload")
        ? 500
        : 400;

    return addCorsHeaders(
      new NextResponse(errorMessage, { status: statusCode })
    );
  }
}

// Handle GET request to retrieve profile picture history
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return addCorsHeaders(
        new NextResponse("Unauthenticated", { status: 401 })
      );
    }

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const profileType =
      (searchParams.get("profileType") as ProfilePictureType) || "current";

    // Validate R2 configuration
    if (!R2Config.validateConfig()) {
      return addCorsHeaders(
        new NextResponse("Server configuration error: R2 settings missing", {
          status: 500,
        })
      );
    }

    // Ensure user folder exists
    await UserFolderService.ensureUserFolderExists(userId);

    // List profile pictures based on type
    const prefix =
      profileType === "current"
        ? `${UserFolderPaths.getProfilePicturesPath(userId)}/`
        : `${UserFolderPaths.getProfilePictureHistoryPath(userId)}/`;

    const result = await UserFolderService.listUserFilesPaginated(
      userId,
      prefix,
      0,
      20 // Limit to 20 most recent profile pictures
    );

    const config = R2Config.getConfig();
    const profilePictures = result.files.map((file: any) => ({
      key: file.key,
      url: `${config.publicBucketUrl}/${file.key}`,
      lastModified: file.lastModified,
      size: file.size,
    }));

    const response = NextResponse.json({
      profileType,
      profilePictures,
      totalCount: result.totalCount,
    });

    return addCorsHeaders(response);
  } catch (error: any) {
    console.error("[PROFILE_PICTURE_GET] Error:", error);
    return addCorsHeaders(
      new NextResponse(`Internal Server Error: ${error.message}`, {
        status: 500,
      })
    );
  }
}

// Handle DELETE request to delete profile pictures
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return addCorsHeaders(
        new NextResponse("Unauthenticated", { status: 401 })
      );
    }

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const imageKey = searchParams.get("imageKey");

    if (!imageKey) {
      return addCorsHeaders(
        new NextResponse("Missing imageKey parameter", { status: 400 })
      );
    }

    // Validate user has access to delete this file
    const hasAccess = await UserFolderService.validateUserFileAccess(
      userId,
      imageKey
    );
    if (!hasAccess) {
      return addCorsHeaders(
        new NextResponse("Forbidden: Cannot access this file", { status: 403 })
      );
    }

    // Delete the file
    const deleted = await UserFolderService.deleteUserFile(userId, imageKey);

    if (!deleted) {
      return addCorsHeaders(
        new NextResponse("Failed to delete profile picture", { status: 500 })
      );
    }

    // If this was the current profile picture, update user record
    const currentUser = await prismadb.user.findUnique({
      where: { id: userId },
      select: { image: true },
    });

    const config = R2Config.getConfig();
    const currentImageUrl = `${config.publicBucketUrl}/${imageKey}`;

    if (currentUser?.image === currentImageUrl) {
      await prismadb.user.update({
        where: { id: userId },
        data: { image: null },
      });
    }

    console.log(
      `[PROFILE_PICTURE_DELETE] Deleted profile picture for user ${userId}:`,
      { imageKey }
    );

    const response = NextResponse.json({
      success: true,
      message: "Profile picture deleted successfully",
    });

    return addCorsHeaders(response);
  } catch (error: any) {
    console.error("[PROFILE_PICTURE_DELETE] Error:", error);
    return addCorsHeaders(
      new NextResponse(`Internal Server Error: ${error.message}`, {
        status: 500,
      })
    );
  }
}
