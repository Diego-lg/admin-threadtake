import prismadb from "@/lib/prismadb";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Check if user already has a store
    const existingStore = await prismadb.store.findFirst({
      where: { userId },
    });

    if (existingStore) {
      return NextResponse.json(existingStore);
    }

    // Create a default store for the user
    const store = await prismadb.store.create({
      data: {
        name: "My Store",
        userId,
      },
    });

    return NextResponse.json(store);
  } catch (error) {
    console.log("[STORES_ME_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
