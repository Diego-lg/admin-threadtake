import { PrismaClient } from "@prisma/client";

/* eslint-disable no-var */
declare global {
  var prisma: PrismaClient | undefined;
}
/* eslint-enable no-var */

// --- TEMPORARY DEBUG LOGGING ---
// Log the FULL DATABASE_URL being used at runtime in Vercel
// REMOVE THIS LATER FOR SECURITY
console.log(
  "[Backend Prisma Init - DEBUG] Full DATABASE_URL:",
  process.env.DATABASE_URL || "DATABASE_URL Env Var Not Set!"
);
// --- END TEMPORARY DEBUG LOGGING ---

const prismadb =
  globalThis.prisma ||
  new PrismaClient({
    // Optional: Add logs here if needed
    // log: ['query', 'info', 'warn', 'error'],
  });

if (process.env.NODE_ENV !== "production") globalThis.prisma = prismadb;

export default prismadb;
