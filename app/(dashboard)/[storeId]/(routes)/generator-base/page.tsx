import prismadb from "@/lib/prismadb";

import { GeneratorBaseForm } from "./components/generator-base-form"; // Assuming this component will be created

const GeneratorBasePage = async ({
  params,
}: {
  params: { storeId: string };
}) => {
  // Fetch the current generator base product using the logic from our dedicated API route
  // We fetch it here on the server-side to pass initial data to the form
  let product = null;
  try {
    product = await prismadb.product.findFirst({
      where: {
        storeId: params.storeId,
        isArchived: false,
        savedDesignId: null,
      },
      include: {
        images: true, // Include images if the form needs them
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  } catch (error) {
    console.error(
      "Failed to fetch initial generator base product for dashboard:",
      error
    );
    // Handle error appropriately, maybe show a message on the page
  }

  // Fetch categories, sizes, and colors needed for the form dropdowns
  const categories = await prismadb.category.findMany({
    where: {
      storeId: params.storeId,
    },
  });

  // Reinstated sizes fetching
  const sizes = await prismadb.size.findMany({
    where: {
      storeId: params.storeId,
    },
  });

  // Reinstated colors fetching
  const colors = await prismadb.color.findMany({
    where: {
      storeId: params.storeId,
    },
  });

  // No need to format price here, the form component handles it in defaultValues
  // const initialData = product
  //   ? {
  //       ...product,
  //       price: parseFloat(product.price.toString()),
  //     }
  //   : null;

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        {/* Pass the raw product data (or null) directly to the form component */}
        <GeneratorBaseForm
          categories={categories}
          colors={colors} // Reinstated colors prop
          sizes={sizes} // Reinstated sizes prop
          initialData={product} // Pass the potentially existing product data (with Decimal price)
        />
      </div>
    </div>
  );
};

export default GeneratorBasePage;
