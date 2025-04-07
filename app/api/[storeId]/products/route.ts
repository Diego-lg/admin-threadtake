import prismadb from "@/lib/prismadb";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth"; // Updated import path

export async function POST(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params;
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const body = await req.json();

    const {
      name,
      price,
      categoryId,
      colorId,
      sizeId,
      images,
      isFeatured,
      isArchived,
    } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }
    if (!name) {
      return new NextResponse("name is required", { status: 400 });
    }
    if (!images || !images.length) {
      return new NextResponse("images are required", { status: 400 });
    }
    if (!price) {
      return new NextResponse("price is required", { status: 400 });
    }
    if (!categoryId) {
      return new NextResponse("categoryId is required", { status: 400 });
    }
    if (!colorId) {
      return new NextResponse("colorId is required", { status: 400 });
    }
    if (!sizeId) {
      return new NextResponse("sizeId is required", { status: 400 });
    }
    if (!storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: storeId,
        userId: userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    const product = await prismadb.product.create({
      data: {
        name,
        price,
        isFeatured,
        isArchived,
        categoryId,
        colorId,
        sizeId,
        storeId: storeId,
        images: {
          createMany: {
            data: [...images.map((image: { url: string }) => image)],
          },
        },
      },
      include: {
        images: true,
        category: true,
        color: true,
        size: true,
      },
    });

    return NextResponse.json({
      ...product,
      price: parseFloat(product.price.toString()),
    });
  } catch (error) {
    console.log("[PRODUCTS_POST]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params; // Note: storeId might not be relevant for community designs
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId") || undefined;
    const colorId = searchParams.get("colorId") || undefined; // Filters might not apply to shared designs
    const sizeId = searchParams.get("sizeId") || undefined; // Filters might not apply to shared designs
    const isFeatured = searchParams.get("isFeatured"); // Filters might not apply to shared designs

    const COMMUNITY_CATEGORY_ID = "f53abb5e-7c99-4e07-a0f3-359720c0c175";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let results: any[] = []; // Use 'any' for now, refine type later if needed

    if (categoryId === COMMUNITY_CATEGORY_ID) {
      // Fetch shared designs
      // Fetch shared designs
      const sharedDesigns = await prismadb.savedDesign.findMany({
        where: {
          isShared: true,
          // Potentially add filters based on colorId/sizeId if applicable to shared designs?
          // colorId: colorId,
          // sizeId: sizeId,
        },
        include: {
          user: {
            // Include user to potentially show creator info
            select: { name: true, id: true },
          },
          product: {
            // Include related product for name/price
            select: { name: true, price: true },
          },
          color: true, // Include related color
          size: true, // Include related size
        },
        orderBy: {
          updatedAt: "desc", // Order by last updated might be more relevant
        },
      });

      // Map SavedDesign to a structure similar to Product
      results = sharedDesigns.map((design) => ({
        id: design.id, // Use SavedDesign ID
        name: design.product?.name || "Community Design", // Use related product name or default
        // Use related product price, convert Decimal to number, default to 0
        price: design.product?.price
          ? parseFloat(design.product.price.toString())
          : 0,
        isFeatured: false, // Shared designs likely aren't "featured" in store context
        isArchived: false,
        // Use designImageUrl for the image preview
        images: design.designImageUrl
          ? [
              {
                id: design.id + "_img",
                url: design.designImageUrl,
                productId: design.id,
              },
            ]
          : [],
        // Set category explicitly to Community
        category: {
          id: COMMUNITY_CATEGORY_ID,
          name: "Community",
          storeId: null,
          billboardId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }, // Provide necessary fields for Category type
        // Use related size and color data
        size: design.size,
        color: design.color,
        storeId: null, // Not associated with a specific store
        createdAt: design.createdAt,
        updatedAt: design.updatedAt,
        // Add creator info
        creatorName: design.user?.name || "Anonymous",
        creatorId: design.user?.id,
        // Add any other fields required by the frontend's Product type, potentially with null/default values
        categoryId: COMMUNITY_CATEGORY_ID, // Explicitly set categoryId
        sizeId: design.sizeId,
        colorId: design.colorId,
      }));
    } else {
      // Fetch regular products if not Community category
      if (!storeId) {
        // Store ID is required for non-community categories
        return new NextResponse("Store ID is required for this category", {
          status: 400,
        });
      }
      const products = await prismadb.product.findMany({
        where: {
          storeId: storeId,
          categoryId, // Filter by the provided categoryId
          colorId,
          sizeId,
          isFeatured: isFeatured ? true : undefined,
          savedDesignId: null, // <-- Add this line to exclude generated products
          isArchived: false,
        },
        include: {
          images: true,
          category: true,
          size: true,
          color: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      results = products.map((product) => ({
        ...product,
        price: parseFloat(product.price.toString()),
      }));
    }

    return NextResponse.json(results);
  } catch (error) {
    console.log("[PRODUCTS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
