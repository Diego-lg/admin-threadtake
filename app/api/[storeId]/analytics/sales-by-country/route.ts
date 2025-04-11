import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import prismadb from "@/lib/prismadb";
import { authOptions } from "@/lib/auth";
import { OrderItem, Product } from "@prisma/client"; // Import specific types

// Define the structure of the data returned
interface SalesByCountryData {
  country: string; // Country name or code (best guess)
  totalSalesValue: number;
  orderCount: number;
}

// Basic Country Parsing Logic (Example - very rudimentary)
// A more robust solution would involve a dedicated library or geocoding API.
function guessCountryFromAddress(address: string): string | null {
  if (!address || typeof address !== "string") return null; // Basic validation
  const lowerAddress = address.toLowerCase();
  // Split by comma or newline, take the last non-empty part
  const parts = lowerAddress
    .split(/,|\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const lastPart = parts[parts.length - 1];

  // Simple checks for common countries (expand as needed)
  if (
    lastPart === "usa" ||
    lastPart === "united states" ||
    /\b\d{5}(-\d{4})?\b/.test(lastPart)
  )
    return "USA"; // Assuming zip code implies USA
  if (lastPart === "canada" || /\b[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b/i.test(lastPart))
    return "Canada"; // Assuming postal code implies Canada
  if (lastPart === "uk" || lastPart === "united kingdom")
    return "United Kingdom";
  if (lastPart === "australia") return "Australia";
  if (lastPart === "germany") return "Germany";
  if (lastPart === "france") return "France";
  // ... add more common countries

  // If it looks like a number (maybe postcode without country), ignore
  if (/^\d+$/.test(lastPart)) return null;
  // If it's very short, likely not a country name
  if (lastPart.length <= 3 && !["uk"].includes(lastPart)) return null; // Allow 'UK' but not 'NY' etc.

  // Return the capitalized last part as a best guess
  return lastPart
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function GET(
  req: Request,
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

    const storeByUserId = await prismadb.store.findFirst({
      where: { id: params.storeId, userId: userId },
    });
    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Fetch all paid orders with address and items/products for the store
    const paidOrders = await prismadb.order.findMany({
      where: {
        storeId: params.storeId,
        isPaid: true,
        address: { not: "" }, // Ensure address is not empty string
      },
      include: {
        orderItems: {
          // Correctly include OrderItems
          include: {
            product: true, // Include the related Product
          },
        },
      }, // Close the main include block correctly
    });

    // Aggregate sales data by guessed country
    const salesByCountryMap = new Map<
      string,
      { totalSalesValue: number; orderCount: number }
    >();

    for (const order of paidOrders) {
      const countryGuess = guessCountryFromAddress(order.address);

      if (countryGuess) {
        // Only process if we have a country guess
        // Define type for item within reduce, using imported types
        type OrderItemWithProduct = OrderItem & { product: Product };
        const orderValue = order.orderItems.reduce(
          (sum: number, item: OrderItemWithProduct) => {
            return sum + parseFloat(item.product.price.toString());
          },
          0
        );

        if (!salesByCountryMap.has(countryGuess)) {
          salesByCountryMap.set(countryGuess, {
            totalSalesValue: 0,
            orderCount: 0,
          });
        }

        const currentData = salesByCountryMap.get(countryGuess)!;
        currentData.totalSalesValue += orderValue;
        currentData.orderCount += 1;
      }
    }

    // Convert map to array format
    const result: SalesByCountryData[] = Array.from(
      salesByCountryMap.entries()
    ).map(([country, data]) => ({
      country,
      ...data,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("[SALES_BY_COUNTRY_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
