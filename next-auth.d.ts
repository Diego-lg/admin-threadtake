import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";
import { UserRole } from "@prisma/client"; // Import UserRole enum

declare module "next-auth" {
  /**
   * Represents the session object returned by `useSession`, `getSession`, etc.
   */
  interface Session extends DefaultSession {
    user: {
      id: string; // Add the user ID property
      role: UserRole; // Add the role property
      // Add custom fields that are added in the session callback
      profileCardBackground?: string | null;
      bio?: string | null;
      portfolioUrl?: string | null;
    } & DefaultSession["user"];
  }

  /**
   * Represents the User model returned by the adapter or authorize callback.
   */
  interface User extends DefaultUser {
    // Add custom properties from your Prisma User model
    role: UserRole;
  }
}

declare module "next-auth/jwt" {
  /**
   * Represents the JWT payload.
   */
  interface JWT extends DefaultJWT {
    id: string; // Add the user ID to the JWT payload
    // Add custom properties here as well
    role: UserRole;
    // Add fields potentially added in the jwt callback
    name?: string | null;
    image?: string | null;
    profileCardBackground?: string | null;
    bio?: string | null;
    portfolioUrl?: string | null;
  }
}
