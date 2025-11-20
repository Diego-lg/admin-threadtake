import { NextRequest, NextResponse } from "next/server";
import initializeServerServices from "@/lib/server-init";

// This API route initializes server services safely after Next.js is fully started
export async function GET(req: NextRequest) {
  console.log("[API_INIT] Server initialization endpoint called");

  try {
    // Initialize server services
    initializeServerServices();

    return NextResponse.json({
      success: true,
      message: "Server services initialized successfully",
    });
  } catch (error) {
    console.error("[API_INIT] Failed to initialize server services:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to initialize server services",
      },
      { status: 500 }
    );
  }
}

// Also allow POST for initialization
export async function POST(req: NextRequest) {
  return GET(req);
}
