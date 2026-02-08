import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, tenantMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";

const tenantCalendarRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
tenantCalendarRouter.use("*", authMiddleware);
tenantCalendarRouter.use("*", tenantMiddleware);

// Event categories for color coding
type EventCategory = "logistics" | "milestone" | "compliance" | "holiday" | "move";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  category: EventCategory;
  description?: string;
  location?: string;
  isRecurring?: boolean;
  recurrencePattern?: string;
  isAdminEvent?: boolean;
}

// Canadian Federal Holidays for 2024-2026
const CANADIAN_HOLIDAYS: Array<{ name: string; dates: string[] }> = [
  { name: "New Year's Day", dates: ["2024-01-01", "2025-01-01", "2026-01-01"] },
  { name: "Family Day", dates: ["2024-02-19", "2025-02-17", "2026-02-16"] },
  { name: "Good Friday", dates: ["2024-03-29", "2025-04-18", "2026-04-03"] },
  { name: "Victoria Day", dates: ["2024-05-20", "2025-05-19", "2026-05-18"] },
  { name: "Canada Day", dates: ["2024-07-01", "2025-07-01", "2026-07-01"] },
  { name: "Civic Holiday", dates: ["2024-08-05", "2025-08-04", "2026-08-03"] },
  { name: "Labour Day", dates: ["2024-09-02", "2025-09-01", "2026-09-07"] },
  { name: "Thanksgiving", dates: ["2024-10-14", "2025-10-13", "2026-10-12"] },
  { name: "Remembrance Day", dates: ["2024-11-11", "2025-11-11", "2026-11-11"] },
  { name: "Christmas Day", dates: ["2024-12-25", "2025-12-25", "2026-12-25"] },
  { name: "Boxing Day", dates: ["2024-12-26", "2025-12-26", "2026-12-26"] },
];

// Helper to format date as YYYY-MM-DD
function formatDateStr(date: Date): string {
  return date.toISOString().split("T")[0] as string;
}

/**
 * GET /api/tenant/calendar
 * Get all calendar events for the tenant
 * Query params:
 *   - start: ISO date string for range start
 *   - end: ISO date string for range end
 */
tenantCalendarRouter.get("/", async (c) => {
  const user = c.get("user");
  const startParam = c.req.query("start");
  const endParam = c.req.query("end");

  // Default to current month +/- 3 months
  const now = new Date();
  const rangeStart = startParam
    ? new Date(startParam)
    : new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const rangeEnd = endParam
    ? new Date(endParam)
    : new Date(now.getFullYear(), now.getMonth() + 4, 0);

  const events: CalendarEvent[] = [];

  // Get the tenant's active tenancy with unit and building info
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
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

  if (!tenancy) {
    // Return only holidays if no active tenancy
    const holidayEvents: CalendarEvent[] = CANADIAN_HOLIDAYS.flatMap((holiday) =>
      holiday.dates
        .filter((date) => {
          const d = new Date(date);
          return d >= rangeStart && d <= rangeEnd;
        })
        .map((date) => ({
          id: `holiday-${holiday.name.toLowerCase().replace(/\s+/g, "-")}-${date}`,
          title: holiday.name,
          start: date,
          allDay: true,
          category: "holiday" as EventCategory,
          description: `Canadian Public Holiday. Building services may be limited or unavailable.`,
        }))
    );

    return c.json({ data: holidayEvents });
  }

  const buildingName = tenancy.unit.buildingName;
  const unitLabel = tenancy.unit.unitLabel;
  const locationStr = `${buildingName} - ${unitLabel}`;

  // ============================================
  // 1. Lease Milestones (Move-in, Move-out/Renewal)
  // ============================================

  // Move-in date
  if (tenancy.startDate) {
    const startDateStr = formatDateStr(tenancy.startDate);
    if (tenancy.startDate >= rangeStart && tenancy.startDate <= rangeEnd) {
      events.push({
        id: `milestone-move-in-${tenancy.id}`,
        title: `Move-In Date: ${locationStr}`,
        start: startDateStr,
        allDay: true,
        category: "milestone",
        description: `Your lease start date for ${locationStr}.`,
        location: locationStr,
      });
    }

    // Move-in anniversary (if not the original move-in date year)
    const anniversary = new Date(tenancy.startDate);
    for (let year = rangeStart.getFullYear(); year <= rangeEnd.getFullYear(); year++) {
      if (year !== tenancy.startDate.getFullYear()) {
        anniversary.setFullYear(year);
        if (anniversary >= rangeStart && anniversary <= rangeEnd) {
          const anniversaryStr = formatDateStr(anniversary);
          events.push({
            id: `milestone-anniversary-${tenancy.id}-${year}`,
            title: `Lease Anniversary: ${locationStr}`,
            start: anniversaryStr,
            allDay: true,
            category: "milestone",
            description: `Anniversary of your lease at ${locationStr}.`,
            location: locationStr,
          });
        }
      }
    }
  }

  // Move-out/Renewal date
  if (tenancy.endDate) {
    const endDateStr = formatDateStr(tenancy.endDate);
    if (tenancy.endDate >= rangeStart && tenancy.endDate <= rangeEnd) {
      events.push({
        id: `milestone-lease-end-${tenancy.id}`,
        title: `Lease End: ${locationStr}`,
        start: endDateStr,
        allDay: true,
        category: "milestone",
        description: `Your lease end date for ${locationStr}. Contact management regarding renewal options.`,
        location: locationStr,
      });

      // Add 60-day notice reminder
      const noticeDate = new Date(tenancy.endDate);
      noticeDate.setDate(noticeDate.getDate() - 60);
      if (noticeDate >= rangeStart && noticeDate <= rangeEnd) {
        const noticeDateStr = formatDateStr(noticeDate);
        events.push({
          id: `compliance-notice-reminder-${tenancy.id}`,
          title: `Lease Renewal Due: ${locationStr}`,
          start: noticeDateStr,
          allDay: true,
          category: "compliance",
          description: `60 days until lease end. Please contact management to discuss renewal or provide move-out notice.`,
          location: locationStr,
        });
      }
    }
  }

  // Scheduled move-out date
  if (tenancy.moveOutDate) {
    const moveOutStr = formatDateStr(tenancy.moveOutDate);
    if (tenancy.moveOutDate >= rangeStart && tenancy.moveOutDate <= rangeEnd) {
      events.push({
        id: `milestone-move-out-${tenancy.id}`,
        title: `Scheduled Move-Out: ${locationStr}`,
        start: moveOutStr,
        allDay: true,
        category: "milestone",
        description: `Your scheduled move-out date. Please ensure all move-out checklist items are completed.`,
        location: locationStr,
      });
    }
  }

  // ============================================
  // 2. Building Logistics (Garbage/Recycling)
  // ============================================
  // NOTE: Garbage/recycling events are now stored in AdminCalendarEvent table
  // via the sync-calendar endpoint. They are retrieved in section 5 below
  // as part of "Admin Calendar Events Visible to Tenants".
  // This avoids duplicate events and ensures consistency with the synced data.

  // ============================================
  // 3. Canadian Holidays
  // ============================================

  for (const holiday of CANADIAN_HOLIDAYS) {
    for (const date of holiday.dates) {
      const d = new Date(date);
      if (d >= rangeStart && d <= rangeEnd) {
        events.push({
          id: `holiday-${holiday.name.toLowerCase().replace(/\s+/g, "-")}-${date}`,
          title: holiday.name,
          start: date,
          allDay: true,
          category: "holiday",
          description: `Canadian Public Holiday. Building services may be limited or unavailable.`,
        });
      }
    }
  }

  // ============================================
  // 4. Compliance Deadlines (Checklists, Inspections)
  // ============================================

  // Get incomplete required checklist items
  const checklistItems = await prisma.checklistItem.findMany({
    where: {
      tenancyId: tenancy.id,
      isRequired: true,
      isCompleted: false,
    },
  });

  // Group checklist items by type to create separate events for Move-In and Move-Out
  const checklistByType = new Map<string, number>();
  for (const item of checklistItems) {
    const existing = checklistByType.get(item.checklistType) || 0;
    checklistByType.set(item.checklistType, existing + 1);
  }

  if (checklistByType.size > 0) {
    // Add a reminder for checklist completion - 7 days from now if items pending
    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + 7);
    if (reminderDate >= rangeStart && reminderDate <= rangeEnd) {
      const reminderDateStr = formatDateStr(reminderDate);

      for (const [checklistType, count] of checklistByType) {
        const checklistTypeLabel = checklistType === "MOVE_OUT" ? "Move-Out" : "Move-In";
        events.push({
          id: `compliance-checklist-reminder-${tenancy.id}-${checklistType}`,
          title: `${checklistTypeLabel} Checklist: ${locationStr} (${count} items)`,
          start: reminderDateStr,
          allDay: true,
          category: "compliance",
          description: `You have ${count} required ${checklistTypeLabel.toLowerCase()} checklist item${count > 1 ? "s" : ""} to complete. Please review and complete them.`,
          location: locationStr,
        });
      }
    }
  }

  // Get pending inspections
  const inspections = await prisma.inspection.findMany({
    where: {
      tenancyId: tenancy.id,
      isFinalized: false,
    },
  });

  for (const inspection of inspections) {
    // Add inspection reminder
    if (inspection.createdAt >= rangeStart && inspection.createdAt <= rangeEnd) {
      const inspectionDateStr = formatDateStr(inspection.createdAt);
      events.push({
        id: `compliance-inspection-${inspection.id}`,
        title: `${inspection.inspectionType === "MOVE_IN" ? "Move-In" : "Move-Out"} Inspection: ${locationStr}`,
        start: inspectionDateStr,
        allDay: true,
        category: "compliance",
        description: `${inspection.inspectionType === "MOVE_IN" ? "Move-in" : "Move-out"} inspection ${inspection.status === "NOT_STARTED" ? "not yet started" : "in progress"}. Please complete the inspection documentation.`,
        location: locationStr,
      });
    }
  }

  // Insurance expiry reminder
  const tenant = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      insuranceStatus: true,
      insuranceExpiresAt: true,
    },
  });

  if (tenant?.insuranceExpiresAt) {
    const expiryDate = tenant.insuranceExpiresAt;
    if (expiryDate >= rangeStart && expiryDate <= rangeEnd) {
      const expiryDateStr = formatDateStr(expiryDate);
      events.push({
        id: `compliance-insurance-expiry-${user.id}`,
        title: "Insurance Expires",
        start: expiryDateStr,
        allDay: true,
        category: "compliance",
        description: "Your renter's insurance expires on this date. Please renew and upload proof of coverage before expiration.",
      });

      // Add 30-day reminder
      const reminderDate = new Date(expiryDate);
      reminderDate.setDate(reminderDate.getDate() - 30);
      if (reminderDate >= rangeStart && reminderDate <= rangeEnd && reminderDate > now) {
        const reminderDateStr = formatDateStr(reminderDate);
        events.push({
          id: `compliance-insurance-reminder-${user.id}`,
          title: "Insurance Renewal Reminder",
          start: reminderDateStr,
          allDay: true,
          category: "compliance",
          description: "Your renter's insurance expires in 30 days. Please begin the renewal process to maintain continuous coverage.",
        });
      }
    }
  }

  // Rent due dates (current and upcoming months)
  const invoices = await prisma.invoice.findMany({
    where: {
      unitId: tenancy.unitId,
      status: { in: ["OPEN", "OVERDUE"] },
      dueDate: {
        gte: rangeStart,
        lte: rangeEnd,
      },
    },
  });

  for (const invoice of invoices) {
    const dueDateStr = formatDateStr(invoice.dueDate);
    events.push({
      id: `compliance-rent-due-${invoice.id}`,
      title: invoice.status === "OVERDUE" ? `Rent OVERDUE: ${locationStr}` : `Rent Due: ${locationStr}`,
      start: dueDateStr,
      allDay: true,
      category: "compliance",
      description: `Rent payment for ${invoice.periodMonth}${invoice.status === "OVERDUE" ? " is overdue. Please pay immediately." : ` is due. Amount: $${(invoice.amountCents / 100).toFixed(2)}`}`,
      location: locationStr,
    });
  }

  // ============================================
  // 5. Admin Calendar Events Visible to Tenants
  // ============================================

  // Query admin events that are visible to tenants and match the tenant's building
  const adminEvents = await prisma.adminCalendarEvent.findMany({
    where: {
      isVisibleToTenant: true,
      eventDate: {
        gte: rangeStart,
        lte: rangeEnd,
      },
      OR: [
        // Events for all buildings (buildingName is null)
        { buildingName: null, unitId: null },
        // Events for tenant's building
        { buildingName: buildingName },
        // Events for tenant's specific unit
        { unitId: tenancy.unitId },
      ],
    },
    orderBy: { eventDate: "asc" },
  });

  for (const adminEvent of adminEvents) {
    // Map the admin event category to tenant event category
    const validCategories: EventCategory[] = ["logistics", "milestone", "compliance", "holiday", "move"];
    const category = validCategories.includes(adminEvent.category as EventCategory)
      ? (adminEvent.category as EventCategory)
      : "logistics";

    events.push({
      id: `admin-event-${adminEvent.id}`,
      title: adminEvent.title,
      start: formatDateStr(adminEvent.eventDate),
      end: adminEvent.endDate ? formatDateStr(adminEvent.endDate) : undefined,
      allDay: adminEvent.allDay,
      category,
      description: adminEvent.description || undefined,
      location: adminEvent.buildingName || undefined,
      isAdminEvent: true,
    });
  }

  // Sort events by date
  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return c.json({ data: events });
});

export { tenantCalendarRouter };
