import prismadb from "@/lib/prismadb";
import { format } from "date-fns";

import { MarketplaceProductClient } from "./components/client"; // We will create this next
import { MarketplaceProductColumn } from "./components/columns"; // We will create this next
import { formatter } from "@/lib/utils";

const MarketplaceProductsPage = async ({
  params,
}: {
  params: { storeId: string };
}) => {
  // Fetch the data server-side initially to pass to the client component
  // This uses the same logic as the API route for consistency,
  // but could potentially be simplified if client-side fetching is preferred.

  // --- Fetch ALL available sizes ---
  const allSizes = await prismadb.size.findMany({
    orderBy: { name: "asc" }, // Optional: Order sizes for consistency
  });

  const marketplaceProducts = await prismadb.product.findMany({
    where: {
      storeId: params.storeId,
      savedDesignId: {
        not: null,
      },
      isArchived: false,
    },
    include: {
      savedDesign: {
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      },
      category: true, // Include category
      // size: true, // No longer need the single size here
      color: true, // Include color
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const formattedProducts: MarketplaceProductColumn[] = marketplaceProducts.map(
    (item) => ({
      id: item.id,
      name: item.name,
      price: formatter.format(parseFloat(item.price.toString())), // Use shared formatter
      category: item.category.name,
      // size: item.size.name, // Remove old single size
      availableSizes: allSizes, // Add the list of all available sizes
      color: item.color.value, // Use color value for display (e.g., background swatch)
      createdAt: format(item.createdAt, "MMMM do, yyyy"),
      // Flatten relevant savedDesign details
      designId: item.savedDesignId ?? "N/A",
      creatorName: item.savedDesign?.user?.name ?? "N/A",
      isShared: item.savedDesign?.isShared ?? false,
    })
  );

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <MarketplaceProductClient data={formattedProducts} />
      </div>
    </div>
  );
};

export default MarketplaceProductsPage;
