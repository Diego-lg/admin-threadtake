"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useParams } from "next/navigation";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis, // Optional: Use ZAxis to control bubble size based on another metric (e.g., profit margin if available)
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Label,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatter } from "@/lib/utils"; // Assuming currency formatter exists

// Define the structure of the data fetched from the API
interface ProductPerformanceData {
  id: string;
  name: string;
  totalRevenue: number;
  totalUnitsSold: number;
  // Optional: Add profit margin or other metrics if calculated by API
  // profitMargin?: number;
}

// Define props for the component (optional, could fetch based on params)
interface ProductPerformanceChartProps {
  // Add any necessary props, e.g., date range filter if implemented
}

export const ProductPerformanceChart: React.FC<
  ProductPerformanceChartProps
> = ({}) => {
  const params = useParams();
  const [data, setData] = useState<ProductPerformanceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await axios.get(
          `/api/${params.storeId}/analytics/product-performance`
        );
        setData(response.data);
      } catch (err) {
        console.error("Failed to fetch product performance data:", err);
        setError("Could not load product performance data.");
      } finally {
        setLoading(false);
      }
    };

    if (params.storeId) {
      fetchData();
    }
  }, [params.storeId]);

  // Custom Tooltip Content
  // Define a more specific type for the tooltip props
  interface TooltipProps {
    active?: boolean;
    payload?: Array<{
      payload: ProductPerformanceData /* other recharts props */;
    }>;
    label?: string | number;
  }

  const CustomTooltip = ({ active, payload }: TooltipProps) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload as ProductPerformanceData;
      return (
        <div className="bg-white dark:bg-gray-800 p-2 border border-gray-300 dark:border-gray-700 rounded shadow-md text-sm">
          <p className="font-semibold">{dataPoint.name}</p>
          <p>Revenue: {formatter.format(dataPoint.totalRevenue)}</p>
          <p>Units Sold: {dataPoint.totalUnitsSold}</p>
          {/* Optional: Display Z-axis metric if used */}
          {/* {dataPoint.profitMargin && <p>Margin: {dataPoint.profitMargin.toFixed(1)}%</p>} */}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Product Performance Matrix</CardTitle>
        </CardHeader>
        <CardContent className="h-[350px] flex items-center justify-center">
          <p>Loading chart data...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Product Performance Matrix</CardTitle>
        </CardHeader>
        <CardContent className="h-[350px] flex items-center justify-center">
          <p className="text-red-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Product Performance Matrix</CardTitle>
        {/* Optional: Add description or filters here */}
      </CardHeader>
      <CardContent className="pl-2 h-[350px]">
        {" "}
        {/* Adjust height as needed */}
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart
            margin={{
              top: 20,
              right: 20,
              bottom: 20, // Increased bottom margin for label
              left: 20, // Increased left margin for label
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="totalRevenue"
              name="Total Revenue"
              tickFormatter={(value) => formatter.format(value)}
              // label={{ value: "Total Revenue", position: "insideBottom", offset: -15 }} // Add axis label
            >
              <Label
                value="Total Revenue"
                offset={-15}
                position="insideBottom"
              />
            </XAxis>
            <YAxis
              type="number"
              dataKey="totalUnitsSold"
              name="Units Sold"
              // label={{ value: "Units Sold", angle: -90, position: "insideLeft" }} // Add axis label
            >
              <Label
                value="Units Sold"
                angle={-90}
                position="insideLeft"
                style={{ textAnchor: "middle" }}
              />
            </YAxis>
            {/* Optional ZAxis for bubble size */}
            {/* <ZAxis type="number" dataKey="profitMargin" range={[100, 1000]} name="Profit Margin" unit="%" /> */}
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={<CustomTooltip />}
            />
            <Scatter name="Products" data={data} fill="#8884d8" />
          </ScatterChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
