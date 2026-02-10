import { AuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";

import prismadb from "@/lib/prismadb";
import { UserRole } from "@prisma/client";

// Admin email restriction - only this email can access the backend
const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.toLowerCase();

// Define authOptions here
export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prismadb),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  debug: process.env.NODE_ENV === "development", // Enable debug messages in development
  session: {
    strategy: "jwt", // Using JWT for session strategy
  },
  secret: process.env.NEXTAUTH_SECRET, // Secret for signing JWTs
  cookies: {
    sessionToken: {
      // Conditionally set cookie name based on environment for Secure prefix
      name:
        process.env.NODE_ENV === "production"
          ? `__Secure-next-auth.session-token` // Restored __Secure- prefix
          : `next-auth.session-token`,
      options: {
        httpOnly: true,
        // Use 'none' for production if backend/frontend are on different subdomains/domains
        // Use 'lax' for development (localhost)
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/",
        // Ensure secure is always true in production when sameSite is 'none'
        secure: process.env.NODE_ENV === "production",
        // Set domain to the parent domain for production to allow sharing across subdomains
        // e.g., www.threadtake.com and admin-threadtake.vercel.app
        // REMOVED explicit domain setting for production. Let browser default to the host setting the cookie.
        // This is generally safer unless you specifically need cross-subdomain access on the *same parent domain*.
        // Since admin-threadtake.vercel.app and www.threadtake.com are likely different sites,
        // relying on CORS and `credentials: 'include'` on the frontend fetch is the standard approach.
        domain: undefined, // Let the browser handle the domain based on the host.
        // domain: process.env.NODE_ENV === "production" ? ".threadtake.com" : undefined, // Revert to this if needed for specific cross-subdomain scenarios under .threadtake.com
      },
    },
    // Add configurations for other cookies (callbackUrl, csrfToken) if needed,
    // using similar secure settings based on NODE_ENV
  },
  pages: {
    signIn: "/login", // Redirect users to /login if they need to sign in
    // error: '/auth/error', // Optional: Error code passed in query string as ?error=
    // newUser: '/auth/new-user' // Optional: New users will be directed here on first sign in
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      console.log(
        "[NextAuth JWT Callback] START - Incoming Token:",
        JSON.stringify(token),
      );
      console.log(
        "[NextAuth JWT Callback] START - User object (only present on login):",
        user ? user.id : "N/A",
      );
      console.log("[NextAuth JWT Callback] START - Trigger:", trigger);
      console.log(
        "[NextAuth JWT Callback] START - Session object (only present on update):",
        session ? Object.keys(session) : "N/A",
      );

      // On initial sign in, `user` object is present.
      if (user) {
        // Admin email restriction - only allow specific email to sign in
        if (ADMIN_EMAIL && user.email?.toLowerCase() !== ADMIN_EMAIL) {
          console.warn(
            `[NextAuth JWT Callback] Unauthorized sign-in attempt from email: ${user.email}`,
          );
          throw new Error(
            "Unauthorized email - only threadtake@gmail.com is allowed to access this backend.",
          );
        }

        // Find the user in the database. The adapter should have already created it.
        const dbUser = await prismadb.user.findUnique({
          where: { email: user.email! },
        });

        // If the user is found in the database, use their DB ID (CUID) in the token.
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.name = dbUser.name;
          token.image = dbUser.image;
          token.profileCardBackground = dbUser.profileCardBackground;
          token.bio = dbUser.bio;
          token.portfolioUrl = dbUser.portfolioUrl;
        } else {
          // This case should ideally not happen if the adapter is working correctly.
          // Fallback to the ID from the provider, but log a warning.
          token.id = user.id;
          console.warn(
            `[NextAuth JWT Callback] Warning: User with email ${user.email} not found in DB during JWT creation. Using provider ID.`,
          );
        }
      }

      // Handle session updates triggered by the client-side `update()` function
      if (trigger === "update" && session) {
        console.log(
          "[NextAuth JWT Callback] Update trigger detected. Session data:",
          session,
        );
        // Merge the session data passed from update() into the token
        if (session.profileCardBackground !== undefined) {
          token.profileCardBackground = session.profileCardBackground;
        }
        if (session.name !== undefined) {
          token.name = session.name;
        }
        if (session.image !== undefined) {
          token.image = session.image;
        }
        if (session.bio !== undefined) {
          token.bio = session.bio;
        }
        if (session.portfolioUrl !== undefined) {
          token.portfolioUrl = session.portfolioUrl;
        }
      }

      console.log(
        "[NextAuth JWT Callback] END - Returning Token:",
        JSON.stringify(token),
      );
      return token; // Return the token with the correct database ID
    },
    async session({ session, token }) {
      console.log(
        "[NextAuth Session Callback] START - Incoming Session:",
        JSON.stringify(session),
      ); // DEBUG LOG
      console.log(
        "[NextAuth Session Callback] START - Incoming Token:",
        JSON.stringify(token),
      ); // DEBUG LOG

      // Ensure session.user exists
      // Ensure session.user exists and has the correct type structure
      if (!session.user) {
        // Initialize with required properties, casting from token if available
        session.user = {
          id: token?.id as string, // Assuming id is always in token if token exists
          role: token?.role as UserRole, // Cast role to UserRole enum
          // Initialize other optional properties to null or undefined
          name: null,
          email: null,
          image: null,
          profileCardBackground: null,
          bio: null,
          portfolioUrl: null,
        };
      }

      // Populate session.user with data from the token (which came from the JWT claims)
      // This makes the token claims available on the client-side session object
      // Populate session.user with data from the token (which came from the JWT claims)
      // This makes the token claims available on the client-side session object
      if (token) {
        // Assign properties, ensuring correct types
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole; // Correctly cast to UserRole enum
        session.user.name = token.name as string | null;
        session.user.email = token.email as string | null; // Assuming email is in token
        session.user.image = token.image as string | null;
        session.user.profileCardBackground = token.profileCardBackground as
          | string
          | null;
        session.user.bio = token.bio as string | null;
        session.user.portfolioUrl = token.portfolioUrl as string | null;

        // If you need the raw JWT string on the client, you would add it here
        // However, this is generally discouraged for security reasons.
        // The standard approach is to use the claims from the token.
        // If your backend API requires the raw JWT string in the Authorization header,
        // you might need to expose it, but be aware of the risks.
        // For now, let's assume the backend validates the JWT claims implicitly
        // when the cookie is sent, or expects the user ID/role from the token.

        // If your backend *specifically* needs the raw JWT string in the header,
        // you would need to find a way to access it here and add it to the session.
        // This is not straightforward with the default NextAuth setup.
        // A common pattern is to use a custom API route for protected data
        // that verifies the session server-side using `getServerSession`.
      }

      console.log(`[NextAuth Session Callback] Returning session:`, session); // DEBUG LOG
      return session; // Return the potentially modified session
    },
  },
};
