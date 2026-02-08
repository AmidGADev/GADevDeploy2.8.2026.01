import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { CreateAdminCalendarEventSchema } from "../../types";
import { notifyEventCreated } from "../../lib/calendar-notifications";

const adminCalendarRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
adminCalendarRouter.use("*", authMiddleware);
adminCalendarRouter.use("*", adminMiddleware);

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
  unitId?: string;
  unitLabel?: string;
  buildingName?: string;
  tenantName?: string;
  isRecurring?: boolean;
  recurrencePattern?: string;
  isCustom?: boolean;
  // New notification-related fields
  isVisibleToTenant?: boolean;
  notifyAdmins?: boolean;
  notifyTenants?: boolean;
  notificationMethod?: string;
  reminderTrigger?: string;
  sourceType?: string;
  sourceId?: string;
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
 * GET /api/admin/calendar/buildings
 * Get list of buildings for filtering
 */
adminCalendarRouter.get("/buildings", async (c) => {
  const buildings = await prisma.unit.findMany({
    distinct: ["buildingName"],
    select: { buildingName: true },
    orderBy: { buildingName: "asc" },
  });

  return c.json({
    data: buildings.map((b) => b.buildingName).filter(Boolean),
  });
});

/**
 * GET /api/admin/calendar
 * Get all calendar events across all units/buildings
 * Query params:
 *   - start: ISO date string for range start
 *   - end: ISO date string for range end
 *   - buildingName: optional filter by building
 *   - unitId: optional filter by unit
 */
adminCalendarRouter.get("/", async (c) => {
  const startParam = c.req.query("start");
  const endParam = c.req.query("end");
  const buildingFilter = c.req.query("buildingName");
  const unitFilter = c.req.query("unitId");

  // Default to current month +/- 6 months for wider range
  const now = new Date();
  const rangeStart = startParam
    ? new Date(startParam)
    : new Date(now.getFullYear() - 1, 0, 1);
  const rangeEnd = endParam
    ? new Date(endParam)
    : new Date(now.getFullYear() + 1, 11, 31);

  const events: CalendarEvent[] = [];

  // Build unit filter
  const unitWhere: Record<string, unknown> = {};
  if (buildingFilter) {
    unitWhere.buildingName = buildingFilter;
  }
  if (unitFilter) {
    unitWhere.id = unitFilter;
  }

  // ============================================
  // 1. Lease Milestones (All tenancies)
  // ============================================

  const tenancies = await prisma.tenancy.findMany({
    where: {
      isActive: true,
      unit: Object.keys(unitWhere).length > 0 ? unitWhere : undefined,
    },
    include: {
      unit: {
        select: {
          id: true,
          unitLabel: true,
          buildingName: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          insuranceExpiresAt: true,
        },
      },
    },
  });

  for (const tenancy of tenancies) {
    const unitLabel = tenancy.unit.unitLabel;
    const buildingName = tenancy.unit.buildingName;
    const tenantName = tenancy.user.name;
    const locationStr = `${buildingName} - ${unitLabel}`;

    // Move-in date
    if (tenancy.startDate && tenancy.startDate >= rangeStart && tenancy.startDate <= rangeEnd) {
      const startDateStr = formatDateStr(tenancy.startDate);
      events.push({
        id: `milestone-move-in-${tenancy.id}`,
        title: `Move-In: ${locationStr}`,
        start: startDateStr,
        allDay: true,
        category: "move",
        description: `${tenantName} moves into ${locationStr}`,
        location: locationStr,
        unitId: tenancy.unit.id,
        unitLabel,
        buildingName,
        tenantName,
      });
    }

    // Lease end date
    if (tenancy.endDate && tenancy.endDate >= rangeStart && tenancy.endDate <= rangeEnd) {
      const endDateStr = formatDateStr(tenancy.endDate);
      events.push({
        id: `milestone-lease-end-${tenancy.id}`,
        title: `Lease End: ${locationStr}`,
        start: endDateStr,
        allDay: true,
        category: "milestone",
        description: `Lease ends for ${tenantName} at ${locationStr}. Discuss renewal or process move-out.`,
        location: locationStr,
        unitId: tenancy.unit.id,
        unitLabel,
        buildingName,
        tenantName,
      });

      // 60-day notice reminder
      const noticeDate = new Date(tenancy.endDate);
      noticeDate.setDate(noticeDate.getDate() - 60);
      if (noticeDate >= rangeStart && noticeDate <= rangeEnd && noticeDate > now) {
        const noticeDateStr = formatDateStr(noticeDate);
        events.push({
          id: `compliance-notice-${tenancy.id}`,
          title: `Renewal Due: ${locationStr}`,
          start: noticeDateStr,
          allDay: true,
          category: "compliance",
          description: `60 days until lease end for ${tenantName}. Contact tenant about renewal.`,
          location: locationStr,
          unitId: tenancy.unit.id,
          unitLabel,
          buildingName,
          tenantName,
        });
      }
    }

    // Scheduled move-out
    if (tenancy.moveOutDate && tenancy.moveOutDate >= rangeStart && tenancy.moveOutDate <= rangeEnd) {
      const moveOutStr = formatDateStr(tenancy.moveOutDate);
      events.push({
        id: `move-out-${tenancy.id}`,
        title: `Move-Out: ${locationStr}`,
        start: moveOutStr,
        allDay: true,
        category: "move",
        description: `Scheduled move-out for ${tenantName} from ${locationStr}. Coordinate inspection and key return.`,
        location: locationStr,
        unitId: tenancy.unit.id,
        unitLabel,
        buildingName,
        tenantName,
      });
    }

    // Insurance expiry
    if (tenancy.user.insuranceExpiresAt) {
      const expiryDate = tenancy.user.insuranceExpiresAt;
      if (expiryDate >= rangeStart && expiryDate <= rangeEnd) {
        const expiryDateStr = formatDateStr(expiryDate);
        events.push({
          id: `insurance-expiry-${tenancy.user.id}`,
          title: `Insurance Expiry: ${locationStr}`,
          start: expiryDateStr,
          allDay: true,
          category: "compliance",
          description: `Renter's insurance expires for ${tenantName} at ${locationStr}. Follow up on renewal.`,
          location: locationStr,
          unitId: tenancy.unit.id,
          unitLabel,
          buildingName,
          tenantName,
        });
      }
    }
  }

  // ============================================
  // 2. Rent Due Dates (Invoices)
  // ============================================

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["OPEN", "OVERDUE"] },
      dueDate: {
        gte: rangeStart,
        lte: rangeEnd,
      },
      unit: Object.keys(unitWhere).length > 0 ? unitWhere : undefined,
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

  for (const invoice of invoices) {
    const dueDateStr = formatDateStr(invoice.dueDate);
    const unitLabel = invoice.unit.unitLabel;
    const buildingName = invoice.unit.buildingName;
    const locationStr = `${buildingName} - ${unitLabel}`;

    events.push({
      id: `rent-due-${invoice.id}`,
      title: invoice.status === "OVERDUE"
        ? `OVERDUE: ${locationStr}`
        : `Rent Due: ${locationStr}`,
      start: dueDateStr,
      allDay: true,
      category: "compliance",
      description: `${invoice.periodMonth} rent ${invoice.status === "OVERDUE" ? "is overdue" : "is due"} for ${locationStr}. Amount: $${(invoice.amountCents / 100).toFixed(2)}`,
      location: locationStr,
      unitId: invoice.unit.id,
      unitLabel,
      buildingName,
    });
  }

  // ============================================
  // 3. Pending Inspections
  // ============================================

  const inspections = await prisma.inspection.findMany({
    where: {
      isFinalized: false,
      tenancy: {
        unit: Object.keys(unitWhere).length > 0 ? unitWhere : undefined,
      },
    },
    include: {
      tenancy: {
        include: {
          unit: {
            select: {
              id: true,
              unitLabel: true,
              buildingName: true,
            },
          },
          user: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  for (const inspection of inspections) {
    if (inspection.createdAt >= rangeStart && inspection.createdAt <= rangeEnd) {
      const inspectionDateStr = formatDateStr(inspection.createdAt);
      const unitLabel = inspection.tenancy.unit.unitLabel;
      const buildingName = inspection.tenancy.unit.buildingName;
      const tenantName = inspection.tenancy.user.name;
      const locationStr = `${buildingName} - ${unitLabel}`;

      events.push({
        id: `inspection-${inspection.id}`,
        title: `${inspection.inspectionType === "MOVE_IN" ? "Move-In" : "Move-Out"} Inspection: ${locationStr}`,
        start: inspectionDateStr,
        allDay: true,
        category: "compliance",
        description: `${inspection.inspectionType === "MOVE_IN" ? "Move-in" : "Move-out"} inspection for ${tenantName} at ${locationStr}. Status: ${inspection.status}`,
        location: locationStr,
        unitId: inspection.tenancy.unit.id,
        unitLabel,
        buildingName,
        tenantName,
      });
    }
  }

  // ============================================
  // 4. Incomplete Checklists
  // ============================================

  const checklistItems = await prisma.checklistItem.findMany({
    where: {
      isRequired: true,
      isCompleted: false,
      tenancy: {
        isActive: true,
        unit: Object.keys(unitWhere).length > 0 ? unitWhere : undefined,
      },
    },
    include: {
      tenancy: {
        include: {
          unit: {
            select: {
              id: true,
              unitLabel: true,
              buildingName: true,
            },
          },
          user: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  // Group by tenancy AND checklist type to create separate events for Move-In and Move-Out
  const checklistByTenancyAndType = new Map<string, {
    count: number;
    tenancy: typeof checklistItems[0]["tenancy"];
    checklistType: string;
  }>();
  for (const item of checklistItems) {
    const key = `${item.tenancyId}-${item.checklistType}`;
    const existing = checklistByTenancyAndType.get(key);
    if (existing) {
      existing.count++;
    } else {
      checklistByTenancyAndType.set(key, {
        count: 1,
        tenancy: item.tenancy,
        checklistType: item.checklistType,
      });
    }
  }

  // Add checklist reminder 7 days from now
  const checklistReminderDate = new Date();
  checklistReminderDate.setDate(checklistReminderDate.getDate() + 7);
  if (checklistReminderDate >= rangeStart && checklistReminderDate <= rangeEnd) {
    for (const [key, data] of checklistByTenancyAndType) {
      const dateStr = formatDateStr(checklistReminderDate);
      const unitLabel = data.tenancy.unit.unitLabel;
      const buildingName = data.tenancy.unit.buildingName;
      const tenantName = data.tenancy.user.name;
      const locationStr = `${buildingName} - ${unitLabel}`;
      const checklistTypeLabel = data.checklistType === "MOVE_OUT" ? "Move-Out" : "Move-In";

      events.push({
        id: `checklist-reminder-${key}`,
        title: `${checklistTypeLabel} Checklist: ${locationStr} (${data.count} items)`,
        start: dateStr,
        allDay: true,
        category: "compliance",
        description: `${tenantName} has ${data.count} incomplete required ${checklistTypeLabel.toLowerCase()} checklist items at ${locationStr}.`,
        location: locationStr,
        unitId: data.tenancy.unit.id,
        unitLabel,
        buildingName,
        tenantName,
      });
    }
  }

  // ============================================
  // 5. Building Logistics (Garbage/Recycling)
  // ============================================
  // NOTE: Garbage/recycling events are now stored in AdminCalendarEvent table
  // via the sync-calendar endpoint. They are retrieved in section 7 below.
  // This avoids duplicate events and ensures consistency with the synced data.

  // ============================================
  // 6. Canadian Holidays
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
          description: `Canadian Public Holiday. Building services may be limited. Plan maintenance accordingly.`,
        });
      }
    }
  }

  // ============================================
  // 7. Custom Admin Events
  // ============================================

  const customEventWhere: Record<string, unknown> = {
    eventDate: {
      gte: rangeStart,
      lte: rangeEnd,
    },
  };

  if (buildingFilter) {
    customEventWhere.OR = [
      { buildingName: buildingFilter },
      { buildingName: null }, // Include property-wide events
    ];
  }

  const customEvents = await prisma.adminCalendarEvent.findMany({
    where: customEventWhere,
  });

  for (const customEvent of customEvents) {
    // Get unit info if unitId is set
    let unitLabel: string | undefined;
    let eventBuildingName = customEvent.buildingName;

    if (customEvent.unitId) {
      const unit = await prisma.unit.findUnique({
        where: { id: customEvent.unitId },
        select: { unitLabel: true, buildingName: true },
      });
      if (unit) {
        unitLabel = unit.unitLabel;
        eventBuildingName = unit.buildingName;
      }
    }

    events.push({
      id: `custom-${customEvent.id}`,
      title: customEvent.title,
      start: formatDateStr(customEvent.eventDate),
      end: customEvent.endDate ? formatDateStr(customEvent.endDate) : undefined,
      allDay: customEvent.allDay,
      category: customEvent.category as EventCategory,
      description: customEvent.description || undefined,
      buildingName: eventBuildingName || undefined,
      unitId: customEvent.unitId || undefined,
      unitLabel,
      isCustom: true,
      isVisibleToTenant: customEvent.isVisibleToTenant,
      notifyAdmins: customEvent.notifyAdmins,
      notifyTenants: customEvent.notifyTenants,
      notificationMethod: customEvent.notificationMethod || undefined,
      reminderTrigger: customEvent.reminderTrigger || undefined,
      sourceType: customEvent.sourceType || undefined,
      sourceId: customEvent.sourceId || undefined,
    });
  }

  // Sort events by date
  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return c.json({ data: events });
});

// ============================================
// Create Custom Event - Uses shared schema from types.ts
// ============================================

/**
 * POST /api/admin/calendar/events
 * Create a custom calendar event
 */
adminCalendarRouter.post("/events", zValidator("json", CreateAdminCalendarEventSchema), async (c) => {
  const user = c.get("user");
  const data = c.req.valid("json");

  const {
    title,
    description,
    eventDate,
    endDate,
    allDay,
    category,
    buildingName,
    unitId,
    isVisibleToTenant,
    notifyAdmins,
    notifyTenants,
    notificationMethod,
    reminderTrigger,
    sourceType,
    sourceId,
  } = data;

  // If unitId is provided, validate it exists and get building info
  let resolvedBuildingName = buildingName;
  let resolvedUnitLabel: string | null = null;

  if (unitId) {
    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
      select: { buildingName: true, unitLabel: true },
    });
    if (!unit) {
      return c.json({ error: { message: "Unit not found" } }, 404);
    }
    resolvedBuildingName = unit.buildingName;
    resolvedUnitLabel = unit.unitLabel;
  }

  const event = await prisma.adminCalendarEvent.create({
    data: {
      title,
      description: description || null,
      eventDate: new Date(eventDate),
      endDate: endDate ? new Date(endDate) : null,
      allDay,
      category,
      buildingName: resolvedBuildingName || null,
      unitId: unitId || null,
      createdById: user.id,
      isVisibleToTenant: isVisibleToTenant ?? false,
      notifyAdmins: notifyAdmins ?? false,
      notifyTenants: notifyTenants ?? false,
      notificationMethod: notificationMethod || null,
      reminderTrigger: reminderTrigger || null,
      sourceType: sourceType || null,
      sourceId: sourceId || null,
    },
  });

  // Send notifications if enabled
  let notificationResults = null;
  if (notifyAdmins || notifyTenants) {
    notificationResults = await notifyEventCreated({
      id: event.id,
      title: event.title,
      description: event.description,
      eventDate: event.eventDate,
      endDate: event.endDate,
      allDay: event.allDay,
      category: event.category,
      buildingName: event.buildingName,
      unitId: event.unitId,
      isVisibleToTenant: event.isVisibleToTenant,
      notifyAdmins: event.notifyAdmins,
      notifyTenants: event.notifyTenants,
      notificationMethod: event.notificationMethod,
      reminderTrigger: event.reminderTrigger,
    });
  }

  return c.json({
    data: {
      id: `custom-${event.id}`,
      title: event.title,
      start: formatDateStr(event.eventDate),
      end: event.endDate ? formatDateStr(event.endDate) : undefined,
      allDay: event.allDay,
      category: event.category,
      description: event.description,
      buildingName: event.buildingName,
      unitId: event.unitId,
      unitLabel: resolvedUnitLabel,
      isCustom: true,
      isVisibleToTenant: event.isVisibleToTenant,
      notifyAdmins: event.notifyAdmins,
      notifyTenants: event.notifyTenants,
      notificationMethod: event.notificationMethod,
      reminderTrigger: event.reminderTrigger,
      notificationResults,
    },
  });
});

/**
 * DELETE /api/admin/calendar/events/:id
 * Delete a custom calendar event
 */
adminCalendarRouter.delete("/events/:id", async (c) => {
  const eventId = c.req.param("id");

  // Remove the "custom-" prefix if present
  const cleanId = eventId.replace(/^custom-/, "");

  const event = await prisma.adminCalendarEvent.findUnique({
    where: { id: cleanId },
  });

  if (!event) {
    return c.json({ error: { message: "Event not found" } }, 404);
  }

  await prisma.adminCalendarEvent.delete({
    where: { id: cleanId },
  });

  return c.json({ data: { success: true } });
});

/**
 * GET /api/admin/calendar/units
 * Get list of units for the event form dropdown
 */
adminCalendarRouter.get("/units", async (c) => {
  const buildingName = c.req.query("buildingName");

  const units = await prisma.unit.findMany({
    where: buildingName ? { buildingName } : undefined,
    select: {
      id: true,
      unitLabel: true,
      buildingName: true,
    },
    orderBy: [
      { buildingName: "asc" },
      { unitLabel: "asc" },
    ],
  });

  return c.json({ data: units });
});

export { adminCalendarRouter };
