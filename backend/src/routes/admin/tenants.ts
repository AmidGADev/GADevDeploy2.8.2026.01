import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../../prisma";
import { auth } from "../../auth";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { InviteTenantSchema, ScheduleMoveOutSchema } from "../../types";
import { logAuditAction, AuditActions } from "../../lib/audit";
import { sendWelcomeEmail } from "../../lib/email";
import { deleteUserFiles, getUserFilesSummary } from "../../lib/user-files";
import { notifyNewTenant } from "../../lib/event-notifications";
import { syncTenantMoveEvents } from "../../lib/calendar-sync";

const tenantsRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
tenantsRouter.use("*", authMiddleware);
tenantsRouter.use("*", adminMiddleware);

/**
 * GET /api/admin/tenants
 * List all tenants with unit info and roleInUnit
 * Query params: unitId (optional filter)
 */
tenantsRouter.get("/", async (c) => {
  const unitIdFilter = c.req.query("unitId");

  const tenants = await prisma.user.findMany({
    where: {
      role: "TENANT",
      deletedAt: null, // Exclude soft-deleted users
      ...(unitIdFilter && {
        tenancies: {
          some: {
            unitId: unitIdFilter,
            isActive: true,
          },
        },
      }),
    },
    include: {
      tenancies: {
        include: {
          unit: {
            select: {
              id: true,
              unitLabel: true,
              buildingName: true,
              propertyId: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
      payments: {
        orderBy: {
          paidAt: "desc",
        },
        take: 1,
        select: {
          paidAt: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return c.json({
    data: tenants.map((tenant) => {
      const activeTenancy = tenant.tenancies.find((t) => t.isActive);
      const lastPayment = tenant.payments[0];
      return {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        phone: tenant.phone,
        status: tenant.status,
        createdAt: tenant.createdAt.toISOString(),
        currentUnit: activeTenancy
          ? {
              id: activeTenancy.unit.id,
              unitLabel: activeTenancy.unit.unitLabel,
              buildingName: activeTenancy.unit.buildingName,
              tenancyId: activeTenancy.id,
              startDate: activeTenancy.startDate.toISOString(),
              roleInUnit: activeTenancy.roleInUnit,
              moveOutDate: activeTenancy.moveOutDate?.toISOString() || null,
            }
          : null,
        hasActiveTenancy: !!activeTenancy,
        roleInUnit: activeTenancy?.roleInUnit ?? null,
        lastPaymentDate: lastPayment?.paidAt?.toISOString() || null,
      };
    }),
  });
});

/**
 * POST /api/admin/tenants/invite
 * Invite a new tenant - creates user, tenancy, marks unit occupied if first tenant
 * Supports roleInUnit: PRIMARY (default) or OCCUPANT
 * If a soft-deleted user with the same email exists, restores them instead
 */
tenantsRouter.post("/invite", zValidator("json", InviteTenantSchema), async (c) => {
  const data = c.req.valid("json");
  const roleInUnit = data.roleInUnit ?? "PRIMARY";

  // Check if email is already in use
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  // If user exists and is NOT deleted, block the invite
  if (existingUser && !existingUser.deletedAt) {
    return c.json({ error: { message: "Email already in use", code: "EMAIL_EXISTS" } }, 400);
  }

  // Check if this is a soft-deleted user being re-invited
  const isRestoringDeletedUser = existingUser && existingUser.deletedAt !== null;

  // Verify unit exists and get current tenancies
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

  // Check if there's already a PRIMARY tenant in this unit
  const existingPrimary = unit.tenancies.find((t) => t.roleInUnit === "PRIMARY");

  if (roleInUnit === "PRIMARY" && existingPrimary) {
    return c.json(
      { error: { message: "Unit already has a primary tenant. Use OCCUPANT role or promote existing occupant.", code: "PRIMARY_EXISTS" } },
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

  try {
    let userId: string;

    if (isRestoringDeletedUser && existingUser) {
      // Restore the soft-deleted user
      console.log(`[TENANT] Restoring soft-deleted user: ${existingUser.email} (${existingUser.id})`);

      userId = existingUser.id;

      // Update the user: clear deletedAt, update name, set status to ACTIVE
      await prisma.user.update({
        where: { id: userId },
        data: {
          name: data.name,
          deletedAt: null,
          status: "ACTIVE",
          role: "TENANT",
        },
      });

      // Update password using Better Auth's internal method via raw query
      // Since Better Auth hashes passwords, we need to use their API
      // For simplicity, we'll update the account password hash directly
      const { hashPassword } = await import("better-auth/crypto");
      const hashedPassword = await hashPassword(data.password);

      await prisma.account.updateMany({
        where: {
          userId: userId,
          providerId: "credential",
        },
        data: {
          password: hashedPassword,
        },
      });

      console.log(`[TENANT] Restored user ${existingUser.email} with new password`);
    } else {
      // Create new user with Better Auth
      const signUpResult = await auth.api.signUpEmail({
        body: {
          name: data.name,
          email: data.email,
          password: data.password,
        },
      });

      if (!signUpResult || !signUpResult.user) {
        return c.json({ error: { message: "Failed to create user", code: "CREATE_FAILED" } }, 500);
      }

      userId = signUpResult.user.id;

      // Update user role to TENANT and status to ACTIVE using Prisma directly
      await prisma.user.update({
        where: { id: userId },
        data: {
          role: "TENANT",
          status: "ACTIVE",
        },
      });
    }

    // Determine if this is a legacy tenant (lease started before today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const leaseStartDay = new Date(data.startDate);
    leaseStartDay.setHours(0, 0, 0, 0);
    const isLegacyMoveIn = leaseStartDay < today;

    // Create tenancy record with roleInUnit and legacy status
    const tenancy = await prisma.tenancy.create({
      data: {
        userId: userId,
        unitId: data.unitId,
        startDate: new Date(data.startDate),
        isActive: true,
        roleInUnit: roleInUnit,
        isLegacyMoveIn: isLegacyMoveIn,
      },
    });

    // Update unit status to OCCUPIED if it's the first tenant
    if (unit.status === "VACANT") {
      await prisma.unit.update({
        where: { id: data.unitId },
        data: { status: "OCCUPIED" },
      });
    }

    // Send welcome email with credentials
    const emailResult = await sendWelcomeEmail({
      email: data.email,
      tenantName: data.name,
      unitLabel: unit.unitLabel,
      buildingName: unit.buildingName || undefined,
      password: data.password,
      createdById: c.get("user").id,
    });

    if (!emailResult.success) {
      console.error(`[EMAIL] Failed to send welcome email: ${emailResult.error}`);
    } else {
      const action = isRestoringDeletedUser ? "restored" : "invite";
      console.log(`[EMAIL] Welcome email sent to ${data.email} for tenant ${action} (${roleInUnit})`);
    }

    // Trigger NEW_TENANT notification to Communication Center recipients
    const notificationResult = await notifyNewTenant({
      tenantName: data.name,
      tenantEmail: data.email,
      buildingName: unit.buildingName || "Unknown Building",
      unitLabel: unit.unitLabel,
      leaseStartDate: data.startDate,
      invitedBy: c.get("user").name,
    });
    console.log(`[TENANT] NEW_TENANT notification sent to ${notificationResult.sentCount}/${notificationResult.recipientCount} recipients`);

    // Fetch the updated user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    return c.json({
      data: {
        tenant: {
          id: user!.id,
          name: user!.name,
          email: user!.email,
          status: user!.status,
          createdAt: user!.createdAt.toISOString(),
        },
        tenancy: {
          id: tenancy.id,
          unitId: tenancy.unitId,
          startDate: tenancy.startDate.toISOString(),
          isActive: tenancy.isActive,
          roleInUnit: tenancy.roleInUnit,
        },
        restored: isRestoringDeletedUser,
        notificationsSent: notificationResult.sentCount,
        notificationRecipients: notificationResult.recipientCount,
      },
    });
  } catch (error: any) {
    console.error("Tenant invite error:", error);
    return c.json(
      { error: { message: error.message || "Failed to invite tenant", code: "INVITE_FAILED" } },
      500
    );
  }
});

/**
 * PUT /api/admin/tenants/:id
 * Update tenant basic information (name, email, phone)
 */
tenantsRouter.put("/:id", async (c) => {
  const adminUser = c.get("user");
  const id = c.req.param("id");

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Invalid JSON body", code: "INVALID_JSON" } }, 400);
  }

  const { name, email, phone } = body;

  // Verify tenant exists
  const tenant = await prisma.user.findUnique({
    where: { id, role: "TENANT" },
  });

  if (!tenant) {
    return c.json({ error: { message: "Tenant not found", code: "NOT_FOUND" } }, 404);
  }

  // Check if email is being changed and if it's already taken
  if (email && email !== tenant.email) {
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return c.json({ error: { message: "Email is already in use", code: "EMAIL_EXISTS" } }, 400);
    }
  }

  // Build update data
  const updateData: { name?: string; email?: string; phone?: string | null } = {};
  if (name !== undefined) updateData.name = name;
  if (email !== undefined) updateData.email = email;
  if (phone !== undefined) updateData.phone = phone || null;

  // Update tenant
  const updatedTenant = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
    },
  });

  console.log(`[TENANT UPDATE] Admin ${adminUser.email} updated tenant ${updatedTenant.email} (${id})`);

  return c.json({ data: updatedTenant });
});

/**
 * PUT /api/admin/tenants/:id/deactivate
 * Deactivate a tenant - ends tenancy, marks unit vacant, terminates all sessions
 * User cannot log in while deactivated and won't receive communications
 * Admin can later reactivate the user
 */
tenantsRouter.put("/:id/deactivate", async (c) => {
  const adminUser = c.get("user");
  const id = c.req.param("id");

  // Verify tenant exists
  const tenant = await prisma.user.findUnique({
    where: { id, role: "TENANT" },
    include: {
      tenancies: {
        where: { isActive: true },
        include: {
          unit: true,
        },
      },
    },
  });

  if (!tenant) {
    return c.json({ error: { message: "Tenant not found", code: "NOT_FOUND" } }, 404);
  }

  if (tenant.status === "INACTIVE") {
    return c.json({ error: { message: "Tenant is already deactivated", code: "ALREADY_INACTIVE" } }, 400);
  }

  if (tenant.deletedAt) {
    return c.json({ error: { message: "Tenant has been deleted", code: "ALREADY_DELETED" } }, 400);
  }

  console.log(`[TENANT DEACTIVATE] Admin ${adminUser.email} deactivating tenant ${tenant.email} (${id})`);

  // End active tenancies and mark units as vacant
  for (const tenancy of tenant.tenancies) {
    await prisma.tenancy.update({
      where: { id: tenancy.id },
      data: {
        isActive: false,
        endDate: new Date(),
      },
    });

    // Check if any other active tenancies remain for this unit
    const remainingTenancies = await prisma.tenancy.count({
      where: {
        unitId: tenancy.unitId,
        isActive: true,
      },
    });

    if (remainingTenancies === 0) {
      await prisma.unit.update({
        where: { id: tenancy.unitId },
        data: { status: "VACANT" },
      });
    }
  }

  // Delete all sessions to force logout immediately
  const deletedSessions = await prisma.session.deleteMany({
    where: { userId: id },
  });
  console.log(`[TENANT DEACTIVATE] Deleted ${deletedSessions.count} sessions`);

  // Update tenant status to INACTIVE
  await prisma.user.update({
    where: { id },
    data: { status: "INACTIVE" },
  });

  // Log the audit action
  await logAuditAction({
    adminUserId: adminUser.id,
    action: AuditActions.USER_DEACTIVATE,
    entityType: "User",
    entityId: id,
    metadata: {
      tenantName: tenant.name,
      tenantEmail: tenant.email,
      endedTenancies: tenant.tenancies.map((t) => ({
        tenancyId: t.id,
        unitId: t.unitId,
        unitLabel: t.unit.unitLabel,
      })),
      deletedSessionCount: deletedSessions.count,
    },
  });

  return c.json({
    data: {
      id: tenant.id,
      name: tenant.name,
      email: tenant.email,
      status: "INACTIVE",
      deactivatedAt: new Date().toISOString(),
    },
  });
});

/**
 * PUT /api/admin/tenants/:id/reactivate
 * Reactivate a deactivated tenant - allows them to log in again and receive communications
 * Note: Does NOT restore tenancies - admin must assign to a unit separately if needed
 */
tenantsRouter.put("/:id/reactivate", async (c) => {
  const adminUser = c.get("user");
  const id = c.req.param("id");

  // Verify tenant exists
  const tenant = await prisma.user.findUnique({
    where: { id, role: "TENANT" },
  });

  if (!tenant) {
    return c.json({ error: { message: "Tenant not found", code: "NOT_FOUND" } }, 404);
  }

  if (tenant.deletedAt) {
    return c.json({ error: { message: "Tenant has been permanently deleted and cannot be reactivated", code: "USER_DELETED" } }, 400);
  }

  if (tenant.status === "ACTIVE") {
    return c.json({ error: { message: "Tenant is already active", code: "ALREADY_ACTIVE" } }, 400);
  }

  // Reactivate the tenant
  await prisma.user.update({
    where: { id },
    data: { status: "ACTIVE" },
  });

  // Log the audit action
  await logAuditAction({
    adminUserId: adminUser.id,
    action: AuditActions.USER_REACTIVATE,
    entityType: "User",
    entityId: id,
    metadata: {
      tenantName: tenant.name,
      tenantEmail: tenant.email,
      previousStatus: tenant.status,
    },
  });

  console.log(`[TENANT] Admin ${adminUser.email} reactivated tenant: ${tenant.email} (${id})`);

  return c.json({
    data: {
      id: tenant.id,
      name: tenant.name,
      email: tenant.email,
      status: "ACTIVE",
      reactivatedAt: new Date().toISOString(),
    },
  });
});

/**
 * PUT /api/admin/tenants/:id/move-out
 * End active tenancy and mark unit as vacant if no other tenants remain
 * If PRIMARY moves out and OCCUPANTS exist, require admin to promote one first
 */
tenantsRouter.put("/:id/move-out", async (c) => {
  const id = c.req.param("id");

  // Verify tenant exists
  const tenant = await prisma.user.findUnique({
    where: { id, role: "TENANT" },
    include: {
      tenancies: {
        where: { isActive: true },
        include: {
          unit: true,
        },
      },
    },
  });

  if (!tenant) {
    return c.json({ error: { message: "Tenant not found", code: "NOT_FOUND" } }, 404);
  }

  if (tenant.tenancies.length === 0) {
    return c.json({ error: { message: "Tenant has no active tenancy", code: "NO_ACTIVE_TENANCY" } }, 400);
  }

  // For each active tenancy, check if moving out is allowed
  for (const tenancy of tenant.tenancies) {
    // Get all other active tenancies in the same unit
    const otherTenancies = await prisma.tenancy.findMany({
      where: {
        unitId: tenancy.unitId,
        isActive: true,
        id: { not: tenancy.id },
      },
    });

    // If this is the PRIMARY and there are OCCUPANTS, require promotion first
    if (tenancy.roleInUnit === "PRIMARY" && otherTenancies.length > 0) {
      return c.json(
        {
          error: {
            message: "Cannot move out primary tenant while occupants remain. Promote an occupant to primary first.",
            code: "OCCUPANTS_REMAIN",
            occupantCount: otherTenancies.length,
          }
        },
        400
      );
    }
  }

  // Proceed with move-out
  for (const tenancy of tenant.tenancies) {
    await prisma.tenancy.update({
      where: { id: tenancy.id },
      data: {
        isActive: false,
        endDate: new Date(),
      },
    });

    // Check if any other active tenancies remain for this unit
    const remainingTenancies = await prisma.tenancy.count({
      where: {
        unitId: tenancy.unitId,
        isActive: true,
      },
    });

    // If no tenants remain, mark unit as VACANT
    if (remainingTenancies === 0) {
      await prisma.unit.update({
        where: { id: tenancy.unitId },
        data: { status: "VACANT" },
      });
    }
  }

  return c.json({
    data: {
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
      },
      movedOutAt: new Date().toISOString(),
    },
  });
});

/**
 * PUT /api/admin/tenants/:id/promote
 * Promote an OCCUPANT to PRIMARY
 * Only allowed when no active PRIMARY exists in the unit
 */
tenantsRouter.put("/:id/promote", async (c) => {
  const adminUser = c.get("user");
  const id = c.req.param("id");

  // Verify tenant exists
  const tenant = await prisma.user.findUnique({
    where: { id, role: "TENANT" },
    include: {
      tenancies: {
        where: { isActive: true },
        include: {
          unit: true,
        },
      },
    },
  });

  if (!tenant) {
    return c.json({ error: { message: "Tenant not found", code: "NOT_FOUND" } }, 404);
  }

  if (tenant.tenancies.length === 0) {
    return c.json({ error: { message: "Tenant has no active tenancy", code: "NO_ACTIVE_TENANCY" } }, 400);
  }

  const tenancy = tenant.tenancies[0]!;

  // Check if already PRIMARY
  if (tenancy.roleInUnit === "PRIMARY") {
    return c.json({ error: { message: "Tenant is already the primary tenant", code: "ALREADY_PRIMARY" } }, 400);
  }

  // Check if there's already an active PRIMARY in the unit
  const existingPrimary = await prisma.tenancy.findFirst({
    where: {
      unitId: tenancy.unitId,
      isActive: true,
      roleInUnit: "PRIMARY",
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (existingPrimary) {
    return c.json(
      {
        error: {
          message: `Cannot promote: ${existingPrimary.user.name} is still the primary tenant. Move them out first.`,
          code: "PRIMARY_EXISTS",
          currentPrimary: {
            id: existingPrimary.user.id,
            name: existingPrimary.user.name,
          },
        }
      },
      400
    );
  }

  // Promote to PRIMARY
  await prisma.tenancy.update({
    where: { id: tenancy.id },
    data: { roleInUnit: "PRIMARY" },
  });

  // Log the audit action
  await logAuditAction({
    adminUserId: adminUser.id,
    action: AuditActions.TENANT_PROMOTE,
    entityType: "Tenancy",
    entityId: tenancy.id,
    metadata: {
      tenantId: tenant.id,
      tenantName: tenant.name,
      unitId: tenancy.unitId,
      unitLabel: tenancy.unit.unitLabel,
      previousRole: "OCCUPANT",
      newRole: "PRIMARY",
    },
  });

  return c.json({
    data: {
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
      },
      tenancy: {
        id: tenancy.id,
        unitId: tenancy.unitId,
        unitLabel: tenancy.unit.unitLabel,
        roleInUnit: "PRIMARY",
      },
      promotedAt: new Date().toISOString(),
    },
  });
});

/**
 * DELETE /api/admin/tenants/:id/soft-delete
 * Soft delete a tenant - sets deletedAt, status to DELETED, ends tenancies, logs out user
 * The user will be hidden from all lists and cannot log in
 */
tenantsRouter.delete("/:id/soft-delete", async (c) => {
  const adminUser = c.get("user");
  const id = c.req.param("id");

  // Verify tenant exists and is not already deleted
  const tenant = await prisma.user.findUnique({
    where: { id, role: "TENANT" },
    include: {
      tenancies: {
        where: { isActive: true },
        include: {
          unit: true,
        },
      },
    },
  });

  if (!tenant) {
    return c.json({ error: { message: "Tenant not found", code: "NOT_FOUND" } }, 404);
  }

  if (tenant.deletedAt) {
    return c.json({ error: { message: "Tenant is already deleted", code: "ALREADY_DELETED" } }, 400);
  }

  console.log(`[TENANT SOFT DELETE] Admin ${adminUser.email} (${adminUser.id}) initiating soft delete for tenant ${tenant.email} (${id})`);

  // End all active tenancies
  for (const tenancy of tenant.tenancies) {
    await prisma.tenancy.update({
      where: { id: tenancy.id },
      data: {
        isActive: false,
        endDate: new Date(),
      },
    });

    // Check if any other active tenancies remain for this unit
    const remainingTenancies = await prisma.tenancy.count({
      where: {
        unitId: tenancy.unitId,
        isActive: true,
      },
    });

    // If no tenants remain, mark unit as VACANT
    if (remainingTenancies === 0) {
      await prisma.unit.update({
        where: { id: tenancy.unitId },
        data: { status: "VACANT" },
      });
      console.log(`[TENANT SOFT DELETE] Unit ${tenancy.unit.unitLabel} marked as VACANT`);
    }
  }

  // Delete all sessions for the user to force logout
  const deletedSessions = await prisma.session.deleteMany({
    where: { userId: id },
  });
  console.log(`[TENANT SOFT DELETE] Deleted ${deletedSessions.count} sessions for tenant ${tenant.email}`);

  // Soft delete the user
  const now = new Date();
  await prisma.user.update({
    where: { id },
    data: {
      deletedAt: now,
      status: "DELETED",
    },
  });

  // Log the audit action
  await logAuditAction({
    adminUserId: adminUser.id,
    action: AuditActions.USER_SOFT_DELETE,
    entityType: "User",
    entityId: id,
    metadata: {
      tenantName: tenant.name,
      tenantEmail: tenant.email,
      previousStatus: tenant.status,
      endedTenancies: tenant.tenancies.map((t) => ({
        tenancyId: t.id,
        unitId: t.unitId,
        unitLabel: t.unit.unitLabel,
      })),
      deletedSessionCount: deletedSessions.count,
    },
  });

  console.log(`[TENANT SOFT DELETE] Successfully soft deleted tenant ${tenant.email} (${id})`);

  return c.json({
    data: {
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
      },
      deletedAt: now.toISOString(),
    },
  });
});

/**
 * GET /api/admin/tenants/:id/delete-preview
 * Preview what will be deleted when permanently deleting a user
 * Shows file counts and data that will be removed
 */
tenantsRouter.get("/:id/delete-preview", async (c) => {
  const id = c.req.param("id");

  const tenant = await prisma.user.findUnique({
    where: { id, role: "TENANT" },
    include: {
      tenancies: {
        include: {
          unit: { select: { unitLabel: true } },
        },
      },
      payments: { select: { id: true } },
      serviceRequests: { select: { id: true } },
      documents: { select: { id: true } },
    },
  });

  if (!tenant) {
    return c.json({ error: { message: "Tenant not found", code: "NOT_FOUND" } }, 404);
  }

  // Get file summary
  const fileSummary = await getUserFilesSummary(id);

  return c.json({
    data: {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        status: tenant.status,
      },
      dataToDelete: {
        tenancies: tenant.tenancies.length,
        tenancyDetails: tenant.tenancies.map(t => ({
          unitLabel: t.unit.unitLabel,
          isActive: t.isActive,
          startDate: t.startDate.toISOString(),
          endDate: t.endDate?.toISOString() || null,
        })),
        payments: tenant.payments.length,
        serviceRequests: tenant.serviceRequests.length,
        documents: tenant.documents.length,
        files: fileSummary,
      },
      warning: "This action is permanent and cannot be undone. All user data and files will be deleted.",
    },
  });
});

/**
 * DELETE /api/admin/tenants/:id/permanent
 * Permanently delete a tenant and all their data
 * This is IRREVERSIBLE - use with extreme caution
 *
 * Required body: { confirmEmail: string } - must match tenant's email
 *
 * What gets deleted:
 * - User record and all cascading records (sessions, accounts, tenancies, payments, etc.)
 * - All uploaded files (insurance docs, tenant documents, service request attachments, checklist photos)
 * - DebugSession records (no FK relation in schema)
 * - Service requests are NOT deleted but createdById is reassigned to admin (for audit trail)
 * - Payments are cascade-deleted with the user (invoice records preserved for accounting)
 *
 * What gets preserved (reassigned to admin):
 * - Service requests, announcements, invitations, audit logs, tenant documents
 * - Invoice records (for accounting, linked to Unit not User)
 * - TransactionAuditLog (anonymized for compliance)
 * - CalendarCommunicationHistory (recipientId nulled)
 *
 * Unit protection: Units are NEVER deleted, only set to VACANT status
 */
tenantsRouter.delete(
  "/:id/permanent",
  zValidator("json", z.object({ confirmEmail: z.string().email() })),
  async (c) => {
    const adminUser = c.get("user");
    const id = c.req.param("id");
    const { confirmEmail } = c.req.valid("json");

    // Verify tenant exists
    const tenant = await prisma.user.findUnique({
      where: { id, role: "TENANT" },
      include: {
        tenancies: {
          where: { isActive: true },
          include: { unit: true },
        },
      },
    });

    if (!tenant) {
      return c.json({ error: { message: "Tenant not found", code: "NOT_FOUND" } }, 404);
    }

    // Verify email confirmation
    if (confirmEmail.toLowerCase() !== tenant.email.toLowerCase()) {
      return c.json(
        { error: { message: "Email confirmation does not match", code: "EMAIL_MISMATCH" } },
        400
      );
    }

    console.log(`[TENANT PERMANENT DELETE] Admin ${adminUser.email} initiating permanent delete for ${tenant.email} (${id})`);

    // Delete files BEFORE transaction (filesystem operations cannot be rolled back)
    const fileCleanupResult = await deleteUserFiles(id);
    console.log(`[TENANT PERMANENT DELETE] File cleanup: ${fileCleanupResult.deleted} deleted, ${fileCleanupResult.notFound} not found`);

    // Count payments for logging (will be cascade deleted)
    const paymentCount = await prisma.payment.count({ where: { userId: id } });

    try {
      // Execute ALL database operations in a single transaction
      const result = await prisma.$transaction(async (tx) => {
        // 1. End active tenancies and update unit status to VACANT
        const endedTenancies: Array<{ unitId: string; unitLabel: string }> = [];
        for (const tenancy of tenant.tenancies) {
          await tx.tenancy.update({
            where: { id: tenancy.id },
            data: { isActive: false, endDate: new Date() },
          });

          // Check if unit has other active tenancies
          const remainingTenancies = await tx.tenancy.count({
            where: { unitId: tenancy.unitId, isActive: true },
          });

          // Set unit to VACANT if no other active tenancies (Unit is NEVER deleted)
          if (remainingTenancies === 0) {
            await tx.unit.update({
              where: { id: tenancy.unitId },
              data: { status: "VACANT" },
            });
          }

          endedTenancies.push({ unitId: tenancy.unitId, unitLabel: tenancy.unit.unitLabel });
        }

        // 2. Delete sessions (force logout)
        const deletedSessions = await tx.session.deleteMany({ where: { userId: id } });

        // 3. Delete debug sessions (no FK relation in schema)
        await tx.debugSession.deleteMany({ where: { userId: id } });

        // 4. Null out nullable foreign keys
        await tx.$executeRaw`UPDATE ChecklistItem SET completedById = NULL WHERE completedById = ${id}`;
        await tx.$executeRaw`UPDATE MoveOutChecklist SET finalizedById = NULL WHERE finalizedById = ${id}`;
        await tx.$executeRaw`UPDATE Inspection SET finalizedById = NULL WHERE finalizedById = ${id}`;
        await tx.$executeRaw`UPDATE MoveOutRequest SET respondedById = NULL WHERE respondedById = ${id}`;
        await tx.$executeRaw`UPDATE EmailLog SET createdById = NULL WHERE createdById = ${id}`;
        await tx.$executeRaw`UPDATE CalendarCommunicationHistory SET recipientId = NULL WHERE recipientId = ${id}`;

        // 5. Reassign non-nullable foreign keys to admin (preserve records for audit trail)
        const reassignedServiceRequests = await tx.$executeRaw`
          UPDATE ServiceRequest SET createdById = ${adminUser.id} WHERE createdById = ${id}
        `;
        await tx.$executeRaw`UPDATE Announcement SET createdById = ${adminUser.id} WHERE createdById = ${id}`;
        await tx.$executeRaw`UPDATE Invitation SET createdById = ${adminUser.id} WHERE createdById = ${id}`;
        await tx.$executeRaw`UPDATE AuditLog SET adminUserId = ${adminUser.id} WHERE adminUserId = ${id}`;
        await tx.$executeRaw`UPDATE TenantDocument SET uploadedById = ${adminUser.id} WHERE uploadedById = ${id}`;

        // 6. Preserve TransactionAuditLog but anonymize (for compliance - userId stored as string not FK)
        await tx.$executeRaw`
          UPDATE TransactionAuditLog SET userEmail = '[DELETED]', userId = ${adminUser.id} WHERE userId = ${id}
        `;

        // 7. Delete the user - this cascades to:
        //    - Session, Account, Tenancy, AnnouncementRead, ServiceRequestComment
        //    - Payment, TenantDocument (userId), TenantNotification
        //    - TenantCommunicationPreference, AdminMfaChallenge, AnnouncementAcknowledgement
        await tx.user.delete({ where: { id } });

        return {
          deletedSessions: deletedSessions.count,
          reassignedServiceRequests: Number(reassignedServiceRequests),
          endedTenancies,
        };
      }, {
        timeout: 30000, // 30 second timeout for complex deletion
      });

      // Log the audit action AFTER successful transaction
      await logAuditAction({
        adminUserId: adminUser.id,
        action: AuditActions.USER_PERMANENT_DELETE,
        entityType: "User",
        entityId: id,
        metadata: {
          tenantName: tenant.name,
          tenantEmail: tenant.email,
          deletedSessions: result.deletedSessions,
          deletedFiles: fileCleanupResult.deleted,
          cascadeDeletedPayments: paymentCount,
          reassignedServiceRequests: result.reassignedServiceRequests,
          endedTenancies: result.endedTenancies,
        },
      });

      console.log(`[TENANT PERMANENT DELETE] Successfully permanently deleted tenant ${tenant.email} (${id})`);

      return c.json({
        data: {
          success: true,
          message: "Tenant and all associated records permanently removed",
          deletedUser: { id: tenant.id, name: tenant.name, email: tenant.email },
          cleanup: {
            sessions: result.deletedSessions,
            files: fileCleanupResult.deleted,
            cascadeDeletedPayments: paymentCount,
            endedTenancies: result.endedTenancies,
          },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[TENANT PERMANENT DELETE] Failed to delete tenant ${tenant.email}: ${message}`);

      if (message.includes("FOREIGN KEY constraint failed")) {
        return c.json({
          error: {
            message: "Cannot delete tenant: there are linked records that could not be removed. Please check for any open invoices or unresolved service requests.",
            code: "FK_CONSTRAINT_VIOLATION",
            detail: message,
          },
        }, 500);
      }

      return c.json({
        error: {
          message: "Failed to permanently delete tenant. All changes have been rolled back.",
          code: "DELETE_FAILED",
          detail: message,
        },
      }, 500);
    }
  }
);

/**
 * PUT /api/admin/tenants/:id/schedule-move-out
 * Set or clear the move-out date for a tenant's active tenancy
 * When moveOutDate is SET: automatically creates MoveOutChecklist if none exists
 * When moveOutDate is CLEARED: keeps the checklist (preserve data)
 * Also syncs calendar events for Admin/Tenant visibility
 */
tenantsRouter.put(
  "/:id/schedule-move-out",
  zValidator("json", ScheduleMoveOutSchema),
  async (c) => {
    const id = c.req.param("id");
    const data = c.req.valid("json");
    const adminUser = c.get("user");

    // Verify tenant exists and has active tenancy
    const tenant = await prisma.user.findUnique({
      where: { id, role: "TENANT" },
      include: {
        tenancies: {
          where: { isActive: true },
          include: {
            unit: {
              select: {
                id: true,
                unitLabel: true,
                buildingName: true,
              },
            },
            moveOutChecklist: true,
          },
        },
      },
    });

    if (!tenant) {
      return c.json({ error: { message: "Tenant not found", code: "NOT_FOUND" } }, 404);
    }

    if (tenant.tenancies.length === 0) {
      return c.json({ error: { message: "Tenant has no active tenancy", code: "NO_ACTIVE_TENANCY" } }, 400);
    }

    const tenancy = tenant.tenancies[0]!;
    const moveOutDate = data.moveOutDate ? new Date(data.moveOutDate) : null;

    // Update the tenancy with the move-out date
    await prisma.tenancy.update({
      where: { id: tenancy.id },
      data: { moveOutDate },
    });

    let checklistInfo: { id: string; status: string; isNew: boolean } | null = null;

    // If moveOutDate is SET and no checklist exists, create one
    if (moveOutDate && !tenancy.moveOutChecklist) {
      const DEFAULT_CATEGORIES = [
        { category: "KEYS_ACCESS", label: "Keys & Access" },
        { category: "WALLS_PAINT", label: "Walls & Paint" },
        { category: "FLOORS", label: "Floors" },
        { category: "KITCHEN", label: "Kitchen" },
        { category: "BATHROOM", label: "Bathroom" },
        { category: "APPLIANCES", label: "Appliances" },
        { category: "DOORS_WINDOWS", label: "Doors & Windows" },
      ];

      const newChecklist = await prisma.moveOutChecklist.create({
        data: {
          tenancyId: tenancy.id,
          status: "NOT_STARTED",
          items: {
            create: DEFAULT_CATEGORIES.map((cat) => ({
              category: cat.category,
            })),
          },
        },
      });

      checklistInfo = { id: newChecklist.id, status: newChecklist.status, isNew: true };
      console.log(
        `[TENANT] Created move-out checklist for tenant ${tenant.email} in unit ${tenancy.unit.unitLabel} (scheduled: ${moveOutDate.toISOString()})`
      );
    } else if (tenancy.moveOutChecklist) {
      checklistInfo = { id: tenancy.moveOutChecklist.id, status: tenancy.moveOutChecklist.status, isNew: false };
    }

    // Sync calendar events for Admin/Tenant visibility
    const syncResult = await syncTenantMoveEvents(
      tenancy.id,
      tenant.id,
      tenancy.unit.id,
      tenancy.unit.buildingName,
      tenancy.unit.unitLabel,
      tenancy.startDate, // move-in date
      moveOutDate,       // move-out date
      adminUser.id
    );

    const action = moveOutDate ? "scheduled" : "cleared";
    console.log(
      `[TENANT] Move-out ${action} for tenant ${tenant.email} in unit ${tenancy.unit.unitLabel}${moveOutDate ? ` (date: ${moveOutDate.toISOString()})` : ""}`
    );

    return c.json({
      data: {
        success: true,
        tenant: {
          id: tenant.id,
          name: tenant.name,
          email: tenant.email,
        },
        tenancy: {
          id: tenancy.id,
          unitId: tenancy.unit.id,
          unitLabel: tenancy.unit.unitLabel,
          moveOutDate: moveOutDate?.toISOString() || null,
        },
        checklist: checklistInfo,
        calendarSync: {
          success: syncResult.success,
          action: syncResult.action,
          eventId: syncResult.eventId,
          error: syncResult.error,
        },
      },
    });
  }
);

export { tenantsRouter };
