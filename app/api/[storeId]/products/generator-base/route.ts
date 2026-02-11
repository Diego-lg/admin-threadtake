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
    ); // Log received storeId

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
      baseProduct,
    ); // Log the result

    if (!baseProduct) {
      console.error(
        `[GENERATOR_BASE_GET] No base product found matching criteria for store ${storeId}`,
      );
      return new NextResponse(
        "Generator base product not found for this store",
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
    return new NextResponse("Internal error", { status: 500 });
  }
}
