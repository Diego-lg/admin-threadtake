import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth"; // Import from the new file
import { NextRequest, NextResponse } from "next/server"; // Import NextRequest and NextResponse

// Define allowed origins - duplicating from middleware for this specific handler
const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? ([
        "https://treadheaven-storefront.vercel.app", // Main storefront production URL
        "https://treadheaven-storefront-q1lukl62u-diegolgs-projects-800e72ea.vercel.app", // Specific storefront preview URL
        // Add other production origins if necessary
      ].filter(Boolean) as string[])
    : ["http://localhost:3001", "http://localhost:3000"]; // Allow storefront dev (:3001) and admin dev (:3000)

const handler = NextAuth(authOptions);

// Explicitly handle OPTIONS requests for NextAuth routes
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  const isAllowedOrigin = origin && allowedOrigins.includes(origin);

  const response = new NextResponse(null, { status: 204 }); // 204 No Content is standard for successful preflight

  if (isAllowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    ); // Explicitly list allowed methods
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type"
    ); // Explicitly list allowed headers
    response.headers.set("Access-Control-Allow-Credentials", "true");
  } else {
    // Optionally log blocked origins for debugging
    if (origin)
      console.warn(
        `Blocked OPTIONS request to /api/auth/ from origin: ${origin}`
      );
  }

  return response;
}

export { handler as GET, handler as POST };
