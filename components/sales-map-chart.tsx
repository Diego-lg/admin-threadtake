"use client";

import { useState, useEffect, memo } from "react";
import axios from "axios";
import { useParams } from "next/navigation";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";
import { scaleLinear } from "d3-scale"; // For color scaling
import { Tooltip as ReactTooltip } from "react-tooltip"; // Import the tooltip component
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatter } from "@/lib/utils";

// Define the structure of the data fetched from the API
interface SalesByCountryData {
  country: string; // Guessed country name
  totalSalesValue: number;
  orderCount: number;
}

// URL to fetch world map TopoJSON data
const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Define props for the component
interface SalesMapChartProps {
  // Add any necessary props, e.g., date range filter if implemented
}

// Memoize the Geography component to prevent unnecessary re-renders during map interactions
const MemoizedGeography = memo(Geography);

export const SalesMapChart: React.FC<SalesMapChartProps> = ({}) => {
  const params = useParams();
  const [data, setData] = useState<SalesByCountryData[]>([]);
  const [tooltipContent, setTooltipContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await axios.get(
          `/api/${params.storeId}/analytics/sales-by-country`
        );
        setData(response.data);
      } catch (err) {
        console.error("Failed to fetch sales by country data:", err);
        setError("Could not load sales map data.");
      } finally {
        setLoading(false);
      }
    };

    if (params.storeId) {
      fetchData();
    }
  }, [params.storeId]);

  // Find min/max sales value for color scaling
  const salesValues = data.map((d) => d.totalSalesValue);
  const minSales = Math.min(0, ...salesValues); // Ensure scale starts at 0 or lowest value
  const maxSales = Math.max(...salesValues);

  // Define color scale (adjust colors as needed)
  // Using a simple linear scale from light blue to dark blue
  const colorScale = scaleLinear<string>()
    .domain([minSales, maxSales > 0 ? maxSales : 1]) // Avoid division by zero if maxSales is 0
    .range(["#e0f2fe", "#075985"]); // Light sky blue to dark cyan

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sales by Country</CardTitle>
        </CardHeader>
        <CardContent className="h-[400px] flex items-center justify-center">
          <p>Loading map data...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sales by Country</CardTitle>
        </CardHeader>
        <CardContent className="h-[400px] flex items-center justify-center">
          <p className="text-red-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales by Country</CardTitle>
        {/* Optional: Add description or filters */}
      </CardHeader>
      <CardContent className="h-[400px] p-0 overflow-hidden">
        {" "}
        {/* Adjust height, remove padding */}
        {/* Tooltip component setup */}
        <ReactTooltip id="sales-map-tooltip" />
        <ComposableMap
          data-tooltip-id="sales-map-tooltip" // Link map to the tooltip
          projectionConfig={{ rotate: [-10, 0, 0], scale: 147 }} // Adjust projection as needed
          style={{ width: "100%", height: "100%" }}
        >
          {/* Optional: Add zoom/pan functionality */}
          {/* <ZoomableGroup center={[0, 0]} zoom={1}> */}
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => {
                // Find sales data for the current country
                // Note: Matching geo.properties.name with our guessed country name might be imperfect!
                const countryData = data.find(
                  (s) =>
                    s.country.toLowerCase() ===
                    geo.properties.name.toLowerCase()
                );
                const salesValue = countryData?.totalSalesValue ?? 0;
                const orderCount = countryData?.orderCount ?? 0;

                return (
                  <MemoizedGeography
                    key={geo.rsmKey}
                    geography={geo}
                    // Set tooltip content on hover
                    onMouseEnter={() => {
                      const { name } = geo.properties;
                      setTooltipContent(
                        countryData
                          ? `${name}: ${formatter.format(
                              salesValue
                            )} (${orderCount} orders)`
                          : `${name}: No sales data`
                      );
                    }}
                    onMouseLeave={() => {
                      setTooltipContent("");
                    }}
                    // Apply fill color based on sales value
                    fill={countryData ? colorScale(salesValue) : "#F5F5F5"} // Default fill for no data
                    stroke="#D1D5DB" // Country borders
                    style={{
                      default: { outline: "none" },
                      hover: { fill: "#fbbf24", outline: "none" }, // Highlight color on hover (amber)
                      pressed: { outline: "none" },
                    }}
                    // Pass tooltip content via data attribute
                    data-tooltip-content={tooltipContent}
                  />
                );
              })
            }
          </Geographies>
          {/* </ZoomableGroup> */}
        </ComposableMap>
      </CardContent>
    </Card>
  );
};
