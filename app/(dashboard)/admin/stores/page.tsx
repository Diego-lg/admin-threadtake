import { format } from "date-fns";

import prismadb from "@/lib/prismadb";
import { StoreClient } from "./components/client";

const StoresPage = async () => {
  const stores = await prismadb.store.findMany({
    orderBy: {
      createdAt: "desc",
    },
    include: {
      _count: {
        select: {
          products: true,
          orders: true,
          categories: true,
          billboards: true,
        },
      },
    },
  });

  const formattedStores = stores.map((store) => ({
    id: store.id,
    name: store.name,
    userId: store.userId,
    userName: "N/A",
    userEmail: "N/A",
    createdAt: format(store.createdAt, "MMMM do, yyyy"),
    updatedAt: format(store.updatedAt, "MMMM do, yyyy"),
    productCount: store._count?.products ?? 0,
    orderCount: store._count?.orders ?? 0,
    categoryCount: store._count?.categories ?? 0,
    billboardCount: store._count?.billboards ?? 0,
  }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <StoreClient data={formattedStores} />
      </div>
    </div>
  );
};

export default StoresPage;
