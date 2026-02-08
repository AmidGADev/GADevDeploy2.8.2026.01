/**
 * Admin MFA Routes for GA Developments Property Management
 *
 * @module admin/mfa
 * @description API endpoints for Multi-Factor Authentication management
 * including challenge creation, verification, and settings.
 */

import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { z } from "zod";
import {
  createMfaChallenge,
  verifyMfaChallenge,
  enableMfa,
  disableMfa,
  requiresMfaVerification,
} from "../../lib/mfa-service";
import { auditSecurityAction } from "../../lib/audit-service";

const adminMfaRouter = new Hono<{ Variables: AuthVariables }>();

// Auth required for all routes
adminMfaRouter.use("*", authMiddleware);
adminMfaRouter.use("*", adminMiddleware);

/**
 * GET /api/admin/mfa/status
 * Get current MFA status for the admin user
 */
adminMfaRouter.get("/status", async (c) => {
  const user = c.get("user");

  const adminUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      mfaEnabled: true,
      mfaLastVerifiedAt: true,
    },
  });

  if (!adminUser) {
    return c.json({ error: { message: "User not found" } }, 404);
  }

  const requiresVerification = await requiresMfaVerification(user.id);

  return c.json({
    data: {
      mfaEnabled: adminUser.mfaEnabled,
      lastVerifiedAt: adminUser.mfaLastVerifiedAt,
      requiresVerification,
    },
  });
});

/**
 * POST /api/admin/mfa/enable
 * Enable MFA for the admin user
 */
adminMfaRouter.post("/enable", async (c) => {
  const user = c.get("user");
  const session = c.get("session");

  const success = await enableMfa(user.id);

  if (success) {
    await auditSecurityAction(
      "UPDATE",
      { id: user.id, email: user.email, role: user.role },
      "Enabled MFA for admin account",
      { action: "mfa_enable" },
      { ipAddress: session.ipAddress || undefined, userAgent: session.userAgent || undefined }
    );

    return c.json({ data: { success: true, message: "MFA enabled successfully" } });
  }

  return c.json({ error: { message: "Failed to enable MFA" } }, 500);
});

/**
 * POST /api/admin/mfa/disable
 * Disable MFA for the admin user (requires recent MFA verification)
 */
adminMfaRouter.post("/disable", async (c) => {
  const user = c.get("user");
  const session = c.get("session");

  // Check if MFA was recently verified (within 5 minutes for disable action)
  const adminUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mfaLastVerifiedAt: true },
  });

  if (!adminUser?.mfaLastVerifiedAt) {
    return c.json({ error: { message: "MFA verification required" } }, 403);
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  if (adminUser.mfaLastVerifiedAt < fiveMinutesAgo) {
    return c.json({ error: { message: "Recent MFA verification required to disable MFA" } }, 403);
  }

  const success = await disableMfa(user.id);

  if (success) {
    await auditSecurityAction(
      "UPDATE",
      { id: user.id, email: user.email, role: user.role },
      "Disabled MFA for admin account",
      { action: "mfa_disable" },
      { ipAddress: session.ipAddress || undefined, userAgent: session.userAgent || undefined }
    );

    return c.json({ data: { success: true, message: "MFA disabled successfully" } });
  }

  return c.json({ error: { message: "Failed to disable MFA" } }, 500);
});

/**
 * POST /api/admin/mfa/challenge
 * Request a new MFA verification code
 */
adminMfaRouter.post("/challenge", async (c) => {
  const user = c.get("user");
  const session = c.get("session");

  const result = await createMfaChallenge(
    user.id,
    session.id,
    session.ipAddress || undefined,
    session.userAgent || undefined
  );

  if (result.success) {
    return c.json({
      data: {
        success: true,
        message: "Verification code sent to your email",
        expiresAt: result.expiresAt,
      },
    });
  }

  return c.json({ error: { message: result.error || "Failed to send verification code" } }, 500);
});

// Schema for verification
const VerifyMfaSchema = z.object({
  code: z.string().length(6).regex(/^\d+$/, "Code must be 6 digits"),
});

/**
 * POST /api/admin/mfa/verify
 * Verify an MFA code
 */
adminMfaRouter.post("/verify", async (c) => {
  const user = c.get("user");
  const session = c.get("session");

  const body = await c.req.json();
  const parsed = VerifyMfaSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: { message: "Invalid code format. Must be 6 digits." } }, 400);
  }

  const ipAddress = session.ipAddress || c.req.header("x-forwarded-for") || "unknown";
  const result = await verifyMfaChallenge(user.id, parsed.data.code, ipAddress);

  if (result.success) {
    await auditSecurityAction(
      "MFA_VERIFY",
      { id: user.id, email: user.email, role: user.role },
      "Successfully verified MFA code",
      { action: "mfa_verify_success" },
      { ipAddress: session.ipAddress || undefined, userAgent: session.userAgent || undefined }
    );

    return c.json({ data: { success: true, message: "Verification successful" } });
  }

  // Log failed attempt
  await auditSecurityAction(
    "MFA_FAIL",
    { id: user.id, email: user.email, role: user.role },
    "Failed MFA verification attempt",
    {
      action: "mfa_verify_fail",
      attemptsRemaining: result.attemptsRemaining,
      locked: !!result.lockedUntil,
    },
    { ipAddress: session.ipAddress || undefined, userAgent: session.userAgent || undefined }
  );

  return c.json(
    {
      error: {
        message: result.error || "Verification failed",
        attemptsRemaining: result.attemptsRemaining,
        lockedUntil: result.lockedUntil,
      },
    },
    result.lockedUntil ? 429 : 400
  );
});

export { adminMfaRouter };
