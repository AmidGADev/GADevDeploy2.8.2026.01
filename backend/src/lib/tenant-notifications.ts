import { prisma } from "../prisma";
import { sendEmail } from "./email";

export type TenantNotificationType =
  | "NEW_INVOICE"
  | "PAYMENT_RECEIVED"
  | "OVERDUE_ALERT"
  | "MAINTENANCE_ACKNOWLEDGED"
  | "MAINTENANCE_STATUS_UPDATE"
  | "MAINTENANCE_RESOLVED"
  | "MOVE_IN_CHECKLIST_REMINDER"
  | "INSPECTION_SCHEDULED"
  | "ANNOUNCEMENT"
  | "BUNDLED_UPDATE";

export interface SendTenantNotificationOptions {
  tenantId: string;
  tenantEmail: string;
  tenantName: string;
  notificationType: TenantNotificationType;
  subject: string;
  htmlContent: string;
  referenceType?: string; // Invoice, ServiceRequest, Checklist, etc.
  referenceId?: string; // The related entity ID
}

/**
 * Check if a notification type is enabled in settings
 */
export async function isNotificationEnabled(
  type: TenantNotificationType
): Promise<boolean> {
  // Get or create settings
  const settings = await prisma.tenantNotificationSettings.findFirst();

  if (!settings) {
    // Use defaults if no settings exist
    return true;
  }

  // Global mute disables non-critical notifications
  if (settings.globalMute) {
    // Only allow critical notifications (none in our current types)
    return false;
  }

  const typeToSettingMap: Record<
    string,
    keyof typeof settings | undefined
  > = {
    NEW_INVOICE: "newInvoice",
    PAYMENT_RECEIVED: "paymentReceived",
    OVERDUE_ALERT: "overdueAlert",
    MAINTENANCE_ACKNOWLEDGED: "maintenanceAcknowledged",
    MAINTENANCE_STATUS_UPDATE: "maintenanceStatusUpdate",
    MAINTENANCE_RESOLVED: "maintenanceResolved",
    MOVE_IN_CHECKLIST_REMINDER: "moveInChecklistReminder",
    INSPECTION_SCHEDULED: "inspectionScheduled",
  };

  const settingKey = typeToSettingMap[type];
  if (!settingKey) return true; // Allow unknown types by default

  return settings[settingKey] as boolean;
}

/**
 * Check if we should bundle this notification (for maintenance updates)
 */
export async function shouldBundleNotification(
  tenantId: string,
  referenceType: string | undefined,
  referenceId: string | undefined
): Promise<{ shouldBundle: boolean; bundleIntoId?: string }> {
  const settings = await prisma.tenantNotificationSettings.findFirst();
  const bundleWindowMinutes = settings?.bundleWindowMinutes ?? 60;

  if (!referenceType || !referenceId) {
    return { shouldBundle: false };
  }

  // Check for recent notifications for the same reference
  const windowStart = new Date(Date.now() - bundleWindowMinutes * 60 * 1000);

  const recentNotification = await prisma.tenantNotification.findFirst({
    where: {
      tenantId,
      referenceType,
      referenceId,
      sentAt: { gte: windowStart },
      status: "SENT",
    },
    orderBy: { sentAt: "desc" },
  });

  if (recentNotification) {
    return { shouldBundle: true, bundleIntoId: recentNotification.id };
  }

  return { shouldBundle: false };
}

/**
 * Check frequency cap for overdue alerts
 */
export async function canSendOverdueAlert(
  tenantId: string,
  invoiceId: string
): Promise<boolean> {
  const settings = await prisma.tenantNotificationSettings.findFirst();
  const overdueReminderHours = settings?.overdueReminderHours ?? 72;

  const windowStart = new Date(
    Date.now() - overdueReminderHours * 60 * 60 * 1000
  );

  const recentOverdueNotification = await prisma.tenantNotification.findFirst({
    where: {
      tenantId,
      notificationType: "OVERDUE_ALERT",
      referenceId: invoiceId,
      sentAt: { gte: windowStart },
      status: "SENT",
    },
  });

  return !recentOverdueNotification;
}

/**
 * Map notification type to email type for logging
 */
function getEmailTypeForNotification(
  notificationType: TenantNotificationType
): "MANUAL" | "ANNOUNCEMENT" | "INVITATION" | "REMINDER" | "PAYMENT_CONFIRMATION" | "TEST" {
  switch (notificationType) {
    case "NEW_INVOICE":
    case "OVERDUE_ALERT":
    case "MOVE_IN_CHECKLIST_REMINDER":
    case "INSPECTION_SCHEDULED":
      return "REMINDER";
    case "PAYMENT_RECEIVED":
      return "PAYMENT_CONFIRMATION";
    case "ANNOUNCEMENT":
      return "ANNOUNCEMENT";
    case "MAINTENANCE_ACKNOWLEDGED":
    case "MAINTENANCE_STATUS_UPDATE":
    case "MAINTENANCE_RESOLVED":
    case "BUNDLED_UPDATE":
    default:
      return "MANUAL";
  }
}

/**
 * Main function to send a tenant notification
 * Handles settings check, bundling, and frequency capping
 */
export async function sendTenantNotification(
  options: SendTenantNotificationOptions
): Promise<{
  sent: boolean;
  notificationId?: string;
  reason?: string;
}> {
  const {
    tenantId,
    tenantEmail,
    tenantName,
    notificationType,
    subject,
    htmlContent,
    referenceType,
    referenceId,
  } = options;

  try {
    // 1. Check if notification type is enabled
    const enabled = await isNotificationEnabled(notificationType);
    if (!enabled) {
      console.log(
        `[NOTIFICATIONS] Skipping ${notificationType} - disabled in settings`
      );
      return { sent: false, reason: "DISABLED_IN_SETTINGS" };
    }

    // 2. Check frequency cap for overdue alerts
    if (notificationType === "OVERDUE_ALERT" && referenceId) {
      const canSend = await canSendOverdueAlert(tenantId, referenceId);
      if (!canSend) {
        console.log(
          `[NOTIFICATIONS] Skipping OVERDUE_ALERT for invoice ${referenceId} - frequency cap`
        );
        return { sent: false, reason: "FREQUENCY_CAP" };
      }
    }

    // 3. Check if we should bundle (for maintenance updates)
    if (notificationType.startsWith("MAINTENANCE_")) {
      const { shouldBundle, bundleIntoId } = await shouldBundleNotification(
        tenantId,
        referenceType,
        referenceId
      );

      if (shouldBundle && bundleIntoId) {
        // Record as bundled instead of sending
        const notification = await prisma.tenantNotification.create({
          data: {
            tenantId,
            notificationType,
            subject,
            referenceType,
            referenceId,
            status: "BUNDLED",
            bundledIntoId: bundleIntoId,
          },
        });

        console.log(
          `[NOTIFICATIONS] Bundled ${notificationType} into ${bundleIntoId}`
        );
        return { sent: false, notificationId: notification.id, reason: "BUNDLED" };
      }
    }

    // 4. Send the email
    const emailType = getEmailTypeForNotification(notificationType);
    const emailResult = await sendEmail({
      to: tenantEmail,
      subject,
      html: htmlContent,
      text: subject, // Simple text fallback
      emailType,
      toGroup: `Tenant: ${tenantName}`,
    });

    // 5. Log the notification
    const notification = await prisma.tenantNotification.create({
      data: {
        tenantId,
        notificationType,
        subject,
        referenceType,
        referenceId,
        status: emailResult.success ? "SENT" : "FAILED",
        errorMessage: emailResult.error,
        emailMessageId: undefined, // Email service doesn't expose this in current implementation
      },
    });

    if (emailResult.success) {
      console.log(`[NOTIFICATIONS] Sent ${notificationType} to ${tenantEmail}`);
      return { sent: true, notificationId: notification.id };
    } else {
      console.error(
        `[NOTIFICATIONS] Failed to send ${notificationType} to ${tenantEmail}: ${emailResult.error}`
      );
      return { sent: false, notificationId: notification.id, reason: "EMAIL_FAILED" };
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[NOTIFICATIONS] Error sending ${notificationType}:`, error);
    return { sent: false, reason: errorMessage };
  }
}

/**
 * Helper to get notification settings (cached per request)
 */
export async function getNotificationSettings() {
  let settings = await prisma.tenantNotificationSettings.findFirst();

  if (!settings) {
    settings = await prisma.tenantNotificationSettings.create({
      data: {},
    });
  }

  return settings;
}

/**
 * Generate HTML content for different notification types
 */
export function generateNotificationHtml(
  type: TenantNotificationType,
  tenantName: string,
  data: Record<string, unknown>
): { subject: string; html: string } {
  const appUrl = process.env.APP_URL || "http://localhost:8000";

  const templates: Record<
    TenantNotificationType,
    () => { subject: string; html: string }
  > = {
    NEW_INVOICE: () => ({
      subject: `New Invoice - ${(data.periodMonth as string) || "Due"}`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">New Invoice Generated</h2>
          <p>Hello ${tenantName},</p>
          <p>A new invoice has been generated for your unit:</p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Amount:</strong> ${data.amount}</p>
            <p style="margin: 4px 0;"><strong>Due Date:</strong> ${data.dueDate}</p>
            <p style="margin: 4px 0;"><strong>Period:</strong> ${data.periodMonth}</p>
          </div>
          <p><a href="${appUrl}/portal/invoices" style="color: #2563eb;">View Invoice in Portal</a></p>
          <p style="color: #666; font-size: 14px; margin-top: 24px;">- GA Developments</p>
        </div>
      `,
    }),
    PAYMENT_RECEIVED: () => ({
      subject: "Payment Confirmation",
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">Payment Received</h2>
          <p>Hello ${tenantName},</p>
          <p>Thank you! Your payment has been successfully processed.</p>
          <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #22c55e;">
            <p style="margin: 4px 0;"><strong>Amount:</strong> ${data.amount}</p>
            <p style="margin: 4px 0;"><strong>Date:</strong> ${data.paidDate}</p>
          </div>
          <p><a href="${appUrl}/portal/payments" style="color: #2563eb;">View Payment History</a></p>
          <p style="color: #666; font-size: 14px; margin-top: 24px;">- GA Developments</p>
        </div>
      `,
    }),
    OVERDUE_ALERT: () => ({
      subject: "Payment Reminder - Invoice Overdue",
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #dc2626;">Payment Reminder</h2>
          <p>Hello ${tenantName},</p>
          <p>This is a reminder that your invoice is past due.</p>
          <div style="background: #fef2f2; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #dc2626;">
            <p style="margin: 4px 0;"><strong>Amount Due:</strong> ${data.amount}</p>
            <p style="margin: 4px 0;"><strong>Due Date:</strong> ${data.dueDate}</p>
            <p style="margin: 4px 0;"><strong>Days Overdue:</strong> ${data.daysOverdue}</p>
          </div>
          <p>Please submit payment at your earliest convenience to avoid any late fees.</p>
          <p><a href="${appUrl}/portal/invoices" style="color: #2563eb;">Pay Now</a></p>
          <p style="color: #666; font-size: 14px; margin-top: 24px;">- GA Developments</p>
        </div>
      `,
    }),
    MAINTENANCE_ACKNOWLEDGED: () => ({
      subject: `Maintenance Request Received - ${data.title}`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">Request Received</h2>
          <p>Hello ${tenantName},</p>
          <p>We have received your maintenance request and will address it shortly.</p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Request:</strong> ${data.title}</p>
            <p style="margin: 4px 0;"><strong>Priority:</strong> ${data.priority}</p>
          </div>
          <p><a href="${appUrl}/portal/requests" style="color: #2563eb;">Track Request Status</a></p>
          <p style="color: #666; font-size: 14px; margin-top: 24px;">- GA Developments</p>
        </div>
      `,
    }),
    MAINTENANCE_STATUS_UPDATE: () => ({
      subject: `Maintenance Update - ${data.title}`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">Status Update</h2>
          <p>Hello ${tenantName},</p>
          <p>There's an update on your maintenance request:</p>
          <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #f59e0b;">
            <p style="margin: 4px 0;"><strong>Request:</strong> ${data.title}</p>
            <p style="margin: 4px 0;"><strong>New Status:</strong> ${data.status}</p>
          </div>
          <p><a href="${appUrl}/portal/requests" style="color: #2563eb;">View Details</a></p>
          <p style="color: #666; font-size: 14px; margin-top: 24px;">- GA Developments</p>
        </div>
      `,
    }),
    MAINTENANCE_RESOLVED: () => ({
      subject: `Maintenance Completed - ${data.title}`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #22c55e;">Request Completed</h2>
          <p>Hello ${tenantName},</p>
          <p>Your maintenance request has been resolved.</p>
          <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #22c55e;">
            <p style="margin: 4px 0;"><strong>Request:</strong> ${data.title}</p>
            <p style="margin: 4px 0;"><strong>Status:</strong> Resolved</p>
          </div>
          <p>If you have any questions or the issue persists, please submit a new request.</p>
          <p><a href="${appUrl}/portal/requests" style="color: #2563eb;">View Request History</a></p>
          <p style="color: #666; font-size: 14px; margin-top: 24px;">- GA Developments</p>
        </div>
      `,
    }),
    MOVE_IN_CHECKLIST_REMINDER: () => ({
      subject: "Move-In Checklist Reminder",
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">Checklist Reminder</h2>
          <p>Hello ${tenantName},</p>
          <p>This is a friendly reminder to complete your move-in checklist.</p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Items Remaining:</strong> ${(data.itemsRemaining as string) || "Several"}</p>
          </div>
          <p><a href="${appUrl}/portal/checklists" style="color: #2563eb;">Complete Checklist</a></p>
          <p style="color: #666; font-size: 14px; margin-top: 24px;">- GA Developments</p>
        </div>
      `,
    }),
    INSPECTION_SCHEDULED: () => ({
      subject: "Inspection Scheduled",
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">Inspection Scheduled</h2>
          <p>Hello ${tenantName},</p>
          <p>An inspection has been scheduled for your unit.</p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Type:</strong> ${data.inspectionType}</p>
            <p style="margin: 4px 0;"><strong>Date:</strong> ${(data.scheduledDate as string) || "To be confirmed"}</p>
          </div>
          <p><a href="${appUrl}/portal/inspections" style="color: #2563eb;">View Details</a></p>
          <p style="color: #666; font-size: 14px; margin-top: 24px;">- GA Developments</p>
        </div>
      `,
    }),
    ANNOUNCEMENT: () => ({
      subject: (data.title as string) || "New Announcement",
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">${data.title}</h2>
          <p>Hello ${tenantName},</p>
          <div style="margin: 16px 0;">${data.body}</div>
          <p><a href="${appUrl}/portal/announcements" style="color: #2563eb;">View in Portal</a></p>
          <p style="color: #666; font-size: 14px; margin-top: 24px;">- GA Developments</p>
        </div>
      `,
    }),
    BUNDLED_UPDATE: () => ({
      subject: "Multiple Updates Summary",
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">Updates Summary</h2>
          <p>Hello ${tenantName},</p>
          <p>Here's a summary of recent updates:</p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            ${
              Array.isArray(data.updates)
                ? data.updates
                    .map((u: unknown) => `<p style="margin: 4px 0;">- ${u}</p>`)
                    .join("")
                : ""
            }
          </div>
          <p><a href="${appUrl}/portal" style="color: #2563eb;">View Portal</a></p>
          <p style="color: #666; font-size: 14px; margin-top: 24px;">- GA Developments</p>
        </div>
      `,
    }),
  };

  return (
    templates[type]?.() || {
      subject: "Notification",
      html: "<p>You have a new notification.</p>",
    }
  );
}
