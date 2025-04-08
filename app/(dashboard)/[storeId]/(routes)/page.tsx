import { getTotalRevenue } from "@/actions/get-total-revenue";
import { getSalesCount } from "@/actions/get-sales-count";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { formatter } from "@/lib/utils";
import { CreditCard, DollarSign, Package } from "lucide-react";
import { getStockCount } from "@/actions/get-stock-count";
import { Overview } from "@/components/overview";
import { getGraphRevenue } from "@/actions/get-graph-revenue";
import { MetricType, TimePeriod } from "@prisma/client"; // Import enums for direct use
import {
  GoalTracker,
  SalesGoalWithProgress,
} from "@/components/ui/goal-tracker";
import { SalesTicker } from "@/components/ui/sales-ticker";
import { ProductPerformanceChart } from "@/components/product-performance-chart";
import { SalesMapChart } from "@/components/sales-map-chart";
import { CustomerSegmentationChart } from "@/components/customer-segmentation-chart"; // Import segmentation chart
import prismadb from "@/lib/prismadb"; // Import prismadb for direct access
// import { getServerSession } from "next-auth"; // Not strictly needed if page is protected by middleware
// import { authOptions } from "@/lib/auth"; // Not strictly needed if page is protected by middleware

// Helper function to get date range (copied from API route)
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

interface DashboardPageProps {
  params: Promise<{ storeId: string }>;
}

const DashboardPage: React.FC<DashboardPageProps> = async ({ params }) => {
  const { storeId } = await params;
  const totalRevenue = await getTotalRevenue(storeId);
  const salesCount = await getSalesCount(storeId);
  const stockCount = await getStockCount(storeId);
  const graphRevenue = await getGraphRevenue(storeId);

  // --- Fetch Sales Goals and Progress Directly ---
  let salesGoals: SalesGoalWithProgress[] = [];
  try {
    // Optional: Add auth check if needed, though page likely already has middleware/redirects
    // const session = await getServerSession(authOptions);
    // if (!session?.user?.id) { throw new Error("Unauthenticated"); }

    const goals = await prismadb.salesGoal.findMany({
      where: { storeId: storeId },
      orderBy: { timePeriod: "asc" },
    });

    salesGoals = await Promise.all(
      goals.map(async (goal) => {
        const { startDate, endDate } = getDateRange(goal.timePeriod);
        let currentProgress = 0;

        if (goal.metricType === MetricType.REVENUE) {
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
          const result = await prismadb.orderItem.count({
            where: {
              order: {
                storeId: storeId,
                isPaid: true,
                createdAt: { gte: startDate, lte: endDate },
              },
            },
          });
          currentProgress = result;
        }

        return {
          ...goal,
          currentProgress,
          startDate,
          endDate,
        };
      })
    );
  } catch (error) {
    console.error("Error fetching sales goals directly:", error);
    // Handle error appropriately, maybe show a message on the dashboard
  }
  // --- End Direct Fetch ---

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <Heading title="Dashboard" description="Overview of your store" />
        <SalesTicker storeId={storeId} /> {/* Add the Sales Ticker */}
        <Separator />
        <div className="grid gap-4 grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {" "}
                Total Revenue
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatter.format(totalRevenue)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CreditCard className="text-sm font-medium"> Sales</CreditCard>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+{salesCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {" "}
                Products In Stock
              </CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stockCount}</div>
            </CardContent>
          </Card>
          {/* Add Product Performance Chart */}
          <ProductPerformanceChart />
        </div>
        {/* Add Goal Trackers Section */}
        {salesGoals.length > 0 && (
          <>
            <Separator />
            <Heading title="Goals" description="Your current sales goals" />
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {salesGoals.map((goal) => (
                <GoalTracker key={goal.id} goal={goal} />
              ))}
            </div>
          </>
        )}
        <Card className="col-span-4">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <Overview data={graphRevenue} />
          </CardContent>
        </Card>
        {/* Add Sales Map Chart */}
        <SalesMapChart />
        {/* Add Customer Segmentation Chart */}
        <CustomerSegmentationChart />
      </div>
    </div>
  );
};

export default DashboardPage;
