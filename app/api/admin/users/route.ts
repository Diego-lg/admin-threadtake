import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { UserRole, UserStatus } from "@prisma/client"; // Import UserStatus as well

import { authOptions } from "@/lib/auth"; // Assuming authOptions are in lib/auth
import prismadb from "@/lib/prismadb";

export async function GET(req: Request) {
  try {
    // 1. Check for Admin Authentication
    const session = await getServerSession(authOptions);

    if (!session || !session.user || session.user.role !== UserRole.ADMIN) {
      return new NextResponse("Unauthorized", { status: 403 }); // Use 403 Forbidden for role issues
    }

    // 2. Parse URL Search Parameters for filtering, pagination, searching
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const roleFilter = searchParams.get("role") as UserRole | null;
    const statusFilter = searchParams.get("status") as UserStatus | null;
    const searchQuery = searchParams.get("search") || "";

    const skip = (page - 1) * limit;

    // 3. Construct Prisma Query Conditions
    const whereCondition: any = {}; // Use 'any' for flexibility or define a stricter type

    if (roleFilter && Object.values(UserRole).includes(roleFilter)) {
      whereCondition.role = roleFilter;
    }

    if (statusFilter && Object.values(UserStatus).includes(statusFilter)) {
      whereCondition.status = statusFilter;
    }

    if (searchQuery) {
      whereCondition.OR = [
        { name: { contains: searchQuery, mode: "insensitive" } },
        { email: { contains: searchQuery, mode: "insensitive" } },
      ];
    }

    // 4. Fetch Users and Total Count
    const users = await prismadb.user.findMany({
      where: whereCondition,
      select: {
        // Select only necessary fields, exclude sensitive ones like hashedPassword
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        // Exclude: hashedPassword, accounts, sessions etc. unless needed
      },
      orderBy: {
        createdAt: "desc", // Or other sorting as needed
      },
      skip: skip,
      take: limit,
    });

    const totalUsers = await prismadb.user.count({
      where: whereCondition,
    });

    // 5. Return Response
    return NextResponse.json({
      data: users,
      pagination: {
        total: totalUsers,
        page: page,
        limit: limit,
        totalPages: Math.ceil(totalUsers / limit),
      },
    });
  } catch (error) {
    console.error("[ADMIN_USERS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

// Placeholder for other methods if needed (POST, etc.) - though likely not for this specific route
// export async function POST(req: Request) { ... }
