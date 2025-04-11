import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import prismadb from "@/lib/prismadb";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3"; // Import S3 client
import { Prisma, UserRole, Size } from "@prisma/client"; // Import Prisma, UserRole, and Size

// Define the expected shape of the JWT payload (matching the other route)
interface JwtPayload {
  userId: string; // Changed from id to userId to match other route
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

// PATCH /api/designs/[designId] - Update a specific saved design
export async function PATCH(
  req: Request,
  { params }: { params: { designId: string } } // Use params from context
) {
  try {
    // 1. Get Authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new NextResponse("Authorization header missing or invalid", {
        status: 401,
      });
    }

    // 2. Extract token
    const token = authHeader.split(" ")[1];

    // 3. Verify token
    let decodedPayload: JwtPayload;
    try {
      const jwtSecret = process.env.JWT_SECRET; // Use the same secret
      if (!jwtSecret) {
        throw new Error("JWT_SECRET environment variable is not set!");
      }
      decodedPayload = jwt.verify(token, jwtSecret) as JwtPayload;
    } catch (error) {
      console.error("JWT Verification Error:", error);
      return new NextResponse("Invalid or expired token", { status: 401 });
    }

    // 4. Use userId from token
    const userId = decodedPayload.userId;
    if (!userId) {
      return new NextResponse("User ID not found in token", { status: 401 });
    }

    // 5. Get designId from params
    const { designId } = params;
    if (!designId) {
      return new NextResponse("Design ID is required", { status: 400 });
    }

    // 6. Get request body
    const body = await req.json();
    const {
      description,
      tags,
      isShared,
      mockupImageUrl, // Add mockupImageUrl
      // Add other fields that might be updatable here if needed in future
      // e.g., customText, designImageUrl (if re-generating), etc.
      usageRights, // Add usageRights
    } = body;

    // 7. Prepare update data, only including fields that were actually provided
    const updateData: {
      description?: string | null;
      tags?: string[];
      isShared?: boolean;
      mockupImageUrl?: string | null; // Add type for mockupImageUrl
      usageRights?: string | null; // Add type for usageRights
    } = {};

    if (description !== undefined) {
      updateData.description = description || null;
    }
    if (tags !== undefined) {
      // Validate tags input
      updateData.tags = Array.isArray(tags)
        ? tags.filter((tag) => typeof tag === "string")
        : [];
    }
    if (isShared !== undefined && typeof isShared === "boolean") {
      updateData.isShared = isShared;
    }
    if (mockupImageUrl !== undefined) {
      updateData.mockupImageUrl = mockupImageUrl || null;
    }
    if (usageRights !== undefined && typeof usageRights === "string") {
      updateData.usageRights = usageRights || null;
    }
    // Add checks for other updatable fields here...

    if (Object.keys(updateData).length === 0) {
      return new NextResponse("No valid fields provided for update", {
        status: 400,
      });
    }

    // 8. Update the design in the database, ensuring ownership
    const updatedDesign = await prismadb.savedDesign.update({
      where: {
        id: designId,
        userId: userId, // IMPORTANT: Ensure user owns the design
      },
      data: updateData,
    });

    // If update didn't find a matching record (wrong ID or user), Prisma throws an error
    // which will be caught below. If successful, return the updated design.

    return NextResponse.json(updatedDesign);
  } catch (error: unknown) {
    // Check if it's a known Prisma error for record not found
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return new NextResponse("Design not found or unauthorized", {
        status: 404,
      });
    }
    // Handle other errors
    console.error("[DESIGN_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

// DELETE /api/designs/[designId] - Delete a specific saved design
export async function DELETE(
  req: Request,
  { params }: { params: { designId: string } } // Use params from context
) {
  try {
    // Debug: Log R2 environment variables at the start of the request
    console.log("--- R2 Env Var Check ---");
    console.log("R2_ENDPOINT:", process.env.R2_ENDPOINT);
    console.log("R2_ACCESS_KEY_ID:", process.env.R2_ACCESS_KEY_ID);
    // Avoid logging the actual secret key for security
    console.log(
      "R2_SECRET_ACCESS_KEY:",
      process.env.R2_SECRET_ACCESS_KEY ? "Loaded" : "Missing/Empty"
    );
    console.log("R2_BUCKET_NAME:", process.env.R2_BUCKET_NAME);
    console.log("R2_PUBLIC_BUCKET_URL:", process.env.R2_PUBLIC_BUCKET_URL);
    console.log("------------------------");
    // 1. Get Authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new NextResponse("Authorization header missing or invalid", {
        status: 401,
      });
    }

    // 2. Extract token
    const token = authHeader.split(" ")[1];

    // 3. Verify token
    let decodedPayload: JwtPayload;
    try {
      const jwtSecret = process.env.JWT_SECRET; // Use the same secret
      if (!jwtSecret) {
        throw new Error("JWT_SECRET environment variable is not set!");
      }
      decodedPayload = jwt.verify(token, jwtSecret) as JwtPayload;
    } catch (error) {
      console.error("JWT Verification Error:", error);
      return new NextResponse("Invalid or expired token", { status: 401 });
    }

    // 4. Use userId from token
    const userId = decodedPayload.userId;
    if (!userId) {
      return new NextResponse("User ID not found in token", { status: 401 });
    }

    // 5. Get designId from params
    const { designId } = params;
    if (!designId) {
      return new NextResponse("Design ID is required", { status: 400 });
    }

    // Verify the design exists and belongs to the user before deleting
    const designToDelete = await prismadb.savedDesign.findUnique({
      where: {
        id: designId,
        userId: userId, // Ensure the user owns this design
      },
    });

    if (!designToDelete) {
      // Either design doesn't exist or user doesn't own it
      return new NextResponse("Design not found or unauthorized", {
        status: 404,
      });
    }

    // --- R2 Deletion Logic ---
    const { designImageUrl, uploadedLogoUrl, uploadedPatternUrl } =
      designToDelete;
    const imageUrlsToDelete = [
      designImageUrl,
      uploadedLogoUrl,
      uploadedPatternUrl,
    ].filter((url): url is string => typeof url === "string" && url.length > 0);

    if (imageUrlsToDelete.length > 0) {
      // Check for R2 environment variables
      const accountId = process.env.R2_ENDPOINT?.split(".")[0]?.replace(
        "https://",
        ""
      ); // Extract account ID for endpoint
      const accessKeyId = process.env.R2_ACCESS_KEY_ID;
      const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
      const bucketName = process.env.R2_BUCKET_NAME;
      const publicBucketUrl = process.env.R2_PUBLIC_BUCKET_URL; // URL stored in DB likely starts with this

      if (
        !accountId ||
        !accessKeyId ||
        !secretAccessKey ||
        !bucketName ||
        !publicBucketUrl
      ) {
        console.error(
          "R2 environment variables missing. Skipping R2 deletion."
        );
        // Optionally return an error or just log and continue with DB deletion
        // return new NextResponse("Server configuration error for file deletion", { status: 500 });
      } else {
        const s3Client = new S3Client({
          region: "auto", // R2 specific setting
          endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey,
          },
        });

        const deletePromises = imageUrlsToDelete.map(async (imageUrl) => {
          try {
            // Ensure the public URL ends with a slash for proper replacement
            const baseUrl = publicBucketUrl.endsWith("/")
              ? publicBucketUrl
              : `${publicBucketUrl}/`;
            // Extract object key by removing the public bucket URL base
            const objectKey = imageUrl.replace(baseUrl, "");

            if (objectKey && objectKey !== imageUrl) {
              // Check if replacement happened
              console.log(`Attempting to delete R2 object: ${objectKey}`);
              const deleteCommand = new DeleteObjectCommand({
                Bucket: bucketName,
                Key: objectKey,
              });
              await s3Client.send(deleteCommand);
              console.log(`Successfully deleted R2 object: ${objectKey}`);
            } else {
              console.warn(
                `Could not extract object key from URL: ${imageUrl} using base: ${baseUrl}`
              );
            }
          } catch (r2Error) {
            // Log R2 deletion errors but don't necessarily block DB deletion
            console.error(
              `Failed to delete R2 object for URL ${imageUrl}:`,
              r2Error
            );
          }
        });

        // Wait for all R2 deletions to attempt
        await Promise.all(deletePromises);
      }
    }
    // --- End R2 Deletion Logic ---

    // Delete the design from the database
    await prismadb.savedDesign.delete({
      where: {
        id: designId,
        // No need for userId here again, already verified ownership above
      },
    });

    return new NextResponse(null, { status: 204 }); // No Content
  } catch (error) {
    console.error("[DESIGN_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

// GET /api/designs/[designId] - Get public details for a single shared design
export async function GET(
  req: Request, // Keep req for potential future use (e.g., getting headers)
  { params }: { params: { designId: string } }
) {
  try {
    const { designId } = params;
    if (!designId) {
      return new NextResponse("Design ID is required", { status: 400 });
    }

    // Fetch the specific design, regardless of sharing status initially
    // We need derivedProductId even if not shared to potentially link later
    const design = await prismadb.savedDesign.findUnique({
      where: {
        id: designId,
        // Removed isShared check here, will check later before returning
      },
      include: {
        color: { select: { id: true, name: true, value: true } },
        size: { select: { id: true, name: true, value: true } }, // The specific size saved with the design
        user: {
          // Include creator info
          select: {
            id: true,
            name: true,
            image: true,
            bio: true,
            profileCardBackground: true,
          },
        },
        product: {
          // Include base product to get storeId
          select: {
            id: true,
            storeId: true,
          },
        },
        // derivedProductId is already fetched by default
      },
    });

    if (!design) {
      return new NextResponse("Design not found", { status: 404 });
    }

    // --- Determine which product details to fetch ---
    let productDetails = null;
    const targetProductId =
      design.isShared && design.derivedProductId
        ? design.derivedProductId
        : design.productId;

    if (targetProductId) {
      productDetails = await prismadb.product.findUnique({
        where: { id: targetProductId },
        select: {
          id: true,
          name: true,
          price: true,
          images: { take: 1, select: { url: true } }, // Get first image
          // Removed incorrect 'sizes: true' here
        },
      });
    }

    // --- Check if the design should be publicly visible ---
    // If the design isn't shared, return 404 for this public endpoint
    if (!design.isShared) {
      console.log(`Design ${designId} found but is not shared. Returning 404.`);
      return new NextResponse("Shared design not found", { status: 404 });
    }

    if (!design) {
      // If product details couldn't be fetched (e.g., inconsistent state), return error
      if (!productDetails) {
        console.error(
          `Could not fetch product details for product ID ${targetProductId} linked to design ${designId}`
        );
        return new NextResponse("Error fetching product details", {
          status: 500,
        });
      }
    }

    // --- Fetch Available Sizes for the Store ---
    let availableSizes: Size[] = []; // Explicitly type as an array of Size
    // Use storeId from the base product relation included earlier
    if (design.product?.storeId) {
      availableSizes = await prismadb.size.findMany({
        where: { storeId: design.product.storeId },
        // Removed select to fetch full Size objects, matching the Size[] type
        orderBy: { name: "asc" }, // Optional: order them
      });
    } else {
      console.warn(
        `Could not determine storeId for design ${designId} to fetch available sizes.`
      );
    }

    // --- Increment view count (fire-and-forget) ---
    // Use try/catch to prevent view count update failure from breaking the main response
    try {
      await prismadb.savedDesign.update({
        where: { id: designId },
        data: { viewCount: { increment: 1 } },
      });
    } catch (viewCountError) {
      console.error(
        `Failed to increment view count for design ${designId}:`,
        viewCountError
      );
      // Log the error but continue serving the request
    }

    // Map response to rename 'user' to 'creator'
    const responseData = {
      ...design,
      product: productDetails
        ? {
            // Ensure productDetails exists before spreading
            id: productDetails.id,
            name: productDetails.name,
            price: productDetails.price,
            images: productDetails.images,
            // Note: We don't include sizes here as it's redundant with availableSizes
          }
        : null,
      availableSizes: availableSizes, // Use the variable fetched earlier
      creator: design.user
        ? {
            id: design.user.id,
            name: design.user.name,
            image: design.user.image,
            bio: design.user.bio,
            profileCardBackground: design.user.profileCardBackground,
          }
        : null,
      user: undefined, // Remove original user field
    };

    // Public endpoint, usually no CORS needed unless called cross-origin directly
    return NextResponse.json(responseData);
  } catch (error) {
    console.error("[DESIGN_GET_SINGLE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
