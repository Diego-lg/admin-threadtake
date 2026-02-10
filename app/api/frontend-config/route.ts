import { NextResponse } from "next/server";
import prisma from "@/lib/prismadb";

export async function GET() {
  try {
    const configs = await prisma.frontendConfig.findMany();

    // Transform array to object keyed by section
    const configObject: Record<string, any> = {};
    configs.forEach((item) => {
      configObject[item.section] = item.config;
    });

    return NextResponse.json(configObject, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Error fetching frontend config:", error);
    return NextResponse.json(
      { error: "Failed to fetch frontend configuration" },
      { status: 500 },
    );
  }
}
