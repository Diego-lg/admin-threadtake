import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { R2Config } from "@/lib/r2-config";
import { UserFolderPaths } from "@/lib/r2-user-storage";

/**
 * Request body interface for URL translation
 */
interface TranslateUrlRequest {
  url: string;
  userId?: string; // For admin access to other users' files
}

/**
 * Response interface for URL translation
 */
interface TranslateUrlResponse {
  originalUrl: string;
  translatedUrl?: string;
  userId?: string;
  fileType?: string;
  isTranslated: boolean;
  message?: string;
}

/**
 * Legacy URL patterns to translate
 */
const LEGACY_URL_PATTERNS = [
  {
    pattern: /^.*\/designs\/([^\/]+)\/(.+)$/,
    type: "designs",
    description: "Legacy design folder structure",
  },
  {
    pattern: /^.*\/profile_pictures\/(.+)$/,
    type: "profile-pictures",
    description: "Legacy profile picture folder",
  },
  {
    pattern: /^.*\/user-uploads\/(.+)$/,
    type: "assets",
    description: "Legacy user uploads folder",
  },
  {
    pattern: /^.*\/mockups\/([^\/]+)\/(.+)$/,
    type: "mockups",
    description: "Legacy mockup folder structure",
  },
];

// POST handler for translating legacy URLs to new user-centric format
export async function POST(req: Request) {
  try {
    // 1. Check Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // 2. Parse request body
    const body: TranslateUrlRequest = await req.json();
    const { url, userId: targetUserId } = body;

    if (!url) {
      return new NextResponse("Missing required field: url", { status: 400 });
    }

    const userId = session.user.id;
    const effectiveUserId =
      targetUserId && session.user.role === UserRole.ADMIN
        ? targetUserId
        : userId;

    // 3. Authorization check for accessing other users' URLs
    if (
      targetUserId &&
      targetUserId !== userId &&
      session.user.role !== UserRole.ADMIN
    ) {
      return new NextResponse("Forbidden: Cannot translate other users' URLs", {
        status: 403,
      });
    }

    // 4. Validate R2 configuration
    if (!R2Config.validateConfig()) {
      return new NextResponse(
        "Server configuration error: R2 settings missing",
        { status: 500 }
      );
    }

    const config = R2Config.getConfig();
    const publicBucketUrl = config.publicBucketUrl.replace(/\/$/, "");

    // 5. Check if URL is already in the new format
    if (url.includes(`/users/${effectiveUserId}/`)) {
      return NextResponse.json({
        originalUrl: url,
        translatedUrl: url,
        userId: effectiveUserId,
        isTranslated: false,
        message: "URL is already in the new user-centric format",
      } as TranslateUrlResponse);
    }

    // 6. Extract the key from the URL
    let key: string;
    if (url.startsWith(publicBucketUrl)) {
      key = url.substring(publicBucketUrl.length + 1);
    } else {
      // Try to extract key from full URL
      const urlParts = url.split("/");
      const bucketIndex = urlParts.findIndex(
        (part) =>
          part.includes(".r2.cloudflarestorage.com") ||
          part.includes("r2.cloudflarestorage.com")
      );

      if (bucketIndex >= 0 && urlParts.length > bucketIndex + 1) {
        key = urlParts.slice(bucketIndex + 2).join("/");
      } else {
        return NextResponse.json({
          originalUrl: url,
          isTranslated: false,
          message: "Could not extract key from URL",
        } as TranslateUrlResponse);
      }
    }

    // 7. Try to match against legacy patterns
    let translatedKey: string | undefined;
    let fileType: string | undefined;

    for (const pattern of LEGACY_URL_PATTERNS) {
      const match = key.match(pattern.pattern);
      if (match) {
        switch (pattern.type) {
          case "designs":
            const designId = match[1];
            const filename = match[2];
            translatedKey = `${UserFolderPaths.getUserBasePath(
              effectiveUserId
            )}/designs/${designId}/${filename}`;
            fileType = "designs";
            break;

          case "profile-pictures":
            const profileFilename = match[1];
            translatedKey = `${UserFolderPaths.getProfilePicturesPath(
              effectiveUserId
            )}/${profileFilename}`;
            fileType = "profile-pictures";
            break;

          case "assets":
            const assetFilename = match[1];
            translatedKey = `${UserFolderPaths.getAssetTypePath(
              effectiveUserId,
              "uploads"
            )}/${assetFilename}`;
            fileType = "assets";
            break;

          case "mockups":
            const mockupDesignId = match[1];
            const mockupFilename = match[2];
            translatedKey = `${UserFolderPaths.getMockupsPath(
              effectiveUserId
            )}/${mockupDesignId}/${mockupFilename}`;
            fileType = "mockups";
            break;
        }

        if (translatedKey) {
          break;
        }
      }
    }

    // 8. Return translation result
    if (translatedKey) {
      const translatedUrl = `${publicBucketUrl}/${translatedKey}`;

      console.log(
        `[R2_TRANSLATE_URL] Translated URL for user ${effectiveUserId}:`,
        {
          originalUrl: url,
          translatedUrl,
          fileType,
          originalKey: key,
          translatedKey,
        }
      );

      return NextResponse.json({
        originalUrl: url,
        translatedUrl,
        userId: effectiveUserId,
        fileType,
        isTranslated: true,
        message: `Successfully translated ${fileType} URL to new user-centric format`,
      } as TranslateUrlResponse);
    } else {
      return NextResponse.json({
        originalUrl: url,
        isTranslated: false,
        message: "URL does not match any known legacy patterns",
      } as TranslateUrlResponse);
    }
  } catch (error: any) {
    console.error("[R2_TRANSLATE_URL] Error:", error);
    return new NextResponse(`Internal Server Error: ${error.message}`, {
      status: 500,
    });
  }
}

// GET handler for batch URL translation
export async function GET(req: Request) {
  try {
    // 1. Check Authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // 2. Parse query parameters
    const { searchParams } = new URL(req.url);
    const urlsParam = searchParams.get("urls");
    const userId = searchParams.get("userId");

    if (!urlsParam) {
      return new NextResponse("Missing required query parameter: urls", {
        status: 400,
      });
    }

    const urls = urlsParam
      .split(",")
      .map((url) => url.trim())
      .filter((url) => url);
    const effectiveUserId =
      userId && session.user.role === UserRole.ADMIN ? userId : session.user.id;

    // 3. Authorization check
    if (
      userId &&
      userId !== session.user.id &&
      session.user.role !== UserRole.ADMIN
    ) {
      return new NextResponse("Forbidden: Cannot translate other users' URLs", {
        status: 403,
      });
    }

    // 4. Process each URL
    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          // Call the POST handler logic internally
          const response = await POST(
            new Request(req.url, {
              method: "POST",
              body: JSON.stringify({ url, userId: effectiveUserId }),
              headers: {
                "Content-Type": "application/json",
                Authorization: req.headers.get("Authorization") || "",
              },
            })
          );

          const result = (await response.json()) as TranslateUrlResponse;
          return { url, ...result, success: true };
        } catch (error: any) {
          return {
            url,
            isTranslated: false,
            success: false,
            message: error.message,
          };
        }
      })
    );

    // 5. Return batch results
    const summary = {
      total: urls.length,
      translated: results.filter((r) => r.isTranslated).length,
      failed: results.filter((r) => !r.success).length,
    };

    console.log(
      `[R2_TRANSLATE_URL] Batch translation for user ${effectiveUserId}:`,
      summary
    );

    return NextResponse.json({
      results,
      summary,
    });
  } catch (error: any) {
    console.error("[R2_TRANSLATE_URL_GET] Error:", error);
    return new NextResponse(`Internal Server Error: ${error.message}`, {
      status: 500,
    });
  }
}
