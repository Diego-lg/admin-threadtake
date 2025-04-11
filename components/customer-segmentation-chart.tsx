"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useParams } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList, // To display counts on bars
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Define the structure of the data fetched from the API
interface SegmentationResult {
  segment: string;
  customerCount: number;
}

// Define props for the component
interface CustomerSegmentationChartProps {
  // Add any necessary props, e.g., date range filter if implemented
}

export const CustomerSegmentationChart: React.FC<
  CustomerSegmentationChartProps
> = ({}) => {
  const params = useParams();
  const [data, setData] = useState<SegmentationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await axios.get(
          `/api/${params.storeId}/analytics/customer-segmentation`
        );
        setData(response.data);
      } catch (err) {
        console.error("Failed to fetch customer segmentation data:", err);
        setError("Could not load customer segmentation data.");
      } finally {
        setLoading(false);
      }
    };

    if (params.storeId) {
      fetchData();
    }
  }, [params.storeId]);

  // Custom Tooltip Content
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 p-2 border border-gray-300 dark:border-gray-700 rounded shadow-md text-sm">
          <p className="font-semibold">{label}</p>
          <p>Customers: {payload[0].value}</p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Customer Segments</CardTitle>
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
          <CardTitle>Customer Segments</CardTitle>
        </CardHeader>
        <CardContent className="h-[350px] flex items-center justify-center">
          <p className="text-red-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Customer Segments</CardTitle>
        </CardHeader>
        <CardContent className="h-[350px] flex items-center justify-center">
          <p>No customer data available for segmentation.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer Segments (by RFM)</CardTitle>
        {/* Optional: Add description or filters here */}
      </CardHeader>
      <CardContent className="h-[350px]">
        {" "}
        {/* Adjust height as needed */}
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical" // Use vertical layout for better label readability
            margin={{
              top: 5,
              right: 30,
              left: 50, // Increase left margin for segment labels
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />{" "}
            {/* Only vertical grid lines */}
            <XAxis type="number" hide />{" "}
            {/* Hide X axis, show values on bars */}
            <YAxis
              type="category"
              dataKey="segment"
              axisLine={false}
              tickLine={false}
              width={100} // Adjust width for labels
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: "transparent" }}
              content={<CustomTooltip />}
            />
            <Bar dataKey="customerCount" fill="#8884d8" barSize={30}>
              {/* Display count labels on bars */}
              <LabelList
                dataKey="customerCount"
                position="right"
                style={{ fill: "#fff", fontSize: 12 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
