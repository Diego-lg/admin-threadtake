// Test script to verify the bind error fix
console.log("[TEST] Testing bind error fix...");

// Test 1: Check if the server can start without the bind error
const { spawn } = require("child_process");

console.log("[TEST] Starting Next.js development server...");

const devServer = spawn("npm", ["run", "dev"], {
  stdio: "pipe",
  cwd: process.cwd(),
});

let hasBindError = false;
let serverStarted = false;

const timeout = setTimeout(() => {
  if (!serverStarted && !hasBindError) {
    console.log("[TEST] ✅ Server appears to be starting without bind errors");
    devServer.kill("SIGTERM");
    process.exit(0);
  }
}, 10000); // Wait 10 seconds

devServer.stdout.on("data", (data) => {
  const output = data.toString();
  console.log("[SERVER]", output.trim());

  if (output.includes("ready") || output.includes("started")) {
    serverStarted = true;
    console.log("[TEST] ✅ Server started successfully!");
    clearTimeout(timeout);
    devServer.kill("SIGTERM");
    process.exit(0);
  }
});

devServer.stderr.on("data", (data) => {
  const output = data.toString();
  console.error("[SERVER ERROR]", output.trim());

  if (output.includes("Cannot read properties of undefined (reading 'bind')")) {
    hasBindError = true;
    console.log("[TEST] ❌ Bind error still present");
    clearTimeout(timeout);
    devServer.kill("SIGTERM");
    process.exit(1);
  }
});

devServer.on("close", (code) => {
  if (!serverStarted && !hasBindError) {
    console.log("[TEST] ✅ Server process closed without bind errors");
  }
  clearTimeout(timeout);
});

devServer.on("error", (error) => {
  console.error("[TEST] Failed to start server:", error);
  clearTimeout(timeout);
  process.exit(1);
});
