import prismadb from "@/lib/prismadb";
import { NextResponse } from "next/server";

export async function GET(
  req: Request, // req is unused but required by Next.js convention
  { params }: { params: { storeId: string } }
) {
  try {
    const { storeId } = params;

    if (!storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    console.log(
      `[GENERATOR_BASE_GET] Received request for storeId: ${storeId}`
    ); // Log received storeId

    // Logic to find the designated generator base product.
    // For now, let's find the *first* non-archived product for this store
    // that is NOT linked to a saved design.
    // You might refine this later (e.g., add an 'isGeneratorBase' flag).
    const baseProduct = await prismadb.product.findFirst({
      where: {
        storeId: storeId,
        isArchived: false,
        // Modify query: Check if savedDesignId is NOT set (covers null/undefined)
        // This is slightly more robust than checking for strict null.
        NOT: {
          savedDesignId: {
            not: undefined, // Check if the field exists / is not undefined
          },
        },
      },
      include: {
        // Include necessary relations required by the frontend designer
        images: true,
        category: true,
        size: true,
        color: true,
      },
      orderBy: {
        // Consistent ordering to get the same product each time if multiple exist
        createdAt: "asc",
      },
    });

    console.log(
      `[GENERATOR_BASE_GET] Prisma findFirst result for store ${storeId}:`,
      baseProduct
    ); // Log the result

    if (!baseProduct) {
      console.error(
        `[GENERATOR_BASE_GET] No base product found matching criteria for store ${storeId}`
      );
      return new NextResponse(
        "Generator base product not found for this store",
        { status: 404 }
      );
    }

    // Ensure price is formatted correctly (Prisma returns Decimal)
    const formattedProduct = {
      ...baseProduct,
      price: parseFloat(baseProduct.price.toString()),
    };

    return NextResponse.json(formattedProduct);
  } catch (error) {
    console.error("[GENERATOR_BASE_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
