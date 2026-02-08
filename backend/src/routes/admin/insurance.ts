import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { RejectInsuranceSchema } from "../../types";
import { logAuditAction, AuditActions } from "../../lib/audit";

const adminInsuranceRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
adminInsuranceRouter.use("*", authMiddleware);
adminInsuranceRouter.use("*", adminMiddleware);

/**
 * Helper function to compute effective insurance status
 * Returns EXPIRED if insuranceExpiresAt is in the past
 */
function getEffectiveInsuranceStatus(user: {
  insuranceStatus: string | null;
  insuranceExpiresAt: Date | null;
}): string {
  // If status is APPROVED and expiration date is in the past, return EXPIRED
  if (user.insuranceStatus === "APPROVED" && user.insuranceExpiresAt) {
    const now = new Date();
    if (user.insuranceExpiresAt < now) {
      return "EXPIRED";
    }
  }
  // Default to MISSING if no status set
  return user.insuranceStatus ?? "MISSING";
}

/**
 * GET /api/admin/insurance
 * List all tenants with their insurance status
 * Query params:
 *   - status: filter by status (MISSING, PENDING, APPROVED, REJECTED, EXPIRED)
 *   - unitId: filter by unit
 */
adminInsuranceRouter.get("/", async (c) => {
  const statusFilter = c.req.query("status");
  const unitIdFilter = c.req.query("unitId");

  // Get all tenants with their insurance info and active tenancy
  const tenants = await prisma.user.findMany({
    where: {
      role: "TENANT",
      status: "ACTIVE",
      ...(unitIdFilter && {
        tenancies: {
          some: {
            unitId: unitIdFilter,
            isActive: true,
          },
        },
      }),
    },
    select: {
      id: true,
      name: true,
      email: true,
      insuranceStatus: true,
      insuranceProvider: true,
      insuranceExpiresAt: true,
      insuranceVerifiedAt: true,
      insuranceDocumentUrl: true,
      insuranceRejectionReason: true,
      tenancies: {
        where: { isActive: true },
        select: {
          unit: {
            select: {
              unitLabel: true,
              buildingName: true,
            },
          },
        },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  // Map and filter by effective status
  const results = tenants
    .map((tenant) => {
      const effectiveStatus = getEffectiveInsuranceStatus(tenant);
      return {
        userId: tenant.id,
        userName: tenant.name,
        userEmail: tenant.email,
        unitLabel: tenant.tenancies[0]?.unit.unitLabel ?? null,
        buildingName: tenant.tenancies[0]?.unit.buildingName ?? null,
        status: effectiveStatus,
        provider: tenant.insuranceProvider,
        expiresAt: tenant.insuranceExpiresAt?.toISOString() ?? null,
        verifiedAt: tenant.insuranceVerifiedAt?.toISOString() ?? null,
        documentUrl: tenant.insuranceDocumentUrl,
        rejectionReason: tenant.insuranceRejectionReason,
      };
    })
    .filter((tenant) => {
      // Apply status filter if provided
      if (statusFilter && tenant.status !== statusFilter) {
        return false;
      }
      return true;
    });

  return c.json({ data: results });
});

/**
 * GET /api/admin/insurance/:userId
 * Get specific tenant's insurance details
 */
adminInsuranceRouter.get("/:userId", async (c) => {
  const userId = c.req.param("userId");

  const tenant = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      insuranceStatus: true,
      insuranceProvider: true,
      insuranceExpiresAt: true,
      insuranceVerifiedAt: true,
      insuranceDocumentUrl: true,
      insuranceRejectionReason: true,
      covieLinkId: true,
      coviePolicyId: true,
      tenancies: {
        where: { isActive: true },
        select: {
          startDate: true,
          unit: {
            select: {
              unitLabel: true,
            },
          },
        },
        take: 1,
      },
    },
  });

  if (!tenant) {
    return c.json({ error: { message: "Tenant not found", code: "NOT_FOUND" } }, 404);
  }

  if (tenant.role !== "TENANT") {
    return c.json({ error: { message: "User is not a tenant", code: "NOT_TENANT" } }, 400);
  }

  const effectiveStatus = getEffectiveInsuranceStatus(tenant);

  return c.json({
    data: {
      userId: tenant.id,
      userName: tenant.name,
      userEmail: tenant.email,
      unitLabel: tenant.tenancies[0]?.unit.unitLabel ?? null,
      status: effectiveStatus,
      provider: tenant.insuranceProvider,
      expiresAt: tenant.insuranceExpiresAt?.toISOString() ?? null,
      verifiedAt: tenant.insuranceVerifiedAt?.toISOString() ?? null,
      documentUrl: tenant.insuranceDocumentUrl,
      rejectionReason: tenant.insuranceRejectionReason,
      covieLinkId: tenant.covieLinkId,
      coviePolicyId: tenant.coviePolicyId,
      tenancyStartDate: tenant.tenancies[0]?.startDate.toISOString() ?? null,
    },
  });
});

/**
 * PUT /api/admin/insurance/:userId/approve
 * Approve uploaded insurance
 */
adminInsuranceRouter.put("/:userId/approve", async (c) => {
  const adminUser = c.get("user");
  const userId = c.req.param("userId");

  // Fetch tenant
  const tenant = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      insuranceStatus: true,
      insuranceProvider: true,
      insuranceExpiresAt: true,
      insuranceDocumentUrl: true,
    },
  });

  if (!tenant) {
    return c.json({ error: { message: "Tenant not found", code: "NOT_FOUND" } }, 404);
  }

  if (tenant.role !== "TENANT") {
    return c.json({ error: { message: "User is not a tenant", code: "NOT_TENANT" } }, 400);
  }

  // Check if there's pending insurance to approve
  if (tenant.insuranceStatus !== "PENDING") {
    return c.json(
      { error: { message: "No pending insurance to approve", code: "NOT_PENDING" } },
      400
    );
  }

  // Check if expiration date is still valid
  if (tenant.insuranceExpiresAt && tenant.insuranceExpiresAt < new Date()) {
    return c.json(
      { error: { message: "Insurance has already expired", code: "ALREADY_EXPIRED" } },
      400
    );
  }

  // Approve the insurance
  await prisma.user.update({
    where: { id: userId },
    data: {
      insuranceStatus: "APPROVED",
      insuranceVerifiedAt: new Date(),
      insuranceRejectionReason: null,
    },
  });

  // Log the audit action
  await logAuditAction({
    adminUserId: adminUser.id,
    action: AuditActions.INSURANCE_APPROVE,
    entityType: "User",
    entityId: userId,
    metadata: {
      tenantName: tenant.name,
      tenantEmail: tenant.email,
      provider: tenant.insuranceProvider,
      expiresAt: tenant.insuranceExpiresAt?.toISOString(),
    },
  });

  console.log(`[INSURANCE] Admin ${adminUser.email} approved insurance for tenant ${tenant.email}`);

  return c.json({
    data: {
      success: true,
      userId: tenant.id,
      status: "APPROVED",
      verifiedAt: new Date().toISOString(),
    },
  });
});

/**
 * PUT /api/admin/insurance/:userId/reject
 * Reject uploaded insurance with reason
 */
adminInsuranceRouter.put(
  "/:userId/reject",
  zValidator("json", RejectInsuranceSchema),
  async (c) => {
    const adminUser = c.get("user");
    const userId = c.req.param("userId");
    const { reason } = c.req.valid("json");

    // Fetch tenant
    const tenant = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        insuranceStatus: true,
        insuranceProvider: true,
      },
    });

    if (!tenant) {
      return c.json({ error: { message: "Tenant not found", code: "NOT_FOUND" } }, 404);
    }

    if (tenant.role !== "TENANT") {
      return c.json({ error: { message: "User is not a tenant", code: "NOT_TENANT" } }, 400);
    }

    // Check if there's pending insurance to reject
    if (tenant.insuranceStatus !== "PENDING") {
      return c.json(
        { error: { message: "No pending insurance to reject", code: "NOT_PENDING" } },
        400
      );
    }

    // Reject the insurance
    await prisma.user.update({
      where: { id: userId },
      data: {
        insuranceStatus: "REJECTED",
        insuranceRejectionReason: reason,
        insuranceVerifiedAt: null,
      },
    });

    // Log the audit action
    await logAuditAction({
      adminUserId: adminUser.id,
      action: AuditActions.INSURANCE_REJECT,
      entityType: "User",
      entityId: userId,
      metadata: {
        tenantName: tenant.name,
        tenantEmail: tenant.email,
        provider: tenant.insuranceProvider,
        rejectionReason: reason,
      },
    });

    console.log(`[INSURANCE] Admin ${adminUser.email} rejected insurance for tenant ${tenant.email}. Reason: ${reason}`);

    return c.json({
      data: {
        success: true,
        userId: tenant.id,
        status: "REJECTED",
        rejectionReason: reason,
      },
    });
  }
);

/**
 * POST /api/admin/insurance/:userId/send-reminder
 * Send insurance reminder email to tenant
 */
adminInsuranceRouter.post("/:userId/send-reminder", async (c) => {
  const adminUser = c.get("user");
  const userId = c.req.param("userId");

  // Fetch tenant
  const tenant = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      insuranceStatus: true,
    },
  });

  if (!tenant) {
    return c.json({ error: { message: "Tenant not found", code: "NOT_FOUND" } }, 404);
  }

  if (tenant.role !== "TENANT") {
    return c.json({ error: { message: "User is not a tenant", code: "NOT_TENANT" } }, 400);
  }

  // Import email function
  const { sendInsuranceReminderEmail } = await import("../../lib/email");

  try {
    await sendInsuranceReminderEmail(tenant.email, tenant.name);

    // Log the audit action
    await logAuditAction({
      adminUserId: adminUser.id,
      action: AuditActions.INSURANCE_REMINDER_SENT,
      entityType: "User",
      entityId: userId,
      metadata: {
        tenantName: tenant.name,
        tenantEmail: tenant.email,
        insuranceStatus: tenant.insuranceStatus,
      },
    });

    console.log(`[INSURANCE] Admin ${adminUser.email} sent insurance reminder to tenant ${tenant.email}`);

    return c.json({
      data: {
        success: true,
        message: `Reminder sent to ${tenant.email}`,
      },
    });
  } catch (error) {
    console.error("[INSURANCE] Failed to send reminder email:", error);
    return c.json(
      { error: { message: "Failed to send reminder email", code: "EMAIL_FAILED" } },
      500
    );
  }
});

export { adminInsuranceRouter };
