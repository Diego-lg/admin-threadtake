import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prismadb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";

// Valid sections that can be configured
const validSections = ["navigation", "footer", "theme", "auth", "categories"];

// Schema for updating config
const updateConfigSchema = z.object({
  config: z.record(z.any()),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ section: string }> },
) {
  try {
    const { section } = await params;

    // Validate section
    if (!validSections.includes(section)) {
      return NextResponse.json(
        {
          error: `Invalid section. Valid sections: ${validSections.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const config = await prisma.frontendConfig.findUnique({
      where: { section },
    });

    if (!config) {
      return NextResponse.json(
        { error: `Configuration for section '${section}' not found` },
        { status: 404 },
      );
    }

    return NextResponse.json(config.config, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error(`Error fetching frontend config section:`, error);
    return NextResponse.json(
      { error: "Failed to fetch frontend configuration" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ section: string }> },
) {
  try {
    const { section } = await params;

    // Validate section
    if (!validSections.includes(section)) {
      return NextResponse.json(
        {
          error: `Invalid section. Valid sections: ${validSections.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Check authentication - admin required for updates
    const session = await getServerSession(authOptions);

    if (!session || session.user?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Unauthorized. Admin access required." },
        { status: 401 },
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = updateConfigSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: validationResult.error.errors,
        },
        { status: 400 },
      );
    }

    const { config } = validationResult.data;

    // Upsert the configuration
    const updatedConfig = await prisma.frontendConfig.upsert({
      where: { section },
      update: { config },
      create: { section, config },
    });

    return NextResponse.json({
      section: updatedConfig.section,
      config: updatedConfig.config,
    });
  } catch (error) {
    console.error(`Error updating frontend config section:`, error);
    return NextResponse.json(
      { error: "Failed to update frontend configuration" },
      { status: 500 },
    );
  }
}
