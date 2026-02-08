import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { prisma } from "../prisma";
import { authMiddleware } from "../middleware/auth";
import type { AuthVariables } from "../middleware/auth";
import { UpdateProfileSchema, ChangePasswordSchema } from "../types";

const meRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
meRouter.use("*", authMiddleware);

/**
 * GET /api/me
 * Get current user profile (name, email, phone)
 */
meRouter.get("/", async (c) => {
  const user = c.get("user");

  // Fetch the full user from DB to get phone field
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  if (!dbUser) {
    return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      phone: dbUser.phone,
      role: dbUser.role,
      status: dbUser.status,
      createdAt: dbUser.createdAt.toISOString(),
    },
  });
});

/**
 * PATCH /api/me
 * Update profile fields (name, phone - email is read-only)
 */
meRouter.patch("/", zValidator("json", UpdateProfileSchema), async (c) => {
  const user = c.get("user");
  const data = c.req.valid("json");

  // Only allow updating name and phone
  const updateData: { name?: string; phone?: string | null } = {};

  if (data.name !== undefined) {
    updateData.name = data.name;
  }

  if (data.phone !== undefined) {
    updateData.phone = data.phone;
  }

  // If nothing to update, return current profile
  if (Object.keys(updateData).length === 0) {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    if (!dbUser) {
      return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);
    }

    return c.json({
      data: {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        phone: dbUser.phone,
        role: dbUser.role,
        status: dbUser.status,
        createdAt: dbUser.createdAt.toISOString(),
      },
    });
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  return c.json({
    data: {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      role: updatedUser.role,
      status: updatedUser.status,
      createdAt: updatedUser.createdAt.toISOString(),
    },
  });
});

/**
 * POST /api/me/change-password
 * Change password - requires current password verification
 * Deletes all sessions after password change (force re-login)
 */
meRouter.post("/change-password", zValidator("json", ChangePasswordSchema), async (c) => {
  const user = c.get("user");
  const data = c.req.valid("json");

  // Get the user's credential account (email/password)
  const account = await prisma.account.findFirst({
    where: {
      userId: user.id,
      providerId: "credential",
    },
  });

  if (!account || !account.password) {
    return c.json(
      { error: { message: "No password set for this account", code: "NO_PASSWORD" } },
      400
    );
  }

  // Verify current password using Better Auth's password verification (scrypt)
  const isValidPassword = await verifyPassword({
    hash: account.password,
    password: data.currentPassword,
  });

  if (!isValidPassword) {
    return c.json(
      { error: { message: "Current password is incorrect", code: "INVALID_PASSWORD" } },
      400
    );
  }

  // Hash the new password using Better Auth's password hashing (scrypt)
  const hashedPassword = await hashPassword(data.newPassword);

  // Update the password
  await prisma.account.update({
    where: { id: account.id },
    data: {
      password: hashedPassword,
    },
  });

  // Delete all sessions for this user (force re-login on all devices)
  await prisma.session.deleteMany({
    where: { userId: user.id },
  });

  return c.json({
    data: {
      success: true,
      message: "Password changed successfully. Please log in again.",
    },
  });
});

export { meRouter };
