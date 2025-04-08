import { NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { randomUUID } from "crypto"; // For generating unique filenames
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
  console.error(
    "CRITICAL: Missing Cloudflare R2 environment variables at startup!"
  );
  // Optionally throw an error during build or startup if preferred
  // Log which ones are missing for easier debugging:
  if (!R2_BUCKET_NAME) console.error("Missing: R2_BUCKET_NAME");
  if (!CLOUDFLARE_ACCOUNT_ID) console.error("Missing: CLOUDFLARE_ACCOUNT_ID");
  if (!R2_ACCESS_KEY_ID) console.error("Missing: R2_ACCESS_KEY_ID");
  if (!R2_SECRET_ACCESS_KEY) console.error("Missing: R2_SECRET_ACCESS_KEY");
  if (!R2_PUBLIC_BUCKET_URL) console.error("Missing: R2_PUBLIC_BUCKET_URL");
} else {
  console.log("R2 Environment variables seem present at startup."); // Added log
}

// Construct the R2 endpoint URL
const R2_ENDPOINT = `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;

// Log values just before S3 client initialization
console.log("[R2 Init] R2_BUCKET_NAME:", R2_BUCKET_NAME ? "Exists" : "MISSING");
console.log(
  "[R2 Init] CLOUDFLARE_ACCOUNT_ID:",
  CLOUDFLARE_ACCOUNT_ID ? "Exists" : "MISSING"
);
console.log(
  "[R2 Init] R2_ACCESS_KEY_ID:",
  R2_ACCESS_KEY_ID ? "Exists" : "MISSING"
);
console.log(
  "[R2 Init] R2_SECRET_ACCESS_KEY:",
  R2_SECRET_ACCESS_KEY ? "Exists" : "MISSING"
);
console.log(
  "[R2 Init] R2_PUBLIC_BUCKET_URL:",
  R2_PUBLIC_BUCKET_URL ? "Exists" : "MISSING"
);
console.log("[R2 Init] R2_ENDPOINT:", R2_ENDPOINT);

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

// POST handler for uploading images
export async function POST(req: Request) {
  try {
    // 1. Check Authentication (Allow any logged-in user to upload)
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return new NextResponse("Unauthorized", { status: 403 });
    }
    const userId = session.user.id; // Get user ID for potential folder structure

    // 2. Validate R2 configuration at runtime
    if (
      !R2_BUCKET_NAME ||
      !CLOUDFLARE_ACCOUNT_ID ||
      !R2_ACCESS_KEY_ID ||
      !R2_SECRET_ACCESS_KEY ||
      !R2_PUBLIC_BUCKET_URL
    ) {
      console.error(
        "[R2_IMAGES_POST] Runtime configuration error: R2 settings missing."
      );
      // Log which ones are missing at runtime:
      if (!R2_BUCKET_NAME)
        console.error("[R2_IMAGES_POST] Missing Runtime: R2_BUCKET_NAME");
      if (!CLOUDFLARE_ACCOUNT_ID)
        console.error(
          "[R2_IMAGES_POST] Missing Runtime: CLOUDFLARE_ACCOUNT_ID"
        );
      if (!R2_ACCESS_KEY_ID)
        console.error("[R2_IMAGES_POST] Missing Runtime: R2_ACCESS_KEY_ID");
      if (!R2_SECRET_ACCESS_KEY)
        console.error("[R2_IMAGES_POST] Missing Runtime: R2_SECRET_ACCESS_KEY");
      if (!R2_PUBLIC_BUCKET_URL)
        console.error("[R2_IMAGES_POST] Missing Runtime: R2_PUBLIC_BUCKET_URL");

      return new NextResponse(
        "Server configuration error: R2 settings missing.", // Keep original user-facing message
        { status: 500 }
      );
    } else {
      console.log("[R2_IMAGES_POST] Runtime R2 configuration check passed."); // Added log
    }

    // 3. Parse FormData
    const formData = await req.formData();
    const file = formData.get("file") as File | null; // Assuming the file input name is 'file'

    if (!file) {
      return new NextResponse("No file provided.", { status: 400 });
    }

    // Optional: Validate file type and size here if needed
    // e.g., if (!file.type.startsWith('image/')) { ... }
    // e.g., if (file.size > MAX_FILE_SIZE) { ... }

    // 4. Generate unique filename and key
    const fileExtension = file.name.split(".").pop();
    // Consider adding user ID to the path for organization: e.g., `users/${userId}/images/${randomUUID()}.${fileExtension}`
    const fileName = `${randomUUID()}.${fileExtension}`;
    const key = `user-uploads/${fileName}`; // Example path, adjust as needed

    // 5. Upload to R2 using Upload from lib-storage
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: file.stream(), // Use the file stream
        ContentType: file.type, // Set content type for proper browser handling
        // ACL: 'public-read', // R2 doesn't use ACLs like S3, rely on bucket policy/public URL
      },
      // Optional: Configure queue size and part size for large files
      // queueSize: 4, // Concurrent parts upload
      // partSize: 1024 * 1024 * 5, // 5 MB parts
    });

    // Optional: Log progress
    // upload.on("httpUploadProgress", (progress) => {
    //   console.log(progress);
    // });

    await upload.done(); // Execute the upload

    // 6. Construct the public URL
    const imageUrl = `${R2_PUBLIC_BUCKET_URL}/${key}`;

    // 7. Return the URL
    return NextResponse.json({ url: imageUrl });
  } catch (error) {
    console.error("[R2_IMAGES_POST] Detailed Error uploading to R2:", error);

    let errorMessage = "Internal error uploading image.";
    if (error instanceof Error) {
      errorMessage = `Failed to upload image: ${error.name} - ${error.message}`;
    } else {
      errorMessage = `Failed to upload image: An unknown error occurred.`;
    }
    return new NextResponse(errorMessage, { status: 500 });
  }
}
