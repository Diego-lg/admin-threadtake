import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

import prismadb from "@/lib/prismadb";
import { UserFolderService } from "@/services/user-folder-service";

export async function GET(req: Request) {
  console.log("--- [MY_DESIGNS_GET] Handler Entered ---");
  const { searchParams } = new URL(req.url);
  // --- Cursor Pagination ---
  const cursor = searchParams.get("cursor") || undefined;
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  // --- End Cursor Pagination ---

  try {
    console.log("[MY_DESIGNS_GET] Attempting to get session...");
    // Use getServerSession to verify the server-side session
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      console.error("[MY_DESIGNS_GET] Authentication failed: No valid session");
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    const userId = session.user.id;

    console.log(
      `[MY_DESIGNS_GET] Authenticated user ID from session: ${userId}`,
    );

    // --- Fetch initial data concurrently ---
    console.log("[MY_DESIGNS_GET] Preparing initial concurrent queries...");
    console.time("[MY_DESIGNS_GET] Prisma Initial Concurrent Queries");

    const userPromise = prismadb.user.findUnique({
      where: { id: userId },
      select: { maxSavedDesigns: true },
    });

    const settingsPromise = prismadb.generalSetting.findFirst({
      select: { defaultMaxSavedDesigns: true },
    });

    const countPromise = prismadb.savedDesign.count({
      where: { userId: userId },
    });

    // Execute concurrently
    const [userData, generalSettings, totalDesigns] = await Promise.all([
      userPromise,
      settingsPromise,
      countPromise,
    ]);

    console.timeEnd("[MY_DESIGNS_GET] Prisma Initial Concurrent Queries");
    console.log(
      `[MY_DESIGNS_GET] Fetched User Data: ${JSON.stringify(userData)}`,
    );
    console.log(
      `[MY_DESIGNS_GET] Fetched Settings: ${JSON.stringify(generalSettings)}`,
    );
    console.log(`[MY_DESIGNS_GET] Total Designs Count: ${totalDesigns}`);
    // --- End Concurrent Fetch ---

    console.log("[MY_DESIGNS_GET] Fetching paginated designs...");
    console.time("[MY_DESIGNS_GET] Prisma FindMany Query");
    const designs = await prismadb.savedDesign.findMany({
      take: limit,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      where: {
        userId: userId,
      },
      orderBy: {
        updatedAt: "desc",
        // id: 'asc' // Optional secondary sort
      },
      include: {
        // Keep the optimized include (no nested images)
        product: { select: { id: true, name: true } },
        color: { select: { id: true, name: true, value: true } },
        size: { select: { id: true, name: true, value: true } },
      },
    });
    console.timeEnd("[MY_DESIGNS_GET] Prisma FindMany Query");

    // Determine the effective design limit
    const userLimit = userData?.maxSavedDesigns;
    const defaultLimit = generalSettings?.defaultMaxSavedDesigns ?? 10;
    const effectiveLimit = userLimit ?? defaultLimit;

    console.log(`[MY_DESIGNS_GET] User ID: ${userId}`);
    console.log(`[MY_DESIGNS_GET] Fetched User Limit: ${userLimit}`);
    console.log(
      `[MY_DESIGNS_GET] Fetched Default Limit: ${generalSettings?.defaultMaxSavedDesigns}`,
    );
    console.log(`[MY_DESIGNS_GET] Effective Limit: ${effectiveLimit}`);
    console.log(`[MY_DESIGNS_GET] Total Designs Count: ${totalDesigns}`);
    console.log(
      `[MY_DESIGNS_GET] Fetched Designs Count (limit ${limit}, cursor ${cursor}): ${designs.length}`,
    );

    // --- Cursor Pagination: Determine next cursor ---
    let nextCursor: string | undefined = undefined;
    if (designs.length === limit) {
      nextCursor = designs[designs.length - 1].id;
    }
    // --- End Cursor Pagination ---

    // Get user info for dynamic folder resolution
    const user = await prismadb.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    // Dynamically resolve image URLs based on user's current folder
    // This handles cases where user changed their name and folder structure changed
    const resolvedDesigns = await Promise.all(
      designs.map(async (design) => {
        const [
          resolvedDesignImageUrl,
          resolvedMockupImageUrl,
          resolvedUploadedLogoUrl,
          resolvedUploadedPatternUrl,
        ] = await Promise.all([
          UserFolderService.resolveImageUrl(
            design.designImageUrl,
            userId,
            user?.name,
          ),
          UserFolderService.resolveImageUrl(
            design.mockupImageUrl,
            userId,
            user?.name,
          ),
          UserFolderService.resolveImageUrl(
            design.uploadedLogoUrl,
            userId,
            user?.name,
          ),
          UserFolderService.resolveImageUrl(
            design.uploadedPatternUrl,
            userId,
            user?.name,
          ),
        ]);

        return {
          ...design,
          designImageUrl: resolvedDesignImageUrl,
          mockupImageUrl: resolvedMockupImageUrl,
          uploadedLogoUrl: resolvedUploadedLogoUrl,
          uploadedPatternUrl: resolvedUploadedPatternUrl,
        };
      }),
    );

    // Return designs, pagination info (nextCursor), total count, and the effective limit
    return NextResponse.json({
      designs: resolvedDesigns,
      nextCursor: nextCursor,
      totalDesigns: totalDesigns,
      limit: effectiveLimit,
    });
  } catch (error) {
    console.error("[MY_DESIGNS_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
