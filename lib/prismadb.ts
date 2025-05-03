import { PrismaClient } from "@prisma/client";

/* eslint-disable no-var */
declare global {
  var prisma: PrismaClient | undefined;
}
/* eslint-enable no-var */

// Log the DATABASE_URL being used (or lack thereof)
console.log(
  "[Prisma Init] DATABASE_URL:",
  process.env.DATABASE_URL
    ? "****" + process.env.DATABASE_URL.slice(-10)
    : "Not Set"
); // Log only the end of the URL for security

const prismadb = globalThis.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.prisma = prismadb;

export default prismadb;
