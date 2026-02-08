import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import crypto from "crypto";
import { auditBackupAction } from "../../lib/audit-service";
import { triggerManualBackup } from "../../lib/backup-scheduler";

// App version for schema versioning
const APP_VERSION = "1.0.0";

const settingsRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
settingsRouter.use("*", authMiddleware);
settingsRouter.use("*", adminMiddleware);

// ============================================
// Notification Event Types
// ============================================

export const NotificationEventTypeSchema = z.enum([
  "MAINTENANCE_REQUEST",
  "INVOICE_OVERDUE",
  "NEW_TENANT",
  "MOVE_OUT_REQUEST",
  "INSURANCE_EXPIRING",
  "PAYMENT_RECEIVED",
]);
export type NotificationEventType = z.infer<typeof NotificationEventTypeSchema>;

// ============================================
// Zod Schemas for Notification Recipients
// ============================================

const CreateNotificationRecipientSchema = z.object({
  email: z.string().email("Valid email is required"),
  name: z.string().optional(),
  eventTypes: z.array(NotificationEventTypeSchema).min(1, "At least one event type is required"),
  buildingName: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

const UpdateNotificationRecipientSchema = z.object({
  email: z.string().email("Valid email is required").optional(),
  name: z.string().optional().nullable(),
  eventTypes: z.array(NotificationEventTypeSchema).min(1).optional(),
  buildingName: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

// ============================================
// Zod Schemas for Data Export/Import
// ============================================

const ImportValidationSchema = z.object({
  content: z.string().min(1, "Import content is required"),
});

// Schema for approved changes - indices for creates, IDs for updates
const ApprovedChangesSchema = z.object({
  units: z.object({ creates: z.array(z.number()), updates: z.array(z.string()) }),
  tenants: z.object({ creates: z.array(z.number()), updates: z.array(z.string()) }),
  tenancies: z.object({ creates: z.array(z.number()), updates: z.array(z.string()) }),
  invoices: z.object({ creates: z.array(z.number()), updates: z.array(z.string()) }),
  checklistItems: z.object({ creates: z.array(z.number()), updates: z.array(z.string()) }),
  inspections: z.object({ creates: z.array(z.number()), updates: z.array(z.string()) }),
  buildingInfos: z.object({ creates: z.array(z.number()), updates: z.array(z.string()) }),
});

const ImportConfirmSchema = z.object({
  content: z.string().min(1, "Import content is required"),
  confirmationToken: z.string().min(1, "Confirmation token is required"),
  approvedChanges: ApprovedChangesSchema.optional(),
});

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
// Notification Recipients Routes
// ============================================

/**
 * GET /api/admin/settings/notifications
 * List all notification recipients
 */
settingsRouter.get("/notifications", async (c) => {
  const recipients = await prisma.notificationRecipient.findMany({
    orderBy: { createdAt: "desc" },
  });

  return c.json({
    data: recipients.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      eventTypes: r.eventTypes.split(",").filter(Boolean),
      buildingName: r.buildingName,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
});

/**
 * POST /api/admin/settings/notifications
 * Add a new notification recipient
 */
settingsRouter.post(
  "/notifications",
  zValidator("json", CreateNotificationRecipientSchema),
  async (c) => {
    const user = c.get("user");
    const data = c.req.valid("json");
    const ipAddress = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null;
    const userAgent = c.req.header("user-agent") || null;

    try {
      const recipient = await prisma.notificationRecipient.create({
        data: {
          email: data.email,
          name: data.name ?? null,
          eventTypes: data.eventTypes.join(","),
          buildingName: data.buildingName ?? null,
          isActive: data.isActive ?? true,
          createdById: user.id,
        },
      });

      // Log the action
      await logSystemAudit(
        user.id,
        "CREATE_NOTIFICATION_RECIPIENT",
        "SETTINGS",
        `Created notification recipient: ${data.email}`,
        { recipientId: recipient.id, email: data.email, eventTypes: data.eventTypes },
        true,
        undefined,
        ipAddress ?? undefined,
        userAgent ?? undefined
      );

      return c.json({
        data: {
          id: recipient.id,
          email: recipient.email,
          name: recipient.name,
          eventTypes: recipient.eventTypes.split(",").filter(Boolean),
          buildingName: recipient.buildingName,
          isActive: recipient.isActive,
          createdAt: recipient.createdAt.toISOString(),
          updatedAt: recipient.updatedAt.toISOString(),
        },
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await logSystemAudit(
        user.id,
        "CREATE_NOTIFICATION_RECIPIENT",
        "SETTINGS",
        `Failed to create notification recipient: ${data.email}`,
        { email: data.email },
        false,
        errorMessage,
        ipAddress ?? undefined,
        userAgent ?? undefined
      );
      throw error;
    }
  }
);

/**
 * PUT /api/admin/settings/notifications/:id
 * Update a notification recipient
 */
settingsRouter.put(
  "/notifications/:id",
  zValidator("json", UpdateNotificationRecipientSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const data = c.req.valid("json");
    const ipAddress = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null;
    const userAgent = c.req.header("user-agent") || null;

    // Verify recipient exists
    const existing = await prisma.notificationRecipient.findUnique({
      where: { id },
    });

    if (!existing) {
      return c.json({ error: { message: "Notification recipient not found", code: "NOT_FOUND" } }, 404);
    }

    try {
      const recipient = await prisma.notificationRecipient.update({
        where: { id },
        data: {
          email: data.email,
          name: data.name,
          eventTypes: data.eventTypes ? data.eventTypes.join(",") : undefined,
          buildingName: data.buildingName,
          isActive: data.isActive,
        },
      });

      // Log the action
      await logSystemAudit(
        user.id,
        "UPDATE_NOTIFICATION_RECIPIENT",
        "SETTINGS",
        `Updated notification recipient: ${recipient.email}`,
        { recipientId: id, changes: data },
        true,
        undefined,
        ipAddress ?? undefined,
        userAgent ?? undefined
      );

      return c.json({
        data: {
          id: recipient.id,
          email: recipient.email,
          name: recipient.name,
          eventTypes: recipient.eventTypes.split(",").filter(Boolean),
          buildingName: recipient.buildingName,
          isActive: recipient.isActive,
          createdAt: recipient.createdAt.toISOString(),
          updatedAt: recipient.updatedAt.toISOString(),
        },
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await logSystemAudit(
        user.id,
        "UPDATE_NOTIFICATION_RECIPIENT",
        "SETTINGS",
        `Failed to update notification recipient: ${id}`,
        { recipientId: id },
        false,
        errorMessage,
        ipAddress ?? undefined,
        userAgent ?? undefined
      );
      throw error;
    }
  }
);

/**
 * DELETE /api/admin/settings/notifications/:id
 * Delete a notification recipient
 */
settingsRouter.delete("/notifications/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const ipAddress = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null;
  const userAgent = c.req.header("user-agent") || null;

  // Verify recipient exists
  const existing = await prisma.notificationRecipient.findUnique({
    where: { id },
  });

  if (!existing) {
    return c.json({ error: { message: "Notification recipient not found", code: "NOT_FOUND" } }, 404);
  }

  try {
    await prisma.notificationRecipient.delete({
      where: { id },
    });

    // Log the action
    await logSystemAudit(
      user.id,
      "DELETE_NOTIFICATION_RECIPIENT",
      "SETTINGS",
      `Deleted notification recipient: ${existing.email}`,
      { recipientId: id, email: existing.email },
      true,
      undefined,
      ipAddress ?? undefined,
      userAgent ?? undefined
    );

    return c.json({ data: { success: true } });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await logSystemAudit(
      user.id,
      "DELETE_NOTIFICATION_RECIPIENT",
      "SETTINGS",
      `Failed to delete notification recipient: ${id}`,
      { recipientId: id },
      false,
      errorMessage,
      ipAddress ?? undefined,
      userAgent ?? undefined
    );
    throw error;
  }
});

// ============================================
// Data Export Routes
// ============================================

/**
 * POST /api/admin/settings/exports
 * Generate a full database export (JSON) with schema version
 * Also supports POST /api/admin/settings/export for backwards compatibility
 */
settingsRouter.post("/exports", async (c) => {
  const user = c.get("user");
  const ipAddress = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null;
  const userAgent = c.req.header("user-agent") || null;

  try {
    // Fetch all data from relevant tables
    const [units, users, tenancies, invoices, checklistItems, inspections, buildingInfos] = await Promise.all([
      prisma.unit.findMany({
        include: {
          property: true,
        },
      }),
      prisma.user.findMany({
        where: { role: "TENANT" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          insuranceStatus: true,
          insuranceProvider: true,
          insuranceExpiresAt: true,
        },
      }),
      prisma.tenancy.findMany({
        include: {
          unit: {
            select: { id: true, unitLabel: true },
          },
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.invoice.findMany({
        include: {
          unit: {
            select: { id: true, unitLabel: true },
          },
          tenancy: {
            select: { id: true },
          },
        },
      }),
      prisma.checklistItem.findMany({
        include: {
          tenancy: {
            select: { id: true },
          },
        },
      }),
      prisma.inspection.findMany({
        include: {
          items: {
            include: {
              photos: true,
            },
          },
          tenancy: {
            select: { id: true },
          },
        },
      }),
      prisma.buildingInfo.findMany(),
    ]);

    const exportData = {
      schemaVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      exportedBy: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      recordCounts: {
        units: units.length,
        tenants: users.length,
        tenancies: tenancies.length,
        invoices: invoices.length,
        checklistItems: checklistItems.length,
        inspections: inspections.length,
        buildingInfos: buildingInfos.length,
      },
      data: {
        units: units.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
          updatedAt: u.updatedAt.toISOString(),
          property: u.property
            ? {
                ...u.property,
                createdAt: u.property.createdAt.toISOString(),
                updatedAt: u.property.updatedAt.toISOString(),
              }
            : null,
        })),
        tenants: users.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
          updatedAt: u.updatedAt.toISOString(),
          insuranceExpiresAt: u.insuranceExpiresAt?.toISOString() ?? null,
        })),
        tenancies: tenancies.map((t) => ({
          ...t,
          startDate: t.startDate.toISOString(),
          endDate: t.endDate?.toISOString() ?? null,
          moveOutDate: t.moveOutDate?.toISOString() ?? null,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        })),
        invoices: invoices.map((i) => ({
          ...i,
          dueDate: i.dueDate.toISOString(),
          createdAt: i.createdAt.toISOString(),
          updatedAt: i.updatedAt.toISOString(),
          etransferMarkedAt: i.etransferMarkedAt?.toISOString() ?? null,
        })),
        checklistItems: checklistItems.map((ci) => ({
          ...ci,
          completedAt: ci.completedAt?.toISOString() ?? null,
          createdAt: ci.createdAt.toISOString(),
          updatedAt: ci.updatedAt.toISOString(),
        })),
        inspections: inspections.map((insp) => ({
          ...insp,
          finalizedAt: insp.finalizedAt?.toISOString() ?? null,
          createdAt: insp.createdAt.toISOString(),
          updatedAt: insp.updatedAt.toISOString(),
          items: insp.items.map((item) => ({
            ...item,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
            photos: item.photos.map((photo) => ({
              ...photo,
              uploadedAt: photo.uploadedAt.toISOString(),
            })),
          })),
        })),
        buildingInfos: buildingInfos.map((bi) => ({
          ...bi,
          updatedAt: bi.updatedAt.toISOString(),
        })),
      },
    };

    const exportJson = JSON.stringify(exportData, null, 2);
    const fileSize = Buffer.byteLength(exportJson, "utf8");
    const filename = `export_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

    // Store export record
    const exportRecord = await prisma.dataExport.create({
      data: {
        adminUserId: user.id,
        exportType: "FULL_BACKUP",
        schemaVersion: APP_VERSION,
        filename,
        fileSize,
        recordCounts: JSON.stringify(exportData.recordCounts),
        status: "COMPLETED",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    // Log the action
    await logSystemAudit(
      user.id,
      "EXPORT_DATA",
      "DATA_GOVERNANCE",
      `Generated full database export: ${filename}`,
      { exportId: exportRecord.id, recordCounts: exportData.recordCounts, fileSize },
      true,
      undefined,
      ipAddress ?? undefined,
      userAgent ?? undefined
    );

    return c.json({
      data: {
        id: exportRecord.id,
        filename,
        fileSize,
        schemaVersion: APP_VERSION,
        recordCounts: exportData.recordCounts,
        exportedAt: exportData.exportedAt,
        content: exportJson,
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await logSystemAudit(
      user.id,
      "EXPORT_DATA",
      "DATA_GOVERNANCE",
      "Failed to generate database export",
      {},
      false,
      errorMessage,
      ipAddress ?? undefined,
      userAgent ?? undefined
    );
    throw error;
  }
});

/**
 * GET /api/admin/settings/exports
 * List past exports
 */
settingsRouter.get("/exports", async (c) => {
  const exports = await prisma.dataExport.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return c.json({
    data: exports.map((e) => ({
      id: e.id,
      exportType: e.exportType,
      schemaVersion: e.schemaVersion,
      filename: e.filename,
      fileSize: e.fileSize,
      recordCounts: JSON.parse(e.recordCounts),
      status: e.status,
      downloadedAt: e.downloadedAt?.toISOString() ?? null,
      expiresAt: e.expiresAt.toISOString(),
      createdAt: e.createdAt.toISOString(),
    })),
  });
});

/**
 * GET /api/admin/settings/exports/:id/download
 * Download an export file (regenerates the export)
 */
settingsRouter.get("/exports/:id/download", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const ipAddress = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null;
  const userAgent = c.req.header("user-agent") || null;

  const exportRecord = await prisma.dataExport.findUnique({
    where: { id },
  });

  if (!exportRecord) {
    return c.json({ error: { message: "Export not found", code: "NOT_FOUND" } }, 404);
  }

  if (new Date() > exportRecord.expiresAt) {
    return c.json({ error: { message: "Export has expired", code: "EXPIRED" } }, 410);
  }

  // Regenerate the export data (same as POST /export but without creating a new record)
  const [units, users, tenancies, invoices, checklistItems, inspections, buildingInfos] = await Promise.all([
    prisma.unit.findMany({ include: { property: true } }),
    prisma.user.findMany({
      where: { role: "TENANT" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        insuranceStatus: true,
        insuranceProvider: true,
        insuranceExpiresAt: true,
      },
    }),
    prisma.tenancy.findMany({
      include: {
        unit: { select: { id: true, unitLabel: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.invoice.findMany({
      include: {
        unit: { select: { id: true, unitLabel: true } },
        tenancy: { select: { id: true } },
      },
    }),
    prisma.checklistItem.findMany({ include: { tenancy: { select: { id: true } } } }),
    prisma.inspection.findMany({
      include: {
        items: { include: { photos: true } },
        tenancy: { select: { id: true } },
      },
    }),
    prisma.buildingInfo.findMany(),
  ]);

  const exportData = {
    schemaVersion: exportRecord.schemaVersion,
    exportedAt: exportRecord.createdAt.toISOString(),
    recordCounts: JSON.parse(exportRecord.recordCounts),
    data: {
      units: units.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
        property: u.property
          ? {
              ...u.property,
              createdAt: u.property.createdAt.toISOString(),
              updatedAt: u.property.updatedAt.toISOString(),
            }
          : null,
      })),
      tenants: users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
        insuranceExpiresAt: u.insuranceExpiresAt?.toISOString() ?? null,
      })),
      tenancies: tenancies.map((t) => ({
        ...t,
        startDate: t.startDate.toISOString(),
        endDate: t.endDate?.toISOString() ?? null,
        moveOutDate: t.moveOutDate?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      invoices: invoices.map((i) => ({
        ...i,
        dueDate: i.dueDate.toISOString(),
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
        etransferMarkedAt: i.etransferMarkedAt?.toISOString() ?? null,
      })),
      checklistItems: checklistItems.map((ci) => ({
        ...ci,
        completedAt: ci.completedAt?.toISOString() ?? null,
        createdAt: ci.createdAt.toISOString(),
        updatedAt: ci.updatedAt.toISOString(),
      })),
      inspections: inspections.map((insp) => ({
        ...insp,
        finalizedAt: insp.finalizedAt?.toISOString() ?? null,
        createdAt: insp.createdAt.toISOString(),
        updatedAt: insp.updatedAt.toISOString(),
        items: insp.items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
          photos: item.photos.map((photo) => ({
            ...photo,
            uploadedAt: photo.uploadedAt.toISOString(),
          })),
        })),
      })),
      buildingInfos: buildingInfos.map((bi) => ({
        ...bi,
        updatedAt: bi.updatedAt.toISOString(),
      })),
    },
  };

  // Update download timestamp
  await prisma.dataExport.update({
    where: { id },
    data: { downloadedAt: new Date() },
  });

  // Log the download
  await logSystemAudit(
    user.id,
    "DOWNLOAD_EXPORT",
    "DATA_GOVERNANCE",
    `Downloaded export: ${exportRecord.filename}`,
    { exportId: id },
    true,
    undefined,
    ipAddress ?? undefined,
    userAgent ?? undefined
  );

  return c.json({
    data: {
      id: exportRecord.id,
      filename: exportRecord.filename,
      content: JSON.stringify(exportData, null, 2),
    },
  });
});

// ============================================
// Data Import Routes
// ============================================

// Store validation tokens temporarily (in memory - in production use Redis/DB)
const validationTokens = new Map<string, { hash: string; expiresAt: Date }>();

// ============================================
// Helper Functions for Change Detection
// ============================================

// Fields to ignore when comparing records (metadata)
const IGNORE_FIELDS = ['id', 'createdAt', 'updatedAt', 'createdById', 'updatedById'];

function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim();
  if (value instanceof Date) return value.toISOString().split('T')[0]; // Normalize to date only
  // Check for date strings
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.split('T')[0]; // Normalize date strings to date only
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    // Recursively normalize object values
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!IGNORE_FIELDS.includes(k)) {
        normalized[k] = normalizeValue(v);
      }
    }
    return normalized;
  }
  return value;
}

interface ChangePreviewEntry<T> {
  creates: Array<{ data: T }>;
  updates: Array<{
    id: string;
    identifier: string;
    before: Partial<T>;
    after: Partial<T>;
    changedFields: string[];
  }>;
  unchangedCount: number;
}

function getChangedFields(before: Record<string, unknown>, after: Record<string, unknown>, fieldsToCompare: string[]): string[] {
  const changedFields: string[] = [];
  for (const field of fieldsToCompare) {
    if (IGNORE_FIELDS.includes(field)) continue;
    const beforeVal = normalizeValue(before[field]);
    const afterVal = normalizeValue(after[field]);
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      changedFields.push(field);
    }
  }
  return changedFields;
}

function pickFields<T extends Record<string, unknown>>(obj: T, fields: string[]): Partial<T> {
  const result: Partial<T> = {};
  for (const field of fields) {
    if (field in obj) {
      result[field as keyof T] = obj[field] as T[keyof T];
    }
  }
  return result;
}

/**
 * POST /api/admin/settings/imports/validate
 * Validate an import file before applying
 * Returns detailed change preview for each entity type
 */
settingsRouter.post(
  "/imports/validate",
  zValidator("json", ImportValidationSchema),
  async (c) => {
    const user = c.get("user");
    const { content: importDataString } = c.req.valid("json");
    const ipAddress = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null;
    const userAgent = c.req.header("user-agent") || null;

    try {
      const importData = JSON.parse(importDataString);

      // Validate schema version
      if (!importData.schemaVersion) {
        return c.json({
          data: {
            valid: false,
            errors: ["Missing schema version in import file"],
          },
        });
      }

      // Check schema compatibility
      const [importMajor] = importData.schemaVersion.split(".");
      const [currentMajor] = APP_VERSION.split(".");
      if (importMajor !== currentMajor) {
        return c.json({
          data: {
            valid: false,
            errors: [`Incompatible schema version. Import: ${importData.schemaVersion}, Current: ${APP_VERSION}`],
          },
        });
      }

      // Validate required data sections
      const requiredSections = ["units", "tenants", "tenancies", "invoices", "checklistItems", "inspections", "buildingInfos"];
      const missingSections = requiredSections.filter((section) => !importData.data?.[section]);
      if (missingSections.length > 0) {
        return c.json({
          data: {
            valid: false,
            errors: [`Missing data sections: ${missingSections.join(", ")}`],
          },
        });
      }

      // ============================================
      // Calculate Change Preview for Each Entity Type
      // ============================================

      // Fetch current database state for comparison
      const [
        currentUnits,
        currentTenants,
        currentTenancies,
        currentInvoices,
        currentChecklistItems,
        currentInspections,
        currentBuildingInfos,
      ] = await Promise.all([
        prisma.unit.findMany({
          include: { property: true },
        }),
        prisma.user.findMany({
          where: { role: "TENANT" },
        }),
        prisma.tenancy.findMany(),
        prisma.invoice.findMany(),
        prisma.checklistItem.findMany(),
        prisma.inspection.findMany(),
        prisma.buildingInfo.findMany(),
      ]);

      // Import data
      const importUnits = importData.data.units || [];
      const importTenants = importData.data.tenants || [];
      const importTenancies = importData.data.tenancies || [];
      const importInvoices = importData.data.invoices || [];
      const importChecklistItems = importData.data.checklistItems || [];
      const importInspections = importData.data.inspections || [];
      const importBuildingInfos = importData.data.buildingInfos || [];

      // ============================================
      // 1. BuildingInfos - Match by buildingName
      // ============================================
      const buildingInfoPreview: ChangePreviewEntry<Record<string, unknown>> = {
        creates: [],
        updates: [],
        unchangedCount: 0,
      };

      const buildingInfoFieldsToCompare = ["parkingRules", "garbageSchedule", "garbageScheduleStructured", "quietHours", "emergencyContacts", "customNotes"];
      const existingBuildingInfoMap = new Map(currentBuildingInfos.map(bi => [bi.buildingName, bi]));

      for (const importBi of importBuildingInfos) {
        const existing = existingBuildingInfoMap.get(importBi.buildingName);
        if (!existing) {
          buildingInfoPreview.creates.push({ data: importBi });
        } else {
          const changedFields = getChangedFields(
            existing as unknown as Record<string, unknown>,
            importBi,
            buildingInfoFieldsToCompare
          );
          if (changedFields.length > 0) {
            buildingInfoPreview.updates.push({
              id: existing.id,
              identifier: importBi.buildingName,
              before: pickFields(existing as unknown as Record<string, unknown>, changedFields),
              after: pickFields(importBi, changedFields),
              changedFields,
            });
          } else {
            buildingInfoPreview.unchangedCount++;
          }
        }
      }

      // ============================================
      // 2. Units - Match by propertyId + buildingName + unitLabel
      // ============================================
      const unitPreview: ChangePreviewEntry<Record<string, unknown>> = {
        creates: [],
        updates: [],
        unchangedCount: 0,
      };

      const unitFieldsToCompare = ["rentAmountCents", "rentDueDay", "status", "description", "bedrooms", "bathrooms", "sqft"];

      // Build a map of existing units by composite key
      const existingUnitMap = new Map<string, typeof currentUnits[0]>();
      for (const unit of currentUnits) {
        const key = `${unit.propertyId}|${unit.buildingName}|${unit.unitLabel}`;
        existingUnitMap.set(key, unit);
      }

      for (const importUnit of importUnits) {
        // For import, we need to resolve the property ID if it includes property data
        let propertyId = importUnit.propertyId;
        if (importUnit.property) {
          // Try to find matching property by name+address
          const matchingProperty = await prisma.property.findFirst({
            where: {
              name: importUnit.property.name,
              address: importUnit.property.address,
            },
          });
          if (matchingProperty) {
            propertyId = matchingProperty.id;
          }
        }

        const key = `${propertyId}|${importUnit.buildingName || ""}|${importUnit.unitLabel}`;
        const existing = existingUnitMap.get(key);

        if (!existing) {
          unitPreview.creates.push({ data: importUnit });
        } else {
          const changedFields = getChangedFields(
            existing as unknown as Record<string, unknown>,
            importUnit,
            unitFieldsToCompare
          );
          if (changedFields.length > 0) {
            unitPreview.updates.push({
              id: existing.id,
              identifier: `Unit ${importUnit.unitLabel} - ${importUnit.buildingName || "No Building"}`,
              before: pickFields(existing as unknown as Record<string, unknown>, changedFields),
              after: pickFields(importUnit, changedFields),
              changedFields,
            });
          } else {
            unitPreview.unchangedCount++;
          }
        }
      }

      // ============================================
      // 3. Tenants - Match by email
      // ============================================
      const tenantPreview: ChangePreviewEntry<Record<string, unknown>> = {
        creates: [],
        updates: [],
        unchangedCount: 0,
      };

      const tenantFieldsToCompare = ["name", "phone", "status", "insuranceStatus", "insuranceProvider", "insuranceExpiresAt"];
      const existingTenantMap = new Map(currentTenants.map(t => [t.email, t]));

      for (const importTenant of importTenants) {
        const existing = existingTenantMap.get(importTenant.email);
        if (!existing) {
          tenantPreview.creates.push({ data: importTenant });
        } else {
          const changedFields = getChangedFields(
            existing as unknown as Record<string, unknown>,
            importTenant,
            tenantFieldsToCompare
          );
          if (changedFields.length > 0) {
            tenantPreview.updates.push({
              id: existing.id,
              identifier: `${importTenant.name} (${importTenant.email})`,
              before: pickFields(existing as unknown as Record<string, unknown>, changedFields),
              after: pickFields(importTenant, changedFields),
              changedFields,
            });
          } else {
            tenantPreview.unchangedCount++;
          }
        }
      }

      // ============================================
      // 4. Tenancies - Match by userId + unitId + startDate
      // ============================================
      const tenancyPreview: ChangePreviewEntry<Record<string, unknown>> = {
        creates: [],
        updates: [],
        unchangedCount: 0,
      };

      const tenancyFieldsToCompare = ["endDate", "moveOutDate", "isActive", "roleInUnit", "isLegacyMoveIn"];

      // Build tenancy map with composite key
      const existingTenancyMap = new Map<string, typeof currentTenancies[0]>();
      for (const tenancy of currentTenancies) {
        const startDateStr = tenancy.startDate.toISOString().split("T")[0];
        const key = `${tenancy.userId}|${tenancy.unitId}|${startDateStr}`;
        existingTenancyMap.set(key, tenancy);
      }

      // Create ID maps for resolving imported tenant/unit IDs
      const importTenantIdMap = new Map<string, string>();
      for (const importTenant of importTenants) {
        const existing = existingTenantMap.get(importTenant.email);
        if (existing) {
          importTenantIdMap.set(importTenant.id, existing.id);
        }
      }

      const importUnitIdMap = new Map<string, string>();
      for (const importUnit of importUnits) {
        let propertyId = importUnit.propertyId;
        if (importUnit.property) {
          const matchingProperty = await prisma.property.findFirst({
            where: { name: importUnit.property.name, address: importUnit.property.address },
          });
          if (matchingProperty) propertyId = matchingProperty.id;
        }
        const key = `${propertyId}|${importUnit.buildingName || ""}|${importUnit.unitLabel}`;
        const existingUnit = existingUnitMap.get(key);
        if (existingUnit) {
          importUnitIdMap.set(importUnit.id, existingUnit.id);
        }
      }

      for (const importTenancy of importTenancies) {
        const mappedUserId = importTenantIdMap.get(importTenancy.userId) || importTenancy.userId;
        const mappedUnitId = importUnitIdMap.get(importTenancy.unitId) || importTenancy.unitId;
        const startDateStr = new Date(importTenancy.startDate).toISOString().split("T")[0];
        const key = `${mappedUserId}|${mappedUnitId}|${startDateStr}`;

        const existing = existingTenancyMap.get(key);
        if (!existing) {
          tenancyPreview.creates.push({ data: importTenancy });
        } else {
          const changedFields = getChangedFields(
            {
              ...existing,
              endDate: existing.endDate?.toISOString() ?? null,
              moveOutDate: existing.moveOutDate?.toISOString() ?? null,
            } as unknown as Record<string, unknown>,
            importTenancy,
            tenancyFieldsToCompare
          );
          if (changedFields.length > 0) {
            // Find tenant and unit names for identifier
            const tenant = importTenants.find((t: { id: string }) => t.id === importTenancy.userId);
            const unit = importUnits.find((u: { id: string }) => u.id === importTenancy.unitId);
            tenancyPreview.updates.push({
              id: existing.id,
              identifier: `${tenant?.name || "Unknown Tenant"} at ${unit?.unitLabel || "Unknown Unit"} (${startDateStr})`,
              before: pickFields(existing as unknown as Record<string, unknown>, changedFields),
              after: pickFields(importTenancy, changedFields),
              changedFields,
            });
          } else {
            tenancyPreview.unchangedCount++;
          }
        }
      }

      // ============================================
      // 5. Invoices - Match by unitId + tenancyId + periodMonth + invoiceType
      // ============================================
      const invoicePreview: ChangePreviewEntry<Record<string, unknown>> = {
        creates: [],
        updates: [],
        unchangedCount: 0,
      };

      const invoiceFieldsToCompare = ["dueDate", "amountCents", "status", "chargeCategory", "description", "paymentMethod", "etransferStatus"];

      // Create tenancy ID map
      const importTenancyIdMap = new Map<string, string>();
      for (const importTenancy of importTenancies) {
        const mappedUserId = importTenantIdMap.get(importTenancy.userId) || importTenancy.userId;
        const mappedUnitId = importUnitIdMap.get(importTenancy.unitId) || importTenancy.unitId;
        const startDateStr = new Date(importTenancy.startDate).toISOString().split("T")[0];
        const key = `${mappedUserId}|${mappedUnitId}|${startDateStr}`;
        const existingTenancy = existingTenancyMap.get(key);
        if (existingTenancy) {
          importTenancyIdMap.set(importTenancy.id, existingTenancy.id);
        }
      }

      // Build invoice map
      const existingInvoiceMap = new Map<string, typeof currentInvoices[0]>();
      for (const invoice of currentInvoices) {
        const key = `${invoice.unitId}|${invoice.tenancyId}|${invoice.periodMonth}|${invoice.invoiceType}`;
        existingInvoiceMap.set(key, invoice);
      }

      for (const importInvoice of importInvoices) {
        const mappedUnitId = importUnitIdMap.get(importInvoice.unitId) || importInvoice.unitId;
        const mappedTenancyId = importTenancyIdMap.get(importInvoice.tenancyId) || importInvoice.tenancyId;
        const invoiceType = importInvoice.invoiceType || "RENT";
        const key = `${mappedUnitId}|${mappedTenancyId}|${importInvoice.periodMonth}|${invoiceType}`;

        const existing = existingInvoiceMap.get(key);
        if (!existing) {
          invoicePreview.creates.push({ data: importInvoice });
        } else {
          const changedFields = getChangedFields(
            {
              ...existing,
              dueDate: existing.dueDate.toISOString(),
            } as unknown as Record<string, unknown>,
            importInvoice,
            invoiceFieldsToCompare
          );
          if (changedFields.length > 0) {
            invoicePreview.updates.push({
              id: existing.id,
              identifier: `Invoice ${importInvoice.periodMonth} (${invoiceType})`,
              before: pickFields(existing as unknown as Record<string, unknown>, changedFields),
              after: pickFields(importInvoice, changedFields),
              changedFields,
            });
          } else {
            invoicePreview.unchangedCount++;
          }
        }
      }

      // ============================================
      // 6. ChecklistItems - Match by tenancyId + itemType + checklistType
      // ============================================
      const checklistItemPreview: ChangePreviewEntry<Record<string, unknown>> = {
        creates: [],
        updates: [],
        unchangedCount: 0,
      };

      const checklistItemFieldsToCompare = ["title", "description", "isRequired", "isCompleted", "completedAt", "sortOrder"];

      // Build checklist item map
      const existingChecklistItemMap = new Map<string, typeof currentChecklistItems[0]>();
      for (const item of currentChecklistItems) {
        const checklistType = item.checklistType || "MOVE_IN";
        const key = `${item.tenancyId}|${item.itemType}|${checklistType}`;
        existingChecklistItemMap.set(key, item);
      }

      for (const importItem of importChecklistItems) {
        const mappedTenancyId = importTenancyIdMap.get(importItem.tenancyId) || importItem.tenancyId;
        const checklistType = importItem.checklistType || "MOVE_IN";
        const key = `${mappedTenancyId}|${importItem.itemType}|${checklistType}`;

        const existing = existingChecklistItemMap.get(key);
        if (!existing) {
          checklistItemPreview.creates.push({ data: importItem });
        } else {
          const changedFields = getChangedFields(
            {
              ...existing,
              completedAt: existing.completedAt?.toISOString() ?? null,
            } as unknown as Record<string, unknown>,
            importItem,
            checklistItemFieldsToCompare
          );
          if (changedFields.length > 0) {
            checklistItemPreview.updates.push({
              id: existing.id,
              identifier: `${importItem.title} (${checklistType})`,
              before: pickFields(existing as unknown as Record<string, unknown>, changedFields),
              after: pickFields(importItem, changedFields),
              changedFields,
            });
          } else {
            checklistItemPreview.unchangedCount++;
          }
        }
      }

      // ============================================
      // 7. Inspections - Match by tenancyId + inspectionType
      // ============================================
      const inspectionPreview: ChangePreviewEntry<Record<string, unknown>> = {
        creates: [],
        updates: [],
        unchangedCount: 0,
      };

      const inspectionFieldsToCompare = ["status", "isFinalized", "notes", "damageNotes", "damageFound", "keysReturned"];

      // Build inspection map
      const existingInspectionMap = new Map<string, typeof currentInspections[0]>();
      for (const inspection of currentInspections) {
        const key = `${inspection.tenancyId}|${inspection.inspectionType}`;
        existingInspectionMap.set(key, inspection);
      }

      for (const importInspection of importInspections) {
        const mappedTenancyId = importTenancyIdMap.get(importInspection.tenancyId) || importInspection.tenancyId;
        const key = `${mappedTenancyId}|${importInspection.inspectionType}`;

        const existing = existingInspectionMap.get(key);
        if (!existing) {
          inspectionPreview.creates.push({ data: importInspection });
        } else {
          const changedFields = getChangedFields(
            existing as unknown as Record<string, unknown>,
            importInspection,
            inspectionFieldsToCompare
          );
          if (changedFields.length > 0) {
            // Find tenancy info for identifier
            const tenancy = importTenancies.find((t: { id: string }) => t.id === importInspection.tenancyId);
            const tenant = tenancy ? importTenants.find((t: { id: string }) => t.id === tenancy.userId) : null;
            const unit = tenancy ? importUnits.find((u: { id: string }) => u.id === tenancy.unitId) : null;
            inspectionPreview.updates.push({
              id: existing.id,
              identifier: `${importInspection.inspectionType} Inspection - ${tenant?.name || "Unknown"} at ${unit?.unitLabel || "Unknown"}`,
              before: pickFields(existing as unknown as Record<string, unknown>, changedFields),
              after: pickFields(importInspection, changedFields),
              changedFields,
            });
          } else {
            inspectionPreview.unchangedCount++;
          }
        }
      }

      // ============================================
      // Assemble change preview
      // ============================================
      const changePreview = {
        units: unitPreview,
        tenants: tenantPreview,
        tenancies: tenancyPreview,
        invoices: invoicePreview,
        checklistItems: checklistItemPreview,
        inspections: inspectionPreview,
        buildingInfos: buildingInfoPreview,
      };

      // Generate confirmation token
      const token = crypto.randomBytes(32).toString("hex");
      const dataHash = crypto.createHash("sha256").update(importDataString).digest("hex");

      // Store token with 15 minute expiry
      validationTokens.set(token, {
        hash: dataHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      // Clean up expired tokens
      for (const [key, value] of validationTokens.entries()) {
        if (new Date() > value.expiresAt) {
          validationTokens.delete(key);
        }
      }

      // Generate warnings based on change preview
      const warnings: string[] = [];

      const totalCreates =
        changePreview.units.creates.length +
        changePreview.tenants.creates.length +
        changePreview.tenancies.creates.length +
        changePreview.invoices.creates.length +
        changePreview.checklistItems.creates.length +
        changePreview.inspections.creates.length +
        changePreview.buildingInfos.creates.length;

      const totalUpdates =
        changePreview.units.updates.length +
        changePreview.tenants.updates.length +
        changePreview.tenancies.updates.length +
        changePreview.invoices.updates.length +
        changePreview.checklistItems.updates.length +
        changePreview.inspections.updates.length +
        changePreview.buildingInfos.updates.length;

      if (totalCreates > 0 || totalUpdates > 0) {
        warnings.push(`This import will create ${totalCreates} new records and update ${totalUpdates} existing records.`);
      }

      if (changePreview.tenants.creates.length > 0) {
        warnings.push(`${changePreview.tenants.creates.length} new tenant(s) will be created without login credentials.`);
      }

      if (changePreview.invoices.updates.length > 0) {
        warnings.push(`${changePreview.invoices.updates.length} invoice(s) will be modified. Review payment status changes carefully.`);
      }

      warnings.push("Make sure you have a backup before proceeding with the import.");

      // Log validation
      await logSystemAudit(
        user.id,
        "VALIDATE_IMPORT",
        "DATA_GOVERNANCE",
        "Validated import file with change preview",
        {
          schemaVersion: importData.schemaVersion,
          recordCounts: importData.recordCounts,
          changePreviewSummary: {
            creates: totalCreates,
            updates: totalUpdates,
          },
        },
        true,
        undefined,
        ipAddress ?? undefined,
        userAgent ?? undefined
      );

      return c.json({
        data: {
          valid: true,
          confirmationToken: token,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          schemaVersion: importData.schemaVersion,
          recordCounts: importData.recordCounts,
          warnings,
          changePreview,
        },
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({
        data: {
          valid: false,
          errors: [`Failed to parse import file: ${errorMessage}`],
        },
      });
    }
  }
);

/**
 * POST /api/admin/settings/imports/confirm
 * Import data with schema validation (requires confirmation token)
 *
 * Full implementation with:
 * - Transactional integrity (all-or-nothing)
 * - Schema version compatibility checking
 * - Upsert logic based on unique identifiers
 * - Relational mapping (old IDs to new IDs)
 * - Detailed feedback with counts
 */
settingsRouter.post(
  "/imports/confirm",
  zValidator("json", ImportConfirmSchema),
  async (c) => {
    const user = c.get("user");
    const { content: importDataString, confirmationToken, approvedChanges } = c.req.valid("json");
    const ipAddress = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null;
    const userAgent = c.req.header("user-agent") || null;

    // Validate confirmation token
    const storedToken = validationTokens.get(confirmationToken);
    if (!storedToken) {
      return c.json({ error: { message: "Invalid or expired confirmation token", code: "INVALID_TOKEN" } }, 400);
    }

    if (new Date() > storedToken.expiresAt) {
      validationTokens.delete(confirmationToken);
      return c.json({ error: { message: "Confirmation token has expired", code: "TOKEN_EXPIRED" } }, 400);
    }

    // Verify data hasn't changed since validation
    const dataHash = crypto.createHash("sha256").update(importDataString).digest("hex");
    if (dataHash !== storedToken.hash) {
      return c.json({ error: { message: "Import data has changed since validation", code: "DATA_MISMATCH" } }, 400);
    }

    // Remove used token
    validationTokens.delete(confirmationToken);

    // Summary counters - now includes skipped counts
    const summary = {
      units: { created: 0, updated: 0, skipped: 0 },
      tenants: { created: 0, updated: 0, skipped: 0 },
      tenancies: { created: 0, updated: 0, skipped: 0 },
      invoices: { created: 0, updated: 0, skipped: 0 },
      checklistItems: { created: 0, updated: 0, skipped: 0 },
      inspections: { created: 0, updated: 0, skipped: 0 },
      buildingInfos: { created: 0, updated: 0, skipped: 0 },
    };

    // Helper function to check if a create at index is approved
    const isCreateApproved = (entityType: keyof typeof summary, index: number): boolean => {
      if (!approvedChanges) return true; // No filter = import all
      const entityApproved = approvedChanges[entityType];
      return entityApproved.creates.includes(index);
    };

    // Helper function to check if an update for ID is approved
    const isUpdateApproved = (entityType: keyof typeof summary, id: string): boolean => {
      if (!approvedChanges) return true; // No filter = import all
      const entityApproved = approvedChanges[entityType];
      return entityApproved.updates.includes(id);
    };

    // ID mapping: old ID -> new ID
    const unitIdMap = new Map<string, string>();
    const userIdMap = new Map<string, string>();
    const tenancyIdMap = new Map<string, string>();

    try {
      const importData = JSON.parse(importDataString);

      // Schema version compatibility check
      const importSchemaVersion = importData.schemaVersion || "1.0.0";
      const [importMajor, importMinor] = importSchemaVersion.split(".").map(Number);
      const [currentMajor] = APP_VERSION.split(".").map(Number);

      if (importMajor !== currentMajor) {
        return c.json({
          error: {
            message: `Incompatible schema version. Import version ${importSchemaVersion} is not compatible with current version ${APP_VERSION}`,
            code: "SCHEMA_INCOMPATIBLE",
          },
        }, 400);
      }

      // Handle 1.x schema migrations if needed
      let migratedData = importData.data;
      if (importMajor === 1 && importMinor < 0) {
        // Future: Add migration logic for older 1.x versions
        // For now, 1.0.0 is the baseline
      }

      // Log import start
      await logSystemAudit(
        user.id,
        "IMPORT_DATA_START",
        "DATA_GOVERNANCE",
        "Starting data import",
        {
          schemaVersion: importSchemaVersion,
          recordCounts: importData.recordCounts,
        },
        true,
        undefined,
        ipAddress ?? undefined,
        userAgent ?? undefined
      );

      // Execute the entire import in a transaction
      await prisma.$transaction(async (tx) => {
        // ============================================
        // 1. Import BuildingInfos
        // ============================================
        const buildingInfos = migratedData.buildingInfos || [];
        let buildingInfoCreateIndex = 0;
        for (const bi of buildingInfos) {
          try {
            const existing = await tx.buildingInfo.findUnique({
              where: { buildingName: bi.buildingName },
            });

            if (existing) {
              // Check if this update is approved
              if (!isUpdateApproved("buildingInfos", existing.id)) {
                summary.buildingInfos.skipped++;
                continue;
              }
              await tx.buildingInfo.update({
                where: { buildingName: bi.buildingName },
                data: {
                  parkingRules: bi.parkingRules ?? null,
                  garbageSchedule: bi.garbageSchedule ?? null,
                  garbageScheduleStructured: bi.garbageScheduleStructured ?? null,
                  quietHours: bi.quietHours ?? null,
                  emergencyContacts: bi.emergencyContacts ?? null,
                  customNotes: bi.customNotes ?? null,
                  updatedById: user.id,
                },
              });
              summary.buildingInfos.updated++;
            } else {
              // Check if this create is approved
              if (!isCreateApproved("buildingInfos", buildingInfoCreateIndex)) {
                summary.buildingInfos.skipped++;
                buildingInfoCreateIndex++;
                continue;
              }
              await tx.buildingInfo.create({
                data: {
                  buildingName: bi.buildingName,
                  parkingRules: bi.parkingRules ?? null,
                  garbageSchedule: bi.garbageSchedule ?? null,
                  garbageScheduleStructured: bi.garbageScheduleStructured ?? null,
                  quietHours: bi.quietHours ?? null,
                  emergencyContacts: bi.emergencyContacts ?? null,
                  customNotes: bi.customNotes ?? null,
                  updatedById: user.id,
                },
              });
              summary.buildingInfos.created++;
              buildingInfoCreateIndex++;
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Unknown error";
            throw new Error(`Failed to import BuildingInfo "${bi.buildingName}": ${errMsg}`);
          }
        }

        // ============================================
        // 2. Import Units (need property first)
        // ============================================
        const units = migratedData.units || [];
        let unitCreateIndex = 0;
        for (const unit of units) {
          try {
            // Get or create property
            let propertyId = unit.propertyId;
            if (unit.property) {
              const existingProperty = await tx.property.findFirst({
                where: {
                  name: unit.property.name,
                  address: unit.property.address,
                },
              });

              if (existingProperty) {
                propertyId = existingProperty.id;
              } else {
                const newProperty = await tx.property.create({
                  data: {
                    name: unit.property.name,
                    address: unit.property.address,
                    city: unit.property.city || "",
                    province: unit.property.province || "",
                    postalCode: unit.property.postalCode || "",
                    heroImageUrl: unit.property.heroImageUrl ?? null,
                    marketingCopyOverview: unit.property.marketingCopyOverview ?? null,
                    marketingCopyNeighborhood: unit.property.marketingCopyNeighborhood ?? null,
                  },
                });
                propertyId = newProperty.id;
              }
            }

            // Find existing unit by buildingName + unitLabel within property
            const existingUnit = await tx.unit.findFirst({
              where: {
                propertyId,
                buildingName: unit.buildingName || "",
                unitLabel: unit.unitLabel,
              },
            });

            if (existingUnit) {
              // Check if this update is approved
              if (!isUpdateApproved("units", existingUnit.id)) {
                unitIdMap.set(unit.id, existingUnit.id); // Still map ID for dependent records
                summary.units.skipped++;
                continue;
              }
              await tx.unit.update({
                where: { id: existingUnit.id },
                data: {
                  rentAmountCents: unit.rentAmountCents ?? null,
                  rentDueDay: unit.rentDueDay ?? 1,
                  status: unit.status ?? "VACANT",
                  description: unit.description ?? null,
                  bedrooms: unit.bedrooms ?? null,
                  bathrooms: unit.bathrooms ?? null,
                  sqft: unit.sqft ?? null,
                },
              });
              unitIdMap.set(unit.id, existingUnit.id);
              summary.units.updated++;
            } else {
              // Check if this create is approved
              if (!isCreateApproved("units", unitCreateIndex)) {
                summary.units.skipped++;
                unitCreateIndex++;
                continue;
              }
              const newUnit = await tx.unit.create({
                data: {
                  propertyId,
                  buildingName: unit.buildingName || "",
                  unitLabel: unit.unitLabel,
                  rentAmountCents: unit.rentAmountCents ?? null,
                  rentDueDay: unit.rentDueDay ?? 1,
                  status: unit.status ?? "VACANT",
                  description: unit.description ?? null,
                  bedrooms: unit.bedrooms ?? null,
                  bathrooms: unit.bathrooms ?? null,
                  sqft: unit.sqft ?? null,
                },
              });
              unitIdMap.set(unit.id, newUnit.id);
              summary.units.created++;
              unitCreateIndex++;
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Unknown error";
            throw new Error(`Failed to import Unit "${unit.unitLabel}" (${unit.buildingName}): ${errMsg}`);
          }
        }

        // ============================================
        // 3. Import Tenants (Users with role TENANT)
        // ============================================
        const tenants = migratedData.tenants || [];
        let tenantCreateIndex = 0;
        for (const tenant of tenants) {
          try {
            // Find existing user by email
            const existingUser = await tx.user.findUnique({
              where: { email: tenant.email },
            });

            if (existingUser) {
              // Check if this update is approved
              if (!isUpdateApproved("tenants", existingUser.id)) {
                userIdMap.set(tenant.id, existingUser.id); // Still map ID for dependent records
                summary.tenants.skipped++;
                continue;
              }
              await tx.user.update({
                where: { email: tenant.email },
                data: {
                  name: tenant.name,
                  phone: tenant.phone ?? null,
                  status: tenant.status ?? "ACTIVE",
                  insuranceStatus: tenant.insuranceStatus ?? null,
                  insuranceProvider: tenant.insuranceProvider ?? null,
                  insuranceExpiresAt: tenant.insuranceExpiresAt ? new Date(tenant.insuranceExpiresAt) : null,
                },
              });
              userIdMap.set(tenant.id, existingUser.id);
              summary.tenants.updated++;
            } else {
              // Check if this create is approved
              if (!isCreateApproved("tenants", tenantCreateIndex)) {
                summary.tenants.skipped++;
                tenantCreateIndex++;
                continue;
              }
              // Create new user with a generated ID
              const newUser = await tx.user.create({
                data: {
                  id: crypto.randomUUID(),
                  name: tenant.name,
                  email: tenant.email,
                  phone: tenant.phone ?? null,
                  role: "TENANT",
                  status: tenant.status ?? "ACTIVE",
                  insuranceStatus: tenant.insuranceStatus ?? null,
                  insuranceProvider: tenant.insuranceProvider ?? null,
                  insuranceExpiresAt: tenant.insuranceExpiresAt ? new Date(tenant.insuranceExpiresAt) : null,
                },
              });
              userIdMap.set(tenant.id, newUser.id);
              summary.tenants.created++;
              tenantCreateIndex++;
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Unknown error";
            throw new Error(`Failed to import Tenant "${tenant.email}": ${errMsg}`);
          }
        }

        // ============================================
        // 4. Import Tenancies
        // ============================================
        const tenancies = migratedData.tenancies || [];
        let tenancyCreateIndex = 0;
        for (const tenancy of tenancies) {
          try {
            // Map user and unit IDs
            const mappedUserId = userIdMap.get(tenancy.userId) || tenancy.userId;
            const mappedUnitId = unitIdMap.get(tenancy.unitId) || tenancy.unitId;

            // Verify mapped IDs exist
            const userExists = await tx.user.findUnique({ where: { id: mappedUserId } });
            const unitExists = await tx.unit.findUnique({ where: { id: mappedUnitId } });

            if (!userExists) {
              throw new Error(`User with ID ${mappedUserId} not found`);
            }
            if (!unitExists) {
              throw new Error(`Unit with ID ${mappedUnitId} not found`);
            }

            // Find existing tenancy by userId + unitId + startDate
            const startDate = new Date(tenancy.startDate);
            const existingTenancy = await tx.tenancy.findFirst({
              where: {
                userId: mappedUserId,
                unitId: mappedUnitId,
                startDate,
              },
            });

            if (existingTenancy) {
              // Check if this update is approved
              if (!isUpdateApproved("tenancies", existingTenancy.id)) {
                tenancyIdMap.set(tenancy.id, existingTenancy.id); // Still map ID for dependent records
                summary.tenancies.skipped++;
                continue;
              }
              await tx.tenancy.update({
                where: { id: existingTenancy.id },
                data: {
                  endDate: tenancy.endDate ? new Date(tenancy.endDate) : null,
                  moveOutDate: tenancy.moveOutDate ? new Date(tenancy.moveOutDate) : null,
                  isActive: tenancy.isActive ?? true,
                  roleInUnit: tenancy.roleInUnit ?? "PRIMARY",
                  isLegacyMoveIn: tenancy.isLegacyMoveIn ?? false,
                },
              });
              tenancyIdMap.set(tenancy.id, existingTenancy.id);
              summary.tenancies.updated++;
            } else {
              // Check if this create is approved
              if (!isCreateApproved("tenancies", tenancyCreateIndex)) {
                summary.tenancies.skipped++;
                tenancyCreateIndex++;
                continue;
              }
              const newTenancy = await tx.tenancy.create({
                data: {
                  userId: mappedUserId,
                  unitId: mappedUnitId,
                  startDate,
                  endDate: tenancy.endDate ? new Date(tenancy.endDate) : null,
                  moveOutDate: tenancy.moveOutDate ? new Date(tenancy.moveOutDate) : null,
                  isActive: tenancy.isActive ?? true,
                  roleInUnit: tenancy.roleInUnit ?? "PRIMARY",
                  isLegacyMoveIn: tenancy.isLegacyMoveIn ?? false,
                },
              });
              tenancyIdMap.set(tenancy.id, newTenancy.id);
              summary.tenancies.created++;
              tenancyCreateIndex++;
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Unknown error";
            throw new Error(`Failed to import Tenancy for user ${tenancy.userId} in unit ${tenancy.unitId}: ${errMsg}`);
          }
        }

        // ============================================
        // 5. Import Invoices
        // ============================================
        const invoices = migratedData.invoices || [];
        let invoiceCreateIndex = 0;
        for (const invoice of invoices) {
          try {
            // Map unit and tenancy IDs
            const mappedUnitId = unitIdMap.get(invoice.unitId) || invoice.unitId;
            const mappedTenancyId = tenancyIdMap.get(invoice.tenancyId) || invoice.tenancyId;

            // Verify mapped IDs exist
            const unitExists = await tx.unit.findUnique({ where: { id: mappedUnitId } });
            const tenancyExists = await tx.tenancy.findUnique({ where: { id: mappedTenancyId } });

            if (!unitExists) {
              throw new Error(`Unit with ID ${mappedUnitId} not found`);
            }
            if (!tenancyExists) {
              throw new Error(`Tenancy with ID ${mappedTenancyId} not found`);
            }

            // Find existing invoice by unitId + tenancyId + periodMonth + invoiceType
            const existingInvoice = await tx.invoice.findFirst({
              where: {
                unitId: mappedUnitId,
                tenancyId: mappedTenancyId,
                periodMonth: invoice.periodMonth,
                invoiceType: invoice.invoiceType ?? "RENT",
              },
            });

            const invoiceData = {
              periodMonth: invoice.periodMonth,
              dueDate: new Date(invoice.dueDate),
              amountCents: invoice.amountCents,
              status: invoice.status ?? "OPEN",
              invoiceType: invoice.invoiceType ?? "RENT",
              chargeCategory: invoice.chargeCategory ?? null,
              description: invoice.description ?? null,
              stripeCheckoutSessionId: invoice.stripeCheckoutSessionId ?? null,
              stripePaymentIntentId: invoice.stripePaymentIntentId ?? null,
              etransferMarkedAt: invoice.etransferMarkedAt ? new Date(invoice.etransferMarkedAt) : null,
              etransferMarkedById: invoice.etransferMarkedById ?? null,
              etransferRejectReason: invoice.etransferRejectReason ?? null,
              etransferStatus: invoice.etransferStatus ?? null,
              paymentMethod: invoice.paymentMethod ?? null,
            };

            if (existingInvoice) {
              // Check if this update is approved
              if (!isUpdateApproved("invoices", existingInvoice.id)) {
                summary.invoices.skipped++;
                continue;
              }
              await tx.invoice.update({
                where: { id: existingInvoice.id },
                data: invoiceData,
              });
              summary.invoices.updated++;
            } else {
              // Check if this create is approved
              if (!isCreateApproved("invoices", invoiceCreateIndex)) {
                summary.invoices.skipped++;
                invoiceCreateIndex++;
                continue;
              }
              await tx.invoice.create({
                data: {
                  unitId: mappedUnitId,
                  tenancyId: mappedTenancyId,
                  ...invoiceData,
                },
              });
              summary.invoices.created++;
              invoiceCreateIndex++;
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Unknown error";
            throw new Error(`Failed to import Invoice for period ${invoice.periodMonth}: ${errMsg}`);
          }
        }

        // ============================================
        // 6. Import ChecklistItems
        // ============================================
        const checklistItems = migratedData.checklistItems || [];
        let checklistItemCreateIndex = 0;
        for (const item of checklistItems) {
          try {
            // Map tenancy ID
            const mappedTenancyId = tenancyIdMap.get(item.tenancyId) || item.tenancyId;

            // Verify tenancy exists
            const tenancyExists = await tx.tenancy.findUnique({ where: { id: mappedTenancyId } });
            if (!tenancyExists) {
              throw new Error(`Tenancy with ID ${mappedTenancyId} not found`);
            }

            // Find existing checklist item by tenancyId + itemType + checklistType
            const existingItem = await tx.checklistItem.findFirst({
              where: {
                tenancyId: mappedTenancyId,
                itemType: item.itemType,
                checklistType: item.checklistType ?? "MOVE_IN",
              },
            });

            const itemData = {
              itemType: item.itemType,
              title: item.title,
              description: item.description ?? null,
              isRequired: item.isRequired ?? true,
              isCompleted: item.isCompleted ?? false,
              completedAt: item.completedAt ? new Date(item.completedAt) : null,
              completedById: item.completedById ?? null,
              sortOrder: item.sortOrder ?? 0,
              checklistType: item.checklistType ?? "MOVE_IN",
            };

            if (existingItem) {
              // Check if this update is approved
              if (!isUpdateApproved("checklistItems", existingItem.id)) {
                summary.checklistItems.skipped++;
                continue;
              }
              await tx.checklistItem.update({
                where: { id: existingItem.id },
                data: itemData,
              });
              summary.checklistItems.updated++;
            } else {
              // Check if this create is approved
              if (!isCreateApproved("checklistItems", checklistItemCreateIndex)) {
                summary.checklistItems.skipped++;
                checklistItemCreateIndex++;
                continue;
              }
              await tx.checklistItem.create({
                data: {
                  tenancyId: mappedTenancyId,
                  ...itemData,
                },
              });
              summary.checklistItems.created++;
              checklistItemCreateIndex++;
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Unknown error";
            throw new Error(`Failed to import ChecklistItem "${item.title}": ${errMsg}`);
          }
        }

        // ============================================
        // 7. Import Inspections
        // ============================================
        const inspections = migratedData.inspections || [];
        let inspectionCreateIndex = 0;
        for (const inspection of inspections) {
          try {
            // Map tenancy ID
            const mappedTenancyId = tenancyIdMap.get(inspection.tenancyId) || inspection.tenancyId;

            // Verify tenancy exists
            const tenancyExists = await tx.tenancy.findUnique({ where: { id: mappedTenancyId } });
            if (!tenancyExists) {
              throw new Error(`Tenancy with ID ${mappedTenancyId} not found`);
            }

            // Find existing inspection by tenancyId + inspectionType (unique constraint)
            const existingInspection = await tx.inspection.findUnique({
              where: {
                tenancyId_inspectionType: {
                  tenancyId: mappedTenancyId,
                  inspectionType: inspection.inspectionType,
                },
              },
              include: { items: { include: { photos: true } } },
            });

            const inspectionData = {
              status: inspection.status ?? "NOT_STARTED",
              isFinalized: inspection.isFinalized ?? false,
              finalizedAt: inspection.finalizedAt ? new Date(inspection.finalizedAt) : null,
              finalizedById: inspection.finalizedById ?? null,
              notes: inspection.notes ?? null,
              damageNotes: inspection.damageNotes ?? null,
              damageFound: inspection.damageFound ?? false,
              keysReturned: inspection.keysReturned ?? false,
            };

            let inspectionId: string;

            if (existingInspection) {
              // Check if this update is approved
              if (!isUpdateApproved("inspections", existingInspection.id)) {
                summary.inspections.skipped++;
                continue;
              }
              await tx.inspection.update({
                where: { id: existingInspection.id },
                data: inspectionData,
              });
              inspectionId = existingInspection.id;

              // Delete existing items and photos to replace with imported ones
              for (const existingItem of existingInspection.items) {
                await tx.inspectionPhoto.deleteMany({
                  where: { inspectionItemId: existingItem.id },
                });
              }
              await tx.inspectionItem.deleteMany({
                where: { inspectionId: existingInspection.id },
              });

              summary.inspections.updated++;
            } else {
              // Check if this create is approved
              if (!isCreateApproved("inspections", inspectionCreateIndex)) {
                summary.inspections.skipped++;
                inspectionCreateIndex++;
                continue;
              }
              const newInspection = await tx.inspection.create({
                data: {
                  tenancyId: mappedTenancyId,
                  inspectionType: inspection.inspectionType,
                  ...inspectionData,
                },
              });
              inspectionId = newInspection.id;
              summary.inspections.created++;
              inspectionCreateIndex++;
            }

            // Import inspection items and photos
            const items = inspection.items || [];
            for (const item of items) {
              const newItem = await tx.inspectionItem.create({
                data: {
                  inspectionId,
                  category: item.category,
                  condition: item.condition ?? null,
                  notes: item.notes ?? null,
                },
              });

              // Import photos for this item
              const photos = item.photos || [];
              for (const photo of photos) {
                await tx.inspectionPhoto.create({
                  data: {
                    inspectionItemId: newItem.id,
                    storageKey: photo.storageKey,
                    filename: photo.filename,
                    caption: photo.caption ?? null,
                    mimeType: photo.mimeType,
                    sizeBytes: photo.sizeBytes,
                  },
                });
              }
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Unknown error";
            throw new Error(`Failed to import Inspection (${inspection.inspectionType}): ${errMsg}`);
          }
        }
      }); // End of transaction

      // Log import completion
      await logSystemAudit(
        user.id,
        "IMPORT_DATA_COMPLETE",
        "DATA_GOVERNANCE",
        "Data import completed successfully",
        {
          schemaVersion: importData.schemaVersion,
          recordCounts: importData.recordCounts,
          summary,
        },
        true,
        undefined,
        ipAddress ?? undefined,
        userAgent ?? undefined
      );

      return c.json({
        data: {
          success: true,
          message: "Import completed successfully",
          summary,
          recordCounts: importData.recordCounts,
          schemaVersion: importData.schemaVersion,
        },
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await logSystemAudit(
        user.id,
        "IMPORT_DATA_FAILED",
        "DATA_GOVERNANCE",
        "Data import failed - transaction rolled back",
        { error: errorMessage },
        false,
        errorMessage,
        ipAddress ?? undefined,
        userAgent ?? undefined
      );
      return c.json({ error: { message: `Import failed: ${errorMessage}`, code: "IMPORT_FAILED" } }, 500);
    }
  }
);

// ============================================
// Auto-Backup Configuration Routes
// ============================================

const AutoBackupConfigSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"]).optional().default("WEEKLY"),
  dayOfWeek: z.number().min(0).max(6).optional().default(0), // 0=Sunday
  hourOfDay: z.number().min(0).max(23).optional().default(3), // UTC hour
  recipientEmail: z.string().email().optional().nullable(),
  retentionDays: z.number().min(7).max(365).optional().default(30),
  includeAttachments: z.boolean().optional().default(false),
});

/**
 * GET /api/admin/settings/auto-backup
 * Get current auto-backup configuration
 */
settingsRouter.get("/auto-backup", async (c) => {
  // Get or create default config
  let config = await prisma.autoBackupConfig.findUnique({
    where: { id: "default" },
  });

  if (!config) {
    config = await prisma.autoBackupConfig.create({
      data: { id: "default" },
    });
  }

  return c.json({
    data: {
      enabled: config.enabled,
      frequency: config.frequency,
      dayOfWeek: config.dayOfWeek,
      hourOfDay: config.hourOfDay,
      recipientEmail: config.recipientEmail,
      retentionDays: config.retentionDays,
      includeAttachments: config.includeAttachments,
      lastRunAt: config.lastRunAt?.toISOString() || null,
      lastSuccessAt: config.lastSuccessAt?.toISOString() || null,
      lastError: config.lastError,
    },
  });
});

/**
 * PUT /api/admin/settings/auto-backup
 * Update auto-backup configuration
 */
settingsRouter.put(
  "/auto-backup",
  zValidator("json", AutoBackupConfigSchema),
  async (c) => {
    const user = c.get("user");
    const data = c.req.valid("json");
    const ipAddress = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null;
    const userAgent = c.req.header("user-agent") || null;

    // Require email if enabling auto-backup
    if (data.enabled && !data.recipientEmail) {
      return c.json({
        error: { message: "Recipient email is required when enabling auto-backup", code: "EMAIL_REQUIRED" },
      }, 400);
    }

    try {
      const config = await prisma.autoBackupConfig.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          enabled: data.enabled,
          frequency: data.frequency,
          dayOfWeek: data.dayOfWeek,
          hourOfDay: data.hourOfDay,
          recipientEmail: data.recipientEmail,
          retentionDays: data.retentionDays,
          includeAttachments: data.includeAttachments,
          updatedById: user.id,
        },
        update: {
          enabled: data.enabled,
          frequency: data.frequency,
          dayOfWeek: data.dayOfWeek,
          hourOfDay: data.hourOfDay,
          recipientEmail: data.recipientEmail,
          retentionDays: data.retentionDays,
          includeAttachments: data.includeAttachments,
          updatedById: user.id,
        },
      });

      // Log the configuration change
      await auditBackupAction(
        data.enabled ? "UPDATE" : "UPDATE",
        { id: user.id, email: user.email, role: user.role },
        `Auto-backup ${data.enabled ? "enabled" : "disabled"} - ${data.frequency} to ${data.recipientEmail || "N/A"}`,
        {
          enabled: data.enabled,
          frequency: data.frequency,
          recipientEmail: data.recipientEmail,
        },
        { ipAddress: ipAddress || undefined, userAgent: userAgent || undefined }
      );

      await logSystemAudit(
        user.id,
        data.enabled ? "ENABLE_AUTO_BACKUP" : "DISABLE_AUTO_BACKUP",
        "DATA_GOVERNANCE",
        `Auto-backup configuration updated`,
        {
          enabled: data.enabled,
          frequency: data.frequency,
          recipientEmail: data.recipientEmail,
          retentionDays: data.retentionDays,
        },
        true,
        undefined,
        ipAddress ?? undefined,
        userAgent ?? undefined
      );

      return c.json({
        data: {
          success: true,
          message: data.enabled
            ? `Auto-backup enabled. ${data.frequency} backups will be sent to ${data.recipientEmail}`
            : "Auto-backup disabled",
          config: {
            enabled: config.enabled,
            frequency: config.frequency,
            dayOfWeek: config.dayOfWeek,
            hourOfDay: config.hourOfDay,
            recipientEmail: config.recipientEmail,
            retentionDays: config.retentionDays,
            includeAttachments: config.includeAttachments,
          },
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({
        error: { message: `Failed to update auto-backup configuration: ${errorMessage}`, code: "UPDATE_FAILED" },
      }, 500);
    }
  }
);

// ============================================
// Dry-Run Import Validation (Enhanced)
// ============================================

/**
 * POST /api/admin/settings/imports/dry-run
 * Comprehensive dry-run validation showing exact changes that would be made
 */
settingsRouter.post(
  "/imports/dry-run",
  zValidator("json", ImportValidationSchema),
  async (c) => {
    const user = c.get("user");
    const { content: importDataString } = c.req.valid("json");

    try {
      const importData = JSON.parse(importDataString);

      // Validate schema
      if (!importData.schemaVersion || !importData.data) {
        return c.json({
          data: {
            valid: false,
            errors: ["Invalid import file format"],
            preview: null,
          },
        });
      }

      // Get current database state for comparison
      const [currentUnits, currentTenants, currentInvoices] = await Promise.all([
        prisma.unit.findMany({ select: { id: true, unitLabel: true, buildingName: true } }),
        prisma.user.findMany({ where: { role: "TENANT" }, select: { id: true, email: true, name: true } }),
        prisma.invoice.findMany({ select: { id: true, periodMonth: true, status: true, amountCents: true } }),
      ]);

      // Calculate changes preview
      const importedUnits = importData.data.units || [];
      const importedTenants = importData.data.tenants || [];
      const importedInvoices = importData.data.invoices || [];

      const currentUnitIds = new Set(currentUnits.map((u) => u.id));
      const currentTenantIds = new Set(currentTenants.map((t) => t.id));
      const currentInvoiceIds = new Set(currentInvoices.map((i) => i.id));

      const importUnitIds = new Set(importedUnits.map((u: { id: string }) => u.id));
      const importTenantIds = new Set(importedTenants.map((t: { id: string }) => t.id));
      const importInvoiceIds = new Set(importedInvoices.map((i: { id: string }) => i.id));

      const preview = {
        units: {
          toAdd: importedUnits.filter((u: { id: string }) => !currentUnitIds.has(u.id)).length,
          toUpdate: importedUnits.filter((u: { id: string }) => currentUnitIds.has(u.id)).length,
          toRemove: currentUnits.filter((u) => !importUnitIds.has(u.id)).length,
          sample: importedUnits.slice(0, 3).map((u: { unitLabel: string; buildingName: string }) => ({
            unitLabel: u.unitLabel,
            buildingName: u.buildingName,
          })),
        },
        tenants: {
          toAdd: importedTenants.filter((t: { id: string }) => !currentTenantIds.has(t.id)).length,
          toUpdate: importedTenants.filter((t: { id: string }) => currentTenantIds.has(t.id)).length,
          toRemove: currentTenants.filter((t) => !importTenantIds.has(t.id)).length,
          sample: importedTenants.slice(0, 3).map((t: { name: string; email: string }) => ({
            name: t.name,
            email: t.email,
          })),
        },
        invoices: {
          toAdd: importedInvoices.filter((i: { id: string }) => !currentInvoiceIds.has(i.id)).length,
          toUpdate: importedInvoices.filter((i: { id: string }) => currentInvoiceIds.has(i.id)).length,
          toRemove: currentInvoices.filter((i) => !importInvoiceIds.has(i.id)).length,
          totalAmount: importedInvoices.reduce((sum: number, i: { amountCents: number }) => sum + (i.amountCents || 0), 0),
        },
        schemaVersion: {
          current: APP_VERSION,
          import: importData.schemaVersion,
          compatible: importData.schemaVersion.split(".")[0] === APP_VERSION.split(".")[0],
        },
        exportedAt: importData.exportedAt,
        exportedBy: importData.exportedBy,
      };

      // Generate confirmation token if valid
      const token = crypto.randomBytes(32).toString("hex");
      const dataHash = crypto.createHash("sha256").update(importDataString).digest("hex");

      validationTokens.set(token, {
        hash: dataHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      // Log dry-run
      await logSystemAudit(
        user.id,
        "DRY_RUN_IMPORT",
        "DATA_GOVERNANCE",
        "Performed dry-run import validation",
        { preview, schemaVersion: importData.schemaVersion },
        true
      );

      return c.json({
        data: {
          valid: true,
          confirmationToken: token,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          preview,
          warnings: [
            preview.units.toRemove > 0 ? `${preview.units.toRemove} units will be removed` : null,
            preview.tenants.toRemove > 0 ? `${preview.tenants.toRemove} tenants will be removed` : null,
            preview.invoices.toRemove > 0 ? `${preview.invoices.toRemove} invoices will be removed` : null,
            !preview.schemaVersion.compatible ? "Schema versions differ - proceed with caution" : null,
          ].filter(Boolean),
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({
        data: {
          valid: false,
          errors: [`Failed to parse import file: ${errorMessage}`],
          preview: null,
        },
      });
    }
  }
);

// ============================================
// Notification Logs Routes
// ============================================

/**
 * GET /api/admin/settings/notification-logs
 * Get notification history for admin visibility
 */
settingsRouter.get("/notification-logs", async (c) => {
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");
  const eventType = c.req.query("eventType");

  const where: any = {
    category: "NOTIFICATION",
  };

  if (eventType) {
    where.action = { contains: eventType };
  }

  const [logs, total] = await Promise.all([
    prisma.systemAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100), // Cap at 100
      skip: offset,
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

  return c.json({
    data: {
      logs: logs.map((log) => {
        let metadata = null;
        try {
          metadata = log.metadata ? JSON.parse(log.metadata) : null;
        } catch {
          metadata = null;
        }
        return {
          id: log.id,
          eventType: metadata?.eventType || log.action.replace("NOTIFICATION_", "").replace("_SENT", "").replace("_FAILED", ""),
          recipientEmail: metadata?.recipientEmail || "Unknown",
          recipientName: metadata?.recipientName || null,
          status: log.success ? "SENT" : "FAILED",
          errorMessage: log.errorMessage,
          createdAt: log.createdAt.toISOString(),
          buildingName: metadata?.buildingName || null,
          unitLabel: metadata?.unitLabel || null,
        };
      }),
      total,
      limit,
      offset,
    },
  });
});

// ============================================
// Backup History Routes
// ============================================

/**
 * GET /api/admin/settings/backups
 * Get recent system backups (last 5)
 */
settingsRouter.get("/backups", async (c) => {
  const backups = await prisma.systemBackup.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return c.json({
    data: backups.map((b) => {
      let recordCounts = null;
      try {
        recordCounts = b.recordCounts ? JSON.parse(b.recordCounts) : null;
      } catch {
        recordCounts = null;
      }

      return {
        id: b.id,
        triggerType: b.triggerType,
        status: b.status,
        filename: b.filename,
        fileSize: b.fileSize,
        recordCounts,
        schemaVersion: b.schemaVersion,
        errorMessage: b.errorMessage,
        startedAt: b.startedAt.toISOString(),
        completedAt: b.completedAt?.toISOString() ?? null,
        downloadedAt: b.downloadedAt?.toISOString() ?? null,
        expiresAt: b.expiresAt?.toISOString() ?? null,
        createdById: b.createdById,
        createdAt: b.createdAt.toISOString(),
      };
    }),
  });
});

/**
 * GET /api/admin/settings/backups/:id
 * Get a specific backup by ID
 */
settingsRouter.get("/backups/:id", async (c) => {
  const id = c.req.param("id");

  const backup = await prisma.systemBackup.findUnique({
    where: { id },
  });

  if (!backup) {
    return c.json({ error: { message: "Backup not found", code: "NOT_FOUND" } }, 404);
  }

  let recordCounts = null;
  try {
    recordCounts = backup.recordCounts ? JSON.parse(backup.recordCounts) : null;
  } catch {
    recordCounts = null;
  }

  return c.json({
    data: {
      id: backup.id,
      triggerType: backup.triggerType,
      status: backup.status,
      filename: backup.filename,
      fileSize: backup.fileSize,
      recordCounts,
      schemaVersion: backup.schemaVersion,
      errorMessage: backup.errorMessage,
      startedAt: backup.startedAt.toISOString(),
      completedAt: backup.completedAt?.toISOString() ?? null,
      downloadedAt: backup.downloadedAt?.toISOString() ?? null,
      expiresAt: backup.expiresAt?.toISOString() ?? null,
      createdById: backup.createdById,
      createdAt: backup.createdAt.toISOString(),
    },
  });
});

/**
 * GET /api/admin/settings/backups/:id/download
 * Download a specific backup
 * Note: This endpoint returns backup data for download. In production,
 * the backup content would be stored and retrieved from a file storage system.
 */
settingsRouter.get("/backups/:id/download", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const ipAddress = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null;
  const userAgent = c.req.header("user-agent") || null;

  const backup = await prisma.systemBackup.findUnique({
    where: { id },
  });

  if (!backup) {
    return c.json({ error: { message: "Backup not found", code: "NOT_FOUND" } }, 404);
  }

  if (backup.status !== "COMPLETED") {
    return c.json({ error: { message: "Backup is not completed or available for download", code: "NOT_AVAILABLE" } }, 400);
  }

  // Update downloadedAt timestamp
  await prisma.systemBackup.update({
    where: { id },
    data: { downloadedAt: new Date() },
  });

  // Log the download action
  await logSystemAudit(
    user.id,
    "DOWNLOAD_BACKUP",
    "DATA_GOVERNANCE",
    `Downloaded backup: ${backup.filename}`,
    { backupId: id, filename: backup.filename },
    true,
    undefined,
    ipAddress ?? undefined,
    userAgent ?? undefined
  );

  // In a real implementation, you would retrieve the backup content from storage
  // For now, we return a message indicating the backup exists
  // The actual download would be handled by regenerating the export or retrieving from storage

  // Generate fresh backup data for download
  const [units, users, tenancies, invoices, checklistItems, inspections, buildingInfos] =
    await Promise.all([
      prisma.unit.findMany({ include: { property: true } }),
      prisma.user.findMany({
        where: { role: "TENANT" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          insuranceStatus: true,
          insuranceProvider: true,
          insuranceExpiresAt: true,
        },
      }),
      prisma.tenancy.findMany({
        include: {
          unit: { select: { id: true, unitLabel: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.invoice.findMany({
        include: {
          unit: { select: { id: true, unitLabel: true } },
          tenancy: { select: { id: true } },
        },
      }),
      prisma.checklistItem.findMany({ include: { tenancy: { select: { id: true } } } }),
      prisma.inspection.findMany({
        include: {
          items: { include: { photos: true } },
          tenancy: { select: { id: true } },
        },
      }),
      prisma.buildingInfo.findMany(),
    ]);

  const now = new Date();
  const exportData = {
    schemaVersion: backup.schemaVersion || "1.0.0",
    exportedAt: now.toISOString(),
    originalBackupId: backup.id,
    originalBackupDate: backup.createdAt.toISOString(),
    recordCounts: {
      units: units.length,
      tenants: users.length,
      tenancies: tenancies.length,
      invoices: invoices.length,
      checklistItems: checklistItems.length,
      inspections: inspections.length,
      buildingInfos: buildingInfos.length,
    },
    data: {
      units: units.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
        property: u.property
          ? {
              ...u.property,
              createdAt: u.property.createdAt.toISOString(),
              updatedAt: u.property.updatedAt.toISOString(),
            }
          : null,
      })),
      tenants: users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
        insuranceExpiresAt: u.insuranceExpiresAt?.toISOString() ?? null,
      })),
      tenancies: tenancies.map((t) => ({
        ...t,
        startDate: t.startDate.toISOString(),
        endDate: t.endDate?.toISOString() ?? null,
        moveOutDate: t.moveOutDate?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      invoices: invoices.map((i) => ({
        ...i,
        dueDate: i.dueDate.toISOString(),
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
        etransferMarkedAt: i.etransferMarkedAt?.toISOString() ?? null,
      })),
      checklistItems: checklistItems.map((ci) => ({
        ...ci,
        completedAt: ci.completedAt?.toISOString() ?? null,
        createdAt: ci.createdAt.toISOString(),
        updatedAt: ci.updatedAt.toISOString(),
      })),
      inspections: inspections.map((insp) => ({
        ...insp,
        finalizedAt: insp.finalizedAt?.toISOString() ?? null,
        createdAt: insp.createdAt.toISOString(),
        updatedAt: insp.updatedAt.toISOString(),
        items: insp.items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
          photos: item.photos.map((photo) => ({
            ...photo,
            uploadedAt: photo.uploadedAt.toISOString(),
          })),
        })),
      })),
      buildingInfos: buildingInfos.map((bi) => ({
        ...bi,
        updatedAt: bi.updatedAt.toISOString(),
      })),
    },
  };

  const exportJson = JSON.stringify(exportData, null, 2);

  return c.json({
    data: {
      backupId: backup.id,
      filename: backup.filename || `backup_${backup.id}.json`,
      content: exportJson,
    },
  });
});

/**
 * POST /api/admin/settings/backups/trigger
 * Manually trigger a new backup
 */
settingsRouter.post("/backups/trigger", async (c) => {
  const user = c.get("user");
  const ipAddress = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null;
  const userAgent = c.req.header("user-agent") || null;

  try {
    const result = await triggerManualBackup(user.id);

    // Log the action
    await logSystemAudit(
      user.id,
      "TRIGGER_BACKUP",
      "DATA_GOVERNANCE",
      result.success
        ? `Manual backup triggered successfully: ${result.backupId}`
        : `Manual backup trigger failed: ${result.error}`,
      { backupId: result.backupId, success: result.success },
      result.success,
      result.error,
      ipAddress ?? undefined,
      userAgent ?? undefined
    );

    if (result.success) {
      // Fetch the created backup to return full details
      const backup = await prisma.systemBackup.findUnique({
        where: { id: result.backupId },
      });

      if (backup) {
        let recordCounts = null;
        try {
          recordCounts = backup.recordCounts ? JSON.parse(backup.recordCounts) : null;
        } catch {
          recordCounts = null;
        }

        return c.json({
          data: {
            id: backup.id,
            triggerType: backup.triggerType,
            status: backup.status,
            filename: backup.filename,
            fileSize: backup.fileSize,
            recordCounts,
            schemaVersion: backup.schemaVersion,
            startedAt: backup.startedAt.toISOString(),
            completedAt: backup.completedAt?.toISOString() ?? null,
            createdAt: backup.createdAt.toISOString(),
          },
        });
      }
    }

    return c.json({
      error: {
        message: result.error || "Backup trigger failed",
        code: "BACKUP_FAILED",
      },
    }, 500);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await logSystemAudit(
      user.id,
      "TRIGGER_BACKUP",
      "DATA_GOVERNANCE",
      `Manual backup trigger failed: ${errorMessage}`,
      {},
      false,
      errorMessage,
      ipAddress ?? undefined,
      userAgent ?? undefined
    );

    return c.json({
      error: {
        message: errorMessage,
        code: "BACKUP_ERROR",
      },
    }, 500);
  }
});

export { settingsRouter };
