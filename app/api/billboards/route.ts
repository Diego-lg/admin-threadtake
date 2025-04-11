import prismadb from "@/lib/prismadb";
import { NextResponse } from "next/server";

// GET handler for fetching all billboards (publicly accessible)
export async function GET(
  req: Request // req might not be used but is part of the signature
) {
  try {
    // Fetch all billboards, ordered by creation date (newest first)
    const billboards = await prismadb.billboard.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    // Return the fetched billboards as JSON
    return NextResponse.json(billboards);
  } catch (error) {
    // Log any errors that occur during the process
    console.log("[GLOBAL_BILLBOARDS_GET]", error);
    // Return a generic internal error response
    return new NextResponse("Internal error", { status: 500 });
  }
}
