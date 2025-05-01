import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import { Prisma } from "@prisma/client"; // Import Prisma types

// GET /api/marketplace/designs - Fetch derived PRODUCTS representing shared designs with filtering/sorting
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const searchTerm = searchParams.get("search") || undefined;
    const tagsParam = searchParams.get("tags") || undefined;
    const sortBy = searchParams.get("sort") || "newest"; // Default to 'newest'
    const creatorId = searchParams.get("creatorId") || undefined; // <-- Read creatorId
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10); // Default limit to 20
    const skip = (page - 1) * limit;

    // --- Build Prisma Query Conditions for PRODUCTS ---
    const whereClause: Prisma.ProductWhereInput = {
      isArchived: false, // Only fetch active products
      savedDesignId: { not: null }, // Only fetch products derived from designs
      // Add creator filter if creatorId is provided
      ...(creatorId && { savedDesign: { userId: creatorId } }),
    };

    // Add search condition (searching description and tags)
    if (searchTerm) {
      // Apply search to product name OR related saved design description/tags/creator name
      whereClause.OR = [
        { name: { contains: searchTerm, mode: "insensitive" } }, // Search product name
        {
          savedDesign: {
            OR: [
              { description: { contains: searchTerm, mode: "insensitive" } },
              { tags: { has: searchTerm } },
              { user: { name: { contains: searchTerm, mode: "insensitive" } } },
            ],
          },
        },
      ];
    }

    // Add tag filtering condition
    if (tagsParam) {
      const tagsArray = tagsParam
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      if (tagsArray.length > 0) {
        // Apply tag filter directly to the Product's related SavedDesign
        // This assumes that if 'searchTerm' is also present, the OR condition
        // correctly handles the nested savedDesign filter.
        // Correctly merge tag filter with existing savedDesign conditions
        if (whereClause.savedDesign) {
          // If savedDesign filter already exists (e.g., from creatorId), add tags to it
          whereClause.savedDesign.tags = { hasSome: tagsArray };
        } else {
          // Otherwise, create the savedDesign filter with just tags
          whereClause.savedDesign = { tags: { hasSome: tagsArray } };
        }
        // Note: If both searchTerm and tagsParam are provided, this might need
        // more complex merging depending on desired AND/OR logic between
        // the search term hitting savedDesign fields and the tag filter.
        // For now, this applies the tag filter directly. If search also applies,
        // Prisma should handle the nested conditions appropriately within the OR.
      }
    }

    // --- Build Prisma OrderBy Clause for PRODUCTS ---
    let orderByClause: Prisma.ProductOrderByWithRelationInput = {};
    if (sortBy === "views") {
      // Sort by view count on the related saved design
      orderByClause = { savedDesign: { viewCount: "desc" } };
    } else if (sortBy === "rating") {
      // Sort by average rating on the related saved design
      orderByClause = { savedDesign: { averageRating: "desc" } };
    } else {
      // Default to newest product creation date
      orderByClause = { createdAt: "desc" };
    }
    console.log("[MARKETPLACE_PRODUCTS_GET] Query Params:", {
      searchTerm,
      tagsParam,
      sortBy,
      creatorId, // <-- Log creatorId
      page,
      limit,
    });
    console.log(
      "[MARKETPLACE_PRODUCTS_GET] Prisma Where Clause:",
      JSON.stringify(whereClause, null, 2)
    );
    console.log(
      "[MARKETPLACE_PRODUCTS_GET] Prisma OrderBy Clause:",
      JSON.stringify(orderByClause, null, 2)
    );

    // --- Fetch Derived Products ---
    console.time("[MARKETPLACE_PRODUCTS_GET] DB Query Time"); // Start timer
    const derivedProducts = await prismadb.product.findMany({
      where: whereClause,
      take: limit, // Add pagination limit
      skip: skip, // Add pagination offset
      // Restore minimal includes using select for performance
      include: {
        images: { take: 1, select: { url: true } }, // Select only the URL of the first image
        savedDesign: {
          select: {
            // Select only necessary fields from SavedDesign
            id: true,
            userId: true, // Get creator ID for potential linking
            designImageUrl: true,
            mockupImageUrl: true,
            description: true,
            tags: true,
            viewCount: true,
            averageRating: true,
            ratingCount: true,
            createdAt: true,
            updatedAt: true,
            user: {
              // Select minimal creator details
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
            // DO NOT include nested color, size objects here for performance
          },
        },
      },
      orderBy: orderByClause,
      // TODO: Add pagination later if needed (take, skip) - Pagination added above
    });
    console.timeEnd("[MARKETPLACE_PRODUCTS_GET] DB Query Time"); // End timer

    // Fetch total count for pagination metadata (optional but good for UI)
    // Note: This adds another query, but it's usually fast if indexed.
    // Consider if this is needed based on frontend requirements.
    // const totalCount = await prismadb.product.count({ where: whereClause });

    console.log(
      `[MARKETPLACE_PRODUCTS_GET] Found ${derivedProducts.length} raw derived products for page ${page}.`
    );
    // Optional: Log the raw products if needed for deep debugging (can be verbose)
    // console.log("[MARKETPLACE_PRODUCTS_GET] Raw Derived Products:", JSON.stringify(derivedProducts, null, 2));
    // --- Map response using the selected fields ---
    // The frontend might still need adjustments if it expects full nested objects.
    const responseData = derivedProducts
      .filter((product) => product.savedDesign) // Ensure savedDesign is linked
      .map((product) => {
        const design = product.savedDesign!; // Non-null assertion as we filtered
        return {
          // --- Key identifiers ---
          id: design.id, // SavedDesign ID
          productId: product.id, // Product ID

          // --- Product details (from derived product) ---
          name: product.name,
          price: product.price,
          productImage: product.images?.[0]?.url || "/placeholder.png", // Image from derived product

          // --- Design details (selected from savedDesign) ---
          designImageUrl: design.designImageUrl,
          mockupImageUrl: design.mockupImageUrl,
          // customText: design.customText, // Not selected
          description: design.description,
          tags: design.tags,
          // usageRights: design.usageRights, // Not selected
          // color: design.color, // Not selected (nested object)
          // size: design.size, // Not selected (nested object)

          // --- Creator details (selected from savedDesign.user) ---
          creator: design.user
            ? {
                // Use selected user details
                id: design.user.id,
                name: design.user.name,
                image: design.user.image,
              }
            : null,

          // --- Stats (selected from savedDesign) ---
          viewCount: design.viewCount,
          averageRating: design.averageRating,
          ratingCount: design.ratingCount,
          createdAt: design.createdAt,
          updatedAt: design.updatedAt,

          // --- Fields no longer directly applicable at top level ---
          // isShared: design.isShared,
          // product: undefined,
          // user: undefined,
        };
      });

    console.log(
      `[MARKETPLACE_PRODUCTS_GET] Mapped ${responseData.length} products for response (with selected fields).`
    );
    // Optional: Log the final response data if needed
    // console.log("[MARKETPLACE_PRODUCTS_GET] Final Response Data:", JSON.stringify(responseData, null, 2));
    // TODO: Implement view count increment logic.
    // Incrementing here might over-count views if users just browse.
    // Better to increment when a specific design detail is viewed (Phase 2?).

    // Include pagination metadata in the response if needed
    // return NextResponse.json({ data: responseData, total: totalCount, page, limit });
    return NextResponse.json(responseData); // Returning only data for now
  } catch (error) {
    console.error("[MARKETPLACE_PRODUCTS_GET]", error); // Update log context
    return new NextResponse("Internal Error", { status: 500 });
  }
}
