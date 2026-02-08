import type { Context, Next } from "hono";
import { auth } from "../auth";
import { prisma } from "../prisma";

/**
 * Variables set by the auth middleware
 */
export interface AuthVariables {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
    image?: string | null;
  };
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
}

/**
 * Auth middleware - validates session and populates user/session
 * Also checks if user is deactivated and invalidates their session
 */
export async function authMiddleware(c: Context, next: Next) {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  // Check if user is deactivated or soft-deleted (fetch fresh status from DB)
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { status: true, deletedAt: true },
  });

  // Check if user is soft-deleted
  if (!user || user.deletedAt) {
    // Delete the session to force logout
    try {
      await prisma.session.delete({
        where: { id: session.session.id },
      });
    } catch {
      // Session may already be deleted
    }
    return c.json(
      { error: { message: "Account has been deleted. Contact admin.", code: "ACCOUNT_DELETED" } },
      403
    );
  }

  // Check if user is deactivated
  if (user.status === "INACTIVE") {
    // Delete the session to force logout
    try {
      await prisma.session.delete({
        where: { id: session.session.id },
      });
    } catch {
      // Session may already be deleted
    }
    return c.json(
      { error: { message: "Account is deactivated. Contact admin.", code: "ACCOUNT_DEACTIVATED" } },
      403
    );
  }

  c.set("user", session.user);
  c.set("session", session.session);

  return next();
}

/**
 * Admin middleware - requires user to have ADMIN role
 * Must be used after authMiddleware
 */
export async function adminMiddleware(c: Context, next: Next) {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  if (user.role !== "ADMIN") {
    return c.json({ error: { message: "Forbidden - Admin access required", code: "FORBIDDEN" } }, 403);
  }

  return next();
}

/**
 * Tenant middleware - requires user to have TENANT role and active status
 * Must be used after authMiddleware
 */
export async function tenantMiddleware(c: Context, next: Next) {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  if (user.role !== "TENANT") {
    return c.json({ error: { message: "Forbidden - Tenant access required", code: "FORBIDDEN" } }, 403);
  }

  if (user.status !== "ACTIVE") {
    return c.json({ error: { message: "Account is inactive", code: "INACTIVE_ACCOUNT" } }, 403);
  }

  return next();
}
