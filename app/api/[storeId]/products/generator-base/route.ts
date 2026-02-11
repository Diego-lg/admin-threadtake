import prismadb from "@/lib/prismadb";
import { NextResponse } from "next/server";

export async function GET(
  req: Request, // req is unused but required by Next.js convention
  { params }: { params: { storeId: string } },
) {
  try {
    const { storeId } = params;

    if (!storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    console.log(
      `[GENERATOR_BASE_GET] Received request for storeId: ${storeId}`,
    );

    // First, verify the store exists
    const storeExists = await prismadb.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true },
    });

    if (!storeExists) {
      console.error(`[GENERATOR_BASE_GET] Store ${storeId} does not exist`);
      return new NextResponse("Store not found", { status: 404 });
    }

    console.log(`[GENERATOR_BASE_GET] Store found: ${storeExists.name}`);

    // Count products in the store
    const productCount = await prismadb.product.count({
      where: { storeId },
    });
    console.log(
      `[GENERATOR_BASE_GET] Product count for store ${storeId}: ${productCount}`,
    );

    // Count non-archived products without savedDesignId
    const availableProductCount = await prismadb.product.count({
      where: {
        storeId,
        isArchived: false,
        savedDesignId: null,
      },
    });
    console.log(
      `[GENERATOR_BASE_GET] Available product count: ${availableProductCount}`,
    );

    // Logic to find the designated generator base product.
    // First try to find a product without a saved design
    let baseProduct = await prismadb.product.findFirst({
      where: {
        storeId: storeId,
        isArchived: false,
        savedDesignId: null,
      },
      include: {
        images: true,
        category: true,
        size: true,
        color: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // If no product without savedDesignId found, fall back to any non-archived product
    if (!baseProduct) {
      console.log(
        `[GENERATOR_BASE_GET] No product with null savedDesignId found, falling back to any non-archived product for store ${storeId}`,
      );
      baseProduct = await prismadb.product.findFirst({
        where: {
          storeId: storeId,
          isArchived: false,
        },
        include: {
          images: true,
          category: true,
          size: true,
          color: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    }

    console.log(
      `[GENERATOR_BASE_GET] Prisma findFirst result for store ${storeId}:`,
      baseProduct ? { id: baseProduct.id, name: baseProduct.name } : null,
    );

    if (!baseProduct) {
      console.error(
        `[GENERATOR_BASE_GET] No base product found matching criteria for store ${storeId}`,
      );
      return new NextResponse(
        "Generator base product not found. Please create a product in your store to use the generator.",
        { status: 404 },
      );
    }

    // Ensure price is formatted correctly (Prisma returns Decimal)
    // Also preserve sizeId and colorId in case the relations are null
    const { size, color, ...productWithoutRelations } = baseProduct;
    const formattedProduct = {
      ...productWithoutRelations,
      price: parseFloat(baseProduct.price.toString()),
      // Include relations if they exist
      size: size || null,
      color: color || null,
    };

    return NextResponse.json(formattedProduct);
  } catch (error) {
    console.error("[GENERATOR_BASE_GET]", error);
    // Provide more detailed error information
    if (error instanceof Error) {
      console.error("[GENERATOR_BASE_GET] Error name:", error.name);
      console.error("[GENERATOR_BASE_GET] Error message:", error.message);
    }
    return new NextResponse(
      "Internal error: " +
        (error instanceof Error ? error.message : "Unknown error"),
      { status: 500 },
    );
  }
}
