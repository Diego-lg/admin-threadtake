import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { withR2AccessControl } from "./middleware/r2-access-control";
import { R2Security } from "./lib/r2-security";
import * as jose from "jose";

// Define allowed origins
const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? ([
        "https://www.threadtake.com",
        "https://threadtake.com",
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
      ].filter(Boolean) as string[])
    : ["http://localhost:3001", "http://localhost:3000"];

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
const secretKey = NEXTAUTH_SECRET ? new TextEncoder().encode(NEXTAUTH_SECRET) : null;

// Helper function to decode JWT token from cookie
async function getSessionFromCookie(req: NextRequest): Promise<any | null> {
  if (!secretKey) {
    console.error("[Middleware] NEXTAUTH_SECRET not configured");
    return null;
  }

  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  // Try to find the next-auth session token cookie
  const nextAuthCookie = cookieHeader
    .split(";")
    .find((c) => c.trim().startsWith("next-auth.session-token=") || c.trim().startsWith("__Secure-next-auth.session-token="));

  if (!nextAuthCookie) {
    return null;
  }

  const token = nextAuthCookie.split("=")[1]?.trim();
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jose.jwtVerify(token, secretKey);
    return payload;
  } catch (err) {
    console.error("[Middleware] JWT verification failed:", err);
    return null;
  }
}

// --- Main Middleware Function ---
export async function middleware(req: NextRequest) {
  console.log(
    `[Middleware START] Method: ${req.method}, Path: ${req.nextUrl.pathname}`,
  );

  try {
    // Skip WebSocket upgrade requests
    const upgrade = req.headers.get("upgrade");
    if (upgrade?.toLowerCase() === "websocket") {
      console.log(
        `[Middleware] Skipping WebSocket upgrade request for ${req.nextUrl.pathname}`,
      );
      return;
    }

    const origin = req.headers.get("origin");
    const pathname = req.nextUrl.pathname;
    const isApiRoute = pathname.startsWith("/api/");
    const isAllowedOrigin = origin && allowedOrigins.includes(origin);

    // --- R2 Security Check ---
    if (pathname.startsWith("/api/r2/")) {
      const r2SecurityResponse = await withR2AccessControl(req);
      if (r2SecurityResponse) {
        console.log(`[R2_SECURITY] Blocked request to ${pathname}`);
        return r2SecurityResponse;
      }
    }

    // --- Step 1: Handle CORS Preflight (OPTIONS) ---
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
        return response;
      } else {
        if (origin)
          console.warn(
            `[Middleware] Blocked OPTIONS request to ${pathname} from origin: ${origin}`,
          );
        return new NextResponse(null, { status: 204 });
      }
    }

    // --- Step 2: Handle Actual API Requests ---
    if (isApiRoute && req.method !== "OPTIONS") {
      // Let the request proceed to the API route handler
      const response = await NextResponse.next();

      // Check if origin is allowed and add headers
      if (isAllowedOrigin && response && origin) {
        const newResponse = new NextResponse(response.body, response);
        newResponse.headers.set("Access-Control-Allow-Origin", origin);
        newResponse.headers.set("Access-Control-Allow-Credentials", "true");

        const securityHeaders = R2Security.generateSecurityHeaders();
        for (const [key, value] of Object.entries(securityHeaders)) {
          newResponse.headers.set(key, value);
        }

        console.log(
          `[Middleware] Added CORS and security headers to final response for ${pathname} from origin: ${origin}`,
        );
        return newResponse;
      } else if (!isAllowedOrigin && origin) {
        console.warn(
          `[Middleware] Blocked API request (${req.method}) to ${pathname} from origin: ${origin}`,
        );
      }
      return response;
    }

    // --- Step 3: Authentication/Authorization Handling for NON-API routes ---
    const protectedPaths = ["/", "/dashboard", "/admin", "/generator"];
    const requiresAuth = protectedPaths.some((path) =>
      pathname.startsWith(path),
    );

    console.log(
      `[Middleware] Path: ${pathname}, Requires Auth: ${requiresAuth}`,
    );

    if (requiresAuth) {
      console.log(
        `[Middleware] Checking session for protected path: ${pathname}`,
      );

      // Use our custom JWT parsing instead of getServerSession
      const session = await getSessionFromCookie(req);
      console.log(
        `[Middleware] Session verification: ${session ? "valid" : "null"}`,
      );

      // If no session, redirect to login
      if (!session) {
        const url = req.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("callbackUrl", req.nextUrl.pathname);
        console.log("[Middleware] No session found, redirecting to login.");
        return NextResponse.redirect(url);
      }

      // Check if user email matches admin email
      const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
      const userEmail = session.email?.toLowerCase();
      if (adminEmail && userEmail !== adminEmail) {
        console.log(
          `[Middleware] Unauthorized user email: ${userEmail}, admin email: ${adminEmail}`,
        );
        const response = NextResponse.redirect(new URL("/login", req.url));
        response.cookies.delete("next-auth.session-token");
        response.cookies.delete("__Secure-next-auth.session-token");
        return response;
      }

      // Check for ADMIN role
      if (
        pathname.startsWith("/admin") &&
        session.role !== UserRole.ADMIN
      ) {
        console.log("[Middleware] Unauthorized access attempt to /admin.");
        const url = req.nextUrl.clone();
        url.pathname = "/unauthorized";
        return NextResponse.redirect(url);
      }

      console.log(
        `[Middleware] Auth check passed for protected route: ${pathname}`,
      );
      return NextResponse.next();
    } else {
      console.log(
        `[Middleware] Path not protected or auth not required, allowing access: ${pathname}`,
      );
    }

    // --- Step 4: Default - Allow all other requests ---
    console.log(`[Middleware END] Allowing request for: ${pathname}`);
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
    "/api/:path*",
    "/((?!_next/static|_next/image|favicon.ico|images/|login|register|unauthorized).*)",
  ],
};
