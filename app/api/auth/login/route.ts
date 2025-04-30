import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken"; // Import jsonwebtoken
import prismadb from "@/lib/prismadb";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return new NextResponse("Missing email or password", { status: 400 });
    }

    const user = await prismadb.user.findUnique({
      where: {
        email: email,
      },
    });

    // If user doesn't exist or doesn't have a hashed password
    if (!user || !user.hashedPassword) {
      console.log(
        `Login attempt failed: User not found or no password for ${email}`
      );
      return new NextResponse("Invalid credentials", { status: 401 });
    }

    const isCorrectPassword = await bcrypt.compare(
      password,
      user.hashedPassword
    );

    if (!isCorrectPassword) {
      console.log(`Login attempt failed: Incorrect password for ${email}`);
      return new NextResponse("Invalid credentials", { status: 401 });
    }

    // Important: Do NOT return the hashedPassword
    const { ...userWithoutPassword } = user;

    console.log(`Login successful for ${email}`);

    // Generate JWT
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error("JWT_SECRET environment variable is not set!");
      // In a real app, you might throw an error or use a default for dev only
      return new NextResponse("Internal Server Error: JWT secret missing", {
        status: 500,
      });
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role, // Include role in the token payload
      // Add any other relevant non-sensitive info needed by the frontend
    };

    const expiresInSeconds = 24 * 60 * 60; // 1 day in seconds
    const token = jwt.sign(tokenPayload, jwtSecret, {
      expiresIn: expiresInSeconds,
    });
    const nowInMs = Date.now();
    const expiresAtMs = nowInMs + expiresInSeconds * 1000;

    // Return the response matching the frontend's expected structure
    return NextResponse.json({
      user: userWithoutPassword,
      accessToken: token,
      refreshToken: token, // Using same token as placeholder for refresh token
      accessTokenExpiresAt: expiresAtMs,
    });
  } catch (error) {
    console.error("[AUTH_LOGIN_POST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
