import { AuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";

import prismadb from "@/lib/prismadb"; // Assuming prismadb is exported from here
import { User } from "@prisma/client";

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
      if (token?.id && session.user) {
        console.log(
          `[NextAuth Session Callback] Triggered for token ID: ${token.id}`
        ); // DEBUG LOG
        // Fetch the latest user data from DB using the ID from the token
        const userFromDb = await prismadb.user.findUnique({
          where: { id: token.id as string },
        });
        console.log(
          `[NextAuth Session Callback] User fetched from DB:`,
          userFromDb
        ); // DEBUG LOG
        if (userFromDb) {
          // Populate session.user with fresh data from the database
          session.user.id = userFromDb.id;
          session.user.name = userFromDb.name;
          session.user.email = userFromDb.email;
          session.user.image = userFromDb.image; // Include the image URL
          session.user.role = userFromDb.role;
          session.user.profileCardBackground = userFromDb.profileCardBackground; // Add background URL
          session.user.bio = userFromDb.bio; // Add bio
          session.user.portfolioUrl = userFromDb.portfolioUrl; // Add portfolio URL
          // Add any other user fields you want in the session here

          // Also update the token object passed to the session callback
          // This might help in edge cases, although jwt callback should handle token updates
          token.name = userFromDb.name;
          token.image = userFromDb.image;
          token.role = userFromDb.role;
          token.profileCardBackground = userFromDb.profileCardBackground;
          token.bio = userFromDb.bio;
          token.portfolioUrl = userFromDb.portfolioUrl;
        } else {
          // Handle case where user might not be found in DB (optional, depends on logic)
          // For safety, maybe clear parts of the session or return unmodified session
          console.error(
            `Session callback: User with id ${token.id} not found in DB.`
          );
        }
      }
      console.log(`[NextAuth Session Callback] Returning session:`, session); // DEBUG LOG
      return session; // Return the potentially modified session
    },
  },
};
