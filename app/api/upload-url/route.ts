// app/api/upload-url/route.ts
import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid"; // For generating unique filenames

// --- IMPORTANT: Configure these environment variables ---
const R2_ENDPOINT = process.env.R2_ENDPOINT; // e.g., https://<ACCOUNT_ID>.r2.cloudflarestorage.com
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_BUCKET_URL = process.env.R2_PUBLIC_BUCKET_URL; // e.g., https://pub-<YOUR_R2_PUBLIC_HOSTNAME>

if (
  !R2_ENDPOINT ||
  !R2_ACCESS_KEY_ID ||
  !R2_SECRET_ACCESS_KEY ||
  !R2_BUCKET_NAME ||
  !R2_PUBLIC_BUCKET_URL
) {
  console.error("Missing required R2 environment variables!");
  // Optionally throw an error during build/startup if preferred
}

const s3Client = new S3Client({
  region: "auto", // R2 specific setting
  endpoint: R2_ENDPOINT!,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
  },
});

const SIGNED_URL_EXPIRES_IN = 60 * 5; // 5 minutes

export async function POST(req: Request) {
  if (
    !R2_ENDPOINT ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET_NAME ||
    !R2_PUBLIC_BUCKET_URL
  ) {
    return new NextResponse("R2 storage is not configured correctly.", {
      status: 500,
    });
  }

  try {
    const { filename, contentType } = await req.json();

    if (!filename || !contentType) {
      return new NextResponse("Filename and contentType are required", {
        status: 400,
      });
    }

    // Generate a unique key for the object in R2
    const uniqueFilename = `${uuidv4()}-${filename}`;
    const key = `uploads/${uniqueFilename}`; // Example: store in an 'uploads' folder

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      // ACL: 'public-read', // R2 doesn't use ACLs like S3, public access is via bucket settings/public URL
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: SIGNED_URL_EXPIRES_IN,
    });

    // Construct the public URL for the file after upload
    const publicFileUrl = `${R2_PUBLIC_BUCKET_URL!.replace(/\/$/, "")}/${key}`; // Ensure no double slash

    return NextResponse.json({
      uploadUrl: signedUrl,
      publicUrl: publicFileUrl, // The URL to store/use after successful upload
      key: key, // The object key in the bucket
    });
  } catch (error) {
    console.error("Detailed error generating signed URL:", error); // Log the full error object
    // Check if it's an AWS SDK error and provide more context if possible
    let errorMessage = "Internal Server Error";
    if (error instanceof Error) {
      errorMessage = `Internal Server Error: ${error.name} - ${error.message}`;
      // Optionally log stack trace: console.error(error.stack);
    }
    return new NextResponse(errorMessage, { status: 500 });
  }
}
