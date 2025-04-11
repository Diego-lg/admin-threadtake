import { withAuth, NextRequestWithAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";

// Define allowed origins
const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? ([
        "https://www.threadtake.com",
        "https://storefront-threadtake.vercel.app", // Main storefront production URL
        "https://treadheaven-storefront-q1lukl62u-diegolgs-projects-800e72ea.vercel.app", // Specific storefront preview URL
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null, // This admin app's Vercel URL
      ].filter(Boolean) as string[]) // Filter out null if VERCEL_URL isn't set
    : ["http://localhost:3001", "http://localhost:3000"]; // Allow storefront dev (:3001) and admin dev (:3000)

export default withAuth(
  // `withAuth` augments `Request` with `req.nextauth`
  function middleware(req: NextRequestWithAuth) {
    const origin = req.headers.get("origin");
    const pathname = req.nextUrl.pathname;

    // --- CORS Handling for API routes ---
    if (pathname.startsWith("/api/")) {
      const isAllowedOrigin = origin && allowedOrigins.includes(origin);

      // Handle Preflight requests
      if (req.method === "OPTIONS") {
        const response = new NextResponse(null, { status: 204 }); // No Content
        // Set CORS headers for OPTIONS response only if origin is allowed
        if (isAllowedOrigin) {
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
        } else {
          // Optionally log blocked origins
          if (origin)
            console.warn(`Blocked OPTIONS request from origin: ${origin}`);
        }
        return response;
      }

      // Handle actual API requests
      const response = NextResponse.next(); // Let the request proceed to the API route handler

      // Add CORS headers to the actual response if origin is allowed
      if (isAllowedOrigin) {
        response.headers.set("Access-Control-Allow-Origin", origin);
        response.headers.set("Access-Control-Allow-Credentials", "true");
        // These might not be strictly necessary on the actual response but are often included
        response.headers.set(
          "Access-Control-Allow-Methods",
          "GET,DELETE,PATCH,POST,PUT,OPTIONS"
        );
        response.headers.set(
          "Access-Control-Allow-Headers",
          "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
        );
      } else {
        // Optionally log blocked origins
        if (origin) console.warn(`Blocked API request from origin: ${origin}`);
        // You could return a 403 Forbidden here, but typically letting the browser enforce CORS is sufficient
        // return new NextResponse(null, { status: 403 });
      }

      return response; // Return the response (potentially with CORS headers added)
    }

    // --- Auth Handling for non-API routes (original logic) ---
    // This part runs only if the path DOES NOT start with /api/ AND the `authorized` callback below returned true.
    // console.log("Authenticated user token for non-API route:", req.nextauth.token);
    return NextResponse.next(); // Proceed if authorized for non-API routes
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;

        // If it's an API route, consider it authorized at this stage.
        // Actual access control is handled by the CORS origin check above
        // and any specific auth logic within the API route itself.
        if (pathname.startsWith("/api/")) {
          return true;
        }

        // For non-API routes, enforce the original ADMIN role check.
        return !!token && token.role === UserRole.ADMIN;
      },
    },
    // If authorized callback returns false for a non-API route, redirect to login
    // pages: { signIn: '/login' } // Ensure this is configured in your main [...nextauth]/route.ts options
  }
);

// Apply middleware to both dashboard routes AND API routes, excluding static assets etc.
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - /login (login page - handled by next-auth redirect)
     * - /register (registration page - assuming public)
     * - /images/ (example public image folder - adjust if needed)
     *
     * This matcher now implicitly includes /api/* paths because they don't start
     * with the excluded patterns. It also includes all other non-excluded paths
     * for the dashboard auth check.
     */
    "/((?!_next/static|_next/image|favicon.ico|login|register|images/).*)",
  ],
};
