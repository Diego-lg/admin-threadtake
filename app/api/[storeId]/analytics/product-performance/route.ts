import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import prismadb from "@/lib/prismadb";
import { authOptions } from "@/lib/auth";

// Define the structure of the data returned for each product
interface ProductPerformanceData {
  id: string;
  name: string;
  totalRevenue: number;
  totalUnitsSold: number;
}

export async function GET(
  req: Request, // req is required even if not used directly
  { params }: { params: { storeId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    if (!params.storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    // Verify user owns the store
    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: params.storeId,
        userId: userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Aggregate sales data per product
    // Find all paid orders for the store
    const paidOrders = await prismadb.order.findMany({
      where: {
        storeId: params.storeId,
        isPaid: true,
      },
      include: {
        orderItems: {
          include: {
            product: true, // Include product details like name and price
          },
        },
      },
    });

    // Process the orders to aggregate data per product
    const productPerformanceMap = new Map<
      string,
      { name: string; totalRevenue: number; totalUnitsSold: number }
    >();

    for (const order of paidOrders) {
      for (const item of order.orderItems) {
        const productId = item.productId;
        const productPrice = parseFloat(item.product.price.toString()); // Convert Decimal to number

        if (!productPerformanceMap.has(productId)) {
          productPerformanceMap.set(productId, {
            name: item.product.name,
            totalRevenue: 0,
            totalUnitsSold: 0,
          });
        }

        const currentProduct = productPerformanceMap.get(productId)!; // Assert non-null as we just set it if needed
        currentProduct.totalRevenue += productPrice;
        currentProduct.totalUnitsSold += 1; // Assuming each OrderItem represents one unit sold
      }
    }

    // Convert map to array format expected by the frontend chart
    const performanceData: ProductPerformanceData[] = Array.from(
      productPerformanceMap.entries()
    ).map(([id, data]) => ({
      id,
      ...data,
    }));

    return NextResponse.json(performanceData);
  } catch (error) {
    console.error("[PRODUCT_PERFORMANCE_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
