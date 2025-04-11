import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import prismadb from "@/lib/prismadb";
import { UserRole } from "@prisma/client";

// Define the expected shape of the JWT payload
interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

// POST /api/designs/[designId]/ratings - Submit a rating for a design
export async function POST(
  req: Request,
  { params }: { params: { designId: string } }
) {
  try {
    // 1. Authentication & Authorization
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const token = authHeader.split(" ")[1];
    let decodedPayload: JwtPayload;
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) throw new Error("JWT_SECRET not set");
      decodedPayload = jwt.verify(token, jwtSecret) as JwtPayload;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      return new NextResponse("Invalid token", { status: 401 });
    }
    const userId = decodedPayload.userId;
    if (!userId) {
      return new NextResponse("User ID not found in token", { status: 401 });
    }

    // 2. Get designId and request body
    const { designId } = params;
    if (!designId) {
      return new NextResponse("Design ID is required", { status: 400 });
    }

    const body = await req.json();
    const { score, comment } = body;

    // 3. Validate Input
    if (
      typeof score !== "number" ||
      !Number.isInteger(score) ||
      score < 1 ||
      score > 5
    ) {
      return new NextResponse("Score must be an integer between 1 and 5", {
        status: 400,
      });
    }
    if (comment && typeof comment !== "string") {
      return new NextResponse("Comment must be a string", { status: 400 });
    }

    // 4. Check if design exists (optional but good practice)
    const designExists = await prismadb.savedDesign.findUnique({
      where: { id: designId },
    });
    if (!designExists) {
      return new NextResponse("Design not found", { status: 404 });
    }

    // 5. Use Prisma Transaction for atomicity
    const result = await prismadb.$transaction(async (tx) => {
      // a. Check if user already rated this design
      const existingRating = await tx.rating.findUnique({
        where: {
          userId_savedDesignId: {
            // Use the compound unique key
            userId: userId,
            savedDesignId: designId,
          },
        },
      });

      if (existingRating) {
        // Throw an error to abort the transaction and signal conflict
        throw new Error("User has already rated this design");
      }

      // b. Create the new rating
      const newRating = await tx.rating.create({
        data: {
          score: score,
          comment: comment || null,
          userId: userId,
          savedDesignId: designId,
        },
      });

      // c. Recalculate average rating and count for the design
      const aggregateResult = await tx.rating.aggregate({
        where: { savedDesignId: designId },
        _avg: { score: true },
        _count: { id: true },
      });

      const newAverageRating = aggregateResult._avg.score ?? 0;
      const newRatingCount = aggregateResult._count.id ?? 0;

      // d. Update the SavedDesign with new average and count
      await tx.savedDesign.update({
        where: { id: designId },
        data: {
          averageRating: newAverageRating,
          ratingCount: newRatingCount,
        },
      });

      return newRating; // Return the created rating from the transaction
    });

    // If transaction was successful, return the new rating
    return NextResponse.json(result);
  } catch (error: unknown) {
    // Handle specific error for already rated
    if (
      error instanceof Error &&
      error.message === "User has already rated this design"
    ) {
      return new NextResponse(error.message, { status: 409 }); // 409 Conflict
    }
    // Handle potential Prisma transaction errors or other errors
    console.error("[RATINGS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

// GET /api/designs/[designId]/ratings - Fetch ratings for a design
export async function GET(
  req: Request,
  { params }: { params: { designId: string } }
) {
  try {
    const { designId } = params;
    if (!designId) {
      return new NextResponse("Design ID is required", { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10"); // Default limit 10

    if (isNaN(page) || page < 1 || isNaN(limit) || limit < 1) {
      return new NextResponse("Invalid pagination parameters", { status: 400 });
    }

    const skip = (page - 1) * limit;
    const take = limit;

    // Fetch ratings and total count in parallel
    const [ratings, totalCount] = await prismadb.$transaction([
      prismadb.rating.findMany({
        where: { savedDesignId: designId },
        include: {
          user: {
            // Include user who submitted the rating
            select: {
              id: true,
              name: true,
              image: true, // Include user image if available
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: skip,
        take: take,
      }),
      prismadb.rating.count({
        where: { savedDesignId: designId },
      }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      data: ratings,
      meta: {
        totalCount,
        currentPage: page,
        totalPages,
        perPage: limit,
      },
    });
  } catch (error) {
    console.error("[RATINGS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
