import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth"; // Updated import path
import prismadb from "@/lib/prismadb";

// GET /api/orders - Get order history for the logged-in user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    const orders = await prismadb.order.findMany({
      where: {
        userId: userId, // Filter orders by the logged-in user
        isPaid: true, // Optionally, only show paid orders in history
      },
      include: {
        // Include details needed for the order history page
        orderItems: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                images: { take: 1, select: { url: true } }, // Get one image URL
              },
            },
          },
        },
        // You could include store details if needed, though maybe less relevant for user history
        // store: {
        //   select: { id: true, name: true }
        // }
      },
      orderBy: {
        createdAt: "desc", // Show most recent orders first
      },
    });

    // Optional: Calculate total price for each order if not stored directly
    const ordersWithTotals = orders.map((order) => {
      const total = order.orderItems.reduce((sum, item) => {
        // Ensure product price is treated as a number
        const price = Number(item.product.price) || 0;
        return sum + price; // Assuming quantity is 1 per OrderItem for simplicity
        // Adjust if OrderItem includes quantity
      }, 0);
      return { ...order, total };
    });

    return NextResponse.json(ordersWithTotals);
  } catch (error) {
    console.error("[ORDERS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
