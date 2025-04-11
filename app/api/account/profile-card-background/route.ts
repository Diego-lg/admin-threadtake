import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth"; // Updated import path
import prismadb from "@/lib/prismadb";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3"; // Added DeleteObjectCommand
import { v4 as uuidv4 } from "uuid"; // For generating unique filenames

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

// POST /api/account/profile-card-background - Upload background image
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return addCorsHeaders(
        new NextResponse("Unauthenticated", { status: 401 })
      );
    }
    const userId = session.user.id;

    // --- R2/S3 Client Setup ---
    const accountId = process.env.R2_ENDPOINT?.split(".")[0]?.replace(
      "https://",
      ""
    );
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME;
    const publicBucketUrl = process.env.R2_PUBLIC_BUCKET_URL;

    if (
      !accountId ||
      !accessKeyId ||
      !secretAccessKey ||
      !bucketName ||
      !publicBucketUrl
    ) {
      console.error("R2 environment variables missing for background upload.");
      return addCorsHeaders(
        new NextResponse("Server configuration error for file upload", {
          status: 500,
        })
      );
    }

    const s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });

    // --- File Handling ---
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return addCorsHeaders(
        new NextResponse("No file provided", { status: 400 })
      );
    }

    if (!file.type.startsWith("image/")) {
      return addCorsHeaders(
        new NextResponse("Invalid file type, please upload an image.", {
          status: 400,
        })
      );
    }

    // Generate unique filename
    const fileExtension = file.name.split(".").pop();
    const uniqueFilename = `${uuidv4()}.${fileExtension}`;
    const objectKey = `user-content/${userId}/profile-card-background/${uniqueFilename}`; // Store in user-specific folder

    // --- Delete Old Image from R2 (if exists) ---
    try {
      const user = await prismadb.user.findUnique({
        where: { id: userId },
        select: { profileCardBackground: true },
      });
      const oldBackgroundUrl = user?.profileCardBackground;

      if (oldBackgroundUrl) {
        // Ensure publicBucketUrl has a trailing slash for accurate replacement
        const baseUrl = publicBucketUrl.endsWith("/")
          ? publicBucketUrl
          : `${publicBucketUrl}/`;
        if (oldBackgroundUrl.startsWith(baseUrl)) {
          const oldObjectKey = oldBackgroundUrl.replace(baseUrl, "");
          if (oldObjectKey) {
            console.log(`Attempting to delete old R2 object: ${oldObjectKey}`);
            const deleteCommand = new DeleteObjectCommand({
              Bucket: bucketName,
              Key: oldObjectKey,
            });
            await s3Client.send(deleteCommand);
            console.log(`Successfully deleted old R2 object: ${oldObjectKey}`);
          } else {
            console.warn(
              `Could not extract old object key from URL: ${oldBackgroundUrl}`
            );
          }
        } else {
          console.warn(
            `Old background URL "${oldBackgroundUrl}" does not match base URL "${baseUrl}"`
          );
        }
      }
    } catch (deleteError) {
      console.error("Error deleting old background image:", deleteError);
      // Log error but continue with upload
    }

    // --- Upload New Image to R2 ---
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: fileBuffer,
      ContentType: file.type,
      ACL: "public-read", // Make the background image publicly accessible
    });

    await s3Client.send(putCommand);
    console.log(`Successfully uploaded background image: ${objectKey}`);

    // Construct the public URL
    const imageUrl = `${
      publicBucketUrl.endsWith("/") ? publicBucketUrl : `${publicBucketUrl}/`
    }${objectKey}`;

    // --- Update Database ---
    const updatedUser = await prismadb.user.update({
      where: { id: userId },
      data: {
        profileCardBackground: imageUrl, // Save the public URL
      },
      select: { profileCardBackground: true }, // Select only the updated field for response
    });

    // --- Return Response ---
    const response = NextResponse.json(updatedUser); // Return { profileCardBackground: 'new_url' }
    return addCorsHeaders(response);
  } catch (error) {
    console.error("[PROFILE_CARD_BACKGROUND_POST]", error);
    return addCorsHeaders(
      new NextResponse("Internal Server Error", { status: 500 })
    );
  }
}

// DELETE /api/account/profile-card-background - Delete background image
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return addCorsHeaders(
        new NextResponse("Unauthenticated", { status: 401 })
      );
    }
    const userId = session.user.id;

    // --- Fetch current user data ---
    const user = await prismadb.user.findUnique({
      where: { id: userId },
      select: { profileCardBackground: true },
    });

    if (!user) {
      // Should not happen if session is valid, but good practice
      return addCorsHeaders(
        new NextResponse("User not found", { status: 404 })
      );
    }

    const currentBackgroundUrl = user.profileCardBackground;

    if (!currentBackgroundUrl) {
      return addCorsHeaders(
        new NextResponse("No background image set to delete", { status: 400 })
      );
    }

    // --- R2/S3 Client Setup (Same as POST) ---
    const accountId = process.env.R2_ENDPOINT?.split(".")[0]?.replace(
      "https://",
      ""
    );
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME;
    const publicBucketUrl = process.env.R2_PUBLIC_BUCKET_URL; // Needed to extract key

    if (
      !accountId ||
      !accessKeyId ||
      !secretAccessKey ||
      !bucketName ||
      !publicBucketUrl
    ) {
      console.error(
        "R2 environment variables missing for background deletion."
      );
      return addCorsHeaders(
        new NextResponse("Server configuration error for file deletion", {
          status: 500,
        })
      );
    }

    const s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });

    // --- Extract Object Key from URL ---
    // Ensure publicBucketUrl has a trailing slash for accurate replacement
    const baseUrl = publicBucketUrl.endsWith("/")
      ? publicBucketUrl
      : `${publicBucketUrl}/`;
    if (!currentBackgroundUrl.startsWith(baseUrl)) {
      console.error(
        `Background URL "${currentBackgroundUrl}" does not match base URL "${baseUrl}"`
      );
      return addCorsHeaders(
        new NextResponse("Invalid background image URL found", { status: 500 })
      );
    }
    const objectKey = currentBackgroundUrl.replace(baseUrl, "");

    if (!objectKey) {
      console.error(
        `Could not extract object key from URL: ${currentBackgroundUrl}`
      );
      return addCorsHeaders(
        new NextResponse("Failed to determine image key for deletion", {
          status: 500,
        })
      );
    }

    // --- Delete from R2 ---
    console.log(`Attempting to delete R2 object: ${objectKey}`);
    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    try {
      await s3Client.send(deleteCommand);
      console.log(`Successfully deleted R2 object: ${objectKey}`);
    } catch (s3Error: unknown) {
      // Log the S3 error but proceed to update DB anyway,
      // as the object might already be deleted or there might be permission issues.
      // Avoid failing the whole request if DB update is more critical.
      console.error(`Failed to delete R2 object ${objectKey}:`, s3Error);
      // Optionally, you could return an error here if R2 deletion is mandatory
      // return addCorsHeaders(new NextResponse("Failed to delete image from storage", { status: 500 }));
    }

    // --- Update Database ---
    await prismadb.user.update({
      where: { id: userId },
      data: {
        profileCardBackground: null, // Set to null
      },
    });
    console.log(
      `Successfully set profileCardBackground to null for user ${userId}`
    );

    // --- Return Response ---
    // Return 204 No Content for successful deletion
    const response = new NextResponse(null, { status: 204 });
    return addCorsHeaders(response);
  } catch (error) {
    console.error("[PROFILE_CARD_BACKGROUND_DELETE]", error);
    return addCorsHeaders(
      new NextResponse("Internal Server Error", { status: 500 })
    );
  }
}
