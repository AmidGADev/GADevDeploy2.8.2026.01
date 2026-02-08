import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../../prisma";
import { auth } from "../../auth";
import { AcceptInvitationSchema } from "../../types";
import { logAuditAction, AuditActions } from "../../lib/audit";

const publicInvitationsRouter = new Hono();

/**
 * GET /api/invitations/:token
 * Validate token and return invitation details (public endpoint)
 */
publicInvitationsRouter.get("/:token", async (c) => {
  const token = c.req.param("token");

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      unit: {
        select: {
          id: true,
          unitLabel: true,
          buildingName: true,
        },
      },
    },
  });

  if (!invitation) {
    return c.json({ error: { message: "Invalid invitation token", code: "INVALID_TOKEN" } }, 404);
  }

  if (invitation.acceptedAt) {
    return c.json({ error: { message: "This invitation has already been accepted", code: "ALREADY_ACCEPTED" } }, 400);
  }

  if (invitation.expiresAt < new Date()) {
    return c.json({ error: { message: "This invitation has expired", code: "EXPIRED" } }, 400);
  }

  return c.json({
    data: {
      email: invitation.email,
      tenantName: invitation.tenantName,
      unitLabel: invitation.unit?.unitLabel ?? null,
      buildingName: invitation.unit?.buildingName ?? null,
      role: invitation.role,
      roleInUnit: invitation.roleInUnit,
      expiresAt: invitation.expiresAt.toISOString(),
    },
  });
});

/**
 * POST /api/invitations/:token/accept
 * Accept invitation and create user account (public endpoint)
 */
publicInvitationsRouter.post("/:token/accept", zValidator("json", AcceptInvitationSchema), async (c) => {
  const token = c.req.param("token");
  const data = c.req.valid("json");

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      unit: true,
    },
  });

  if (!invitation) {
    return c.json({ error: { message: "Invalid invitation token", code: "INVALID_TOKEN" } }, 404);
  }

  if (invitation.acceptedAt) {
    return c.json({ error: { message: "This invitation has already been accepted", code: "ALREADY_ACCEPTED" } }, 400);
  }

  if (invitation.expiresAt < new Date()) {
    return c.json({ error: { message: "This invitation has expired", code: "EXPIRED" } }, 400);
  }

  // Double-check email is not taken (edge case: user could have been created separately)
  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
  });

  if (existingUser) {
    return c.json({ error: { message: "A user with this email already exists", code: "USER_EXISTS" } }, 400);
  }

  // If unit is specified, verify it exists and check roleInUnit constraints
  if (invitation.unitId) {
    const unit = await prisma.unit.findUnique({
      where: { id: invitation.unitId },
      include: {
        tenancies: {
          where: { isActive: true },
        },
      },
    });

    if (!unit) {
      return c.json({ error: { message: "The assigned unit no longer exists", code: "UNIT_NOT_FOUND" } }, 400);
    }

    // Check roleInUnit constraints
    const existingPrimary = unit.tenancies.find((t) => t.roleInUnit === "PRIMARY");

    // If invitation is for PRIMARY and there's already a PRIMARY, reject
    if (invitation.roleInUnit === "PRIMARY" && existingPrimary) {
      return c.json({ error: { message: "The unit already has a primary tenant", code: "PRIMARY_EXISTS" } }, 400);
    }

    // If invitation is for OCCUPANT and unit is empty, reject (need PRIMARY first)
    if (invitation.roleInUnit === "OCCUPANT" && unit.tenancies.length === 0) {
      return c.json({ error: { message: "Cannot add occupant to empty unit. Primary tenant must accept first.", code: "NO_PRIMARY" } }, 400);
    }
  }

  try {
    // Determine the name to use (guaranteed to be a string)
    const emailPrefix = invitation.email.split("@")[0] ?? "User";
    let userName: string = emailPrefix;
    if (invitation.tenantName) {
      userName = invitation.tenantName;
    }
    if (data.name) {
      userName = data.name;
    }

    // Create user with Better Auth
    const signUpResult = await auth.api.signUpEmail({
      body: {
        name: userName,
        email: invitation.email,
        password: data.password,
      },
    });

    if (!signUpResult || !signUpResult.user) {
      return c.json({ error: { message: "Failed to create user account", code: "CREATE_FAILED" } }, 500);
    }

    const userId = signUpResult.user.id;

    // Update user with role and status
    await prisma.user.update({
      where: { id: userId },
      data: {
        role: invitation.role,
        status: "ACTIVE",
      },
    });

    // If TENANT role with unitId, create tenancy with roleInUnit
    if (invitation.role === "TENANT" && invitation.unitId) {
      // Get current unit status
      const unit = await prisma.unit.findUnique({
        where: { id: invitation.unitId },
      });

      // Determine if this is a legacy tenant (lease started before today)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const leaseStartDate = invitation.leaseStartDate || new Date();
      const leaseStartDay = new Date(leaseStartDate);
      leaseStartDay.setHours(0, 0, 0, 0);

      // If lease start date is before today, this is a legacy tenant
      const isLegacyMoveIn = leaseStartDay < today;

      await prisma.tenancy.create({
        data: {
          userId: userId,
          unitId: invitation.unitId,
          startDate: leaseStartDate,
          isActive: true,
          roleInUnit: invitation.roleInUnit,
          isLegacyMoveIn: isLegacyMoveIn,
        },
      });

      // Only mark unit as OCCUPIED if it was VACANT (first tenant)
      if (unit && unit.status === "VACANT") {
        await prisma.unit.update({
          where: { id: invitation.unitId },
          data: { status: "OCCUPIED" },
        });
      }
    }

    // Mark invitation as accepted
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        acceptedAt: new Date(),
      },
    });

    // Log the action (using the inviter as admin since this is a public endpoint)
    await logAuditAction({
      adminUserId: invitation.createdById,
      action: AuditActions.INVITATION_ACCEPT,
      entityType: "Invitation",
      entityId: invitation.id,
      metadata: {
        email: invitation.email,
        newUserId: userId,
        role: invitation.role,
        roleInUnit: invitation.roleInUnit,
        unitId: invitation.unitId,
      },
    });

    console.log(`[EMAIL] Welcome email would be sent to ${invitation.email}`);

    return c.json({
      data: {
        success: true,
        message: "Account created successfully. You can now sign in.",
      },
    });
  } catch (error: unknown) {
    console.error("Invitation accept error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to accept invitation";
    return c.json({ error: { message: errorMessage, code: "ACCEPT_FAILED" } }, 500);
  }
});

export { publicInvitationsRouter };
