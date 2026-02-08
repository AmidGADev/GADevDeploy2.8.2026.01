import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, tenantMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";

const tenantDashboardRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
tenantDashboardRouter.use("*", authMiddleware);
tenantDashboardRouter.use("*", tenantMiddleware);

/**
 * GET /api/tenant/dashboard
 * Get tenant dashboard data (unit info, current invoice, recent payments, open requests, unread announcements, housemates)
 */
tenantDashboardRouter.get("/", async (c) => {
  const user = c.get("user");

  // Get the tenant's active tenancy with unit info
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
    include: {
      unit: true,
    },
  });

  // Get all housemates (other tenants in the same unit)
  let housemates: { id: string; name: string; email: string; roleInUnit: string }[] = [];
  let primaryTenant: { id: string; name: string; roleInUnit: string } | null = null;

  if (tenancy) {
    const unitTenancies = await prisma.tenancy.findMany({
      where: {
        unitId: tenancy.unitId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        roleInUnit: "asc", // PRIMARY comes first
      },
    });

    housemates = unitTenancies
      .filter((t) => t.userId !== user.id)
      .map((t) => ({
        id: t.user.id,
        name: t.user.name,
        email: t.user.email,
        roleInUnit: t.roleInUnit,
      }));

    const primary = unitTenancies.find((t) => t.roleInUnit === "PRIMARY");
    if (primary) {
      primaryTenant = {
        id: primary.user.id,
        name: primary.user.name,
        roleInUnit: primary.roleInUnit,
      };
    }
  }

  // Get current month for invoice
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Get current invoice for the unit (most recent open/overdue invoice)
  const currentInvoice = tenancy
    ? await prisma.invoice.findFirst({
        where: {
          unitId: tenancy.unitId,
          status: { in: ["OPEN", "OVERDUE"] },
        },
        orderBy: { dueDate: "asc" },
      })
    : null;

  // Calculate total outstanding balance (sum of ALL unpaid invoices)
  const outstandingInvoices = tenancy
    ? await prisma.invoice.findMany({
        where: {
          unitId: tenancy.unitId,
          status: { in: ["OPEN", "OVERDUE", "PENDING_VERIFICATION"] },
        },
        select: {
          amountCents: true,
          status: true,
        },
      })
    : [];

  const outstandingBalanceCents = outstandingInvoices.reduce(
    (sum, inv) => sum + inv.amountCents,
    0
  );
  const overdueCount = outstandingInvoices.filter((inv) => inv.status === "OVERDUE").length;

  // Get recent payments for this user (last 5)
  const recentPayments = await prisma.payment.findMany({
    where: {
      userId: user.id,
    },
    orderBy: { paidAt: "desc" },
    take: 5,
  });

  // Count open service requests for the unit (not just created by this user)
  const openServiceRequests = tenancy
    ? await prisma.serviceRequest.count({
        where: {
          unitId: tenancy.unitId,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      })
    : 0;

  // Count unread announcements
  // First, get all announcements that apply to this tenant
  let unreadAnnouncements = 0;
  if (tenancy) {
    // Get announcements that are for ALL, or for this unit, or for this user specifically
    const announcements = await prisma.announcement.findMany({
      where: {
        OR: [
          { audienceType: "ALL" },
          {
            audienceType: "UNIT",
            audienceUnits: { contains: tenancy.unitId },
          },
          {
            audienceType: "CUSTOM",
            audienceUsers: { contains: user.id },
          },
        ],
      },
      select: { id: true },
    });

    // Get read announcements
    const readAnnouncements = await prisma.announcementRead.findMany({
      where: {
        userId: user.id,
        announcementId: { in: announcements.map((a) => a.id) },
      },
      select: { announcementId: true },
    });

    const readIds = new Set(readAnnouncements.map((r) => r.announcementId));
    unreadAnnouncements = announcements.filter((a) => !readIds.has(a.id)).length;
  }

  return c.json({
    data: {
      tenant: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
      },
      unit: tenancy?.unit
        ? {
            id: tenancy.unit.id,
            propertyId: tenancy.unit.propertyId,
            unitLabel: tenancy.unit.unitLabel,
            buildingName: tenancy.unit.buildingName,
            rentAmountCents: tenancy.unit.rentAmountCents,
            rentDueDay: tenancy.unit.rentDueDay,
            status: tenancy.unit.status,
            description: tenancy.unit.description,
            bedrooms: tenancy.unit.bedrooms,
            bathrooms: tenancy.unit.bathrooms,
            sqft: tenancy.unit.sqft,
            createdAt: tenancy.unit.createdAt.toISOString(),
          }
        : null,
      tenancy: tenancy
        ? {
            id: tenancy.id,
            userId: tenancy.userId,
            unitId: tenancy.unitId,
            startDate: tenancy.startDate.toISOString(),
            endDate: tenancy.endDate?.toISOString() || null,
            isActive: tenancy.isActive,
            roleInUnit: tenancy.roleInUnit,
            createdAt: tenancy.createdAt.toISOString(),
          }
        : null,
      // Housemates (other tenants in the same unit)
      housemates,
      // Primary tenant info for display
      primaryTenant,
      currentInvoice: currentInvoice
        ? {
            id: currentInvoice.id,
            unitId: currentInvoice.unitId,
            tenancyId: currentInvoice.tenancyId,
            periodMonth: currentInvoice.periodMonth,
            dueDate: currentInvoice.dueDate.toISOString(),
            amountCents: currentInvoice.amountCents,
            status: currentInvoice.status,
            stripeCheckoutSessionId: currentInvoice.stripeCheckoutSessionId,
            createdAt: currentInvoice.createdAt.toISOString(),
          }
        : null,
      recentPayments: recentPayments.map((p) => ({
        id: p.id,
        invoiceId: p.invoiceId,
        unitId: p.unitId,
        userId: p.userId,
        amountCents: p.amountCents,
        paidAt: p.paidAt.toISOString(),
        stripePaymentIntentId: p.stripePaymentIntentId,
        receiptUrl: p.receiptUrl,
      })),
      openServiceRequests,
      unreadAnnouncements,
      // Outstanding balance
      outstandingBalanceCents,
      overdueCount,
    },
  });
});

export { tenantDashboardRouter };

/**
 * Tenant Tenancy Info Router - for checking move-out date
 */
const tenantTenancyInfoRouter = new Hono<{ Variables: AuthVariables }>();
tenantTenancyInfoRouter.use("*", authMiddleware);
tenantTenancyInfoRouter.use("*", tenantMiddleware);

/**
 * GET /api/tenant/tenancy-info
 * Get basic tenancy info including move-out date for navigation display
 */
tenantTenancyInfoRouter.get("/", async (c) => {
  const user = c.get("user");

  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
    select: {
      id: true,
      moveOutDate: true,
      startDate: true,
      roleInUnit: true,
    },
  });

  return c.json({
    data: {
      moveOutDate: tenancy?.moveOutDate?.toISOString() || null,
      startDate: tenancy?.startDate?.toISOString() || null,
      roleInUnit: tenancy?.roleInUnit || null,
    },
  });
});

export { tenantTenancyInfoRouter };

/**
 * Tenant Unit Router - separate export for /api/tenant/unit
 */
const tenantUnitRouter = new Hono<{ Variables: AuthVariables }>();
tenantUnitRouter.use("*", authMiddleware);
tenantUnitRouter.use("*", tenantMiddleware);

/**
 * GET /api/tenant/unit
 * Get basic unit info for the tenant's active tenancy
 */
tenantUnitRouter.get("/", async (c) => {
  const user = c.get("user");

  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
    include: {
      unit: true,
    },
  });

  if (!tenancy?.unit) {
    return c.json({ error: { message: "No active unit found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: {
      id: tenancy.unit.id,
      unitLabel: tenancy.unit.unitLabel,
      buildingName: tenancy.unit.buildingName,
      bedrooms: tenancy.unit.bedrooms,
      bathrooms: tenancy.unit.bathrooms,
      sqft: tenancy.unit.sqft,
      description: tenancy.unit.description,
    },
  });
});

export { tenantUnitRouter };
