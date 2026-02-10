import prismadb from "@/lib/prismadb";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { deleteStore, adminDeleteStore } from "@/actions/store-manager";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const body = await req.json();
    const { name } = body;
    const { storeId } = await params;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    if (!storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    const store = await prismadb.store.updateMany({
      where: {
        id: storeId,
        userId,
      },
      data: { name },
    });
    return NextResponse.json(store);
  } catch (error) {
    console.log("[STORE_PATCH", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const { storeId } = await params;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    if (!storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    // Get the user to check if admin
    const user = await prismadb.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const isAdmin = user?.role === "ADMIN";

    // Use admin delete function if admin, otherwise use regular delete
    if (isAdmin) {
      await adminDeleteStore(storeId);
    } else {
      await deleteStore(storeId);
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.log("[STORE_DELETE", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to delete store";
    return new NextResponse(errorMessage, { status: 500 });
  }
}
