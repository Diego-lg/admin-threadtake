import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth"; // Updated import path
import prismadb from "@/lib/prismadb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

// --- R2 Configuration ---
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_BUCKET_URL = process.env.R2_PUBLIC_BUCKET_URL; // Corrected variable name

const s3Client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT!,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
  },
});

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

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return addCorsHeaders(
        new NextResponse("No file uploaded", { status: 400 })
      );
    }

    // Basic validation (optional: add more checks like file size, type)
    if (!file.type.startsWith("image/")) {
      return addCorsHeaders(
        new NextResponse("Invalid file type, please upload an image.", {
          status: 400,
        })
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Fetch current user to get the old image URL
    const currentUser = await prismadb.user.findUnique({
      where: { id: session.user.id },
      select: { image: true }, // Select only the old image URL
    });
    const oldImageUrl = currentUser?.image;
    // const oldImageKey = currentUser?.imageKey; // TODO: Uncomment and use after adding imageKey to schema

    // --- Upload to R2 using Signed URL ---
    if (
      !R2_ENDPOINT ||
      !R2_ACCESS_KEY_ID ||
      !R2_SECRET_ACCESS_KEY ||
      !R2_BUCKET_NAME ||
      !R2_PUBLIC_BUCKET_URL // Corrected variable name
    ) {
      throw new Error("R2 storage is not configured correctly on the server.");
    }

    const uniqueFilename = `${uuidv4()}-${file.name.replace(/\s+/g, "_")}`; // Make filename URL-safe
    const key = `profile_pictures/${uniqueFilename}`; // Store in 'profile_pictures' folder

    // 1. Generate Signed URL for PUT request
    const putCommand = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: file.type,
    });

    const signedUrl = await getSignedUrl(s3Client, putCommand, {
      expiresIn: SIGNED_URL_EXPIRES_IN,
    });

    // 2. Upload the file buffer to the Signed URL
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        r2Error = `Failed to upload profile picture to R2: ${uploadResponse.statusText}`;
      }
      throw new Error(r2Error);
    }

    // 3. Construct the public URL
    const newImageUrl = `${R2_PUBLIC_BUCKET_URL.replace(/\/$/, "")}/${key}`; // Corrected variable name
    const newImageKey = key; // The key used for the upload

    console.log(
      `Successfully uploaded profile picture to R2. Key: ${newImageKey}, URL: ${newImageUrl}`
    );

    // const newImageId = uploadResult.id; // We use the key now

    // --- Delete Old Image from R2 ---
    // --- TODO: Delete Old Image from R2 (Requires imageKey in schema) ---
    // if (oldImageKey && oldImageKey !== newImageKey) {
    //   try {
    //     console.log(`Attempting to delete old image from R2 with key: ${oldImageKey}`);
    //     const deleteCommand = new DeleteObjectCommand({
    //       Bucket: R2_BUCKET_NAME,
    //       Key: oldImageKey,
    //     });
    //     await s3Client.send(deleteCommand);
    //     console.log(`Successfully deleted old image from R2: ${oldImageKey}`);
    //   } catch (deleteError) {
    //     console.error("Failed to delete old profile picture from R2:", deleteError);
    //   }
    // } else if (oldImageKey === newImageKey) {
    //      console.warn("Old and new image keys are the same. Skipping deletion.");
    // }
    // --- End Delete Old Image ---
    // Note: Deletion logic is commented out until imageKey is added to the User model.
    // You'll also need to extract the key from the oldImageUrl if imageKey isn't available.
    if (
      oldImageUrl &&
      R2_PUBLIC_BUCKET_URL &&
      oldImageUrl.startsWith(R2_PUBLIC_BUCKET_URL)
    ) {
      // Corrected variable name
      console.warn(
        `Old image deletion skipped for ${oldImageUrl}. Implement deletion using R2 key.`
      );
    }
    // --- End Delete Old Image ---

    // Update user in the database with the NEW image URL
    const updatedUser = await prismadb.user.update({
      where: { id: session.user.id },
      data: {
        image: newImageUrl, // Store the public URL
        // imageKey: newImageKey, // TODO: Uncomment after adding imageKey to schema
      },
      select: { name: true, email: true, image: true, role: true }, // Select only existing fields
    });

    // Return the necessary fields for the client-side update() function
    const responseData = {
      name: updatedUser.name,
      email: updatedUser.email, // email shouldn't change, but good practice
      image: updatedUser.image,
      role: updatedUser.role,
      // id is already in the token, not strictly needed here
    };
    const response = NextResponse.json(responseData);
    return addCorsHeaders(response);
  } catch (error) {
    console.error("[PROFILE_PICTURE_POST]", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    const statusCode =
      errorMessage.includes("R2") || // Check for R2 errors
      errorMessage.includes("Failed to upload") // Keep generic upload failure check
        ? 500 // Internal server / Cloudinary issue
        : 400; // Likely client-side issue (bad file, etc.)
    return addCorsHeaders(
      new NextResponse(errorMessage, { status: statusCode })
    );
  }
}
