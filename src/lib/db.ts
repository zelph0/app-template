import "server-only";
import { PrismaNeon } from "@prisma/adapter-neon";
import { env } from "@/env";
import { PrismaClient } from "@/generated/prisma/client";

function createClient() {
  // Pooled URL + Neon serverless driver: safe for many short-lived serverless invocations.
  const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Reuse one client across hot reloads in dev; each serverless instance gets its own in prod.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
