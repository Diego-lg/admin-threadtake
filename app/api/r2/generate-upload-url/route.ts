import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid"; // For generating unique keys

// Ensure environment variables are set
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "threadheaven"; // Default to 'threadheaven' if not set

if (
  !R2_ACCESS_KEY_ID ||
  !R2_SECRET_ACCESS_KEY ||
  !CLOUDFLARE_ACCOUNT_ID ||
  !R2_BUCKET_NAME
) {
  console.error("Missing required R2 environment variables!");
  // Optionally throw an error during build/startup if preferred
}

// Configure the S3 client to point to R2
const s3Client = new S3Client({
  region: "auto", // R2 specific setting
  endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID!, // Add non-null assertion or handle potential undefined
    secretAccessKey: R2_SECRET_ACCESS_KEY!, // Add non-null assertion
  },
});

export async function POST(req: Request) {
  // Basic check for environment variables at runtime
  if (
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !CLOUDFLARE_ACCOUNT_ID ||
    !R2_BUCKET_NAME
  ) {
    return new NextResponse(
      "Server configuration error: Missing R2 credentials",
      { status: 500 }
    );
  }

  try {
    // Get folderId, filename, and contentType from the request body
    const { folderId, filename, contentType } = await req.json();

    if (!folderId) {
      return new NextResponse("Missing folderId in request body", {
        status: 400,
      });
    }
    if (!filename) {
      return new NextResponse("Missing filename in request body", {
        status: 400,
      });
    }

    // Sanitize filename: remove potentially harmful characters like '..' or '/'
    // Replace spaces with underscores, keep extension
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueSuffix = uuidv4().substring(0, 8); // Add short UUID for extra uniqueness
    const objectKey = `designs/${folderId}/${uniqueSuffix}_${safeFilename}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: objectKey,
      // Use ContentType from the request if provided
      ContentType: contentType || undefined, // Pass undefined if not provided
      // ACL is generally not needed/used with R2 presigned URLs for PUT
    });

    // Generate the presigned URL for PUT request, valid for 60 seconds
    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 60, // URL expires in 60 seconds
    });

    console.log(`Generated presigned URL for key: ${objectKey}`);

    // Return the URL and the key to the frontend
    return NextResponse.json({
      presignedUrl,
      objectKey, // The frontend needs this to construct the final public URL
    });
  } catch (error) {
    console.error("Error generating R2 presigned URL:", error);
    return new NextResponse(
      "Internal Server Error: Could not generate upload URL",
      { status: 500 }
    );
  }
}
