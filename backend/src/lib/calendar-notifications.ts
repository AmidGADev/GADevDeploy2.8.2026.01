import { prisma } from "../prisma";
import { sendEmail, getEmailTemplate } from "./email";
import type {
  NotificationMethod,
  CalendarNotificationType,
  CalendarDeliveryStatus,
  CalendarSkipReason,
  RecipientType,
  EventCategory,
} from "../types";

// ============================================
// Types for Calendar Notifications
// ============================================

export interface CalendarEventData {
  id: string;
  title: string;
  description: string | null;
  eventDate: Date;
  endDate: Date | null;
  allDay: boolean;
  category: string;
  buildingName: string | null;
  unitId: string | null;
  isVisibleToTenant: boolean;
  notifyAdmins: boolean;
  notifyTenants: boolean;
  notificationMethod: string | null;
  reminderTrigger: string | null;
}

export interface NotificationRecipient {
  id: string;
  email: string;
  name: string;
  type: "ADMIN" | "TENANT";
}

export interface SendNotificationResult {
  sent: boolean;
  status: CalendarDeliveryStatus;
  skipReason?: CalendarSkipReason;
  errorMessage?: string;
  emailMessageId?: string;
}

// ============================================
// Category to Alert Type Mapping
// ============================================

type AlertCategory = "financialAlerts" | "operationsAlerts" | "complianceAlerts" | "announcementsAlerts" | "emergencyAlerts";

/**
 * Map calendar event categories to communication preference alert types
 */
function getCategoryAlertType(category: string): AlertCategory {
  switch (category) {
    case "logistics":
      return "operationsAlerts";
    case "compliance":
      return "complianceAlerts";
    case "milestone":
    case "move":
      return "operationsAlerts";
    case "holiday":
      return "announcementsAlerts";
    default:
      return "operationsAlerts";
  }
}

// ============================================
// Check Tenant Communication Preferences
// ============================================

/**
 * Check if a tenant has opted into the given alert category
 * Returns true if tenant can receive notifications for this category
 */
export async function checkTenantPreferences(
  tenantId: string,
  category: string
): Promise<{ canSend: boolean; skipReason?: CalendarSkipReason }> {
  const preferences = await prisma.tenantCommunicationPreference.findUnique({
    where: { tenantId },
  });

  // If no preferences exist, default to allowing all notifications
  if (!preferences) {
    return { canSend: true };
  }

  // Emergency alerts cannot be disabled
  const alertType = getCategoryAlertType(category);
  if (alertType === "emergencyAlerts") {
    return { canSend: true };
  }

  // Check the specific alert category
  const isEnabled = preferences[alertType];
  if (!isEnabled) {
    return { canSend: false, skipReason: "OPT_OUT" };
  }

  return { canSend: true };
}

/**
 * Get tenant's preferred notification method
 */
export async function getTenantPreferredMethod(
  tenantId: string
): Promise<NotificationMethod> {
  const preferences = await prisma.tenantCommunicationPreference.findUnique({
    where: { tenantId },
  });

  return (preferences?.preferredMethod as NotificationMethod) || "BOTH";
}

// ============================================
// Log Communication History
// ============================================

/**
 * Log a notification to CalendarCommunicationHistory for audit purposes
 */
export async function logCommunicationHistory(params: {
  eventId: string;
  recipientId: string;
  recipientType: RecipientType;
  recipientEmail: string;
  notificationType: CalendarNotificationType;
  deliveryMethod: NotificationMethod;
  status: CalendarDeliveryStatus;
  skipReason?: CalendarSkipReason;
  emailMessageId?: string;
  errorMessage?: string;
}): Promise<string> {
  const record = await prisma.calendarCommunicationHistory.create({
    data: {
      eventId: params.eventId,
      recipientId: params.recipientId,
      recipientType: params.recipientType,
      recipientEmail: params.recipientEmail,
      notificationType: params.notificationType,
      deliveryMethod: params.deliveryMethod,
      status: params.status,
      skipReason: params.skipReason || null,
      emailMessageId: params.emailMessageId || null,
      errorMessage: params.errorMessage || null,
    },
  });

  return record.id;
}

// ============================================
// Generate Email HTML
// ============================================

/**
 * Generate HTML email content for a calendar event notification
 */
export function generateEventNotificationHtml(
  event: CalendarEventData,
  notificationType: CalendarNotificationType,
  recipientName: string
): { subject: string; html: string } {
  const appUrl = process.env.APP_URL || "http://localhost:8000";

  // Format event date
  const eventDate = event.eventDate.toLocaleDateString("en-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Get notification context text
  let contextText = "";
  switch (notificationType) {
    case "EVENT_CREATED":
      contextText = "A new calendar event has been scheduled";
      break;
    case "REMINDER_24H":
      contextText = "This is a reminder about an upcoming event tomorrow";
      break;
    case "REMINDER_3D":
      contextText = "This is a reminder about an upcoming event in 3 days";
      break;
    case "AT_EVENT":
      contextText = "Today is the day of a scheduled event";
      break;
  }

  // Get category display
  const categoryDisplay: Record<string, string> = {
    logistics: "Building Logistics",
    milestone: "Milestone",
    compliance: "Compliance",
    holiday: "Holiday",
    move: "Move-In/Move-Out",
  };
  const categoryLabel = categoryDisplay[event.category] || event.category;

  const subject = notificationType === "EVENT_CREATED"
    ? `Calendar Event: ${event.title}`
    : `Reminder: ${event.title}`;

  const content = `
    <p>Hello ${recipientName},</p>
    <p>${contextText}:</p>

    <div class="info-box">
      <p style="margin: 4px 0;"><strong>Event:</strong> ${event.title}</p>
      <p style="margin: 4px 0;"><strong>Date:</strong> ${eventDate}</p>
      <p style="margin: 4px 0;"><strong>Category:</strong> ${categoryLabel}</p>
      ${event.buildingName ? `<p style="margin: 4px 0;"><strong>Building:</strong> ${event.buildingName}</p>` : ""}
      ${event.description ? `<p style="margin: 8px 0 4px 0;"><strong>Details:</strong></p><p style="margin: 4px 0; color: #666;">${event.description}</p>` : ""}
    </div>

    <div class="button-container">
      <a href="${appUrl}/portal/calendar" class="email-button">View Calendar</a>
    </div>
  `;

  const html = getEmailTemplate(content, subject);

  return { subject, html };
}

// ============================================
// Send Calendar Event Notification
// ============================================

/**
 * Send a calendar event notification to a recipient
 * Handles email delivery and logging
 */
export async function sendCalendarEventNotification(
  event: CalendarEventData,
  recipient: NotificationRecipient,
  method: NotificationMethod,
  notificationType: CalendarNotificationType
): Promise<SendNotificationResult> {
  // For tenants, check preferences first
  if (recipient.type === "TENANT") {
    const { canSend, skipReason } = await checkTenantPreferences(
      recipient.id,
      event.category
    );

    if (!canSend) {
      // Log the skipped notification
      await logCommunicationHistory({
        eventId: event.id,
        recipientId: recipient.id,
        recipientType: "TENANT",
        recipientEmail: recipient.email,
        notificationType,
        deliveryMethod: method,
        status: "SKIPPED",
        skipReason,
      });

      console.log(`[CALENDAR-NOTIFY] Skipped notification for tenant ${recipient.id} - ${skipReason}`);
      return {
        sent: false,
        status: "SKIPPED",
        skipReason,
      };
    }
  }

  // Determine actual delivery method based on tenant preferences
  let actualMethod = method;
  if (recipient.type === "TENANT") {
    const preferredMethod = await getTenantPreferredMethod(recipient.id);
    // If event method is BOTH, use tenant preference
    // If event method is EMAIL or DASHBOARD, respect that
    if (method === "BOTH") {
      actualMethod = preferredMethod;
    }
  }

  // Generate email content
  const { subject, html } = generateEventNotificationHtml(
    event,
    notificationType,
    recipient.name
  );

  // Send email if method includes EMAIL or BOTH
  if (actualMethod === "EMAIL" || actualMethod === "BOTH") {
    try {
      const result = await sendEmail({
        to: recipient.email,
        subject,
        html,
        emailType: "REMINDER",
        toGroup: `Calendar Event: ${event.title}`,
      });

      if (result.success) {
        await logCommunicationHistory({
          eventId: event.id,
          recipientId: recipient.id,
          recipientType: recipient.type,
          recipientEmail: recipient.email,
          notificationType,
          deliveryMethod: actualMethod,
          status: "SENT",
        });

        console.log(`[CALENDAR-NOTIFY] Sent ${notificationType} to ${recipient.email}`);
        return {
          sent: true,
          status: "SENT",
        };
      } else {
        await logCommunicationHistory({
          eventId: event.id,
          recipientId: recipient.id,
          recipientType: recipient.type,
          recipientEmail: recipient.email,
          notificationType,
          deliveryMethod: actualMethod,
          status: "FAILED",
          errorMessage: result.error,
        });

        console.error(`[CALENDAR-NOTIFY] Failed to send to ${recipient.email}: ${result.error}`);
        return {
          sent: false,
          status: "FAILED",
          errorMessage: result.error,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await logCommunicationHistory({
        eventId: event.id,
        recipientId: recipient.id,
        recipientType: recipient.type,
        recipientEmail: recipient.email,
        notificationType,
        deliveryMethod: actualMethod,
        status: "FAILED",
        errorMessage,
      });

      console.error(`[CALENDAR-NOTIFY] Error sending to ${recipient.email}:`, error);
      return {
        sent: false,
        status: "FAILED",
        errorMessage,
      };
    }
  }

  // For DASHBOARD only, just log it as sent (dashboard notifications are passive)
  if (actualMethod === "DASHBOARD") {
    await logCommunicationHistory({
      eventId: event.id,
      recipientId: recipient.id,
      recipientType: recipient.type,
      recipientEmail: recipient.email,
      notificationType,
      deliveryMethod: "DASHBOARD",
      status: "SENT",
    });

    console.log(`[CALENDAR-NOTIFY] Dashboard notification logged for ${recipient.email}`);
    return {
      sent: true,
      status: "SENT",
    };
  }

  return {
    sent: false,
    status: "FAILED",
    errorMessage: "Unknown delivery method",
  };
}

// ============================================
// Bulk Notification Functions
// ============================================

/**
 * Get all tenants in a building that should receive notifications
 */
export async function getTenantsForBuilding(
  buildingName: string | null,
  unitId: string | null
): Promise<NotificationRecipient[]> {
  const whereClause: Record<string, unknown> = {
    isActive: true,
    user: {
      role: "TENANT",
      status: "ACTIVE",
    },
  };

  if (unitId) {
    whereClause.unitId = unitId;
  } else if (buildingName) {
    whereClause.unit = { buildingName };
  }
  // If neither buildingName nor unitId specified, get all active tenants

  const tenancies = await prisma.tenancy.findMany({
    where: whereClause,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  return tenancies.map((t) => ({
    id: t.user.id,
    email: t.user.email,
    name: t.user.name,
    type: "TENANT" as const,
  }));
}

/**
 * Get all admin users that should receive notifications
 */
export async function getAdminRecipients(): Promise<NotificationRecipient[]> {
  const admins = await prisma.user.findMany({
    where: {
      role: "ADMIN",
      status: "ACTIVE",
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  return admins.map((a) => ({
    id: a.id,
    email: a.email,
    name: a.name,
    type: "ADMIN" as const,
  }));
}

/**
 * Send notifications for a newly created calendar event
 */
export async function notifyEventCreated(event: CalendarEventData): Promise<{
  adminsSent: number;
  tenantsSent: number;
  skipped: number;
  errors: number;
}> {
  const results = {
    adminsSent: 0,
    tenantsSent: 0,
    skipped: 0,
    errors: 0,
  };

  const method = (event.notificationMethod as NotificationMethod) || "BOTH";

  // Notify admins if enabled
  if (event.notifyAdmins) {
    const admins = await getAdminRecipients();
    for (const admin of admins) {
      const result = await sendCalendarEventNotification(
        event,
        admin,
        method,
        "EVENT_CREATED"
      );
      if (result.sent) {
        results.adminsSent++;
      } else if (result.status === "SKIPPED") {
        results.skipped++;
      } else {
        results.errors++;
      }
    }
  }

  // Notify tenants if enabled and event is visible
  if (event.notifyTenants && event.isVisibleToTenant) {
    const tenants = await getTenantsForBuilding(event.buildingName, event.unitId);
    for (const tenant of tenants) {
      const result = await sendCalendarEventNotification(
        event,
        tenant,
        method,
        "EVENT_CREATED"
      );
      if (result.sent) {
        results.tenantsSent++;
      } else if (result.status === "SKIPPED") {
        results.skipped++;
      } else {
        results.errors++;
      }
    }
  }

  // Update event to mark notifications as sent
  if (results.adminsSent > 0 || results.tenantsSent > 0) {
    await prisma.adminCalendarEvent.update({
      where: { id: event.id },
      data: { notificationsSentAt: new Date() },
    });
  }

  console.log(`[CALENDAR-NOTIFY] Event ${event.id}: ${results.adminsSent} admins, ${results.tenantsSent} tenants, ${results.skipped} skipped, ${results.errors} errors`);

  return results;
}

// ============================================
// Garbage Schedule Calendar Event Generation
// ============================================

/**
 * Parse garbage schedule text and generate calendar events
 */
export function parseGarbageScheduleForEvents(
  scheduleText: string | null,
  buildingName: string,
  buildingInfoId: string
): Array<{
  title: string;
  description: string;
  dayOfWeek: number;
  type: string;
}> {
  if (!scheduleText) return [];

  const events: Array<{
    title: string;
    description: string;
    dayOfWeek: number;
    type: string;
  }> = [];

  const lines = scheduleText.toLowerCase().split(/[,;\n]/);

  const dayMap: Record<string, number> = {
    sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2, tues: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4, thur: 4, thurs: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6,
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let foundDay: number | null = null;
    let type = "Garbage Collection";

    for (const [dayName, dayNum] of Object.entries(dayMap)) {
      if (trimmed.includes(dayName)) {
        foundDay = dayNum;
        break;
      }
    }

    if (trimmed.includes("recycl")) {
      type = "Recycling Collection";
    } else if (trimmed.includes("garbage") || trimmed.includes("trash") || trimmed.includes("waste")) {
      type = "Garbage Collection";
    } else if (trimmed.includes("compost") || trimmed.includes("organic")) {
      type = "Compost Collection";
    } else if (trimmed.includes("bulk") || trimmed.includes("large")) {
      type = "Bulk Pickup";
    }

    if (foundDay !== null) {
      events.push({
        title: `${type} - ${buildingName}`,
        description: `${type} for ${buildingName}. Please ensure items are placed at the designated collection area by 7:00 AM.`,
        dayOfWeek: foundDay,
        type,
      });
    }
  }

  return events;
}

/**
 * Generate recurring calendar events from garbage schedule
 * Creates events for the next 3 months
 */
export async function generateGarbageScheduleEvents(
  buildingInfoId: string,
  buildingName: string,
  garbageSchedule: string | null,
  createdById: string
): Promise<number> {
  // Use a transaction to prevent race conditions and ensure atomicity
  return await prisma.$transaction(async (tx) => {
    // First, delete any existing auto-generated events for this building
    const deleteResult = await tx.adminCalendarEvent.deleteMany({
      where: {
        sourceType: "GARBAGE_SCHEDULE",
        sourceId: buildingInfoId,
      },
    });

    console.log(`[CALENDAR-SYNC] Deleted ${deleteResult.count} existing garbage events for building ${buildingName} (id: ${buildingInfoId})`);

    if (!garbageSchedule) {
      console.log(`[CALENDAR-SYNC] No garbage schedule provided for ${buildingName}, deleted ${deleteResult.count} events, returning 0 new events`);
      return 0;
    }

    // Try to parse as structured JSON first
    let structuredData: { entries: Array<{ type: string; days: number[]; frequency: string }> } | null = null;
    try {
      const parsed = JSON.parse(garbageSchedule);
      if (parsed && Array.isArray(parsed.entries)) {
        // Filter out entries with no days selected
        const validEntries = parsed.entries.filter((entry: { days?: number[] }) => entry.days && entry.days.length > 0);
        structuredData = { entries: validEntries };
        console.log(`[CALENDAR-SYNC] Parsed structured schedule for ${buildingName}: ${validEntries.length} valid entries (of ${parsed.entries.length} total)`);
      }
    } catch {
      // Not JSON, fall back to free-text parsing
      console.log(`[CALENDAR-SYNC] Using free-text parsing for ${buildingName}`);
    }

    const now = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 3); // 3 months ahead

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const typeLabels: Record<string, string> = {
      garbage: "Garbage Collection",
      recycling: "Recycling Collection",
      compost: "Compost Collection",
      bulk_pickup: "Bulk Pickup",
    };

    const eventsToCreate: Array<{
      title: string;
      description: string;
      eventDate: Date;
    endDate: Date | null;
    allDay: boolean;
    category: string;
    buildingName: string;
    unitId: string | null;
    createdById: string;
    isVisibleToTenant: boolean;
    notifyAdmins: boolean;
    notifyTenants: boolean;
    notificationMethod: string | null;
    reminderTrigger: string | null;
    sourceType: string;
    sourceId: string;
  }> = [];

  if (structuredData) {
    // Structured data path
    for (const entry of structuredData.entries) {
      const label = typeLabels[entry.type] || "Garbage Collection";

      for (const dayOfWeek of entry.days) {
        const dayName = dayNames[dayOfWeek] || "Unknown";

        // Find the first occurrence of this day
        const current = new Date(now);
        while (current.getDay() !== dayOfWeek) {
          current.setDate(current.getDate() + 1);
        }

        // Generate events based on frequency
        let counter = 0;
        let weekCounter = 0;
        const maxEvents = entry.frequency === "weekly" ? 13 : entry.frequency === "biweekly" ? 7 : 6;

        while (current <= endDate && counter < maxEvents) {
          let shouldAdd = false;

          if (entry.frequency === "weekly") {
            shouldAdd = true;
          } else if (entry.frequency === "biweekly") {
            // Every other week
            shouldAdd = weekCounter % 2 === 0;
          } else if (entry.frequency === "first_third") {
            // 1st and 3rd occurrence of the day in each month
            const dayOfMonth = current.getDate();
            const weekInMonth = Math.ceil(dayOfMonth / 7);
            shouldAdd = weekInMonth === 1 || weekInMonth === 3;
          }

          if (shouldAdd) {
            eventsToCreate.push({
              title: `${label} - ${buildingName}`,
              description: `${label} for ${buildingName} (${dayName}s, ${entry.frequency === "weekly" ? "every week" : entry.frequency === "biweekly" ? "every 2 weeks" : "1st & 3rd of month"}). Please ensure items are placed at the designated collection area by 7:00 AM.`,
              eventDate: new Date(current),
              endDate: null,
              allDay: true,
              category: "logistics",
              buildingName,
              unitId: null,
              createdById,
              isVisibleToTenant: true,
              notifyAdmins: false,
              notifyTenants: false,
              notificationMethod: null,
              reminderTrigger: null,
              sourceType: "GARBAGE_SCHEDULE",
              sourceId: buildingInfoId,
            });
            counter++;
          }

          current.setDate(current.getDate() + 7);
          weekCounter++;
        }
      }
    }
  } else {
    // Legacy free-text path
    const parsedSchedules = parseGarbageScheduleForEvents(garbageSchedule, buildingName, buildingInfoId);

    for (const schedule of parsedSchedules) {
      const current = new Date(now);
      while (current.getDay() !== schedule.dayOfWeek) {
        current.setDate(current.getDate() + 1);
      }

      let counter = 0;
      while (current <= endDate && counter < 13) {
        eventsToCreate.push({
          title: schedule.title,
          description: schedule.description,
          eventDate: new Date(current),
          endDate: null,
          allDay: true,
          category: "logistics",
          buildingName,
          unitId: null,
          createdById,
          isVisibleToTenant: true,
          notifyAdmins: false,
          notifyTenants: false,
          notificationMethod: null,
          reminderTrigger: null,
          sourceType: "GARBAGE_SCHEDULE",
          sourceId: buildingInfoId,
        });

        current.setDate(current.getDate() + 7);
        counter++;
      }
    }
  }

  // Bulk create all events
    if (eventsToCreate.length > 0) {
      await tx.adminCalendarEvent.createMany({
        data: eventsToCreate,
      });
    }

    console.log(`[CALENDAR] Generated ${eventsToCreate.length} garbage schedule events for ${buildingName}`);

    return eventsToCreate.length;
  }); // End transaction
}
