import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt"; // Use getToken to check session manually
import { UserRole } from "@prisma/client";

// Define allowed origins
const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? ([
        //treadheaven
        "https://www.threadtake.com",
        "https://threadtake.com",
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
    // --- Specific Log for /api/designs ---
    if (pathname === "/api/designs") {
      console.log(
        `[Middleware] Received ${req.method} request for /api/designs from origin: ${origin}`
      );
    }
    // --- End Specific Log ---
    // --- DIAGNOSTIC: Try getToken early for my-designs ---
    if (pathname === "/api/designs/my-designs") {
      console.log(
        "[Middleware] Attempting diagnostic getToken for /api/designs/my-designs..."
      );
      // --- Log raw cookie header seen by middleware ---
      const rawCookieHeader = req.headers.get("cookie");
      console.log(
        `[Middleware] Raw Cookie Header: ${rawCookieHeader || "NONE"}`
      );
      // --- End log raw cookie header ---
      try {
        const diagnosticToken = await getToken({ req, secret });
        if (diagnosticToken) {
          console.log(
            `[Middleware] Diagnostic getToken SUCCESSFUL. Token ID: ${diagnosticToken.id}, Sub: ${diagnosticToken.sub}`
          );
        } else {
          console.error("[Middleware] Diagnostic getToken returned NULL.");
        }
      } catch (err) {
        console.error("[Middleware] Error during diagnostic getToken:", err);
      }
    }
    // --- END DIAGNOSTIC ---

    // Let the request proceed to the API route handler and await its response
    const response = await NextResponse.next();

    // Check if origin is allowed and add headers to the final response
    if (isAllowedOrigin && response && origin) {
      // Clone the response to safely modify headers
      const newResponse = new NextResponse(response.body, response);
      newResponse.headers.set("Access-Control-Allow-Origin", origin);
      newResponse.headers.set("Access-Control-Allow-Credentials", "true");
      console.log(
        `[Middleware] Added CORS headers to final response for ${pathname} from origin: ${origin}`
      );
      return newResponse; // Return the modified response
    } else if (!isAllowedOrigin && origin) {
      console.warn(
        `[Middleware] Blocked API request (${req.method}) to ${pathname} from origin: ${origin}`
      );
      // Optionally return a 403 Forbidden here if needed for non-allowed origins
      // return new NextResponse("Forbidden: Invalid Origin", { status: 403 });
    }
    // Return the original response if origin wasn't allowed or response object is missing
    return response;
  }

  // --- Step 3: Authentication/Authorization Handling for NON-API routes ---
  // Define protected paths (adjust as needed)
  const protectedPaths = ["/", "/dashboard", "/admin"]; // Example protected paths (Added root '/')
  const requiresAuth = protectedPaths.some((path) => pathname.startsWith(path));

  // --- Log path and auth requirement ---
  console.log(`[Middleware] Path: ${pathname}, Requires Auth: ${requiresAuth}`);

  if (requiresAuth) {
    console.log(`[Middleware] Checking token for protected path: ${pathname}`); // <-- ADD THIS LOG
    if (!secret) {
      console.error("Missing NEXTAUTH_SECRET environment variable");
      return new NextResponse("Server configuration error", { status: 500 });
    }

    const token = await getToken({ req, secret });
    console.log(
      `[Middleware] Token found: ${token ? JSON.stringify(token) : "null"}`
    ); // <-- ADD THIS LOG

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
    console.log(
      `[Middleware] Auth check passed for protected route: ${pathname}`
    ); // <-- MODIFIED LOG
    return NextResponse.next(); // Allow access to the protected page
  } else {
    // <-- ADD THIS ELSE BLOCK
    console.log(
      `[Middleware] Path not protected or auth not required, allowing access: ${pathname}`
    ); // <-- ADD THIS LOG
  }

  // --- Step 4: Default - Allow all other requests (public pages, etc.) ---
  console.log(`[Middleware END] Allowing request for: ${pathname}`); // <-- ADD THIS LOG
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
