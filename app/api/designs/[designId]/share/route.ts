import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { updateSharingStatus } from "@/actions/saved-designs"; // Import the function
import { UserRole } from "@prisma/client";

// Define the expected shape of the JWT payload (matching other routes)
interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export async function POST(
  req: Request,
  { params }: { params: { designId: string } }
) {
  try {
    console.log(
      `[API SHARE] Received POST request for design ${params.designId}`
    );

    // 1. Get Authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new NextResponse("Authorization header missing or invalid", {
        status: 401,
      });
    }

    // 2. Extract and Verify token (Ensure JWT_SECRET is set)
    const token = authHeader.split(" ")[1];
    let decodedPayload: JwtPayload;
    try {
      const jwtSecret = process.env.JWT_SECRET;
      // Log the secret status and a few chars for verification (DO NOT log the full secret)
      console.log(
        `[API SHARE] JWT_SECRET Loaded: ${!!jwtSecret}, Starts with: ${
          jwtSecret?.substring(0, 3) ?? "N/A"
        }`
      );
      if (!jwtSecret) {
        console.error(
          "[API SHARE] JWT_SECRET environment variable is missing!"
        );
        throw new Error("JWT_SECRET environment variable is not set!");
      }
      console.log("[API SHARE] Attempting to verify token:", token);
      decodedPayload = jwt.verify(token, jwtSecret) as JwtPayload;
      console.log(
        "[API SHARE] Token verified successfully. Payload:",
        decodedPayload
      );
    } catch (error: unknown) {
      // Catch specific error and log details if it's an Error instance
      if (error instanceof Error) {
        console.error("[API SHARE] JWT Verification Error Details:", {
          message: error.message,
          name: error.name,
          // Potentially log other properties if needed, e.g., error.expiredAt for expiration errors
        });
      } else {
        // Log the error if it's not a standard Error object
        console.error(
          "[API SHARE] JWT Verification Error (Unknown Type):",
          error
        );
      }
      return new NextResponse("Invalid or expired token", { status: 401 });
    }

    // 3. Check User ID from token
    const userId = decodedPayload.userId;
    if (!userId) {
      return new NextResponse("User ID not found in token", { status: 401 });
    }
    console.log(`[API SHARE] Authenticated user: ${userId}`);

    // 4. Get designId from params
    const { designId } = params;
    if (!designId) {
      return new NextResponse("Design ID is required", { status: 400 });
    }

    // 5. Get desired sharing status from request body
    const body = await req.json();
    const { isShared } = body;

    if (typeof isShared !== "boolean") {
      return new NextResponse(
        "Invalid 'isShared' value in request body. Must be true or false.",
        { status: 400 }
      );
    }
    console.log(`[API SHARE] Requested sharing status: ${isShared}`);

    // 6. Call the existing updateSharingStatus function
    // Note: updateSharingStatus already handles ownership verification
    const result = await updateSharingStatus(userId, designId, isShared); // Pass userId as first argument

    // 7. Return response based on the result
    if (result.success) {
      console.log(
        `[API SHARE] Successfully updated sharing status for design ${designId}`
      );
      return NextResponse.json(result.data || { success: true }); // Return data if available
    } else {
      console.error(
        `[API SHARE] Failed to update sharing status for design ${designId}: ${result.error}`
      );
      // Map internal errors to appropriate client responses
      if (result.error === "Unauthenticated") {
        return new NextResponse("Unauthenticated", { status: 401 });
      }
      if (result.error === "Design not found or unauthorized") {
        return new NextResponse("Design not found or unauthorized", {
          status: 404,
        });
      }
      // General internal error for other cases
      return new NextResponse(result.error || "Internal Server Error", {
        status: 500,
      });
    }
  } catch (error) {
    console.error("[API SHARE ROUTE ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
