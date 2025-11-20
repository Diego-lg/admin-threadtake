// Server-side initialization that runs after the server is fully started
// This avoids the bind context issues during Next.js startup

import { startMockupWorker } from "./mockup-worker";

// Initialize the mockup background worker safely
export function initializeServerServices() {
  console.log("[SERVER_INIT] Initializing server services...");

  try {
    // Check if we're in a server environment
    if (typeof window === "undefined") {
      // Start the mockup worker with proper error handling
      startMockupWorker();
      console.log("[SERVER_INIT] ✅ Mockup worker started successfully");
    } else {
      console.log(
        "[SERVER_INIT] ⚠️  Running in client environment, skipping server services"
      );
    }
  } catch (error) {
    console.error("[SERVER_INIT] ❌ Failed to start mockup worker:", error);
    if (error instanceof Error) {
      console.error("[SERVER_INIT] Error details:", error.message);
      console.error("[SERVER_INIT] Error stack:", error.stack);
    }
    // Don't throw the error, just log it
    // This prevents the server from crashing during initialization
  }
}

// Export a function that can be called safely
export default initializeServerServices;
