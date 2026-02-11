import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt"; // Use getToken to check session manually
import { UserRole } from "@prisma/client";
import { withR2AccessControl } from "./middleware/r2-access-control";
import { R2AuthEnhancement } from "./middleware/r2-auth-enhancement";
import { R2Security } from "./lib/r2-security";
import { R2AuditLogger } from "./lib/r2-audit-logger";
import { R2SecurityMonitor } from "./lib/r2-security-monitor";

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
    `[Middleware START] Method: ${req.method}, Path: ${req.nextUrl.pathname}`,
  ); // <-- ADD THIS LOG

  try {
    // Skip WebSocket upgrade requests to prevent bind context errors
    const upgrade = req.headers.get("upgrade");
    if (upgrade?.toLowerCase() === "websocket") {
      console.log(
        `[Middleware] Skipping WebSocket upgrade request for ${req.nextUrl.pathname}`,
      );
      return NextResponse.next();
    }

    const origin = req.headers.get("origin");
    const pathname = req.nextUrl.pathname;
    const isApiRoute = pathname.startsWith("/api/");
    const isAllowedOrigin = origin && allowedOrigins.includes(origin);

    // --- R2 Security Check ---
    // Apply R2 access control middleware to R2 API routes
    if (pathname.startsWith("/api/r2/")) {
      const r2SecurityResponse = await withR2AccessControl(req);
      if (r2SecurityResponse) {
        console.log(`[R2_SECURITY] Blocked request to ${pathname}`);
        return r2SecurityResponse;
      }
    }

    // --- Step 1: Handle CORS Preflight (OPTIONS) for ALL API routes ---
    if (isApiRoute && req.method === "OPTIONS") {
      if (isAllowedOrigin) {
        console.log(
          `[Middleware] Handling OPTIONS for ${pathname} from allowed origin: ${origin}`,
        );
        const response = new NextResponse(null, { status: 204 });
        response.headers.set("Access-Control-Allow-Origin", origin);
        response.headers.set("Access-Control-Allow-Credentials", "true");
        response.headers.set(
          "Access-Control-Allow-Methods",
          "GET,DELETE,PATCH,POST,PUT,OPTIONS",
        );
        response.headers.set(
          "Access-Control-Allow-Headers",
          "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
        );
        return response; // Return immediately
      } else {
        if (origin)
          console.warn(
            `[Middleware] Blocked OPTIONS request to ${pathname} from origin: ${origin}`,
          );
        return new NextResponse(null, { status: 204 }); // Return simple response
      }
    }

    // --- Step 2: Handle Actual API Requests (GET, POST, etc.) ---
    // Add CORS headers to the outgoing response if origin is allowed
    if (isApiRoute && req.method !== "OPTIONS") {
      // --- DIAGNOSTIC: Try getToken early for my-designs ---
      if (pathname === "/api/designs/my-designs") {
        console.log(
          "[Middleware] Attempting diagnostic getToken for /api/designs/my-designs...",
        );
        // --- Log raw cookie header seen by middleware (REDACTED) ---
        const rawCookieHeader = req.headers.get("cookie");
        const hasAuthCookie =
          rawCookieHeader && rawCookieHeader.includes("next-auth");
        console.log(`[Middleware] Auth cookie present: ${hasAuthCookie}`);
        // --- End log raw cookie header ---
        try {
          const diagnosticToken = await getToken({ req, secret });
          if (diagnosticToken) {
            console.log(
              `[Middleware] Diagnostic getToken: Authentication verified`,
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

        // Add security headers to all API responses
        const securityHeaders = R2Security.generateSecurityHeaders();
        for (const [key, value] of Object.entries(securityHeaders)) {
          newResponse.headers.set(key, value);
        }

        console.log(
          `[Middleware] Added CORS and security headers to final response for ${pathname} from origin: ${origin}`,
        );
        return newResponse; // Return the modified response
      } else if (!isAllowedOrigin && origin) {
        console.warn(
          `[Middleware] Blocked API request (${req.method}) to ${pathname} from origin: ${origin}`,
        );
        // Optionally return a 403 Forbidden here if needed for non-allowed origins
        // return new NextResponse("Forbidden: Invalid Origin", { status: 403 });
      }
      // Return the original response if origin wasn't allowed or response object is missing
      return response;
    }

    // --- Step 3: Authentication/Authorization Handling for NON-API routes ---
    // Define protected paths (adjust as needed)
    const protectedPaths = ["/", "/dashboard", "/admin", "/generator"]; // Added /generator as protected
    const requiresAuth = protectedPaths.some((path) =>
      pathname.startsWith(path),
    );

    // --- Log path and auth requirement ---
    console.log(
      `[Middleware] Path: ${pathname}, Requires Auth: ${requiresAuth}`,
    );

    if (requiresAuth) {
      console.log(
        `[Middleware] Checking token for protected path: ${pathname}`,
      ); // <-- ADD THIS LOG
      if (!secret) {
        console.error("Missing NEXTAUTH_SECRET environment variable");
        return new NextResponse("Server configuration error", { status: 500 });
      }

      const token = await getToken({ req, secret });
      console.log(
        `[Middleware] Token verification: ${token ? "valid" : "null"}`,
      ); // <-- ADD THIS LOG

      // If no token, redirect to login
      if (!token) {
        const url = req.nextUrl.clone();
        url.pathname = "/login"; // Your login page path
        url.searchParams.set("callbackUrl", req.nextUrl.pathname); // Optional: redirect back after login
        console.log("[Middleware] No token found, redirecting to login.");
        return NextResponse.redirect(url);
      }

      // Check if user email matches admin email
      const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
      const userEmail = token.email?.toLowerCase();
      if (adminEmail && userEmail !== adminEmail) {
        console.log(
          `[Middleware] Unauthorized user email: ${userEmail}, admin email: ${adminEmail}`,
        );
        // Clear the session cookie and redirect to login
        const response = NextResponse.redirect(new URL("/login", req.url));
        response.cookies.delete("next-auth.session-token");
        response.cookies.delete("__Secure-next-auth.session-token");
        return response;
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
        `[Middleware] Auth check passed for protected route: ${pathname}`,
      ); // <-- MODIFIED LOG
      return NextResponse.next(); // Allow access to the protected page
    } else {
      // <-- ADD THIS ELSE BLOCK
      console.log(
        `[Middleware] Path not protected or auth not required, allowing access: ${pathname}`,
      ); // <-- ADD THIS LOG
    }

    // --- Step 4: Default - Allow all other requests (public pages, etc.) ---
    console.log(`[Middleware END] Allowing request for: ${pathname}`); // <-- ADD THIS LOG
    return NextResponse.next();
  } catch (error) {
    console.error("[Middleware] Unexpected error:", error);
    if (error instanceof Error) {
      console.error("[Middleware] Error stack:", error.stack);
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
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
