import { NextResponse } from "next/server";
import {
  getPrintfulShippingRates,
  convertToStripeShippingOptions,
} from "@/lib/printful";

export async function POST(req: Request) {
  try {
    const { country, state, city, zip, items } = await req.json();

    if (!country || !items || items.length === 0) {
      return new NextResponse("Country and items are required", {
        status: 400,
      });
    }

    // Prepare recipient address for Printful
    const recipient = {
      country,
      state,
      city,
      zip,
    };

    // Prepare items for Printful (using variant IDs)
    const printfulItems = items.map(
      (item: { variantId: number; quantity: number }) => ({
        variant_id: item.variantId || 8852, // Default to t-shirt variant
        quantity: item.quantity || 1,
      }),
    );

    // Get shipping rates from Printful
    const printfulRates = await getPrintfulShippingRates(
      recipient,
      printfulItems,
    );

    // Convert to Stripe shipping options format
    const stripeShippingOptions = convertToStripeShippingOptions(printfulRates);

    return NextResponse.json({
      shippingOptions: stripeShippingOptions,
    });
  } catch (error) {
    console.error("Error fetching shipping rates:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
