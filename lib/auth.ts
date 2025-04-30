import { AuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";

import prismadb from "@/lib/prismadb"; // Assuming prismadb is exported from here
import { User, UserRole } from "@prisma/client";

// Define authOptions here
export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prismadb),
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid credentials");
        }

        const user = await prismadb.user.findUnique({
          where: {
            email: credentials.email,
          },
        });

        // If user doesn't exist or doesn't have a hashed password (e.g., signed up via OAuth)
        if (!user || !user.hashedPassword) {
          throw new Error("Invalid credentials");
        }

        const isCorrectPassword = await bcrypt.compare(
          credentials.password,
          user.hashedPassword
        );

        if (!isCorrectPassword) {
          throw new Error("Invalid credentials");
        }

        // Add check for user status
        if (user.status !== "ACTIVE") {
          // Assuming UserStatus enum values are strings like 'ACTIVE'
          throw new Error("Account is inactive");
        }

        // Return user object if credentials are valid and account is active
        return user;
      },
    }),
    // Add other providers like Google, GitHub here if needed
    // e.g., GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! })
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
          ? `__Secure-next-auth.session-token`
          : `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax", // Keep lax for localhost development unless issues persist
        path: "/",
        secure: process.env.NODE_ENV === "production", // Use secure cookies in production
        // domain: 'localhost' // Explicitly setting domain might help some browsers, but usually not needed for localhost
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
        JSON.stringify(token)
      ); // DEBUG LOG
      console.log(
        "[NextAuth JWT Callback] START - User object (only present on login):",
        user ? user.id : "N/A"
      ); // DEBUG LOG
      console.log("[NextAuth JWT Callback] START - Trigger:", trigger); // DEBUG LOG
      console.log(
        "[NextAuth JWT Callback] START - Session object (only present on update):",
        session ? Object.keys(session) : "N/A"
      ); // DEBUG LOG
      // On initial sign in, populate token with id and role
      if (user) {
        // This block runs only on initial sign-in
        token.id = user.id;
        token.role = user.role;
        // Add all necessary fields from the User object to the token at login
        token.name = user.name;
        token.image = user.image;
        // Ensure custom fields from Prisma model are included if available on the User object
        // The 'user' object here comes from the 'authorize' callback or the adapter
        // We need to cast 'user' if these fields aren't on the default NextAuth User type
        const prismaUser = user as User; // Cast to access potential custom fields
        token.profileCardBackground = prismaUser.profileCardBackground;
        token.bio = prismaUser.bio;
        token.portfolioUrl = prismaUser.portfolioUrl;

        // Explicitly add the JWT token string to the token object
        // This is the token that will be passed to the session callback
        // Note: NextAuth handles the actual signing/encryption of the JWT
        // The 'token' object here represents the payload that will be signed
        // We are adding a property to this payload.
        // The actual JWT string is not directly available here in a simple way.
        // Let's adjust the approach: we need to add the *claims* to the token,
        // and NextAuth will generate the JWT. The session callback then gets this token.
        // We don't need to manually add the JWT string itself here.
        // The issue is likely accessing the *claims* from the session object on the frontend.
        // Let's ensure the session object gets the necessary claims.
      }

      // Handle session updates triggered by the update() function
      if (trigger === "update" && session) {
        console.log(
          "[NextAuth JWT Callback] Update trigger detected. Session data:",
          session
        ); // DEBUG LOG
        // Merge the session data passed from update() into the token
        // Ensure only allowed fields are updated for security if needed
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
        // Add other fields from session update as needed
      }

      // Removed the block that always fetches from DB within JWT callback.
      // The session callback already handles fetching fresh data based on the token.

      console.log(
        "[NextAuth JWT Callback] END - Returning Token:",
        JSON.stringify(token)
      ); // DEBUG LOG
      return token; // Return the updated token
    },
    async session({ session, token }) {
      console.log(
        "[NextAuth Session Callback] START - Incoming Session:",
        JSON.stringify(session)
      ); // DEBUG LOG
      console.log(
        "[NextAuth Session Callback] START - Incoming Token:",
        JSON.stringify(token)
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
