import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, tenantMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";

/**
 * Tenant Compliance Router
 * Provides account standing and compliance status for tenants
 */

const tenantComplianceRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
tenantComplianceRouter.use("*", authMiddleware);
tenantComplianceRouter.use("*", tenantMiddleware);

// Issue type definitions
type IssueType =
  | "RENT_DUE"
  | "RENT_OVERDUE"
  | "INSURANCE_MISSING"
  | "INSURANCE_EXPIRED"
  | "DOCUMENTS_REQUIRED"
  | "CHECKLIST_INCOMPLETE";

type IssueSeverity = "warning" | "critical";

interface ComplianceIssue {
  type: IssueType;
  severity: IssueSeverity;
  title: string;
  description: string;
  actionUrl: string;
  dueDate?: string;
}

type ComplianceStatus = "GOOD_STANDING" | "ACTION_REQUIRED" | "NOT_IN_COMPLIANCE";
type RentStatus = "PAID" | "DUE" | "OVERDUE" | "NO_INVOICE";
type InsuranceStatus = "APPROVED" | "PENDING" | "MISSING" | "EXPIRED" | "REJECTED";

/**
 * Helper function to compute effective insurance status
 * Returns EXPIRED if insuranceExpiresAt is in the past
 */
function getEffectiveInsuranceStatus(user: {
  insuranceStatus: string | null;
  insuranceExpiresAt: Date | null;
}): InsuranceStatus {
  // If no status, return MISSING
  if (!user.insuranceStatus) {
    return "MISSING";
  }

  // If status is APPROVED and expiration date is in the past, return EXPIRED
  if (user.insuranceStatus === "APPROVED" && user.insuranceExpiresAt) {
    const now = new Date();
    if (user.insuranceExpiresAt < now) {
      return "EXPIRED";
    }
    return "APPROVED";
  }

  // Map database status to our status type
  const statusMap: Record<string, InsuranceStatus> = {
    APPROVED: "APPROVED",
    PENDING: "PENDING",
    MISSING: "MISSING",
    EXPIRED: "EXPIRED",
    REJECTED: "REJECTED",
  };

  return statusMap[user.insuranceStatus] || "MISSING";
}

/**
 * Calculate days between two dates
 */
function daysBetween(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.ceil((date2.getTime() - date1.getTime()) / oneDay);
}

/**
 * GET /api/tenant/compliance
 * Get tenant's account standing and compliance status
 */
tenantComplianceRouter.get("/", async (c) => {
  const user = c.get("user");
  const now = new Date();
  const issues: ComplianceIssue[] = [];

  // Fetch user with insurance fields
  const tenant = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      phone: true,
      insuranceStatus: true,
      insuranceExpiresAt: true,
    },
  });

  if (!tenant) {
    return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);
  }

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

  // ============================================
  // Rent Status
  // ============================================
  let rentStatus: RentStatus = "NO_INVOICE";

  if (tenancy) {
    // Get current invoice for the unit (most recent open/overdue invoice)
    const currentInvoice = await prisma.invoice.findFirst({
      where: {
        unitId: tenancy.unitId,
        status: { in: ["OPEN", "OVERDUE"] },
      },
      orderBy: { dueDate: "asc" },
    });

    if (currentInvoice) {
      if (currentInvoice.status === "OVERDUE") {
        rentStatus = "OVERDUE";
        issues.push({
          type: "RENT_OVERDUE",
          severity: "critical",
          title: "Rent Payment Overdue",
          description: `Your rent payment for ${currentInvoice.periodMonth} is overdue. Please make payment immediately.`,
          actionUrl: "/tenant/payments",
          dueDate: currentInvoice.dueDate.toISOString(),
        });
      } else if (currentInvoice.status === "OPEN") {
        const daysUntilDue = daysBetween(now, currentInvoice.dueDate);

        if (daysUntilDue <= 0) {
          // Due date has passed but not marked overdue yet
          rentStatus = "OVERDUE";
          issues.push({
            type: "RENT_OVERDUE",
            severity: "critical",
            title: "Rent Payment Overdue",
            description: `Your rent payment for ${currentInvoice.periodMonth} is past due. Please make payment immediately.`,
            actionUrl: "/tenant/payments",
            dueDate: currentInvoice.dueDate.toISOString(),
          });
        } else if (daysUntilDue <= 7) {
          rentStatus = "DUE";
          issues.push({
            type: "RENT_DUE",
            severity: "warning",
            title: "Rent Payment Due Soon",
            description: `Your rent payment for ${currentInvoice.periodMonth} is due in ${daysUntilDue} day${daysUntilDue !== 1 ? "s" : ""}.`,
            actionUrl: "/tenant/payments",
            dueDate: currentInvoice.dueDate.toISOString(),
          });
        } else {
          rentStatus = "DUE";
        }
      }
    } else {
      // No open/overdue invoices - check for recent paid invoice
      const paidInvoice = await prisma.invoice.findFirst({
        where: {
          unitId: tenancy.unitId,
          status: "PAID",
        },
        orderBy: { dueDate: "desc" },
      });

      if (paidInvoice) {
        rentStatus = "PAID";
      }
    }
  }

  // ============================================
  // Insurance Status
  // ============================================
  const insuranceStatus = getEffectiveInsuranceStatus(tenant);

  if (insuranceStatus === "MISSING") {
    issues.push({
      type: "INSURANCE_MISSING",
      severity: "warning",
      title: "Insurance Required",
      description: "Please upload proof of renter's insurance to comply with your lease terms.",
      actionUrl: "/tenant/insurance",
    });
  } else if (insuranceStatus === "EXPIRED") {
    issues.push({
      type: "INSURANCE_EXPIRED",
      severity: "critical",
      title: "Insurance Expired",
      description: "Your renter's insurance has expired. Please upload a new policy document.",
      actionUrl: "/tenant/insurance",
      dueDate: tenant.insuranceExpiresAt?.toISOString(),
    });
  } else if (insuranceStatus === "PENDING") {
    issues.push({
      type: "INSURANCE_MISSING",
      severity: "warning",
      title: "Insurance Pending Review",
      description: "Your insurance document is pending admin review.",
      actionUrl: "/tenant/insurance",
    });
  } else if (insuranceStatus === "REJECTED") {
    issues.push({
      type: "INSURANCE_MISSING",
      severity: "warning",
      title: "Insurance Rejected",
      description: "Your insurance document was rejected. Please upload a valid policy.",
      actionUrl: "/tenant/insurance",
    });
  }

  // ============================================
  // Documents Count
  // ============================================
  const documentsCount = await prisma.tenantDocument.count({
    where: { userId: user.id },
  });

  // ============================================
  // Checklist Progress
  // ============================================
  let checklistProgress = {
    completed: 0,
    total: 0,
    requiredCompleted: 0,
    requiredTotal: 0,
  };

  if (tenancy) {
    const checklistItems = await prisma.checklistItem.findMany({
      where: { tenancyId: tenancy.id },
    });

    checklistProgress.total = checklistItems.length;
    checklistProgress.completed = checklistItems.filter((item) => item.isCompleted).length;
    checklistProgress.requiredTotal = checklistItems.filter((item) => item.isRequired).length;
    checklistProgress.requiredCompleted = checklistItems.filter(
      (item) => item.isRequired && item.isCompleted
    ).length;

    // Add issue if there are incomplete required checklist items
    if (checklistProgress.requiredCompleted < checklistProgress.requiredTotal) {
      const incompleteCount = checklistProgress.requiredTotal - checklistProgress.requiredCompleted;
      issues.push({
        type: "CHECKLIST_INCOMPLETE",
        severity: "warning",
        title: "Move-in Checklist Incomplete",
        description: `You have ${incompleteCount} required item${incompleteCount !== 1 ? "s" : ""} to complete on your move-in checklist.`,
        actionUrl: "/tenant/checklist",
      });
    }
  }

  // ============================================
  // Lease Expiry
  // ============================================
  let leaseExpiry: {
    endDate: string | null;
    daysRemaining: number | null;
    showWarning: boolean;
  } | null = null;

  if (tenancy && tenancy.endDate) {
    const daysRemaining = daysBetween(now, tenancy.endDate);
    leaseExpiry = {
      endDate: tenancy.endDate.toISOString(),
      daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
      showWarning: daysRemaining <= 90 && daysRemaining > 0,
    };
  } else if (tenancy) {
    // Month-to-month or no end date
    leaseExpiry = {
      endDate: null,
      daysRemaining: null,
      showWarning: false,
    };
  }

  // ============================================
  // Profile Completion
  // ============================================
  const missingItems: string[] = [];

  if (!tenant.phone) {
    missingItems.push("Phone number");
  }
  if (insuranceStatus !== "APPROVED") {
    missingItems.push("Insurance verification");
  }
  if (documentsCount === 0) {
    missingItems.push("Lease documents");
  }
  if (checklistProgress.total > 0 && checklistProgress.completed < checklistProgress.total) {
    missingItems.push("Move-in checklist");
  }

  // Calculate profile completion percentage
  const totalProfileItems = 4; // phone, insurance, documents, checklist
  const completedProfileItems = totalProfileItems - missingItems.length;
  const profilePercentage = Math.round((completedProfileItems / totalProfileItems) * 100);

  const profileCompletion = {
    percentage: profilePercentage,
    missingItems,
  };

  // ============================================
  // Determine Overall Status
  // ============================================
  let status: ComplianceStatus = "GOOD_STANDING";

  // Check for NOT_IN_COMPLIANCE conditions
  const hasRentOverdue = issues.some((i) => i.type === "RENT_OVERDUE");
  const hasExpiredInsurance = insuranceStatus === "EXPIRED";

  if (hasRentOverdue || hasExpiredInsurance) {
    status = "NOT_IN_COMPLIANCE";
  } else if (issues.length > 0) {
    status = "ACTION_REQUIRED";
  }

  return c.json({
    data: {
      status,
      issues,
      summary: {
        rentStatus,
        insuranceStatus,
        documentsCount,
        checklistProgress,
      },
      leaseExpiry,
      profileCompletion,
    },
  });
});

export { tenantComplianceRouter };
