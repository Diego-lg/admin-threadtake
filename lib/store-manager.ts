import prismadb from "@/lib/prismadb";

export interface CreateStoreData {
  name: string;
  userId: string;
}

export interface UpdateStoreData {
  name?: string;
}

export interface StoreWithStats {
  id: string;
  name: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  productCount: number;
  orderCount: number;
  revenue: number;
}

/**
 * Create a new store for a user
 */
export async function createStore(data: CreateStoreData) {
  const { name, userId } = data;

  if (!name || !userId) {
    throw new Error("Name and userId are required");
  }

  const store = await prismadb.store.create({
    data: {
      name,
      userId,
    },
  });

  return store;
}

/**
 * Get all stores for a specific user
 */
export async function getUserStores(userId: string) {
  if (!userId) {
    throw new Error("User ID is required");
  }

  const stores = await prismadb.store.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
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

  return stores;
}

/**
 * Get a single store by ID
 */
export async function getStoreById(storeId: string, userId?: string) {
  if (!storeId) {
    throw new Error("Store ID is required");
  }

  const whereClause: any = { id: storeId };
  if (userId) {
    whereClause.userId = userId;
  }

  const store = await prismadb.store.findFirst({
    where: whereClause,
    include: {
      _count: {
        select: {
          products: true,
          orders: true,
          categories: true,
          billboards: true,
          colors: true,
          sizes: true,
        },
      },
    },
  });

  return store;
}

/**
 * Update a store
 */
export async function updateStore(
  storeId: string,
  userId: string,
  data: UpdateStoreData,
) {
  if (!storeId || !userId) {
    throw new Error("Store ID and user ID are required");
  }

  const store = await prismadb.store.updateMany({
    where: {
      id: storeId,
      userId,
    },
    data: {
      name: data.name,
    },
  });

  return store;
}

/**
 * Delete a store and all its related data
 */
export async function deleteStore(storeId: string, userId: string) {
  if (!storeId || !userId) {
    throw new Error("Store ID and user ID are required");
  }

  // Delete in transaction to ensure data consistency
  const result = await prismadb.$transaction(async (tx) => {
    // Delete order items first (cascade should handle this, but being explicit)
    const orders = await tx.order.findMany({
      where: { storeId },
      select: { id: true },
    });

    for (const order of orders) {
      await tx.orderItem.deleteMany({
        where: { orderId: order.id },
      });
    }

    // Delete orders
    await tx.order.deleteMany({
      where: { storeId },
    });

    // Delete products (and their images via cascade)
    const products = await tx.product.findMany({
      where: { storeId },
      select: { id: true },
    });

    for (const product of products) {
      await tx.image.deleteMany({
        where: { productId: product.id },
      });
    }

    await tx.product.deleteMany({
      where: { storeId },
    });

    // Delete categories (and their billboard relations)
    const categories = await tx.category.findMany({
      where: { storeId },
      select: { id: true, billboardId: true },
    });

    for (const category of categories) {
      await tx.category.delete({
        where: { id: category.id },
      });
    }

    // Delete billboards
    await tx.billboard.deleteMany({
      where: { storeId },
    });

    // Delete colors and sizes
    await tx.color.deleteMany({
      where: { storeId },
    });

    await tx.size.deleteMany({
      where: { storeId },
    });

    // Delete sales goals
    await tx.salesGoal.deleteMany({
      where: { storeId },
    });

    // Finally delete the store
    const store = await tx.store.delete({
      where: { id: storeId, userId },
    });

    return store;
  });

  return result;
}

/**
 * Get store statistics
 */
export async function getStoreStats(storeId: string): Promise<StoreWithStats> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }

  const store = await prismadb.store.findUnique({
    where: { id: storeId },
    include: {
      _count: {
        select: {
          products: true,
          orders: true,
        },
      },
    },
  });

  if (!store) {
    throw new Error("Store not found");
  }

  // Calculate revenue from orders
  const orders = await prismadb.order.findMany({
    where: {
      storeId,
      isPaid: true,
    },
    include: {
      orderItems: {
        include: {
          product: true,
        },
      },
    },
  });

  let revenue = 0;
  for (const order of orders) {
    for (const item of order.orderItems) {
      revenue += Number(item.product.price) * 1; // Assuming quantity is 1 for now
    }
  }

  return {
    id: store.id,
    name: store.name,
    userId: store.userId,
    createdAt: store.createdAt,
    updatedAt: store.updatedAt,
    productCount: store._count.products,
    orderCount: store._count.orders,
    revenue,
  };
}

/**
 * Check if user owns a store
 */
export async function isStoreOwner(
  storeId: string,
  userId: string,
): Promise<boolean> {
  if (!storeId || !userId) {
    return false;
  }

  const store = await prismadb.store.findFirst({
    where: {
      id: storeId,
      userId,
    },
    select: { id: true },
  });

  return !!store;
}

/**
 * Get the active store for a user (first store or specified)
 */
export async function getActiveStore(userId: string, storeId?: string) {
  if (!userId) {
    throw new Error("User ID is required");
  }

  if (storeId) {
    // Verify the user owns this store
    const store = await prismadb.store.findFirst({
      where: { id: storeId, userId },
    });
    return store;
  }

  // Return the most recently updated store
  const store = await prismadb.store.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  return store;
}

/**
 * Set a store as active for a user
 */
export async function setActiveStore(userId: string, storeId: string) {
  if (!userId || !storeId) {
    throw new Error("User ID and store ID are required");
  }

  // Verify ownership
  const store = await prismadb.store.findFirst({
    where: { id: storeId, userId },
  });

  if (!store) {
    throw new Error("Store not found or access denied");
  }

  // Return the store - in a real app, you might store this preference
  // in the user session, database, or cookie
  return store;
}

/**
 * Get all stores with pagination (admin only)
 */
export async function getAllStores(
  page: number = 1,
  limit: number = 10,
  search?: string,
) {
  const skip = (page - 1) * limit;

  const whereClause: any = {};
  if (search) {
    whereClause.OR = [{ name: { contains: search, mode: "insensitive" } }];
  }

  const [stores, total] = await Promise.all([
    prismadb.store.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            products: true,
            orders: true,
          },
        },
      },
    }),
    prismadb.store.count({
      where: whereClause,
    }),
  ]);

  return {
    stores,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get store count for a user
 */
export async function getUserStoreCount(userId: string): Promise<number> {
  if (!userId) {
    throw new Error("User ID is required");
  }

  return prismadb.store.count({
    where: { userId },
  });
}
