// backend_threadtake/app/api/settings/general/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; // Import your authOptions

import prismadb from "@/lib/prismadb";
import { UserRole } from "@prisma/client"; // Import UserRole if needed for checks

// Helper function to get or create the general settings (copied from designs route)
async function getGeneralSettings() {
  let settings = await prismadb.generalSetting.findFirst();
  if (!settings) {
    console.log("No general settings found, creating default settings...");
    settings = await prismadb.generalSetting.create({
      data: {
        // defaultMaxSavedDesigns will use the @default(10) from schema
      },
    });
    console.log("Default general settings created:", settings);
  }
  return settings;
}

// GET /api/settings/general - Fetch the current general settings
export async function GET(req: Request) {
  try {
    // Optional: Add admin check if needed
    // const { userId, sessionClaims } = auth();
    // if (!userId || sessionClaims?.metadata?.role !== UserRole.ADMIN) {
    //   return new NextResponse("Unauthorized", { status: 401 });
    // }

    const settings = await getGeneralSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("[GENERAL_SETTINGS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

// PATCH /api/settings/general - Update the general settings
export async function PATCH(req: Request) {
  try {
    // --- Admin Authentication Check using NextAuth ---
    const session = await getServerSession(authOptions);

    // Check if user is logged in and has ADMIN role
    if (!session || !session.user || session.user.role !== UserRole.ADMIN) {
      console.warn(
        `[GENERAL_SETTINGS_PATCH] Unauthorized attempt. Session: ${!!session}, User: ${!!session?.user}, Role: ${
          session?.user?.role
        }`
      );
      return new NextResponse("Unauthorized: Admin privileges required", {
        status: 403,
        statusText: "Forbidden", // Added statusText for clarity
      }); // 403 Forbidden is more specific
    }
    console.log(
      `[GENERAL_SETTINGS_PATCH] Authorized admin user: ${session.user.id}`
    );
    // --- End Admin Authentication Check ---

    const body = await req.json();
    const { defaultMaxSavedDesigns } = body;

    // Validate input
    if (
      typeof defaultMaxSavedDesigns !== "number" ||
      defaultMaxSavedDesigns < 0 ||
      !Number.isInteger(defaultMaxSavedDesigns)
    ) {
      return new NextResponse(
        "Invalid 'defaultMaxSavedDesigns' value. Must be a non-negative integer.",
        { status: 400 }
      );
    }

    // Get the current settings ID (or create settings if they don't exist)
    const currentSettings = await getGeneralSettings();

    // Update the existing settings record
    const updatedSettings = await prismadb.generalSetting.update({
      where: { id: currentSettings.id }, // Target the single settings record
      data: {
        defaultMaxSavedDesigns: defaultMaxSavedDesigns,
      },
    });

    console.log(
      `[GENERAL_SETTINGS_PATCH] Global design limit updated to ${defaultMaxSavedDesigns} by admin ${session.user.id}` // Ensure session is defined here
    );
    return NextResponse.json(updatedSettings);
  } catch (error) {
    console.error("[GENERAL_SETTINGS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
