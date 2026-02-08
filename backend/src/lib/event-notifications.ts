import { prisma } from "../prisma";
import { sendEmail, getEmailTemplate, isEmailConfigured } from "./email";
import { env } from "../env";

/**
 * Event types that can trigger notifications to Communication Center recipients
 */
export type NotificationEventType =
  | "NEW_TENANT"
  | "MAINTENANCE_REQUEST"
  | "INVOICE_OVERDUE"
  | "MOVE_OUT_REQUEST"
  | "INSURANCE_EXPIRING"
  | "PAYMENT_RECEIVED";

/**
 * Result of a notification dispatch
 */
interface NotificationResult {
  success: boolean;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  errors: string[];
}

/**
 * Log entry for notification tracking
 */
interface NotificationLogEntry {
  eventType: NotificationEventType;
  recipientEmail: string;
  recipientName: string | null;
  status: "SENT" | "FAILED" | "SKIPPED";
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get active notification recipients for a given event type and optional building filter
 */
async function getRecipientsForEvent(
  eventType: NotificationEventType,
  buildingName?: string | null
): Promise<Array<{ id: string; email: string; name: string | null; buildingName: string | null }>> {
  const recipients = await prisma.notificationRecipient.findMany({
    where: {
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      eventTypes: true,
      buildingName: true,
    },
  });

  // Filter recipients by event type and building
  return recipients.filter((recipient) => {
    // Check if recipient is subscribed to this event type
    const subscribedEvents = recipient.eventTypes.split(",").map((e) => e.trim());
    if (!subscribedEvents.includes(eventType)) {
      return false;
    }

    // If recipient has a building filter, check if it matches
    if (recipient.buildingName && buildingName) {
      return recipient.buildingName === buildingName;
    }

    // If recipient has no building filter (null), they receive all buildings
    return true;
  });
}

/**
 * Send email with retry logic
 */
async function sendEmailWithRetry(
  options: Parameters<typeof sendEmail>[0],
  maxAttempts: number = MAX_RETRY_ATTEMPTS
): Promise<{ success: boolean; error?: string; attempts: number }> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await sendEmail(options);

    if (result.success) {
      return { success: true, attempts: attempt };
    }

    lastError = result.error;
    console.log(`[EVENT-NOTIFICATION] Email attempt ${attempt}/${maxAttempts} failed: ${lastError}`);

    if (attempt < maxAttempts) {
      await sleep(RETRY_DELAY_MS * attempt); // Exponential backoff
    }
  }

  return { success: false, error: lastError, attempts: maxAttempts };
}

/**
 * Log notification to database for admin visibility
 */
async function logNotification(entry: NotificationLogEntry): Promise<void> {
  try {
    await prisma.systemAuditLog.create({
      data: {
        adminUserId: "SYSTEM",
        action: `NOTIFICATION_${entry.status}`,
        category: "NOTIFICATION",
        description: `${entry.eventType} notification to ${entry.recipientEmail}: ${entry.status}`,
        metadata: JSON.stringify({
          eventType: entry.eventType,
          recipientEmail: entry.recipientEmail,
          recipientName: entry.recipientName,
          errorMessage: entry.errorMessage,
          ...entry.metadata,
        }),
        success: entry.status === "SENT",
        errorMessage: entry.errorMessage,
      },
    });
  } catch (error) {
    console.error("[EVENT-NOTIFICATION] Failed to log notification:", error);
  }
}

/**
 * Generate email content for NEW_TENANT event
 */
function getNewTenantEmailContent(data: {
  tenantName: string;
  tenantEmail: string;
  buildingName: string;
  unitLabel: string;
  leaseStartDate?: string;
  invitedBy: string;
}): { subject: string; html: string } {
  const appUrl = env.APP_URL || "https://portal.gadevelopments.ca";
  const subject = `New Tenant: ${data.tenantName} - ${data.buildingName} ${data.unitLabel}`;

  const content = `
    <h2>New Tenant Added</h2>
    <p>A new tenant has been invited to the property management system.</p>

    <div class="info-box">
      <p><strong>Tenant Name:</strong> ${data.tenantName}</p>
      <p><strong>Email:</strong> ${data.tenantEmail}</p>
      <p><strong>Building:</strong> ${data.buildingName}</p>
      <p><strong>Unit:</strong> ${data.unitLabel}</p>
      ${data.leaseStartDate ? `<p><strong>Lease Start:</strong> ${data.leaseStartDate}</p>` : ""}
      <p><strong>Invited By:</strong> ${data.invitedBy}</p>
    </div>

    <div class="button-container">
      <a href="${appUrl}/admin/tenants" class="email-button">View Tenants</a>
    </div>
  `;

  return { subject, html: getEmailTemplate(content, subject) };
}

/**
 * Generate email content for MAINTENANCE_REQUEST event
 */
function getMaintenanceRequestEmailContent(data: {
  title: string;
  description: string;
  priority: string;
  tenantName: string;
  buildingName: string;
  unitLabel: string;
}): { subject: string; html: string } {
  const appUrl = env.APP_URL || "https://portal.gadevelopments.ca";
  const priorityColors: Record<string, string> = {
    URGENT: "#dc2626",
    HIGH: "#ea580c",
    NORMAL: "#6b7280",
    LOW: "#9ca3af",
  };
  const priorityColor = priorityColors[data.priority] || "#6b7280";

  const subject = `${data.priority === "URGENT" ? "[URGENT] " : ""}Maintenance Request: ${data.title} - ${data.buildingName} ${data.unitLabel}`;

  const content = `
    <h2>New Maintenance Request</h2>
    <p>A new maintenance request has been submitted.</p>

    <div class="info-box">
      <p><strong>Title:</strong> ${data.title}</p>
      <p><strong>Priority:</strong> <span style="color: ${priorityColor}; font-weight: 600;">${data.priority}</span></p>
      <p><strong>Submitted By:</strong> ${data.tenantName}</p>
      <p><strong>Building:</strong> ${data.buildingName}</p>
      <p><strong>Unit:</strong> ${data.unitLabel}</p>
    </div>

    <p><strong>Description:</strong></p>
    <p style="background: #f7fafc; padding: 12px; border-radius: 6px; border-left: 4px solid ${priorityColor};">
      ${data.description}
    </p>

    <div class="button-container">
      <a href="${appUrl}/admin/requests" class="email-button">View Request</a>
    </div>
  `;

  return { subject, html: getEmailTemplate(content, subject) };
}

/**
 * Generate email content for MOVE_OUT_REQUEST event
 */
function getMoveOutRequestEmailContent(data: {
  tenantName: string;
  tenantEmail: string;
  buildingName: string;
  unitLabel: string;
  requestedDate: string;
}): { subject: string; html: string } {
  const appUrl = env.APP_URL || "https://portal.gadevelopments.ca";
  const subject = `Move-Out Request: ${data.tenantName} - ${data.buildingName} ${data.unitLabel}`;

  const content = `
    <h2>Move-Out Request Submitted</h2>
    <p>A tenant has submitted a move-out request.</p>

    <div class="info-box">
      <p><strong>Tenant Name:</strong> ${data.tenantName}</p>
      <p><strong>Email:</strong> ${data.tenantEmail}</p>
      <p><strong>Building:</strong> ${data.buildingName}</p>
      <p><strong>Unit:</strong> ${data.unitLabel}</p>
      <p><strong>Requested Move-Out Date:</strong> <span style="color: #dc2626; font-weight: 600;">${data.requestedDate}</span></p>
    </div>

    <p>Please review this request and acknowledge or decline it in the admin portal.</p>

    <div class="button-container">
      <a href="${appUrl}/admin/requests" class="email-button">Review Request</a>
    </div>
  `;

  return { subject, html: getEmailTemplate(content, subject) };
}

/**
 * Generate email content for INVOICE_OVERDUE event
 */
function getInvoiceOverdueEmailContent(data: {
  tenantName: string;
  tenantEmail: string;
  buildingName: string;
  unitLabel: string;
  periodMonth: string;
  amountCents: number;
  dueDate: string;
  daysOverdue: number;
}): { subject: string; html: string } {
  const appUrl = env.APP_URL || "https://portal.gadevelopments.ca";
  const amount = (data.amountCents / 100).toFixed(2);
  const subject = `Overdue Invoice: ${data.tenantName} - ${data.buildingName} ${data.unitLabel} (${data.daysOverdue} days)`;

  const content = `
    <h2>Invoice Overdue Alert</h2>
    <p>The following invoice is overdue and requires attention.</p>

    <div class="info-box" style="border-color: #dc2626;">
      <p><strong>Tenant Name:</strong> ${data.tenantName}</p>
      <p><strong>Email:</strong> ${data.tenantEmail}</p>
      <p><strong>Building:</strong> ${data.buildingName}</p>
      <p><strong>Unit:</strong> ${data.unitLabel}</p>
      <p><strong>Period:</strong> ${data.periodMonth}</p>
      <p><strong>Amount:</strong> <span class="amount-highlight">$${amount} CAD</span></p>
      <p><strong>Due Date:</strong> ${data.dueDate}</p>
      <p><strong>Days Overdue:</strong> <span style="color: #dc2626; font-weight: 600;">${data.daysOverdue} days</span></p>
    </div>

    <div class="button-container">
      <a href="${appUrl}/admin/finance" class="email-button">View Finance</a>
    </div>
  `;

  return { subject, html: getEmailTemplate(content, subject) };
}

/**
 * Generate email content for INSURANCE_EXPIRING event
 */
function getInsuranceExpiringEmailContent(data: {
  tenantName: string;
  tenantEmail: string;
  buildingName: string;
  unitLabel: string;
  expirationDate: string;
  daysUntilExpiry: number;
}): { subject: string; html: string } {
  const appUrl = env.APP_URL || "https://portal.gadevelopments.ca";
  const subject = `Insurance Expiring: ${data.tenantName} - ${data.buildingName} ${data.unitLabel} (${data.daysUntilExpiry} days)`;

  const content = `
    <h2>Insurance Expiring Soon</h2>
    <p>A tenant's insurance is expiring and requires attention.</p>

    <div class="info-box" style="border-color: #ea580c;">
      <p><strong>Tenant Name:</strong> ${data.tenantName}</p>
      <p><strong>Email:</strong> ${data.tenantEmail}</p>
      <p><strong>Building:</strong> ${data.buildingName}</p>
      <p><strong>Unit:</strong> ${data.unitLabel}</p>
      <p><strong>Expiration Date:</strong> <span style="color: #ea580c; font-weight: 600;">${data.expirationDate}</span></p>
      <p><strong>Days Until Expiry:</strong> ${data.daysUntilExpiry} days</p>
    </div>

    <div class="button-container">
      <a href="${appUrl}/admin/tenants" class="email-button">View Tenant</a>
    </div>
  `;

  return { subject, html: getEmailTemplate(content, subject) };
}

/**
 * Dispatch notifications to all configured recipients for an event
 */
async function dispatchNotifications(
  eventType: NotificationEventType,
  buildingName: string | null,
  emailContent: { subject: string; html: string },
  metadata?: Record<string, unknown>
): Promise<NotificationResult> {
  const result: NotificationResult = {
    success: true,
    recipientCount: 0,
    sentCount: 0,
    failedCount: 0,
    errors: [],
  };

  if (!isEmailConfigured()) {
    console.log("[EVENT-NOTIFICATION] Email not configured, skipping notifications");
    return result;
  }

  const recipients = await getRecipientsForEvent(eventType, buildingName);
  result.recipientCount = recipients.length;

  if (recipients.length === 0) {
    console.log(`[EVENT-NOTIFICATION] No recipients configured for ${eventType} event`);
    return result;
  }

  console.log(`[EVENT-NOTIFICATION] Dispatching ${eventType} notifications to ${recipients.length} recipients`);

  for (const recipient of recipients) {
    const sendResult = await sendEmailWithRetry({
      to: recipient.email,
      subject: emailContent.subject,
      html: emailContent.html,
      emailType: "MANUAL", // Using MANUAL for admin notifications
      toGroup: `${eventType} - ${recipient.name || recipient.email}`,
    });

    if (sendResult.success) {
      result.sentCount++;
      await logNotification({
        eventType,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        status: "SENT",
        metadata: { ...metadata, attempts: sendResult.attempts },
      });
    } else {
      result.failedCount++;
      result.errors.push(`${recipient.email}: ${sendResult.error}`);
      await logNotification({
        eventType,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        status: "FAILED",
        errorMessage: sendResult.error,
        metadata: { ...metadata, attempts: sendResult.attempts },
      });
    }
  }

  result.success = result.failedCount === 0;
  console.log(`[EVENT-NOTIFICATION] ${eventType} dispatch complete: ${result.sentCount}/${result.recipientCount} sent`);

  return result;
}

// ============================================
// Public API - Event Trigger Functions
// ============================================

/**
 * Trigger NEW_TENANT notification when a tenant is invited or created
 */
export async function notifyNewTenant(data: {
  tenantName: string;
  tenantEmail: string;
  buildingName: string;
  unitLabel: string;
  leaseStartDate?: string;
  invitedBy: string;
}): Promise<NotificationResult> {
  console.log(`[EVENT-NOTIFICATION] Triggering NEW_TENANT notification for ${data.tenantName}`);

  const emailContent = getNewTenantEmailContent(data);
  return dispatchNotifications("NEW_TENANT", data.buildingName, emailContent, {
    tenantName: data.tenantName,
    tenantEmail: data.tenantEmail,
    buildingName: data.buildingName,
    unitLabel: data.unitLabel,
  });
}

/**
 * Trigger MAINTENANCE_REQUEST notification when a service request is created
 */
export async function notifyMaintenanceRequest(data: {
  title: string;
  description: string;
  priority: string;
  tenantName: string;
  buildingName: string;
  unitLabel: string;
}): Promise<NotificationResult> {
  console.log(`[EVENT-NOTIFICATION] Triggering MAINTENANCE_REQUEST notification for ${data.title}`);

  const emailContent = getMaintenanceRequestEmailContent(data);
  return dispatchNotifications("MAINTENANCE_REQUEST", data.buildingName, emailContent, {
    title: data.title,
    priority: data.priority,
    buildingName: data.buildingName,
    unitLabel: data.unitLabel,
  });
}

/**
 * Trigger MOVE_OUT_REQUEST notification when a move-out request is created
 */
export async function notifyMoveOutRequest(data: {
  tenantName: string;
  tenantEmail: string;
  buildingName: string;
  unitLabel: string;
  requestedDate: string;
}): Promise<NotificationResult> {
  console.log(`[EVENT-NOTIFICATION] Triggering MOVE_OUT_REQUEST notification for ${data.tenantName}`);

  const emailContent = getMoveOutRequestEmailContent(data);
  return dispatchNotifications("MOVE_OUT_REQUEST", data.buildingName, emailContent, {
    tenantName: data.tenantName,
    buildingName: data.buildingName,
    unitLabel: data.unitLabel,
    requestedDate: data.requestedDate,
  });
}

/**
 * Trigger INVOICE_OVERDUE notification for overdue invoices
 */
export async function notifyInvoiceOverdue(data: {
  tenantName: string;
  tenantEmail: string;
  buildingName: string;
  unitLabel: string;
  periodMonth: string;
  amountCents: number;
  dueDate: string;
  daysOverdue: number;
}): Promise<NotificationResult> {
  console.log(`[EVENT-NOTIFICATION] Triggering INVOICE_OVERDUE notification for ${data.tenantName}`);

  const emailContent = getInvoiceOverdueEmailContent(data);
  return dispatchNotifications("INVOICE_OVERDUE", data.buildingName, emailContent, {
    tenantName: data.tenantName,
    buildingName: data.buildingName,
    unitLabel: data.unitLabel,
    periodMonth: data.periodMonth,
    amountCents: data.amountCents,
  });
}

/**
 * Trigger INSURANCE_EXPIRING notification for expiring insurance
 */
export async function notifyInsuranceExpiring(data: {
  tenantName: string;
  tenantEmail: string;
  buildingName: string;
  unitLabel: string;
  expirationDate: string;
  daysUntilExpiry: number;
}): Promise<NotificationResult> {
  console.log(`[EVENT-NOTIFICATION] Triggering INSURANCE_EXPIRING notification for ${data.tenantName}`);

  const emailContent = getInsuranceExpiringEmailContent(data);
  return dispatchNotifications("INSURANCE_EXPIRING", data.buildingName, emailContent, {
    tenantName: data.tenantName,
    buildingName: data.buildingName,
    unitLabel: data.unitLabel,
    expirationDate: data.expirationDate,
  });
}

/**
 * Generate email content for PAYMENT_RECEIVED event
 */
function getPaymentReceivedEmailContent(data: {
  tenantName: string;
  tenantEmail: string;
  buildingName: string;
  unitLabel: string;
  periodMonth: string;
  amountCents: number;
  paymentMethod: string;
}): { subject: string; html: string } {
  const appUrl = env.APP_URL || "https://portal.gadevelopments.ca";
  const amount = (data.amountCents / 100).toFixed(2);
  const methodLabel = data.paymentMethod === "etransfer_manual" ? "e-Transfer" :
                      data.paymentMethod === "stripe" ? "Credit Card" : data.paymentMethod;
  const subject = `Payment Received: ${data.tenantName} - ${data.buildingName} ${data.unitLabel} ($${amount})`;

  const content = `
    <h2>Payment Received</h2>
    <p>A payment has been received and recorded.</p>

    <div class="info-box" style="border-color: #10b981;">
      <p><strong>Tenant Name:</strong> ${data.tenantName}</p>
      <p><strong>Email:</strong> ${data.tenantEmail}</p>
      <p><strong>Building:</strong> ${data.buildingName}</p>
      <p><strong>Unit:</strong> ${data.unitLabel}</p>
      <p><strong>Period:</strong> ${data.periodMonth}</p>
      <p><strong>Amount:</strong> <span style="color: #10b981; font-weight: 600;">$${amount} CAD</span></p>
      <p><strong>Payment Method:</strong> ${methodLabel}</p>
    </div>

    <div class="button-container">
      <a href="${appUrl}/admin/finance" class="email-button">View Finances</a>
    </div>
  `;

  return { subject, html: getEmailTemplate(content, subject) };
}

/**
 * Trigger PAYMENT_RECEIVED notification when a payment is made
 */
export async function notifyPaymentReceived(data: {
  tenantName: string;
  tenantEmail: string;
  buildingName: string;
  unitLabel: string;
  periodMonth: string;
  amountCents: number;
  paymentMethod: string;
}): Promise<NotificationResult> {
  console.log(`[EVENT-NOTIFICATION] Triggering PAYMENT_RECEIVED notification for ${data.tenantName} - $${(data.amountCents / 100).toFixed(2)}`);

  const emailContent = getPaymentReceivedEmailContent(data);
  return dispatchNotifications("PAYMENT_RECEIVED", data.buildingName, emailContent, {
    tenantName: data.tenantName,
    buildingName: data.buildingName,
    unitLabel: data.unitLabel,
    periodMonth: data.periodMonth,
    amountCents: data.amountCents,
    paymentMethod: data.paymentMethod,
  });
}

/**
 * Get notification logs for admin visibility
 */
export async function getNotificationLogs(params: {
  limit?: number;
  offset?: number;
  eventType?: NotificationEventType;
}): Promise<{
  logs: Array<{
    id: string;
    eventType: string;
    recipientEmail: string;
    status: string;
    errorMessage: string | null;
    createdAt: Date;
    metadata: Record<string, unknown> | null;
  }>;
  total: number;
}> {
  const where: any = {
    category: "NOTIFICATION",
  };

  if (params.eventType) {
    where.action = { contains: params.eventType };
  }

  const [logs, total] = await Promise.all([
    prisma.systemAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params.limit || 50,
      skip: params.offset || 0,
      select: {
        id: true,
        action: true,
        description: true,
        success: true,
        errorMessage: true,
        createdAt: true,
        metadata: true,
      },
    }),
    prisma.systemAuditLog.count({ where }),
  ]);

  return {
    logs: logs.map((log) => {
      const metadata = log.metadata ? JSON.parse(log.metadata) : null;
      return {
        id: log.id,
        eventType: metadata?.eventType || log.action.replace("NOTIFICATION_", ""),
        recipientEmail: metadata?.recipientEmail || "Unknown",
        status: log.success ? "SENT" : "FAILED",
        errorMessage: log.errorMessage,
        createdAt: log.createdAt,
        metadata,
      };
    }),
    total,
  };
}
