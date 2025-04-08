import { NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getServerSession } from "next-auth/next";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";

// Ensure environment variables are loaded and validated
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID; // Use correct env var name
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_PUBLIC_BUCKET_URL = process.env.R2_PUBLIC_BUCKET_URL; // Use correct env var name

if (
  !R2_BUCKET_NAME ||
  !CLOUDFLARE_ACCOUNT_ID || // Use correct env var name
  !R2_ACCESS_KEY_ID ||
  !R2_SECRET_ACCESS_KEY ||
  !R2_PUBLIC_BUCKET_URL // Use correct env var name
) {
  console.error("Missing Cloudflare R2 environment variables!");
  // Optionally throw an error during build or startup if preferred
}

// Construct the R2 endpoint URL
const R2_ENDPOINT = `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`; // Use correct env var name

// Initialize S3 Client configured for Cloudflare R2
const s3Client = new S3Client({
  region: "auto", // R2 specific setting
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID!, // Add non-null assertion if checks are done elsewhere
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
  },
});

export async function GET(req: Request) {
  try {
    // 1. Check Authentication (Adjust role if needed - e.g., allow any logged-in user)
    const session = await getServerSession(authOptions);
    // For now, restrict to ADMIN, but consider if regular USERS should access their own images
    if (!session || !session.user || session.user.role !== UserRole.ADMIN) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Validate that R2 config is loaded correctly at runtime
    if (!R2_BUCKET_NAME || !R2_PUBLIC_BUCKET_URL) {
      // Use correct env var name
      return new NextResponse(
        "Server configuration error: R2 settings missing.",
        { status: 500 }
      );
    }

    // 2. Get prefix from query params
    const { searchParams } = new URL(req.url);
    const prefix = searchParams.get("prefix") || ""; // Default to root

    // 3. List Objects and Common Prefixes (Folders) in the Bucket
    const command = new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: prefix, // Use the provided prefix
      Delimiter: "/", // Group by folder
      // Optional: Add MaxKeys for pagination if needed
    });

    const { Contents, CommonPrefixes } = await s3Client.send(command);

    // 4. Format the response
    const folders = CommonPrefixes?.map((commonPrefix) => ({
      name: commonPrefix.Prefix?.replace(prefix, "").replace("/", "") || "", // Extract folder name
      prefix: commonPrefix.Prefix || "", // Full prefix for navigation
    }))
      .filter((folder) => folder.name) // Ensure name is not empty
      .sort((a, b) => a.name.localeCompare(b.name)); // Sort folders alphabetically

    const images = Contents?.map((item) => ({
      key: item.Key,
      url: `${R2_PUBLIC_BUCKET_URL}/${item.Key}`, // Use correct env var name
      lastModified: item.LastModified,
      size: item.Size,
    }))
      // Filter out the prefix itself if it appears as content and any folder placeholders
      .filter(
        (item) => item.key && item.key !== prefix && !item.key.endsWith("/")
      )
      .sort(
        (a, b) =>
          (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0)
      ); // Sort images by date, newest first

    // 5. Return folders and images
    return NextResponse.json({
      folders: folders || [],
      images: images || [],
      currentPrefix: prefix, // Include current prefix for context
    });
  } catch (error) {
    // Log the full error object for more details
    console.error("[R2_IMAGES_GET] Detailed Error listing R2 objects:", error);

    let errorMessage = "Internal error listing images.";
    if (error instanceof Error) {
      // Include error name and potentially stack if helpful (be cautious in production)
      errorMessage = `Failed to list images: ${error.name} - ${error.message}`;
      // console.error(error.stack); // Uncomment for detailed stack trace during debugging
    } else {
      // Handle non-Error objects being thrown
      errorMessage = `Failed to list images: An unknown error occurred.`;
    }
    return new NextResponse(errorMessage, { status: 500 });
  }
}
