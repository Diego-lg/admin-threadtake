import { AuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import * as jose from "jose";

import prismadb from "@/lib/prismadb";
import { UserRole } from "@prisma/client";

// Admin email restriction - configurable via ADMIN_EMAIL environment variable
// If ADMIN_EMAIL is set, only that email can access the backend
// If not set, email restriction is disabled (all authenticated users can access)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.toLowerCase();

// Get and validate the secret - throw error if missing
function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET environment variable is not set");
  }
  return secret;
}

const secret = getSecret();
const secretKey = new TextEncoder().encode(secret);

// Define authOptions here
export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prismadb),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  debug: process.env.NODE_ENV === "development",
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: secret,
  jwt: {
    // Use the jose library for encoding/decoding JWTs
    encode: async ({ token }) => {
      return await new jose.SignJWT(token as jose.JWTPayload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("30d")
        .sign(secretKey);
    },
    decode: async ({ token }) => {
      try {
        const { payload } = await jose.jwtVerify(
          token as string,
          secretKey
        );
        return payload;
      } catch {
        return null;
      }
    },
  },
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
    async jwt({ token, user, account, trigger, session }) {
      // Initial sign in
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }

      // Handle session updates
      if (trigger === "update" && session) {
        token.name = session.name;
        token.picture = session.picture;
      }

      return token;
    },
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
    async session({ session, token }) {
      console.log("[NextAuth Session Callback] Loading session from token");

      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string | null;
        session.user.image = token.picture as string | null;

        // Fetch additional user data from database for role and other fields
        try {
          const dbUser = await prismadb.user.findUnique({
            where: { id: token.id as string },
          });

          if (dbUser) {
            session.user.role = dbUser.role as UserRole;
            session.user.profileCardBackground = dbUser.profileCardBackground;
            session.user.bio = dbUser.bio;
            session.user.portfolioUrl = dbUser.portfolioUrl;
            session.user.hasCompletedProfile = !!dbUser.name;
            console.log(
              `[NextAuth] Session loaded for user: ${dbUser.email}, role: ${dbUser.role}`,
            );
          }
        } catch (error) {
          console.error("[NextAuth] Error fetching user from database:", error);
        }
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
      console.log("[NextAuth] User signed out");
    },
  },
};
