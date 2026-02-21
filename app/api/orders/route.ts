import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prismadb from "@/lib/prismadb";

// GET /api/orders - Get order history for the logged-in user
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      // Add CORS header for unauthenticated response
      return new NextResponse("Unauthenticated", {
        status: 401,
        headers: {
          "Access-Control-Allow-Origin": "https://www.threadtake.com", // Or use '*' for testing, but be specific in production
          "Access-Control-Allow-Credentials": "true", // If you need credentials
        },
      });
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

    // Add CORS header for successful response
    const response = NextResponse.json(ordersWithTotals);
    response.headers.set(
      "Access-Control-Allow-Origin",
      "https://www.threadtake.com",
    ); // Or '*' for testing
    response.headers.set("Access-Control-Allow-Credentials", "true");
    return response;
  } catch (error) {
    console.error("[ORDERS_GET]", error);
    // Add CORS header for error response
    return new NextResponse("Internal Error", {
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "https://www.threadtake.com", // Or '*' for testing
        "Access-Control-Allow-Credentials": "true",
      },
    });
  }
}
