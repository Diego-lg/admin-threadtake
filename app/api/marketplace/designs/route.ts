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

    // --- Build Prisma Query Conditions for PRODUCTS ---
    const whereClause: Prisma.ProductWhereInput = {
      isArchived: false, // Only fetch active products
      savedDesignId: { not: null }, // Only fetch products derived from designs
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
        whereClause.savedDesign = {
          tags: { hasSome: tagsArray },
        };
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
    });
    console.log(
      "[MARKETPLACE_PRODUCTS_GET] Prisma Where Clause:",
      JSON.stringify(whereClause, null, 2)
    );
    console.log(
      "[MARKETPLACE_PRODUCTS_GET] Prisma OrderBy Clause:",
      JSON.stringify(orderByClause, null, 2)
    );

    // --- Fetch ALL available sizes ---
    const allSizes = await prismadb.size.findMany({
      // Removed where clause as 'isArchived' doesn't exist on Size model
      orderBy: { name: "asc" }, // Optional: Order sizes for consistency
    });
    console.log(
      `[MARKETPLACE_PRODUCTS_GET] Fetched ${allSizes.length} available sizes.`
    );

    // --- Fetch Derived Products ---
    const derivedProducts = await prismadb.product.findMany({
      where: whereClause,
      include: {
        // Include data needed for display
        images: { take: 1 }, // Get first image of the derived product
        savedDesign: {
          // Include the original design details
          include: {
            user: {
              // Include the creator details
              select: {
                id: true,
                name: true,
                image: true,
                bio: true,
                profileCardBackground: true,
              },
            },
            color: true, // Include full color object
            // size: true, // No longer need the single original size here
          },
        },
        // No need to include base product, color, size directly on Product
        // as they are now part of the derived product itself or its linked savedDesign
      },
      orderBy: orderByClause,
      // TODO: Add pagination later if needed (take, skip)
    });

    console.log(
      `[MARKETPLACE_PRODUCTS_GET] Found ${derivedProducts.length} raw derived products.`
    );
    // Optional: Log the raw products if needed for deep debugging (can be verbose)
    // console.log("[MARKETPLACE_PRODUCTS_GET] Raw Derived Products:", JSON.stringify(derivedProducts, null, 2));
    // --- Map response to a structure expected by the frontend ---
    // The frontend likely expects a structure similar to the old SavedDesign response,
    // but now based on the derived Product.
    const responseData = derivedProducts
      .filter((product) => product.savedDesign) // Ensure savedDesign is linked
      .map((product) => {
        const design = product.savedDesign!; // Non-null assertion as we filtered
        return {
          // --- Key identifiers ---
          id: design.id, // Use the SavedDesign ID as the primary identifier for the *listing*
          productId: product.id, // The actual Product ID being sold

          // --- Product details (from derived product) ---
          name: product.name,
          price: product.price,
          productImage: product.images?.[0]?.url || "/placeholder.png", // Image from derived product

          // --- Design details (from savedDesign) ---
          designImageUrl: design.designImageUrl,
          mockupImageUrl: design.mockupImageUrl,
          customText: design.customText,
          description: design.description,
          tags: design.tags,
          usageRights: design.usageRights,
          color: design.color, // Full color object
          // size: design.size, // Remove original size
          availableSizes: allSizes, // Add the list of all available sizes

          // --- Creator details (from savedDesign.user) ---
          creator: design.user
            ? {
                id: design.user.id,
                name: design.user.name,
                image: design.user.image,
                bio: design.user.bio,
                profileCardBackground: design.user.profileCardBackground,
              }
            : null,

          // --- Stats (from savedDesign) ---
          viewCount: design.viewCount,
          averageRating: design.averageRating,
          ratingCount: design.ratingCount,
          createdAt: design.createdAt, // Use design creation time for "newest" if preferred over product time
          updatedAt: design.updatedAt,

          // --- Fields no longer directly applicable at top level ---
          // isShared: design.isShared, // Implicitly true as we queried derived products
          // product: undefined, // Base product info is not needed here
          // user: undefined, // Replaced by creator
        };
      });

    console.log(
      `[MARKETPLACE_PRODUCTS_GET] Mapped ${responseData.length} products for response.`
    );
    // Optional: Log the final response data if needed
    // console.log("[MARKETPLACE_PRODUCTS_GET] Final Response Data:", JSON.stringify(responseData, null, 2));
    // TODO: Implement view count increment logic.
    // Incrementing here might over-count views if users just browse.
    // Better to increment when a specific design detail is viewed (Phase 2?).

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("[MARKETPLACE_PRODUCTS_GET]", error); // Update log context
    return new NextResponse("Internal Error", { status: 500 });
  }
}
