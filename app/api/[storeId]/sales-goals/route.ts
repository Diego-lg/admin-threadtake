import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { MetricType, TimePeriod } from "@prisma/client"; // Import enums

import prismadb from "@/lib/prismadb";
import { authOptions } from "@/lib/auth";

// Define the expected shape of the request body for creating/updating goals
interface SalesGoalPostBody {
  metricType: MetricType;
  targetValue: number;
  timePeriod: TimePeriod;
  // Optional: goalId if updating an existing goal
  goalId?: string;
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const { storeId } = params;
    const body = (await req.json()) as SalesGoalPostBody;

    const { metricType, targetValue, timePeriod, goalId } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    if (!storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    // Validate required fields
    if (!metricType || !targetValue || !timePeriod) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    // Validate enum values (basic check)
    if (!Object.values(MetricType).includes(metricType)) {
      return new NextResponse("Invalid metricType", { status: 400 });
    }
    if (!Object.values(TimePeriod).includes(timePeriod)) {
      return new NextResponse("Invalid timePeriod", { status: 400 });
    }
    if (targetValue <= 0) {
      return new NextResponse("targetValue must be positive", { status: 400 });
    }

    // Verify user owns the store
    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: storeId,
        userId: userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    let salesGoal;

    if (goalId) {
      // Update existing goal
      salesGoal = await prismadb.salesGoal.update({
        where: {
          id: goalId,
          storeId: storeId, // Ensure the goal belongs to the correct store
        },
        data: {
          metricType,
          targetValue,
          timePeriod,
        },
      });
    } else {
      // Create new goal
      // Optional: Consider logic to prevent duplicate goals (e.g., only one monthly revenue goal per store)
      salesGoal = await prismadb.salesGoal.create({
        data: {
          storeId,
          metricType,
          targetValue,
          timePeriod,
        },
      });
    }

    return NextResponse.json(salesGoal);
  } catch (error) {
    console.error("[SALES_GOALS_POST]", error);
    if (error instanceof SyntaxError) {
      return new NextResponse("Invalid JSON body", { status: 400 });
    }
    // Handle potential Prisma errors (e.g., unique constraint violation if implemented)
    return new NextResponse("Internal error", { status: 500 });
  }
}

// --- GET Handler to fetch goals and their progress ---

// Helper function to get date range for a given period
const getDateRange = (
  period: TimePeriod
): { startDate: Date; endDate: Date } => {
  const now = new Date();
  let startDate = new Date(now);
  let endDate = new Date(now);

  switch (period) {
    case TimePeriod.DAILY:
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case TimePeriod.WEEKLY:
      const dayOfWeek = now.getDay(); // 0 (Sun) - 6 (Sat)
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust to Monday as start
      startDate = new Date(now.setDate(diff));
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    case TimePeriod.MONTHLY:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Last day of current month
      endDate.setHours(23, 59, 59, 999);
      break;
  }
  return { startDate, endDate };
};

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const { storeId } = params;
    // Optional: Allow filtering by period via query param? e.g., ?period=MONTHLY
    // const { searchParams } = new URL(req.url);
    // const filterPeriod = searchParams.get("period") as TimePeriod | null;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    if (!storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    // Verify user owns the store (important for security)
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: storeId, userId: userId },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Fetch all goals for the store
    const goals = await prismadb.salesGoal.findMany({
      where: {
        storeId: storeId,
        // Add period filter if implemented:
        // timePeriod: filterPeriod ?? undefined,
      },
      orderBy: {
        // Optional: Order by period or creation date
        timePeriod: "asc",
      },
    });

    // Calculate progress for each goal
    const goalsWithProgress = await Promise.all(
      goals.map(async (goal) => {
        const { startDate, endDate } = getDateRange(goal.timePeriod);
        let currentProgress = 0;

        if (goal.metricType === MetricType.REVENUE) {
          // Calculate total revenue from paid orders within the date range
          // --- Alternative: Summing OrderItem prices (less efficient in aggregate) ---
          const ordersInPeriod = await prismadb.order.findMany({
            where: {
              storeId: storeId,
              isPaid: true,
              createdAt: { gte: startDate, lte: endDate },
            },
            include: {
              orderItems: { include: { product: true } },
            },
          });
          currentProgress = ordersInPeriod.reduce((sum, order) => {
            return (
              sum +
              order.orderItems.reduce((itemSum, item) => {
                return itemSum + parseFloat(item.product.price.toString());
              }, 0)
            );
          }, 0);
        } else if (goal.metricType === MetricType.UNITS_SOLD) {
          // Calculate total number of items sold from paid orders within the date range
          const result = await prismadb.orderItem.count({
            where: {
              order: {
                storeId: storeId,
                isPaid: true,
                createdAt: {
                  gte: startDate,
                  lte: endDate,
                },
              },
            },
          });
          currentProgress = result;
        }

        return {
          ...goal,
          currentProgress,
          startDate, // Include dates for context on frontend
          endDate,
        };
      })
    );

    return NextResponse.json(goalsWithProgress);
  } catch (error) {
    console.error("[SALES_GOALS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
