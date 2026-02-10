import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import * as storeManager from "@/lib/store-manager";

/**
 * POST - Switch to a different store (validates ownership)
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const { storeId } = await params;

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    // Verify ownership and return store info
    const store = await storeManager.setActiveStore(userId, storeId);

    return NextResponse.json({
      success: true,
      store,
      message: `Successfully switched to store: ${store.name}`,
    });
  } catch (error) {
    console.error("[STORE_SWITCH_POST]", error);
    if (error instanceof Error && error.message.includes("not found")) {
      return new NextResponse("Store not found or access denied", {
        status: 404,
      });
    }
    return new NextResponse("Internal error", { status: 500 });
  }
}

/**
 * GET - Get store details with stats
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const { storeId } = await params;

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    const store = await storeManager.getStoreById(storeId, userId);

    if (!store) {
      return new NextResponse("Store not found", { status: 404 });
    }

    // Get additional stats
    const stats = await storeManager.getStoreStats(storeId);

    return NextResponse.json({
      store,
      stats,
    });
  } catch (error) {
    console.error("[STORE_STATS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
