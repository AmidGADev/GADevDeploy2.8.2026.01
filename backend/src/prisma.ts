import { PrismaClient } from "@prisma/client";
import { isProduction } from "./env";

/**
 * Prisma Client Singleton
 *
 * Uses singleton pattern to prevent multiple instances during hot-reloading in development.
 * In production, this ensures a single connection pool is reused.
 */

// Extend globalThis to store prisma instance (for dev hot-reloading)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Configure Prisma with logging based on environment
const prismaClientSingleton = () => {
  return new PrismaClient({
    log: isProduction()
      ? ["error", "warn"] // Only log errors and warnings in production
      : ["query", "error", "warn"], // Include queries in development
  });
};

// Use existing instance or create new one
export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

// In development, store the instance globally to prevent new instances on hot-reload
if (!isProduction()) {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown handler
const shutdown = async () => {
  console.log("Disconnecting Prisma client...");
  await prisma.$disconnect();
  process.exit(0);
};

// Handle termination signals
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Validate database connection on startup (production only)
if (isProduction()) {
  prisma.$connect()
    .then(() => {
      console.log("✅ Database connection established");
    })
    .catch((error) => {
      console.error("❌ Failed to connect to database:", error.message);
      process.exit(1);
    });
}
// Force reload: Tue Jan 27 02:25:16 UTC 2026
// Force reload: Thu Feb  5 07:43:33 UTC 2026
