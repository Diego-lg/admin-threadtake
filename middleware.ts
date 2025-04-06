import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client"; // Import UserRole

export default withAuth(
  // `withAuth` augments your `Request` with the user's token.
  function middleware(req) {
    // This function is called ONLY if the user is authenticated (authorized callback returned true).
    // You could add further checks here if needed, but for basic role protection,
    // the authorized callback is sufficient.
    // console.log("Authenticated user token:", req.nextauth.token);
    return NextResponse.next(); // Proceed if authorized
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        // Check if the token exists AND the user has the ADMIN role
        return !!token && token.role === UserRole.ADMIN;
      },
    },
    // If authorized callback returns false, redirect to the login page
    // defined in your main NextAuth options (pages: { signIn: '/login' })
  }
);

// The config object specifies which routes the middleware should apply to.
// This remains the same as before, protecting dashboard routes.
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/ (all API routes - typically handled separately)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - /login (the login page itself)
     * - /register (the registration page itself)
     * - /images/ (example public image folder - adjust if needed)
     */
    "/((?!api/|_next/static|_next/image|favicon.ico|login|register|images/).*)",
  ],
};
