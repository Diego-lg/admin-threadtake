import { PrismaClient } from "@prisma/client";

/* eslint-disable no-var */
declare global {
  var prisma: PrismaClient | undefined;
}
/* eslint-enable no-var */

const prismadb =
  globalThis.prisma ||
  new PrismaClient({
    // Optional: Add logs here if needed
    // log: ['query', 'info', 'warn', 'error'],
  });

if (process.env.NODE_ENV !== "production") globalThis.prisma = prismadb;

export default prismadb;
