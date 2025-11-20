// Diagnostic script to identify the source of the bind error
// This will help us understand what's causing the undefined bind issue

console.log("[DEBUG] Starting bind error diagnosis...");

// Check 1: Next.js version compatibility
const packageJson = require("./package.json");
console.log("[DEBUG] Next.js version:", packageJson.dependencies.next);
console.log("[DEBUG] React version:", packageJson.dependencies.react);
console.log(
  "[DEBUG] React DOM version:",
  packageJson.dependencies["react-dom"]
);

// Check 2: Potential middleware issues
console.log("[DEBUG] Checking middleware configuration...");
try {
  const middleware = require("./middleware.ts");
  console.log("[DEBUG] Middleware loaded successfully");
  console.log("[DEBUG] Middleware config:", middleware.config);
} catch (error) {
  console.error("[DEBUG] Error loading middleware:", error.message);
}

// Check 3: NextAuth configuration
console.log("[DEBUG] Checking NextAuth configuration...");
try {
  const { authOptions } = require("./lib/auth.ts");
  console.log("[DEBUG] Auth options loaded successfully");
  console.log(
    "[DEBUG] Auth providers count:",
    authOptions.providers?.length || 0
  );
  console.log("[DEBUG] Auth callbacks present:", !!authOptions.callbacks);
} catch (error) {
  console.error("[DEBUG] Error loading auth config:", error.message);
}

// Check 4: Provider components
console.log("[DEBUG] Checking provider components...");
try {
  const providers = require("./providers/providers.tsx");
  console.log("[DEBUG] Providers component loaded successfully");
} catch (error) {
  console.error("[DEBUG] Error loading providers:", error.message);
}

// Check 5: Mockup worker initialization
console.log("[DEBUG] Checking mockup worker...");
try {
  const mockupWorker = require("./lib/init-mockup-worker.ts");
  console.log("[DEBUG] Mockup worker loaded successfully");
} catch (error) {
  console.error("[DEBUG] Error loading mockup worker:", error.message);
}

console.log("[DEBUG] Bind error diagnosis complete.");
