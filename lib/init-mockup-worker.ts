import { startMockupWorker } from "./mockup-worker";

// Initialize the mockup background worker
// This should be imported and called in your Next.js app entry point
export function initializeMockupWorker() {
  console.log("[INIT] Starting mockup background worker...");

  try {
    startMockupWorker();
    console.log("[INIT] ✅ Mockup background worker started successfully");
  } catch (error) {
    console.error("[INIT] ❌ Failed to start mockup background worker:", error);
  }
}

// Auto-start the worker if this module is imported
// This ensures the worker starts when the backend starts
// DISABLED: This was causing bind context issues during Next.js startup
// The worker is now initialized safely through the API route
/*
if (typeof window === "undefined") {
  // Only run on server side
  console.log(
    "[INIT] Server-side detected, attempting to start mockup worker..."
  );
  try {
    initializeMockupWorker();
  } catch (error) {
    console.error("[INIT] ❌ Failed to initialize mockup worker:", error);
    console.error("[INIT] Error stack:", error.stack);
  }
}
*/
