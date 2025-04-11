import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prismadb from "@/lib/prismadb";
import { authOptions } from "@/lib/auth";
import { Order, OrderItem, Product, User } from "@prisma/client";

// Define the structure for RFM data per customer
interface CustomerRfmData {
  userId: string;
  lastPurchaseDate: Date;
  totalOrders: number;
  totalSpent: number;
  recencyScore?: number;
  frequencyScore?: number;
  monetaryScore?: number;
  segment?: string;
}

// Define the structure for the final aggregated result
interface SegmentationResult {
  segment: string;
  customerCount: number;
  // Optional: Add average metrics per segment later
  // avgLtv?: number;
  // avgAov?: number;
}

// Helper function to assign scores based on quantiles (simple example)
function assignScores<T>(
  data: T[],
  key: keyof T,
  numQuantiles: number = 5 // e.g., 5 for scores 1-5
): T[] {
  if (data.length === 0) return data;

  const sortedData = [...data].sort(
    (a, b) => (a[key] as number) - (b[key] as number)
  );
  const quantileSize = Math.ceil(data.length / numQuantiles);

  return sortedData.map((item, index) => {
    const score = Math.min(numQuantiles, Math.floor(index / quantileSize) + 1);
    return { ...item, [`${String(key)}Score`]: score };
  });
}

// Helper function to assign recency scores (lower days ago = higher score)
function assignRecencyScores(
  data: CustomerRfmData[],
  numQuantiles: number = 5
): CustomerRfmData[] {
  if (data.length === 0) return data;
  const now = new Date();
  // Calculate days ago
  const dataWithDaysAgo = data.map((item) => ({
    ...item,
    daysAgo: Math.floor(
      (now.getTime() - item.lastPurchaseDate.getTime()) / (1000 * 60 * 60 * 24)
    ),
  }));

  const sortedData = [...dataWithDaysAgo].sort((a, b) => b.daysAgo - a.daysAgo); // Sort descending (more days ago first)
  const quantileSize = Math.ceil(data.length / numQuantiles);

  return sortedData.map((item, index) => {
    const score = Math.min(
      numQuantiles,
      numQuantiles - Math.floor(index / quantileSize)
    ); // Higher score for lower index (fewer days ago)
    return { ...item, recencyScore: score };
  });
}

// Define RFM segments (example)
function getSegment(r: number, f: number, m: number): string {
  if (r >= 4 && f >= 4 && m >= 4) return "Champions";
  if (r >= 3 && f >= 3 && m >= 3) return "Loyal Customers";
  if (r >= 4 && f >= 1 && m >= 1) return "Recent Customers"; // Purchased recently, frequency/monetary vary
  if (r >= 3 && f >= 4 && m >= 4) return "Potential Loyalists"; // High F/M, but not recent enough
  if (r <= 2 && f >= 3 && m >= 3) return "At Risk"; // High F/M, but haven't purchased recently
  if (r <= 2 && f <= 2 && m <= 2) return "Lost"; // Low everything, haven't purchased recently
  if (r <= 3 && f <= 3 && m >= 4) return "High Spenders (Needs Attention)"; // High M, but low R/F
  if (r >= 3 && f <= 3 && m <= 3) return "Low Spenders (Recent)"; // Recent, but low F/M
  return "Other"; // Catch-all for other combinations
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) return new NextResponse("Unauthenticated", { status: 401 });
    if (!params.storeId)
      return new NextResponse("Store ID required", { status: 400 });

    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId: userId },
    });
    if (!storeByUserId)
      return new NextResponse("Unauthorized", { status: 403 });

    // Fetch all paid orders with necessary includes
    type OrderWithIncludes = Order & {
      user: User | null;
      orderItems: (OrderItem & { product: Product })[];
    };

    const paidOrders: OrderWithIncludes[] = await prismadb.order.findMany({
      where: {
        storeId: params.storeId,
        isPaid: true,
        userId: { not: null }, // Only include orders linked to a user
      },
      include: {
        user: true,
        orderItems: { include: { product: true } },
      },
      orderBy: {
        createdAt: "asc", // Process in chronological order
      },
    });

    // Calculate RFM metrics per customer
    const customerDataMap = new Map<string, CustomerRfmData>();

    for (const order of paidOrders) {
      if (!order.userId || !order.user) continue; // Skip if no user attached

      const orderValue = order.orderItems.reduce((sum: number, item) => {
        return sum + parseFloat(item.product.price.toString());
      }, 0);

      const customer = customerDataMap.get(order.userId) || {
        userId: order.userId,
        lastPurchaseDate: order.createdAt,
        totalOrders: 0,
        totalSpent: 0,
      };

      customer.totalOrders += 1;
      customer.totalSpent += orderValue;
      // Update last purchase date if this order is newer
      if (order.createdAt > customer.lastPurchaseDate) {
        customer.lastPurchaseDate = order.createdAt;
      }

      customerDataMap.set(order.userId, customer);
    }

    let customerRfmData = Array.from(customerDataMap.values());

    // Assign scores
    customerRfmData = assignRecencyScores(customerRfmData);
    customerRfmData = assignScores(customerRfmData, "totalOrders"); // Frequency
    customerRfmData = assignScores(customerRfmData, "totalSpent"); // Monetary

    // Assign segments
    customerRfmData = customerRfmData.map((customer) => ({
      ...customer,
      segment: getSegment(
        customer.recencyScore ?? 0,
        customer.frequencyScore ?? 0,
        customer.monetaryScore ?? 0
      ),
    }));

    // Aggregate counts per segment
    const segmentCounts = new Map<string, number>();
    for (const customer of customerRfmData) {
      const segment = customer.segment ?? "Other";
      segmentCounts.set(segment, (segmentCounts.get(segment) || 0) + 1);
    }

    // Format result
    const result: SegmentationResult[] = Array.from(segmentCounts.entries())
      .map(([segment, customerCount]) => ({ segment, customerCount }))
      .sort((a, b) => b.customerCount - a.customerCount); // Sort by count descending

    return NextResponse.json(result);
  } catch (error) {
    console.error("[CUSTOMER_SEGMENTATION_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
