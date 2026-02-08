import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";

const dashboardRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
dashboardRouter.use("*", authMiddleware);
dashboardRouter.use("*", adminMiddleware);

/**
 * GET /api/admin/dashboard
 * Get dashboard statistics with property health data
 * Supports optional building filter via ?buildingName query param
 */
dashboardRouter.get("/", async (c) => {
  // Get optional building filter
  const buildingFilter = c.req.query("buildingName");
  const buildingWhere = buildingFilter ? { buildingName: buildingFilter } : {};
  const unitBuildingWhere = buildingFilter ? { unit: { buildingName: buildingFilter } } : {};

  // Get current month for revenue calculation
  const now = new Date();
  const currentMonthName = now.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const currentPeriodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Execute all counts in parallel
  const [
    totalUnits,
    occupiedUnits,
    underRenovationUnits,
    totalTenants,
    openServiceRequests,
    overdueInvoicesData,
    outstandingInvoices,
    pendingShowingRequests,
    monthlyPayments,
    insuranceStats,
    urgentServiceRequests,
    oldestOpenServiceRequest,
    oldestOverdueInvoice,
    oldestShowingRequest,
    recentServiceRequests,
    buildings,
    expectedMonthlyRevenue,
    pendingChecklists,
  ] = await Promise.all([
    // Total units
    prisma.unit.count({ where: buildingWhere }),

    // Occupied units
    prisma.unit.count({
      where: { ...buildingWhere, status: "OCCUPIED" },
    }),

    // Under renovation units
    prisma.unit.count({
      where: { ...buildingWhere, status: "UNDER_RENOVATION" },
    }),

    // Total active tenants
    prisma.user.count({
      where: {
        role: "TENANT",
        status: "ACTIVE",
        ...(buildingFilter
          ? {
              tenancies: {
                some: {
                  isActive: true,
                  unit: { buildingName: buildingFilter },
                },
              },
            }
          : {}),
      },
    }),

    // Open service requests
    prisma.serviceRequest.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        ...unitBuildingWhere,
      },
    }),

    // Overdue invoices count and amount (OVERDUE status OR OPEN past due date)
    prisma.invoice.aggregate({
      where: {
        OR: [
          { status: "OVERDUE" },
          { status: "OPEN", dueDate: { lt: now } }
        ],
        ...unitBuildingWhere,
      },
      _count: true,
      _sum: {
        amountCents: true,
      },
    }),

    // Outstanding invoices (OPEN + OVERDUE) with total amount
    prisma.invoice.aggregate({
      where: {
        status: { in: ["OPEN", "OVERDUE"] },
        ...unitBuildingWhere,
      },
      _count: true,
      _sum: {
        amountCents: true,
      },
    }),

    // Pending showing requests (NEW status)
    prisma.showingRequest.count({
      where: {
        status: "NEW",
      },
    }),

    // Monthly revenue (sum of payments this month)
    prisma.payment.aggregate({
      where: {
        paidAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), 1),
          lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        },
        ...unitBuildingWhere,
      },
      _sum: {
        amountCents: true,
      },
    }),

    // Insurance compliance stats
    prisma.user.groupBy({
      by: ["insuranceStatus"],
      where: {
        role: "TENANT",
        status: "ACTIVE",
        tenancies: {
          some: {
            isActive: true,
            ...(buildingFilter ? { unit: { buildingName: buildingFilter } } : {}),
          },
        },
      },
      _count: true,
    }),

    // Urgent service requests (HIGH or URGENT priority, still open)
    prisma.serviceRequest.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        priority: { in: ["HIGH", "URGENT"] },
        ...unitBuildingWhere,
      },
    }),

    // Oldest open service request (for timestamp)
    prisma.serviceRequest.findFirst({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        ...unitBuildingWhere,
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),

    // Oldest overdue invoice (for timestamp)
    prisma.invoice.findFirst({
      where: {
        OR: [
          { status: "OVERDUE" },
          { status: "OPEN", dueDate: { lt: now } }
        ],
        ...unitBuildingWhere,
      },
      orderBy: { dueDate: "asc" },
      select: { dueDate: true },
    }),

    // Oldest showing request (for timestamp)
    prisma.showingRequest.findFirst({
      where: {
        status: "NEW",
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),

    // Recent service requests (last 3)
    prisma.serviceRequest.findMany({
      where: unitBuildingWhere,
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        createdAt: true,
        unit: {
          select: {
            unitLabel: true,
            buildingName: true,
          },
        },
        createdBy: {
          select: {
            name: true,
          },
        },
      },
    }),

    // Get distinct buildings for filter dropdown
    prisma.unit.findMany({
      select: { buildingName: true },
      distinct: ["buildingName"],
      orderBy: { buildingName: "asc" },
    }),

    // Expected monthly revenue (sum of invoices due this month)
    prisma.invoice.aggregate({
      where: {
        periodMonth: currentPeriodMonth,
        ...unitBuildingWhere,
      },
      _sum: {
        amountCents: true,
      },
    }),

    // Pending move-in/move-out checklists (exclude move-in items for legacy tenants)
    prisma.checklistItem.count({
      where: {
        isRequired: true,
        isCompleted: false,
        OR: [
          // Move-out checklist items for any tenant
          { checklistType: "MOVE_OUT" },
          // Move-in checklist items only for non-legacy tenants
          {
            checklistType: "MOVE_IN",
            tenancy: {
              isLegacyMoveIn: false,
            },
          },
        ],
        tenancy: {
          isActive: true,
          ...(buildingFilter ? { unit: { buildingName: buildingFilter } } : {}),
        },
      },
    }),
  ]);

  // Extract overdue invoices count and amount
  const overdueInvoicesCount = overdueInvoicesData._count || 0;
  const overdueInvoicesAmount = overdueInvoicesData._sum.amountCents || 0;

  // Process insurance stats - VERIFIED and APPROVED both count as verified
  const insuranceVerified =
    (insuranceStats.find((s) => s.insuranceStatus === "VERIFIED")?._count || 0) +
    (insuranceStats.find((s) => s.insuranceStatus === "APPROVED")?._count || 0);
  const insuranceMissing =
    insuranceStats.find((s) => s.insuranceStatus === "MISSING" || s.insuranceStatus === null)?._count || 0;
  const insuranceExpired =
    insuranceStats.find((s) => s.insuranceStatus === "EXPIRED")?._count || 0;
  const insurancePending =
    insuranceStats.find((s) => s.insuranceStatus === "PENDING")?._count || 0;
  const totalTenantsWithInsurance = insuranceVerified + insuranceMissing + insuranceExpired + insurancePending;
  const insuranceComplianceRate = totalTenantsWithInsurance > 0
    ? Math.round((insuranceVerified / totalTenantsWithInsurance) * 100)
    : 100;

  // Calculate property health status
  const hasUrgentIssues = overdueInvoicesCount > 0 || urgentServiceRequests > 0;
  const hasModerateIssues =
    openServiceRequests > 0 ||
    (totalUnits - occupiedUnits - underRenovationUnits) > 0 ||
    insuranceMissing > 0 ||
    insuranceExpired > 0 ||
    pendingShowingRequests > 0;

  let propertyHealthStatus: "GOOD" | "NEEDS_ATTENTION" | "CRITICAL" = "GOOD";
  if (hasUrgentIssues) {
    propertyHealthStatus = "CRITICAL";
  } else if (hasModerateIssues) {
    propertyHealthStatus = "NEEDS_ATTENTION";
  }

  // Build health summary text
  const summaryParts: string[] = [];
  if (overdueInvoicesCount > 0) summaryParts.push(`${overdueInvoicesCount} overdue invoice${overdueInvoicesCount !== 1 ? "s" : ""}`);
  if (openServiceRequests > 0) summaryParts.push(`${openServiceRequests} open request${openServiceRequests !== 1 ? "s" : ""}`);
  if (totalUnits - occupiedUnits - underRenovationUnits > 0) summaryParts.push(`${totalUnits - occupiedUnits - underRenovationUnits} vacant unit${totalUnits - occupiedUnits - underRenovationUnits !== 1 ? "s" : ""}`);
  if (insuranceMissing + insuranceExpired > 0) summaryParts.push(`${insuranceMissing + insuranceExpired} insurance issue${insuranceMissing + insuranceExpired !== 1 ? "s" : ""}`);

  const healthSummary = summaryParts.length > 0
    ? summaryParts.slice(0, 3).join(", ")
    : "All systems running smoothly";

  // Calculate cash flow metrics
  const expectedRevenue = expectedMonthlyRevenue._sum?.amountCents || 0;
  const collectedRevenue = monthlyPayments._sum?.amountCents || 0;
  const pendingRevenue = expectedRevenue - collectedRevenue;
  const collectionRate = expectedRevenue > 0 ? Math.round((collectedRevenue / expectedRevenue) * 100) : 100;

  return c.json({
    data: {
      // Occupancy Overview
      totalUnits,
      occupiedUnits,
      vacantUnits: totalUnits - occupiedUnits - underRenovationUnits,
      underRenovationUnits,
      occupancyRate: totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0,

      // Tenant & Property Stats
      totalTenants,
      openServiceRequests,
      overdueInvoices: overdueInvoicesCount,
      overdueInvoicesAmount,
      pendingShowingRequests,
      urgentServiceRequests,
      pendingChecklists,

      // Cash Flow Metrics
      expectedMonthlyRevenue: expectedRevenue,
      collectedRevenue,
      pendingRevenue: pendingRevenue > 0 ? pendingRevenue : 0,
      collectionRate,
      monthlyRevenue: collectedRevenue,
      currentMonthLabel: currentMonthName,

      // Outstanding Invoices
      outstandingInvoicesCount: outstandingInvoices._count || 0,
      outstandingInvoicesAmount: outstandingInvoices._sum.amountCents || 0,

      // Timestamps for action items
      timestamps: {
        oldestServiceRequest: oldestOpenServiceRequest?.createdAt?.toISOString() || null,
        oldestOverdueInvoice: oldestOverdueInvoice?.dueDate?.toISOString() || null,
        oldestShowingRequest: oldestShowingRequest?.createdAt?.toISOString() || null,
      },

      // Insurance compliance
      insuranceCompliance: {
        verified: insuranceVerified,
        missing: insuranceMissing,
        expired: insuranceExpired,
        pending: insurancePending,
        total: totalTenantsWithInsurance,
        complianceRate: insuranceComplianceRate,
      },

      // Property health
      propertyHealth: {
        status: propertyHealthStatus,
        summary: healthSummary,
      },

      // Recent activity
      recentServiceRequests: recentServiceRequests.map((req) => ({
        id: req.id,
        title: req.title,
        status: req.status,
        priority: req.priority,
        createdAt: req.createdAt.toISOString(),
        unitLabel: req.unit.unitLabel,
        buildingName: req.unit.buildingName,
        tenantName: req.createdBy.name,
      })),

      // Building filter options
      buildings: buildings.map((b) => b.buildingName).filter(Boolean),
    },
  });
});

export { dashboardRouter };
