import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import * as storeManager from "@/lib/store-manager";

/**
 * GET - Get all stores for the authenticated user
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const stores = await storeManager.getUserStores(userId);

    return NextResponse.json({
      stores,
      total: stores.length,
    });
  } catch (error) {
    console.error("[STORES_MANAGE_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

/**
 * POST - Create a new store
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const body = await req.json();
    const { name } = body;

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    // Check if user has reached the store limit (optional: set a limit)
    const storeCount = await storeManager.getUserStoreCount(userId);
    const MAX_STORES_PER_USER = 10; // Configurable limit

    if (storeCount >= MAX_STORES_PER_USER) {
      return new NextResponse(
        `Maximum store limit (${MAX_STORES_PER_USER}) reached`,
        { status: 403 },
      );
    }

    const store = await storeManager.createStore({
      name,
      userId,
    });

    return NextResponse.json(store);
  } catch (error) {
    console.error("[STORES_MANAGE_POST]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
