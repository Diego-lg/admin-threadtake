import { format } from "date-fns";
import prismadb from "@/lib/prismadb";
import { ProductOptionsClient } from "./components/product-options-client";
import { ColorColumn } from "../colors/components/columns";
import { SizeColumn } from "../sizes/components/columns";

interface ProductOptionsPageProps {
  params: Promise<{ storeId: string }>;
}

const ProductOptionsPage = async ({ params }: ProductOptionsPageProps) => {
  const { storeId } = await params;

  // Fetch colors and sizes data
  const [colors, sizes] = await Promise.all([
    prismadb.color.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    }),
    prismadb.size.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Format data for the client components
  const formattedColors: ColorColumn[] = colors.map((item) => ({
    id: item.id,
    name: item.name,
    value: item.value,
    createdAt: format(item.createdAt, "MMMM do, yyyy"),
  }));

  const formattedSizes: SizeColumn[] = sizes.map((item) => ({
    id: item.id,
    name: item.name,
    value: item.value,
    createdAt: format(item.createdAt, "MMMM do, yyyy"),
  }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <ProductOptionsClient colors={formattedColors} sizes={formattedSizes} />
      </div>
    </div>
  );
};

export default ProductOptionsPage;
