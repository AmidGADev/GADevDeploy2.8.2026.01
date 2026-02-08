import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { UpdateTenantNotificationSettingsSchema } from "../../types";

const notificationSettingsRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
notificationSettingsRouter.use("*", authMiddleware);
notificationSettingsRouter.use("*", adminMiddleware);

// ============================================
// Helper: Log to SystemAuditLog
// ============================================

async function logSystemAudit(
  adminUserId: string,
  action: string,
  category: "SETTINGS" | "DATA_GOVERNANCE" | "SECURITY",
  description: string,
  metadata?: Record<string, unknown>,
  success: boolean = true,
  errorMessage?: string,
  ipAddress?: string,
  userAgent?: string
) {
  await prisma.systemAuditLog.create({
    data: {
      adminUserId,
      action,
      category,
      description,
      metadata: metadata ? JSON.stringify(metadata) : null,
      success,
      errorMessage: errorMessage ?? null,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    },
  });
}

// ============================================
// Tenant Notification Preferences Routes
// ============================================

/**
 * GET /api/admin/notification-settings/tenant-preferences
 * Returns the current TenantNotificationSettings (creates default if none exists)
 */
notificationSettingsRouter.get("/tenant-preferences", async (c) => {
  // Try to find existing settings
  let settings = await prisma.tenantNotificationSettings.findFirst();

  // Create default settings if none exist
  if (!settings) {
    settings = await prisma.tenantNotificationSettings.create({
      data: {
        // All defaults are already specified in the schema
      },
    });
  }

  return c.json({
    data: {
      id: settings.id,
      newInvoice: settings.newInvoice,
      paymentReceived: settings.paymentReceived,
      overdueAlert: settings.overdueAlert,
      maintenanceAcknowledged: settings.maintenanceAcknowledged,
      maintenanceStatusUpdate: settings.maintenanceStatusUpdate,
      maintenanceResolved: settings.maintenanceResolved,
      moveInChecklistReminder: settings.moveInChecklistReminder,
      inspectionScheduled: settings.inspectionScheduled,
      globalMute: settings.globalMute,
      overdueReminderHours: settings.overdueReminderHours,
      bundleWindowMinutes: settings.bundleWindowMinutes,
      updatedAt: settings.updatedAt.toISOString(),
    },
  });
});

/**
 * PUT /api/admin/notification-settings/tenant-preferences
 * Updates the tenant notification settings
 * Requires admin auth
 * Logs to SystemAuditLog
 */
notificationSettingsRouter.put(
  "/tenant-preferences",
  zValidator("json", UpdateTenantNotificationSettingsSchema),
  async (c) => {
    const user = c.get("user");
    const data = c.req.valid("json");
    const ipAddress = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null;
    const userAgent = c.req.header("user-agent") || null;

    try {
      // Find existing settings or create new
      let settings = await prisma.tenantNotificationSettings.findFirst();

      if (settings) {
        // Update existing
        settings = await prisma.tenantNotificationSettings.update({
          where: { id: settings.id },
          data: {
            newInvoice: data.newInvoice,
            paymentReceived: data.paymentReceived,
            overdueAlert: data.overdueAlert,
            maintenanceAcknowledged: data.maintenanceAcknowledged,
            maintenanceStatusUpdate: data.maintenanceStatusUpdate,
            maintenanceResolved: data.maintenanceResolved,
            moveInChecklistReminder: data.moveInChecklistReminder,
            inspectionScheduled: data.inspectionScheduled,
            globalMute: data.globalMute,
            overdueReminderHours: data.overdueReminderHours,
            bundleWindowMinutes: data.bundleWindowMinutes,
            updatedById: user.id,
          },
        });
      } else {
        // Create new with provided values
        settings = await prisma.tenantNotificationSettings.create({
          data: {
            newInvoice: data.newInvoice ?? true,
            paymentReceived: data.paymentReceived ?? true,
            overdueAlert: data.overdueAlert ?? true,
            maintenanceAcknowledged: data.maintenanceAcknowledged ?? true,
            maintenanceStatusUpdate: data.maintenanceStatusUpdate ?? true,
            maintenanceResolved: data.maintenanceResolved ?? true,
            moveInChecklistReminder: data.moveInChecklistReminder ?? true,
            inspectionScheduled: data.inspectionScheduled ?? true,
            globalMute: data.globalMute ?? false,
            overdueReminderHours: data.overdueReminderHours ?? 72,
            bundleWindowMinutes: data.bundleWindowMinutes ?? 60,
            updatedById: user.id,
          },
        });
      }

      // Log the action
      await logSystemAudit(
        user.id,
        "UPDATE_TENANT_NOTIFICATION_SETTINGS",
        "SETTINGS",
        "Updated tenant notification preferences",
        { settingsId: settings.id, changes: data },
        true,
        undefined,
        ipAddress ?? undefined,
        userAgent ?? undefined
      );

      return c.json({
        data: {
          id: settings.id,
          newInvoice: settings.newInvoice,
          paymentReceived: settings.paymentReceived,
          overdueAlert: settings.overdueAlert,
          maintenanceAcknowledged: settings.maintenanceAcknowledged,
          maintenanceStatusUpdate: settings.maintenanceStatusUpdate,
          maintenanceResolved: settings.maintenanceResolved,
          moveInChecklistReminder: settings.moveInChecklistReminder,
          inspectionScheduled: settings.inspectionScheduled,
          globalMute: settings.globalMute,
          overdueReminderHours: settings.overdueReminderHours,
          bundleWindowMinutes: settings.bundleWindowMinutes,
          updatedAt: settings.updatedAt.toISOString(),
        },
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await logSystemAudit(
        user.id,
        "UPDATE_TENANT_NOTIFICATION_SETTINGS",
        "SETTINGS",
        "Failed to update tenant notification preferences",
        { attemptedChanges: data },
        false,
        errorMessage,
        ipAddress ?? undefined,
        userAgent ?? undefined
      );
      throw error;
    }
  }
);

// ============================================
// Tenant Notification History Routes
// ============================================

/**
 * GET /api/admin/notification-settings/tenant-history/:tenantId
 * Returns notification history for a specific tenant
 * Supports pagination: ?limit=20&offset=0
 * Returns most recent first
 */
notificationSettingsRouter.get("/tenant-history/:tenantId", async (c) => {
  const tenantId = c.req.param("tenantId");
  const limit = Math.min(parseInt(c.req.query("limit") || "20"), 100);
  const offset = parseInt(c.req.query("offset") || "0");

  // Verify tenant exists
  const tenant = await prisma.user.findUnique({
    where: { id: tenantId },
    select: { id: true, role: true },
  });

  if (!tenant) {
    return c.json(
      { error: { message: "Tenant not found", code: "NOT_FOUND" } },
      404
    );
  }

  // Get notification history
  const [notifications, total] = await Promise.all([
    prisma.tenantNotification.findMany({
      where: { tenantId },
      orderBy: { sentAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.tenantNotification.count({
      where: { tenantId },
    }),
  ]);

  return c.json({
    data: {
      items: notifications.map((n) => ({
        id: n.id,
        tenantId: n.tenantId,
        notificationType: n.notificationType,
        subject: n.subject,
        referenceType: n.referenceType,
        referenceId: n.referenceId,
        status: n.status,
        errorMessage: n.errorMessage,
        bundledIntoId: n.bundledIntoId,
        emailMessageId: n.emailMessageId,
        openedAt: n.openedAt?.toISOString() ?? null,
        sentAt: n.sentAt.toISOString(),
      })),
      total,
      limit,
      offset,
    },
  });
});

export { notificationSettingsRouter };
