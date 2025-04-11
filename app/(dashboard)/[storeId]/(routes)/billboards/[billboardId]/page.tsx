import prismadb from "@/lib/prismadb";
import { BillboardForm } from "./components/billboard-form";

// Update interface to match Next.js PageProps requirements
interface BillboardPageProps {
  params: Promise<{ storeId: string; billboardId: string }>;
}

const BillboardPage = async ({ params }: BillboardPageProps) => {
  // Since params is properly typed as a Promise, await is correct
  const paramsData = await params;
  const { billboardId } = paramsData;

  const billboard = await prismadb.billboard.findUnique({
    where: {
      id: billboardId,
    },
  });

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <BillboardForm initialData={billboard} />
      </div>
    </div>
  );
};

export default BillboardPage;
