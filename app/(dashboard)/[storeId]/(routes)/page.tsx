import { getTotalRevenue } from "@/actions/get-total-revenue";
import { getSalesCount } from "@/actions/get-sales-count";
import { getStockCount } from "@/actions/get-stock-count";
import { getGraphRevenue } from "@/actions/get-graph-revenue";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatter } from "@/lib/utils";
import { Overview } from "@/components/overview";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  ShoppingCart,
  Package,
  Users,
  Image as ImageIcon, // Use alias for Image icon
} from "lucide-react";
import Link from "next/link";
import prismadb from "@/lib/prismadb"; // Import prismadb
import { Product, Image as PrismaImage } from "@prisma/client"; // Import Prisma types
import Image from "next/image"; // Import Next Image for optimized images

// Interface for combined product data including sales
interface ProductWithSales extends Product {
  images: PrismaImage[]; // Ensure images are included
  totalUnitsSold: number;
}

// Interface for the performance API response item
interface ProductPerformanceData {
  id: string;
  name: string; // Name is available here too, but we'll use the one from Product fetch
  totalRevenue: number;
  totalUnitsSold: number;
}

interface DashboardPageProps {
  params: { storeId: string };
}

const DashboardPage: React.FC<DashboardPageProps> = async ({ params }) => {
  const storeId = params.storeId;

  // --- Fetch Core Metrics ---
  const totalRevenue = await getTotalRevenue(storeId);
  const salesCount = await getSalesCount(storeId);
  const stockCount = await getStockCount(storeId); // Note: This is total stock, not per product
  const graphRevenue = await getGraphRevenue(storeId);
  const customerCount = 0; // Placeholder - Requires new action get-customer-count

  // --- Fetch Top Products Data ---
  let topProducts: ProductWithSales[] = [];
  try {
    // 1. Fetch all non-archived products with images
    const products = await prismadb.product.findMany({
      where: {
        storeId: storeId,
        isArchived: false,
      },
      include: {
        images: true, // Include images
      },
    });

    // 2. Fetch performance data (units sold)
    // Construct the absolute URL for the API endpoint
    // Note: This assumes the app is running on localhost:3000 during development
    // In production, use the actual deployed URL (e.g., from an environment variable)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"; // Ensure this env var is set
    const performanceApiUrl = `${baseUrl}/api/${storeId}/analytics/product-performance`;

    const performanceRes = await fetch(performanceApiUrl, {
      cache: "no-store",
    }); // Fetch fresh data
    if (!performanceRes.ok) {
      console.error(
        `Failed to fetch product performance: ${performanceRes.statusText}`
      );
      // Handle error - maybe show fewer products or a message
    } else {
      const performanceData: ProductPerformanceData[] =
        await performanceRes.json();

      // 3. Combine data
      const performanceMap = new Map(
        performanceData.map((p) => [p.id, p.totalUnitsSold])
      );

      const combinedProducts = products.map((product) => ({
        ...product,
        totalUnitsSold: performanceMap.get(product.id) || 0, // Get units sold, default to 0
      }));

      // 4. Sort and Slice
      combinedProducts.sort((a, b) => b.totalUnitsSold - a.totalUnitsSold); // Sort descending
      topProducts = combinedProducts.slice(0, 4); // Get top 4
    }
  } catch (error) {
    console.error("Error fetching top products data:", error);
    // Handle error state if necessary
  }
  // --- End Fetch Top Products ---

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">
        {/* Welcome Header */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Welcome back, Admin!
          </h2>
          <p className="text-muted-foreground">
            Here's what's happening with your store today.
          </p>
        </div>

        <Separator />

        {/* Summary Cards Grid */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          {/* Total Revenue Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Revenue
              </CardTitle>
              <DollarSign className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatter.format(totalRevenue)}
              </div>
            </CardContent>
          </Card>

          {/* Orders Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Orders</CardTitle>
              <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+{salesCount}</div>
            </CardContent>
          </Card>

          {/* Products Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Products</CardTitle>
              <Package className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stockCount}</div>
            </CardContent>
          </Card>

          {/* Customers Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Customers</CardTitle>
              <Users className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{customerCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid (Sales Overview + Top Products) */}
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
          {/* Sales Overview Chart */}
          <Card className="lg:col-span-4">
            <CardHeader>
              <div className="flex flex-row items-center justify-between space-y-0">
                <CardTitle>Sales Overview</CardTitle>
                <Button variant="outline" size="sm">
                  Last 7 days
                </Button>
              </div>
              <p className="text-sm text-muted-foreground pt-2">
                Track your sales performance over time
              </p>
            </CardHeader>
            <CardContent className="pl-2">
              <Overview data={graphRevenue} />
            </CardContent>
          </Card>

          {/* Top Products List */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <div className="flex flex-row items-center justify-between space-y-0">
                <CardTitle>Top Products</CardTitle>
                {/* Link to the actual products page */}
                <Link
                  href={`/${storeId}/products`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View inventory
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topProducts.length > 0 ? (
                  topProducts.map((product) => (
                    <div key={product.id} className="flex items-center gap-4">
                      <div className="bg-muted rounded-md h-16 w-16 flex items-center justify-center relative overflow-hidden">
                        {product.images && product.images.length > 0 ? (
                          <Image
                            src={product.images[0].url}
                            alt={product.name}
                            fill // Use fill for responsive images within the container
                            style={{ objectFit: "cover" }} // Ensure image covers the area
                            sizes="(max-width: 768px) 10vw, (max-width: 1200px) 5vw, 3vw" // Provide sizes hint
                          />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-muted-foreground" /> // Placeholder icon
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium leading-none truncate">
                          {" "}
                          {/* Added truncate */}
                          {product.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatter.format(
                            parseFloat(product.price.toString())
                          )}{" "}
                          {/* Format price */}
                        </p>
                      </div>
                      <div className="text-right">
                        {/* Removed status badge and progress bar as stock data is unavailable */}
                        <p className="text-sm font-semibold">
                          {product.totalUnitsSold} sold
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No product sales data available.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
