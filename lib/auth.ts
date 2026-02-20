import { AuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";

import prismadb from "@/lib/prismadb";
import { UserRole } from "@prisma/client";

// Admin email restriction - configurable via ADMIN_EMAIL environment variable
// If ADMIN_EMAIL is set, only that email can access the backend
// If not set, email restriction is disabled (all authenticated users can access)
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
  debug: process.env.NODE_ENV === "development",
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? `__Secure-next-auth.session-token`
          : `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        domain: undefined,
      },
    },
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Admin email restriction
      if (ADMIN_EMAIL && user.email?.toLowerCase() !== ADMIN_EMAIL) {
        console.warn(
          `[NextAuth] Unauthorized sign-in attempt from email: ${user.email}`,
        );
        throw new Error(
          `Unauthorized email - only ${ADMIN_EMAIL} is allowed to access this backend.`,
        );
      }

      // Check if user exists in database
      const dbUser = await prismadb.user.findUnique({
        where: { email: user.email! },
      });

      if (!dbUser) {
        console.log(
          `[NextAuth] New user ${user.email} signing in, will be created by adapter`,
        );
      }

      return true;
    },
    async session({ session, user }) {
      console.log("[NextAuth Session Callback] Loading session from database");

      // Fetch fresh user data from database
      const dbUser = await prismadb.user.findUnique({
        where: { id: user.id },
      });

      if (dbUser && session.user) {
        session.user.id = dbUser.id;
        session.user.name = dbUser.name;
        session.user.email = dbUser.email;
        session.user.image = dbUser.image;
        session.user.role = dbUser.role as UserRole;
        session.user.profileCardBackground = dbUser.profileCardBackground;
        session.user.bio = dbUser.bio;
        session.user.portfolioUrl = dbUser.portfolioUrl;
        session.user.hasCompletedProfile = !!dbUser.name;

        console.log(
          `[NextAuth] Session loaded for user: ${dbUser.email}, role: ${dbUser.role}`,
        );
      }

      return session;
    },
  },
  events: {
    async signIn({ user, account, isNewUser }) {
      if (isNewUser) {
        console.log(`[NextAuth] New user created: ${user.id}`);
      }
    },
    async signOut({ session }) {
      console.log("[NextAuth] User signed out, session deleted from DB");
    },
  },
};
