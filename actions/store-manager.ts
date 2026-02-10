"use server";

import prismadb from "@/lib/prismadb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export interface Store {
  id: string;
  name: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    products: number;
    orders: number;
    categories: number;
    billboards: number;
  };
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
  _count?: {
    products: number;
    orders: number;
    categories: number;
    billboards: number;
  };
}

/**
 * Get all stores for the current user
 */
export async function getUserStores(): Promise<{
  stores: Store[];
  total: number;
}> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error("Unauthorized");
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

    return {
      stores,
      total: stores.length,
    };
  } catch (error) {
    console.error("Error getting user stores:", error);
    throw error;
  }
}

/**
 * Create a new store
 */
export async function createStore(name: string): Promise<Store> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error("Unauthorized");
    }

    if (!name || name.trim().length === 0) {
      throw new Error("Store name is required");
    }

    // Check store limit
    const storeCount = await prismadb.store.count({
      where: { userId },
    });

    const MAX_STORES = 10;
    if (storeCount >= MAX_STORES) {
      throw new Error(`Maximum store limit (${MAX_STORES}) reached`);
    }

    const store = await prismadb.store.create({
      data: {
        name: name.trim(),
        userId,
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

    revalidatePath("/");
    return store;
  } catch (error) {
    console.error("Error creating store:", error);
    throw error;
  }
}

/**
 * Update a store
 */
export async function updateStore(
  storeId: string,
  name: string,
): Promise<Store> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error("Unauthorized");
    }

    if (!storeId) {
      throw new Error("Store ID is required");
    }

    if (!name || name.trim().length === 0) {
      throw new Error("Store name is required");
    }

    // Verify ownership
    const existingStore = await prismadb.store.findFirst({
      where: { id: storeId, userId },
    });

    if (!existingStore) {
      throw new Error("Store not found");
    }

    const store = await prismadb.store.update({
      where: { id: storeId },
      data: { name: name.trim() },
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

    revalidatePath("/");
    revalidatePath(`/${storeId}`);
    return store;
  } catch (error) {
    console.error("Error updating store:", error);
    throw error;
  }
}

/**
 * Delete a store (requires ownership)
 */
export async function deleteStore(storeId: string): Promise<void> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error("Unauthorized");
    }

    if (!storeId) {
      throw new Error("Store ID is required");
    }

    // Verify ownership
    const existingStore = await prismadb.store.findFirst({
      where: { id: storeId, userId },
    });

    if (!existingStore) {
      throw new Error("Store not found");
    }

    // Delete all related data in transaction
    await prismadb.$transaction(async (tx) => {
      // Delete order items and orders
      const orders = await tx.order.findMany({
        where: { storeId },
        select: { id: true },
      });

      for (const order of orders) {
        await tx.orderItem.deleteMany({
          where: { orderId: order.id },
        });
      }

      await tx.order.deleteMany({
        where: { storeId },
      });

      // Delete products and images
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

      // Delete categories
      await tx.category.deleteMany({
        where: { storeId },
      });

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
      await tx.store.delete({
        where: { id: storeId },
      });
    });

    revalidatePath("/");
  } catch (error) {
    console.error("Error deleting store:", error);
    throw error;
  }
}

/**
 * Admin delete a store (bypasses ownership check, requires admin role)
 */
export async function adminDeleteStore(storeId: string): Promise<void> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error("Unauthorized");
    }

    if (!storeId) {
      throw new Error("Store ID is required");
    }

    // Verify admin role
    const user = await prismadb.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      throw new Error("Forbidden: Admin access required");
    }

    // Delete all related data in transaction (no ownership check)
    await prismadb.$transaction(async (tx) => {
      // Delete order items and orders
      const orders = await tx.order.findMany({
        where: { storeId },
        select: { id: true },
      });

      for (const order of orders) {
        await tx.orderItem.deleteMany({
          where: { orderId: order.id },
        });
      }

      await tx.order.deleteMany({
        where: { storeId },
      });

      // Delete products and images
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

      // Delete categories
      await tx.category.deleteMany({
        where: { storeId },
      });

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
      await tx.store.delete({
        where: { id: storeId },
      });
    });

    revalidatePath("/");
    revalidatePath("/admin/stores");
  } catch (error) {
    console.error("Error admin deleting store:", error);
    throw error;
  }
}

/**
 * Switch to a different store
 */
export async function switchStore(storeId: string): Promise<{
  success: boolean;
  store: Store;
  message: string;
}> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error("Unauthorized");
    }

    if (!storeId) {
      throw new Error("Store ID is required");
    }

    // Verify ownership
    const store = await prismadb.store.findFirst({
      where: { id: storeId, userId },
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

    if (!store) {
      throw new Error("Store not found or access denied");
    }

    return {
      success: true,
      store,
      message: `Successfully switched to ${store.name}`,
    };
  } catch (error) {
    console.error("Error switching store:", error);
    throw error;
  }
}

/**
 * Get store statistics
 */
export async function getStoreStats(storeId: string): Promise<StoreWithStats> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error("Unauthorized");
    }

    if (!storeId) {
      throw new Error("Store ID is required");
    }

    // Verify ownership
    const store = await prismadb.store.findFirst({
      where: { id: storeId, userId },
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

    if (!store) {
      throw new Error("Store not found");
    }

    // Calculate revenue from paid orders
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
        revenue += Number(item.product.price);
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
      _count: store._count,
    };
  } catch (error) {
    console.error("Error getting store stats:", error);
    throw error;
  }
}

/**
 * Get the current active store
 */
export async function getActiveStore(): Promise<Store | null> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return null;
    }

    const store = await prismadb.store.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
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

    return store;
  } catch (error) {
    console.error("Error getting active store:", error);
    return null;
  }
}

/**
 * Get the count of stores for a user
 */
export async function getUserStoreCount(): Promise<number> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return 0;
    }

    return prismadb.store.count({
      where: { userId },
    });
  } catch (error) {
    console.error("Error getting store count:", error);
    return 0;
  }
}
