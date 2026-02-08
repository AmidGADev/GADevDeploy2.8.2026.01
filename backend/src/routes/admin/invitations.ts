import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import crypto from "crypto";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { CreateInvitationSchema } from "../../types";
import { logAuditAction, AuditActions } from "../../lib/audit";
import { sendInvitationEmail } from "../../lib/email";
import { notifyNewTenant } from "../../lib/event-notifications";

const invitationsRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
invitationsRouter.use("*", authMiddleware);
invitationsRouter.use("*", adminMiddleware);

/**
 * Generate a secure random token (32 characters, URL-safe)
 */
function generateToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * GET /api/admin/invitations
 * List all invitations with related data
 */
invitationsRouter.get("/", async (c) => {
  const invitations = await prisma.invitation.findMany({
    include: {
      unit: {
        select: {
          id: true,
          unitLabel: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return c.json({
    data: invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      tenantName: inv.tenantName,
      unitId: inv.unitId,
      role: inv.role,
      roleInUnit: inv.roleInUnit,
      leaseStartDate: inv.leaseStartDate?.toISOString() ?? null,
      token: inv.token,
      expiresAt: inv.expiresAt.toISOString(),
      acceptedAt: inv.acceptedAt?.toISOString() ?? null,
      createdById: inv.createdById,
      createdAt: inv.createdAt.toISOString(),
      unit: inv.unit,
      createdBy: inv.createdBy,
    })),
  });
});

/**
 * POST /api/admin/invitations
 * Create a new invitation
 */
invitationsRouter.post("/", zValidator("json", CreateInvitationSchema), async (c) => {
  const user = c.get("user");
  const data = c.req.valid("json");

  // Check if email already has a pending (non-expired, non-accepted) invitation
  const existingInvitation = await prisma.invitation.findFirst({
    where: {
      email: data.email,
      acceptedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  if (existingInvitation) {
    return c.json(
      { error: { message: "A pending invitation already exists for this email", code: "INVITATION_EXISTS" } },
      400
    );
  }

  // Check if user already exists with this email (exclude soft-deleted users)
  const existingUser = await prisma.user.findFirst({
    where: {
      email: data.email,
      deletedAt: null,
    },
  });

  if (existingUser) {
    return c.json(
      { error: { message: "A user with this email already exists", code: "USER_EXISTS" } },
      400
    );
  }

  // If the user was soft-deleted, we need to hard delete them to allow re-invitation
  // This cleans up the old account so the new invitation can create a fresh account
  const softDeletedUser = await prisma.user.findFirst({
    where: {
      email: data.email,
      deletedAt: { not: null },
    },
  });

  if (softDeletedUser) {
    // Delete associated records first (accounts, sessions already deleted during soft-delete)
    await prisma.account.deleteMany({ where: { userId: softDeletedUser.id } });
    await prisma.session.deleteMany({ where: { userId: softDeletedUser.id } });
    await prisma.tenancy.deleteMany({ where: { userId: softDeletedUser.id } });
    await prisma.user.delete({ where: { id: softDeletedUser.id } });
    console.log(`[INVITATION] Hard-deleted soft-deleted user ${data.email} to allow re-invitation`);
  }

  // If unitId is provided, verify unit exists and check roleInUnit constraints
  if (data.unitId) {
    const unit = await prisma.unit.findUnique({
      where: { id: data.unitId },
      include: {
        tenancies: {
          where: { isActive: true },
        },
      },
    });

    if (!unit) {
      return c.json({ error: { message: "Unit not found", code: "NOT_FOUND" } }, 404);
    }

    const roleInUnit = data.roleInUnit ?? "PRIMARY";

    // Check if there's already a PRIMARY tenant when inviting as PRIMARY
    const existingPrimary = unit.tenancies.find((t) => t.roleInUnit === "PRIMARY");
    if (roleInUnit === "PRIMARY" && existingPrimary) {
      return c.json(
        { error: { message: "Unit already has a primary tenant. Use OCCUPANT role instead.", code: "PRIMARY_EXISTS" } },
        400
      );
    }

    // If inviting as OCCUPANT, unit must have a PRIMARY (or be empty for first tenant)
    if (roleInUnit === "OCCUPANT" && unit.tenancies.length === 0) {
      return c.json(
        { error: { message: "Cannot add occupant to empty unit. Add a primary tenant first.", code: "NO_PRIMARY" } },
        400
      );
    }
  }

  // Generate token and set expiry (72 hours)
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 72);

  // Create invitation
  const invitation = await prisma.invitation.create({
    data: {
      email: data.email,
      tenantName: data.tenantName,
      unitId: data.unitId,
      role: data.role ?? "TENANT",
      roleInUnit: data.roleInUnit ?? "PRIMARY",
      leaseStartDate: data.leaseStartDate ? new Date(data.leaseStartDate) : null,
      token,
      expiresAt,
      createdById: user.id,
    },
    include: {
      unit: {
        select: {
          id: true,
          unitLabel: true,
          buildingName: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Log the action
  await logAuditAction({
    adminUserId: user.id,
    action: AuditActions.INVITATION_CREATE,
    entityType: "Invitation",
    entityId: invitation.id,
    metadata: {
      email: data.email,
      role: data.role ?? "TENANT",
      unitId: data.unitId,
    },
  });

  // Send invitation email
  const emailResult = await sendInvitationEmail({
    email: data.email,
    tenantName: data.tenantName ?? undefined,
    unitLabel: invitation.unit?.unitLabel,
    token,
    invitedBy: user.name,
    createdById: user.id,
  });

  if (!emailResult.success) {
    console.error(`[EMAIL] Failed to send invitation email: ${emailResult.error}`);
  }

  // Trigger NEW_TENANT notification to Communication Center recipients
  let notificationResult = { recipientCount: 0, sentCount: 0 };
  if (invitation.unit) {
    notificationResult = await notifyNewTenant({
      tenantName: data.tenantName || data.email,
      tenantEmail: data.email,
      buildingName: invitation.unit.buildingName || "Unknown Building",
      unitLabel: invitation.unit.unitLabel,
      leaseStartDate: data.leaseStartDate || undefined,
      invitedBy: user.name,
    });
    console.log(`[INVITATION] NEW_TENANT notification sent to ${notificationResult.sentCount}/${notificationResult.recipientCount} recipients`);
  }

  return c.json({
    data: {
      id: invitation.id,
      email: invitation.email,
      tenantName: invitation.tenantName,
      unitId: invitation.unitId,
      role: invitation.role,
      roleInUnit: invitation.roleInUnit,
      leaseStartDate: invitation.leaseStartDate?.toISOString() ?? null,
      token: invitation.token,
      expiresAt: invitation.expiresAt.toISOString(),
      acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
      createdById: invitation.createdById,
      createdAt: invitation.createdAt.toISOString(),
      unit: invitation.unit,
      createdBy: invitation.createdBy,
      notificationsSent: notificationResult.sentCount,
      notificationRecipients: notificationResult.recipientCount,
      emailStatus: emailResult.success ? "sent" : "failed",
      emailError: emailResult.error || null,
    },
  });
});

/**
 * DELETE /api/admin/invitations/:id
 * Delete/cancel an invitation
 */
invitationsRouter.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const invitation = await prisma.invitation.findUnique({
    where: { id },
  });

  if (!invitation) {
    return c.json({ error: { message: "Invitation not found", code: "NOT_FOUND" } }, 404);
  }

  if (invitation.acceptedAt) {
    return c.json(
      { error: { message: "Cannot delete an accepted invitation", code: "ALREADY_ACCEPTED" } },
      400
    );
  }

  await prisma.invitation.delete({
    where: { id },
  });

  // Log the action
  await logAuditAction({
    adminUserId: user.id,
    action: AuditActions.INVITATION_DELETE,
    entityType: "Invitation",
    entityId: id,
    metadata: {
      email: invitation.email,
    },
  });

  return c.json({ data: { success: true } });
});

/**
 * POST /api/admin/invitations/:id/resend
 * Resend invitation (reset expiry and generate new token)
 */
invitationsRouter.post("/:id/resend", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const invitation = await prisma.invitation.findUnique({
    where: { id },
  });

  if (!invitation) {
    return c.json({ error: { message: "Invitation not found", code: "NOT_FOUND" } }, 404);
  }

  if (invitation.acceptedAt) {
    return c.json(
      { error: { message: "Cannot resend an accepted invitation", code: "ALREADY_ACCEPTED" } },
      400
    );
  }

  // Generate new token and reset expiry
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 72);

  const updatedInvitation = await prisma.invitation.update({
    where: { id },
    data: {
      token,
      expiresAt,
    },
    include: {
      unit: {
        select: {
          id: true,
          unitLabel: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Log the action
  await logAuditAction({
    adminUserId: user.id,
    action: AuditActions.INVITATION_RESEND,
    entityType: "Invitation",
    entityId: id,
    metadata: {
      email: invitation.email,
    },
  });

  // Resend invitation email
  const emailResult = await sendInvitationEmail({
    email: invitation.email,
    tenantName: invitation.tenantName ?? undefined,
    unitLabel: updatedInvitation.unit?.unitLabel,
    token,
    invitedBy: user.name,
    createdById: user.id,
  });

  if (!emailResult.success) {
    console.error(`[EMAIL] Failed to resend invitation email: ${emailResult.error}`);
  }

  return c.json({
    data: {
      id: updatedInvitation.id,
      email: updatedInvitation.email,
      tenantName: updatedInvitation.tenantName,
      unitId: updatedInvitation.unitId,
      role: updatedInvitation.role,
      roleInUnit: updatedInvitation.roleInUnit,
      leaseStartDate: updatedInvitation.leaseStartDate?.toISOString() ?? null,
      token: updatedInvitation.token,
      expiresAt: updatedInvitation.expiresAt.toISOString(),
      acceptedAt: updatedInvitation.acceptedAt?.toISOString() ?? null,
      createdById: updatedInvitation.createdById,
      createdAt: updatedInvitation.createdAt.toISOString(),
      unit: updatedInvitation.unit,
      createdBy: updatedInvitation.createdBy,
      emailStatus: emailResult.success ? "sent" : "failed",
      emailError: emailResult.error || null,
    },
  });
});

export { invitationsRouter };
