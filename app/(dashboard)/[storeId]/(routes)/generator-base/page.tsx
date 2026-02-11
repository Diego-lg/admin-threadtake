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
      error,
    );
    // Handle error appropriately, maybe show a message on the page
  }

  // Fetch categories needed for the form dropdowns
  const categories = await prismadb.category.findMany({
    where: {
      storeId: params.storeId,
    },
  });

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <GeneratorBaseForm categories={categories} initialData={product} />
      </div>
    </div>
  );
};

export default GeneratorBasePage;
