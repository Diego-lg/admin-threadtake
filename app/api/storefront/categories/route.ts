import prismadb from "@/lib/prismadb";
import { NextResponse } from "next/server";

// GET handler for fetching all categories (publicly accessible)
export async function GET(
  req: Request // req might not be used but is part of the signature
) {
  try {
    // Fetch all categories, ordered by creation date (newest first)
    // You might want to include related data like the billboard if needed by the frontend
    const categories = await prismadb.category.findMany({
      include: {
        billboard: true, // Include billboard data if needed for display
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Return the fetched categories as JSON
    return NextResponse.json(categories);
  } catch (error) {
    // Log any errors that occur during the process
    console.log("[GLOBAL_CATEGORIES_GET]", error);
    // Return a generic internal error response
    return new NextResponse("Internal error", { status: 500 });
  }
}
