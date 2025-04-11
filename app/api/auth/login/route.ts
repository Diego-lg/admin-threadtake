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

    const token = jwt.sign(tokenPayload, jwtSecret, {
      expiresIn: "1d", // Example: token expires in 1 day
    });

    // Return the necessary user data AND the token as JSON
    return NextResponse.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error("[AUTH_LOGIN_POST]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
