import prismadb from "@/lib/prismadb";
import { NextResponse } from "next/server";

// Define the context type explicitly for clarity
interface RouteContext {
  params: {
    storeId: string;
  };
}

export async function GET(
  req: Request,
  context: RouteContext // Use the defined interface
) {
  try {
    const { storeId } = context.params; // Destructure from context.params

    if (!storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    // Fetch products that are linked to a SavedDesign for the specific store
    // Note: We might need to adjust if marketplace products aren't strictly tied to one storeId
    // or if we want a global view for the admin. For now, scope to storeId.
    const marketplaceProducts = await prismadb.product.findMany({
      where: {
        storeId: storeId, // Keep scoping by store for now
        savedDesignId: {
          not: null, // The key filter: only products generated from designs
        },
        isArchived: false, // Typically, don't show archived products
      },
      include: {
        savedDesign: {
          // Include the original design details
          include: {
            user: {
              // Include creator details
              select: { id: true, name: true, email: true }, // Select specific user fields
            },
          },
        },
        category: true, // Include category (might be useful)
        size: true, // Include size
        color: true, // Include color
        images: true, // Include product images
      },
      orderBy: {
        createdAt: "desc", // Order by creation date
      },
    });

    // Format the price correctly (Prisma returns Decimal)
    const formattedProducts = marketplaceProducts.map((product) => ({
      ...product,
      price: parseFloat(product.price.toString()),
      // Flatten creator info for easier access in the table
      creatorName: product.savedDesign?.user?.name ?? "N/A",
      creatorEmail: product.savedDesign?.user?.email ?? "N/A",
      designImageUrl: product.savedDesign?.designImageUrl,
      isShared: product.savedDesign?.isShared ?? false,
    }));

    return NextResponse.json(formattedProducts);
  } catch (error) {
    console.error("[MARKETPLACE_PRODUCTS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
