import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import { UserRole, UserStatus } from "@prisma/client"; // Import enums

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, image, providerAccountId, isFirstTime } = body;

    // --- Validation ---
    if (!email) {
      return new NextResponse("Email is required", { status: 400 });
    }
    if (!providerAccountId) {
      return new NextResponse("Provider Account ID is required", {
        status: 400,
      });
    }

    // --- Find Existing User ---
    // A user might exist with the same email but hasn't linked their Google account yet,
    // or they might already have an account via Google.
    let user = await prismadb.user.findUnique({
      where: { email },
      include: { accounts: true }, // Include linked accounts to check provider
    });

    let isFirstTimeUser = false;

    if (user) {
      // User with this email exists. Check if they have a Google account linked.
      const googleAccount = user.accounts.find(
        (acc) =>
          acc.provider === "google" &&
          acc.providerAccountId === providerAccountId
      );

      if (googleAccount) {
        // --- Scenario 1: User exists and has already signed in with this Google account ---
        console.log(`[Google Sign-In] Existing user found for email: ${email}`);
        // For returning Google users, don't update name/image from Google
        // Only update if user has explicitly set them to null/empty
        if (name === null && user.name !== null) {
          // Don't overwrite existing name with null
        } else if (image === null && user.image !== null) {
          // Don't overwrite existing image with null
        }
      } else {
        // --- Scenario 2: User exists (e.g., created via credentials) but is now linking Google ---
        console.log(
          `[Google Sign-In] Linking Google account for existing user: ${email}`
        );
        await prismadb.account.create({
          data: {
            userId: user.id,
            type: "oauth",
            provider: "google",
            providerAccountId: providerAccountId,
          },
        });
      }
    } else {
      // --- Scenario 3: New user, create both User and Account records ---
      console.log(`[Google Sign-In] Creating new user for email: ${email}`);
      isFirstTimeUser = true;
      user = await prismadb.user.create({
        data: {
          email,
          name: null, // Don't auto-populate name from Google
          image: null, // Don't auto-populate image from Google
          emailVerified: new Date(), // Assume email is verified by Google
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
          hasCompletedProfileSetup: false, // Add flag to track profile setup completion
          accounts: {
            create: {
              type: "oauth",
              provider: "google",
              providerAccountId: providerAccountId,
            },
          },
        },
        include: { accounts: true },
      });
    }

    // --- Return User Data ---
    // We don't need to return tokens here as NextAuth on the frontend handles that.
    // We just need to return the user profile.
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        hasCompletedProfileSetup: user.hasCompletedProfileSetup ?? false,
        isFirstTimeUser,
      },
    });
  } catch (error) {
    console.error("[GOOGLE_SIGNIN_POST]", error);
    // Be careful not to leak sensitive error details
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return new NextResponse(
      JSON.stringify({ message: "Internal Server Error", error: errorMessage }),
      { status: 500 }
    );
  }
}
