import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt"; // Use getToken to check session manually
import { UserRole } from "@prisma/client";

// Define allowed origins
const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? ([
        "https://treadheaven-storefront.vercel.app",
        "https://treadheaven-storefront-q1lukl62u-diegolgs-projects-800e72ea.vercel.app",
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
      ].filter(Boolean) as string[])
    : ["http://localhost:3001", "http://localhost:3000"]; // Ensure frontend origin is listed

const secret = process.env.NEXTAUTH_SECRET; // Needed for getToken

// --- Main Middleware Function ---
export async function middleware(req: NextRequest) {
  console.log(
    `[Middleware START] Method: ${req.method}, Path: ${req.nextUrl.pathname}`
  ); // <-- ADD THIS LOG
  const origin = req.headers.get("origin");
  const pathname = req.nextUrl.pathname;
  const isApiRoute = pathname.startsWith("/api/");
  const isAllowedOrigin = origin && allowedOrigins.includes(origin);

  // --- Step 1: Handle CORS Preflight (OPTIONS) for ALL API routes ---
  if (isApiRoute && req.method === "OPTIONS") {
    if (isAllowedOrigin) {
      console.log(
        `[Middleware] Handling OPTIONS for ${pathname} from allowed origin: ${origin}`
      );
      const response = new NextResponse(null, { status: 204 });
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Credentials", "true");
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET,DELETE,PATCH,POST,PUT,OPTIONS"
      );
      response.headers.set(
        "Access-Control-Allow-Headers",
        "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
      );
      return response; // Return immediately
    } else {
      if (origin)
        console.warn(
          `[Middleware] Blocked OPTIONS request to ${pathname} from origin: ${origin}`
        );
      return new NextResponse(null, { status: 204 }); // Return simple response
    }
  }

  // --- Step 2: Handle Actual API Requests (GET, POST, etc.) ---
  // Add CORS headers to the outgoing response if origin is allowed
  if (isApiRoute && req.method !== "OPTIONS") {
    const response = NextResponse.next(); // Let request proceed to the API route handler

    // Add CORS headers to the *final* response by modifying the response object
    // Note: Modifying headers on NextResponse.next() is complex.
    // A common pattern is to set request headers to pass info downstream,
    // or handle final response headers within the API route itself.
    // However, for basic Allow-Origin, adding it here might suffice.
    if (isAllowedOrigin) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Credentials", "true");
      console.log(
        `[Middleware] Added CORS headers for actual request to ${pathname} from origin: ${origin}`
      );
    } else {
      if (origin)
        console.warn(
          `[Middleware] Blocked API request (${req.method}) to ${pathname} from origin: ${origin}`
        );
      // Consider if you want to block the request here entirely if origin is not allowed
      // return new NextResponse("Forbidden: Invalid Origin", { status: 403 });
    }
    return response; // Continue to the API route
  }

  // --- Step 3: Authentication/Authorization Handling for NON-API routes ---
  // Define protected paths (adjust as needed)
  const protectedPaths = ["/dashboard", "/admin"]; // Example protected paths
  const requiresAuth = protectedPaths.some((path) => pathname.startsWith(path));

  if (requiresAuth) {
    if (!secret) {
      console.error("Missing NEXTAUTH_SECRET environment variable");
      return new NextResponse("Server configuration error", { status: 500 });
    }

    const token = await getToken({ req, secret });

    // If no token, redirect to login
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = "/login"; // Your login page path
      url.searchParams.set("callbackUrl", req.nextUrl.pathname); // Optional: redirect back after login
      console.log("[Middleware] No token found, redirecting to login.");
      return NextResponse.redirect(url);
    }

    // Example: Check for ADMIN role for specific paths
    if (pathname.startsWith("/admin") && token.role !== UserRole.ADMIN) {
      console.log("[Middleware] Unauthorized access attempt to /admin.");
      const url = req.nextUrl.clone();
      url.pathname = "/unauthorized"; // Or redirect to home or login
      return NextResponse.redirect(url); // Redirect if not ADMIN
    }

    // If token exists and role is sufficient, allow access
    console.log("[Middleware] Auth check passed for protected route.");
    return NextResponse.next(); // Allow access to the protected page
  }

  // --- Step 4: Default - Allow all other requests (public pages, etc.) ---
  return NextResponse.next();
}

// --- Middleware Config (Matcher) ---
export const config = {
  matcher: [
    /*
     * Explicitly match all API routes for CORS handling.
     */
    "/api/:path*",
    /*
     * Match other paths for potential authentication, excluding static assets,
     * public auth pages, and other specific exclusions.
     * The middleware function itself determines if auth is needed.
     */
    "/((?!_next/static|_next/image|favicon.ico|images/|login|register|unauthorized).*)", // Added /unauthorized exclusion
  ],
};
