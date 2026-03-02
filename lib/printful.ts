import Stripe from "stripe";

const PRINTFUL_API_KEY = process.env.PRINTFUL_API_KEY;
const PRINTFUL_STORE_ID = process.env.PRINTFUL_STORE_ID;

// Printful variant ID for the t-shirt product (from your config)
const DEFAULT_VARIANT_ID = 8852; // Size L t-shirt

interface PrintfulRecipient {
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
}

interface PrintfulItem {
  variant_id: number;
  quantity: number;
  external_id?: string;
}

interface PrintfulShippingRate {
  id: string;
  name: string;
  price: number;
  currency: string;
  estimated_days?: string;
}

interface PrintfulShippingResponse {
  result: {
    shipping_rates: PrintfulShippingRate[];
  };
}

/**
 * Get shipping rates from Printful API
 * https://www.printful.com/docs/shipping
 */
export async function getPrintfulShippingRates(
  recipient: PrintfulRecipient,
  items: PrintfulItem[],
): Promise<PrintfulShippingRate[]> {
  if (!PRINTFUL_API_KEY) {
    console.error("PRINTFUL_API_KEY is not configured");
    return getDefaultShippingRates();
  }

  try {
    const response = await fetch("https://api.printful.com/shipping/rates", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PRINTFUL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient,
        items,
      }),
    });

    if (!response.ok) {
      console.error("Printful API error:", await response.text());
      return getDefaultShippingRates();
    }

    const data: PrintfulShippingResponse = await response.json();

    if (data.result && data.result.shipping_rates) {
      return data.result.shipping_rates;
    }

    return getDefaultShippingRates();
  } catch (error) {
    console.error("Error fetching Printful shipping rates:", error);
    return getDefaultShippingRates();
  }
}

/**
 * Default shipping rates fallback if Printful API fails
 */
export function getDefaultShippingRates(): PrintfulShippingRate[] {
  return [
    {
      id: "standard",
      name: "Standard Shipping",
      price: 5.99,
      currency: "USD",
      estimated_days: "7-14 business days",
    },
    {
      id: "express",
      name: "Express Shipping",
      price: 12.99,
      currency: "USD",
      estimated_days: "3-5 business days",
    },
  ];
}

/**
 * Convert Printful shipping rates to Stripe shipping options
 */
export function convertToStripeShippingOptions(
  printfulRates: PrintfulShippingRate[],
): Stripe.Checkout.SessionCreateParams.ShippingOption[] {
  return printfulRates.map((rate) => ({
    shipping_rate_data: {
      type: "fixed_amount" as const,
      fixed_amount: {
        amount: Math.round(rate.price * 100), // Convert to cents
        currency: rate.currency.toLowerCase(),
      },
      display_name: rate.name,
      delivery_estimate: rate.estimated_days
        ? {
            minimum: {
              unit: "business_day" as const,
              value: parseEstimatedDays(rate.estimated_days).min,
            },
            maximum: {
              unit: "business_day" as const,
              value: parseEstimatedDays(rate.estimated_days).max,
            },
          }
        : undefined,
    },
  }));
}

/**
 * Parse estimated days string like "7-14 business days" to min/max values
 */
function parseEstimatedDays(estimate: string): { min: number; max: number } {
  const match = estimate.match(/(\d+)-(\d+)/);
  if (match) {
    return {
      min: parseInt(match[1], 10),
      max: parseInt(match[2], 10),
    };
  }
  // Default fallback
  const singleMatch = estimate.match(/(\d+)/);
  if (singleMatch) {
    const value = parseInt(singleMatch[1], 10);
    return { min: value, max: value + 3 };
  }
  return { min: 7, max: 14 };
}

/**
 * Get variant ID from product - you may need to customize this
 * based on how you store product-to-printful variant mappings
 */
export function getPrintfulVariantId(productVariantId?: string): number {
  // For now, use default variant. In production, you'd map your
  // product variants to Printful variant IDs
  return DEFAULT_VARIANT_ID;
}
