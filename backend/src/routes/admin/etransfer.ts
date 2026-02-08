import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { UpdateEtransferSettingsSchema, EtransferRejectSchema, TestWebhookRequestSchema } from "../../types";
import { logAuditAction, AuditActions } from "../../lib/audit";
import { notifyPaymentReceived } from "../../lib/event-notifications";
import { env } from "../../env";
import {
  parseInteracEmail,
  matchTenantByName,
  findOldestPendingInvoice,
  findPendingInvoicesForTenant,
} from "../../lib/payment-parser";

const etransferRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
etransferRouter.use("*", authMiddleware);
etransferRouter.use("*", adminMiddleware);

/**
 * GET /api/admin/etransfer/settings
 * Get e-Transfer settings
 */
etransferRouter.get("/settings", async (c) => {
  let settings = await prisma.settings.findUnique({
    where: { id: "default" },
  });

  // Create default settings if not exists
  if (!settings) {
    settings = await prisma.settings.create({
      data: {
        id: "default",
        etransferEnabled: true,
        etransferRecipientEmail: "rent@gadevelopments.ca",
        etransferMemoTemplate: "{UNIT_LABEL} {MONTH} Rent",
      },
    });
  }

  return c.json({
    data: {
      etransferEnabled: settings.etransferEnabled,
      etransferRecipientEmail: settings.etransferRecipientEmail,
      etransferMemoTemplate: settings.etransferMemoTemplate,
    },
  });
});

/**
 * PUT /api/admin/etransfer/settings
 * Update e-Transfer settings
 */
etransferRouter.put("/settings", zValidator("json", UpdateEtransferSettingsSchema), async (c) => {
  const data = c.req.valid("json");
  const user = c.get("user");

  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      etransferEnabled: data.etransferEnabled ?? true,
      etransferRecipientEmail: data.etransferRecipientEmail ?? "info@gadevelopments.ca",
      etransferMemoTemplate: data.etransferMemoTemplate ?? "{UNIT_LABEL} {MONTH} Rent",
    },
    update: {
      etransferEnabled: data.etransferEnabled,
      etransferRecipientEmail: data.etransferRecipientEmail,
      etransferMemoTemplate: data.etransferMemoTemplate,
    },
  });

  await logAuditAction({
    adminUserId: user.id,
    action: AuditActions.SETTINGS_UPDATE,
    entityType: "Settings",
    entityId: "default",
    metadata: { changes: data },
  });

  return c.json({
    data: {
      etransferEnabled: settings.etransferEnabled,
      etransferRecipientEmail: settings.etransferRecipientEmail,
      etransferMemoTemplate: settings.etransferMemoTemplate,
    },
  });
});

/**
 * GET /api/admin/etransfer/pending
 * Get all invoices with pending e-Transfer verification
 */
etransferRouter.get("/pending", async (c) => {
  const pendingInvoices = await prisma.invoice.findMany({
    where: {
      etransferStatus: "pending",
    },
    include: {
      unit: {
        select: {
          id: true,
          unitLabel: true,
          buildingName: true,
          propertyId: true,
        },
      },
      tenancy: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: {
      etransferMarkedAt: "asc",
    },
  });

  // Also get all tenants for each unit (for multi-tenant display)
  const invoicesWithTenants = await Promise.all(
    pendingInvoices.map(async (invoice) => {
      const unitTenants = await prisma.tenancy.findMany({
        where: {
          unitId: invoice.unitId,
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
      });

      return {
        id: invoice.id,
        unitId: invoice.unitId,
        unitLabel: invoice.unit.unitLabel,
        buildingName: invoice.unit.buildingName,
        periodMonth: invoice.periodMonth,
        dueDate: invoice.dueDate.toISOString(),
        amountCents: invoice.amountCents,
        status: invoice.status,
        etransferStatus: invoice.etransferStatus,
        etransferMarkedAt: invoice.etransferMarkedAt?.toISOString() ?? null,
        primaryTenant: invoice.tenancy.user,
        allTenants: unitTenants.map((t) => ({
          id: t.user.id,
          name: t.user.name,
          email: t.user.email,
          roleInUnit: t.roleInUnit,
        })),
      };
    })
  );

  return c.json({ data: invoicesWithTenants });
});

/**
 * PUT /api/admin/etransfer/:invoiceId/approve
 * Approve an e-Transfer payment
 */
etransferRouter.put("/:invoiceId/approve", async (c) => {
  const invoiceId = c.req.param("invoiceId");
  const user = c.get("user");

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      unit: true,
      tenancy: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!invoice) {
    return c.json({ error: { message: "Invoice not found", code: "NOT_FOUND" } }, 404);
  }

  if (invoice.etransferStatus !== "pending") {
    return c.json(
      { error: { message: "Invoice does not have a pending e-Transfer", code: "NOT_PENDING" } },
      400
    );
  }

  const now = new Date();

  // Update invoice and create payment in transaction
  const [updatedInvoice, payment] = await prisma.$transaction([
    prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "PAID",
        etransferStatus: "approved",
      },
    }),
    prisma.payment.create({
      data: {
        invoiceId: invoiceId,
        unitId: invoice.unitId,
        userId: invoice.tenancy.userId,
        amountCents: invoice.amountCents,
        paidAt: now,
        method: "etransfer_manual",
        approvedByAdminId: user.id,
      },
    }),
  ]);

  await logAuditAction({
    adminUserId: user.id,
    action: AuditActions.ETRANSFER_APPROVE,
    entityType: "Invoice",
    entityId: invoiceId,
    metadata: {
      unitLabel: invoice.unit.unitLabel,
      periodMonth: invoice.periodMonth,
      amountCents: invoice.amountCents,
      tenantEmail: invoice.tenancy.user.email,
    },
  });

  // Send payment received notification to Communication Center recipients
  await notifyPaymentReceived({
    tenantName: invoice.tenancy.user.name,
    tenantEmail: invoice.tenancy.user.email,
    buildingName: invoice.unit.buildingName,
    unitLabel: invoice.unit.unitLabel,
    periodMonth: invoice.periodMonth,
    amountCents: invoice.amountCents,
    paymentMethod: "etransfer_manual",
  });

  return c.json({
    data: {
      invoice: {
        id: updatedInvoice.id,
        status: updatedInvoice.status,
        etransferStatus: updatedInvoice.etransferStatus,
      },
      payment: {
        id: payment.id,
        amountCents: payment.amountCents,
        paidAt: payment.paidAt.toISOString(),
        method: payment.method,
      },
    },
  });
});

/**
 * PUT /api/admin/etransfer/:invoiceId/reject
 * Reject an e-Transfer payment
 */
etransferRouter.put("/:invoiceId/reject", zValidator("json", EtransferRejectSchema), async (c) => {
  const invoiceId = c.req.param("invoiceId");
  const data = c.req.valid("json");
  const user = c.get("user");

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      unit: true,
      tenancy: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!invoice) {
    return c.json({ error: { message: "Invoice not found", code: "NOT_FOUND" } }, 404);
  }

  if (invoice.etransferStatus !== "pending") {
    return c.json(
      { error: { message: "Invoice does not have a pending e-Transfer", code: "NOT_PENDING" } },
      400
    );
  }

  const updatedInvoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      paymentMethod: null,
      etransferStatus: "rejected",
      etransferRejectReason: data.reason || null,
    },
  });

  await logAuditAction({
    adminUserId: user.id,
    action: AuditActions.ETRANSFER_REJECT,
    entityType: "Invoice",
    entityId: invoiceId,
    metadata: {
      unitLabel: invoice.unit.unitLabel,
      periodMonth: invoice.periodMonth,
      reason: data.reason,
      tenantEmail: invoice.tenancy.user.email,
    },
  });

  // Log email notification
  console.log(`[EMAIL] e-Transfer rejected notification would be sent to ${invoice.tenancy.user.email}`);
  console.log(`  - Unit: ${invoice.unit.unitLabel}`);
  console.log(`  - Period: ${invoice.periodMonth}`);
  console.log(`  - Reason: ${data.reason || "Not specified"}`);

  return c.json({
    data: {
      id: updatedInvoice.id,
      status: updatedInvoice.status,
      etransferStatus: updatedInvoice.etransferStatus,
      etransferRejectReason: updatedInvoice.etransferRejectReason,
    },
  });
});

/**
 * GET /api/admin/etransfer/webhook-config
 * Get webhook configuration for email forwarding setup
 */
etransferRouter.get("/webhook-config", async (c) => {
  const backendUrl = env.BACKEND_URL;
  const webhookUrl = `${backendUrl}/api/webhooks/rent-payment-intake`;
  const hasOpenAI = !!env.OPENAI_API_KEY;

  // Get stored secret from settings if env var not set
  let webhookSecret = env.PAYMENT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    const settings = await prisma.settings.findUnique({ where: { id: "default" } });
    webhookSecret = settings?.webhookSecret || "";
  }

  const isConfigured = !!webhookSecret;

  // Mask the secret for display (show first 4 and last 4 chars only)
  let maskedSecret = "";
  if (webhookSecret) {
    if (webhookSecret.length <= 8) {
      maskedSecret = "*".repeat(webhookSecret.length);
    } else {
      maskedSecret = `${webhookSecret.substring(0, 4)}${"*".repeat(webhookSecret.length - 8)}${webhookSecret.substring(webhookSecret.length - 4)}`;
    }
  }

  return c.json({
    data: {
      webhookUrl,
      webhookSecret: maskedSecret,
      isConfigured,
      hasOpenAI,
      instructions: {
        step1: "Enable 'Autodeposit' at your bank for your e-Transfer recipient email",
        step2: `Set up an email forwarder/pipe to: ${webhookUrl}`,
        step3: "Check System Activity log for verification code after setup",
      },
    },
  });
});

/**
 * POST /api/admin/etransfer/webhook-secret
 * Save webhook secret (stores in Settings table for display, actual validation uses env var)
 */
etransferRouter.post("/webhook-secret", async (c) => {
  const body = await c.req.json();
  const { webhookSecret } = body as { webhookSecret: string };

  if (!webhookSecret || webhookSecret.length < 10) {
    return c.json({ error: { message: "Webhook secret must be at least 10 characters", code: "INVALID_SECRET" } }, 400);
  }

  // Store in settings for display purposes
  await prisma.settings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      webhookSecret,
    },
    update: {
      webhookSecret,
    },
  });

  return c.json({
    data: {
      success: true,
      message: "Webhook secret saved. Make sure to also set PAYMENT_WEBHOOK_SECRET in your environment variables with the same value.",
    },
  });
});

/**
 * GET /api/admin/etransfer/intake-logs
 * Get all payment intake webhook logs for admin review
 */
etransferRouter.get("/intake-logs", async (c) => {
  const status = c.req.query("status"); // RECEIVED, PARSED, MATCHED, PAID, FAILED, MANUAL_REVIEW
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const where: Record<string, unknown> = {};
  if (status && status !== "all") {
    where.status = status;
  }

  const [logs, total] = await Promise.all([
    prisma.paymentIntakeLog.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.paymentIntakeLog.count({ where }),
  ]);

  // Enrich with tenant and invoice data
  const enrichedLogs = await Promise.all(
    logs.map(async (log) => {
      let tenant = null;
      let invoice = null;

      if (log.matchedTenantId) {
        tenant = await prisma.user.findUnique({
          where: { id: log.matchedTenantId },
          select: { id: true, name: true, email: true },
        });
      }

      if (log.matchedInvoiceId) {
        invoice = await prisma.invoice.findUnique({
          where: { id: log.matchedInvoiceId },
          select: {
            id: true,
            periodMonth: true,
            amountCents: true,
            status: true,
            unit: {
              select: { buildingName: true, unitLabel: true },
            },
          },
        });
      }

      return {
        id: log.id,
        rawSubject: log.rawSubject,
        rawFrom: log.rawFrom,
        senderName: log.senderName,
        amountCents: log.amountCents,
        referenceNumber: log.referenceNumber,
        parseConfidence: log.parseConfidence,
        parseError: log.parseError,
        status: log.status,
        reconciliationNote: log.reconciliationNote,
        isVerified: log.isVerified,
        receivedAt: log.receivedAt.toISOString(),
        parsedAt: log.parsedAt?.toISOString() || null,
        reconciledAt: log.reconciledAt?.toISOString() || null,
        matchedTenant: tenant,
        matchedInvoice: invoice
          ? {
              id: invoice.id,
              periodMonth: invoice.periodMonth,
              amountCents: invoice.amountCents,
              status: invoice.status,
              buildingName: invoice.unit.buildingName,
              unitLabel: invoice.unit.unitLabel,
            }
          : null,
      };
    })
  );

  return c.json({
    data: {
      logs: enrichedLogs,
      total,
      limit,
      offset,
    },
  });
});

/**
 * GET /api/admin/etransfer/intake-logs/:id
 * Get a single intake log with full details
 */
etransferRouter.get("/intake-logs/:id", async (c) => {
  const id = c.req.param("id");

  const log = await prisma.paymentIntakeLog.findUnique({
    where: { id },
  });

  if (!log) {
    return c.json({ error: { message: "Log not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: {
      ...log,
      receivedAt: log.receivedAt.toISOString(),
      parsedAt: log.parsedAt?.toISOString() || null,
      reconciledAt: log.reconciledAt?.toISOString() || null,
    },
  });
});

/**
 * Schema for manual tenant matching
 */
const ManualMatchSchema = z.object({
  tenantId: z.string().min(1),
  invoiceId: z.string().min(1),
});

/**
 * POST /api/admin/etransfer/intake-logs/:id/match
 * Manually match an intake log to a tenant and invoice
 */
etransferRouter.post("/intake-logs/:id/match", zValidator("json", ManualMatchSchema), async (c) => {
  const id = c.req.param("id");
  const { tenantId, invoiceId } = c.req.valid("json");
  const user = c.get("user");

  const log = await prisma.paymentIntakeLog.findUnique({
    where: { id },
  });

  if (!log) {
    return c.json({ error: { message: "Log not found", code: "NOT_FOUND" } }, 404);
  }

  if (log.status === "PAID") {
    return c.json({ error: { message: "This payment has already been reconciled", code: "ALREADY_RECONCILED" } }, 400);
  }

  // Verify tenant exists
  const tenant = await prisma.user.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, email: true },
  });

  if (!tenant) {
    return c.json({ error: { message: "Tenant not found", code: "TENANT_NOT_FOUND" } }, 404);
  }

  // Verify invoice exists and is pending
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      unit: { select: { buildingName: true, unitLabel: true } },
      tenancy: { select: { userId: true } },
    },
  });

  if (!invoice) {
    return c.json({ error: { message: "Invoice not found", code: "INVOICE_NOT_FOUND" } }, 404);
  }

  if (invoice.status === "PAID") {
    return c.json({ error: { message: "Invoice is already paid", code: "INVOICE_ALREADY_PAID" } }, 400);
  }

  // Process the payment
  const amountCents = log.amountCents || invoice.amountCents;

  await prisma.$transaction(async (tx) => {
    // Update invoice status
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "PAID",
        paymentMethod: "etransfer",
        etransferStatus: "PAID",
        etransferMarkedAt: new Date(),
      },
    });

    // Create payment record
    await tx.payment.create({
      data: {
        invoiceId: invoiceId,
        unitId: invoice.unitId,
        userId: tenantId,
        amountCents: amountCents,
        method: "etransfer",
        approvedByAdminId: user.id,
        receiptUrl: log.referenceNumber ? `Interac Ref: ${log.referenceNumber}` : null,
      },
    });

    // Update intake log
    await tx.paymentIntakeLog.update({
      where: { id },
      data: {
        matchedTenantId: tenantId,
        matchedInvoiceId: invoiceId,
        status: "PAID",
        reconciliationNote: `Manual match by admin: $${(amountCents / 100).toLocaleString()} from ${tenant.name} to ${invoice.unit.buildingName} - ${invoice.unit.unitLabel}`,
        reconciledAt: new Date(),
      },
    });
  });

  // Log audit action
  await logAuditAction({
    adminUserId: user.id,
    action: AuditActions.ETRANSFER_APPROVE,
    entityType: "PaymentIntakeLog",
    entityId: id,
    metadata: {
      tenantId,
      tenantName: tenant.name,
      invoiceId,
      amountCents,
      referenceNumber: log.referenceNumber,
    },
  });

  // Notify payment received
  await notifyPaymentReceived({
    tenantName: tenant.name || "Tenant",
    tenantEmail: tenant.email,
    buildingName: invoice.unit.buildingName,
    unitLabel: invoice.unit.unitLabel,
    periodMonth: invoice.periodMonth,
    amountCents,
    paymentMethod: "etransfer",
  });

  return c.json({
    data: {
      success: true,
      logId: id,
      invoiceId,
      tenantId,
      amountCents,
    },
  });
});

/**
 * PUT /api/admin/etransfer/intake-logs/:id/dismiss
 * Dismiss/archive an intake log (mark as reviewed but not matched)
 */
etransferRouter.put("/intake-logs/:id/dismiss", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  const log = await prisma.paymentIntakeLog.findUnique({
    where: { id },
  });

  if (!log) {
    return c.json({ error: { message: "Log not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.paymentIntakeLog.update({
    where: { id },
    data: {
      status: "DISMISSED",
      reconciliationNote: `Dismissed by admin on ${new Date().toISOString()}`,
    },
  });

  await logAuditAction({
    adminUserId: user.id,
    action: "PAYMENT_INTAKE_DISMISSED",
    entityType: "PaymentIntakeLog",
    entityId: id,
    metadata: { originalStatus: log.status },
  });

  return c.json({ data: { success: true } });
});

/**
 * GET /api/admin/etransfer/payment-history
 * Get all e-Transfer payments with filters
 * Enhanced with rawEmailContent and reconciliationType for Automation Center
 */
etransferRouter.get("/payment-history", async (c) => {
  const building = c.req.query("building");
  const month = c.req.query("month"); // Format: YYYY-MM
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  // Build where clause
  const where: Record<string, unknown> = {
    method: { in: ["etransfer", "etransfer_manual"] },
  };

  if (month) {
    const [year, monthNum] = month.split("-");
    const startDate = new Date(Number(year), Number(monthNum) - 1, 1);
    const endDate = new Date(Number(year), Number(monthNum), 0, 23, 59, 59);
    where.paidAt = { gte: startDate, lte: endDate };
  }

  const payments = await prisma.payment.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true } },
      unit: { select: { id: true, buildingName: true, unitLabel: true } },
      invoice: { select: { id: true, periodMonth: true, status: true } },
    },
    orderBy: { paidAt: "desc" },
    take: limit,
    skip: offset,
  });

  // Filter by building if specified (after query since building is in related table)
  let filteredPayments = payments;
  if (building && building !== "all") {
    filteredPayments = payments.filter((p) => p.unit.buildingName === building);
  }

  // Get unique buildings for filter dropdown
  const buildings = await prisma.unit.findMany({
    select: { buildingName: true },
    distinct: ["buildingName"],
    orderBy: { buildingName: "asc" },
  });

  // Get intake logs for raw email content and reconciliation type
  const paymentIds = filteredPayments.map((p) => p.invoiceId);
  const intakeLogs = await prisma.paymentIntakeLog.findMany({
    where: {
      matchedInvoiceId: { in: paymentIds },
    },
    select: {
      matchedInvoiceId: true,
      rawBody: true,
      status: true,
    },
  });

  // Create a map for quick lookup
  const intakeLogMap = new Map(
    intakeLogs.map((log) => [log.matchedInvoiceId, log])
  );

  return c.json({
    data: {
      payments: filteredPayments.map((p) => {
        const intakeLog = intakeLogMap.get(p.invoiceId);

        // Determine reconciliation type
        let reconciliationType: "AUTO" | "MANUAL" | "FLAGGED" = "MANUAL";
        if (intakeLog) {
          if (intakeLog.status === "PAID") {
            reconciliationType = "AUTO";
          } else if (intakeLog.status === "MANUAL_REVIEW") {
            reconciliationType = "FLAGGED";
          }
        }
        // If approved by admin (etransfer_manual method), it's manual
        if (p.method === "etransfer_manual" && p.approvedByAdminId) {
          reconciliationType = "MANUAL";
        }

        return {
          id: p.id,
          tenantId: p.user.id,
          tenantName: p.user.name,
          tenantEmail: p.user.email,
          unitId: p.unit.id,
          buildingName: p.unit.buildingName,
          unitLabel: p.unit.unitLabel,
          invoiceId: p.invoice.id,
          periodMonth: p.invoice.periodMonth,
          amountCents: p.amountCents,
          method: p.method,
          referenceNumber: p.receiptUrl?.replace("Interac Ref: ", "") || null,
          paidAt: p.paidAt.toISOString(),
          approvedByAdminId: p.approvedByAdminId,
          rawEmailContent: intakeLog?.rawBody || null,
          reconciliationType,
        };
      }),
      buildings: buildings.map((b) => b.buildingName).filter(Boolean),
      total: filteredPayments.length,
    },
  });
});

/**
 * GET /api/admin/etransfer/system-activity
 * Get recent system activity logs related to payment webhooks
 */
etransferRouter.get("/system-activity", async (c) => {
  const limit = parseInt(c.req.query("limit") || "20", 10);

  const logs = await prisma.systemAuditLog.findMany({
    where: {
      category: "PAYMENT_WEBHOOK",
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return c.json({
    data: logs.map((log) => ({
      id: log.id,
      action: log.action,
      description: log.description,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
      success: log.success,
      createdAt: log.createdAt.toISOString(),
    })),
  });
});

// ============================================
// E-Transfer Automation Center Endpoints
// ============================================

/**
 * GET /api/admin/etransfer/endpoint-config
 * Get current webhook configuration for the e-Transfer Automation Center
 */
etransferRouter.get("/endpoint-config", async (c) => {
  const backendUrl = env.BACKEND_URL;
  const defaultWebhookUrl = `${backendUrl}/api/webhooks/rent-payment-intake`;
  const webhookSecret = env.PAYMENT_WEBHOOK_SECRET || null;
  const isConfigured = !!env.PAYMENT_WEBHOOK_SECRET && !!env.OPENAI_API_KEY;

  // The customWebhookUrl could be stored in Settings model if needed
  // For now, we'll use the default URL
  const customWebhookUrl = null; // Could be stored in settings if needed

  return c.json({
    data: {
      webhookUrl: customWebhookUrl || defaultWebhookUrl,
      webhookSecret: webhookSecret ? `${webhookSecret.substring(0, 4)}${"*".repeat(Math.max(0, webhookSecret.length - 8))}${webhookSecret.substring(webhookSecret.length - 4)}` : null,
      isConfigured,
      customWebhookUrl,
    },
  });
});

/**
 * POST /api/admin/etransfer/endpoint-config
 * Save custom webhook URL configuration
 */
etransferRouter.post("/endpoint-config", zValidator("json", z.object({
  webhookUrl: z.string().url().optional(),
})), async (c) => {
  const data = c.req.valid("json");
  const user = c.get("user");

  // Note: For a full implementation, you would add a customWebhookUrl field to the Settings model
  // For now, we'll just log the configuration change

  await logAuditAction({
    adminUserId: user.id,
    action: "ETRANSFER_ENDPOINT_CONFIG_UPDATE",
    entityType: "Settings",
    entityId: "default",
    metadata: { webhookUrl: data.webhookUrl },
  });

  const backendUrl = env.BACKEND_URL;
  const defaultWebhookUrl = `${backendUrl}/api/webhooks/rent-payment-intake`;

  return c.json({
    data: {
      webhookUrl: data.webhookUrl || defaultWebhookUrl,
      webhookSecret: env.PAYMENT_WEBHOOK_SECRET ? "[configured]" : null,
      isConfigured: !!env.PAYMENT_WEBHOOK_SECRET && !!env.OPENAI_API_KEY,
      customWebhookUrl: data.webhookUrl || null,
    },
  });
});

/**
 * POST /api/admin/etransfer/test-webhook
 * Simulate webhook processing - DRY RUN (no database changes)
 */
etransferRouter.post("/test-webhook", zValidator("json", TestWebhookRequestSchema), async (c) => {
  const { rawEmailContent, rawEmailSubject } = c.req.valid("json");

  interface TestStep {
    step: string;
    status: "success" | "failure" | "skipped";
    message: string;
  }

  const steps: TestStep[] = [];
  let parsedData: {
    senderName: string | null;
    amount: string | null;
    amountCents: number | null;
    referenceNumber: string | null;
    confidence: number | null;
  } | null = null;
  let matchedTenant: {
    id: string;
    name: string;
    email: string;
    unit: string | null;
  } | null = null;
  let matchedInvoice: {
    id: string;
    periodMonth: string;
    amountCents: number;
    status: string;
    unitLabel: string;
    buildingName: string;
  } | null = null;

  // Step 1: Validate webhook secret (simulated)
  if (env.PAYMENT_WEBHOOK_SECRET) {
    steps.push({
      step: "validate",
      status: "success",
      message: "Webhook secret is configured and would be validated",
    });
  } else {
    steps.push({
      step: "validate",
      status: "failure",
      message: "Webhook secret is not configured (PAYMENT_WEBHOOK_SECRET not set)",
    });
  }

  // Step 2: Parse email content using AI
  try {
    const parsed = await parseInteracEmail(rawEmailContent, rawEmailSubject || "");

    parsedData = {
      senderName: parsed.senderName,
      amount: parsed.amountCents ? `$${(parsed.amountCents / 100).toLocaleString("en-CA", { minimumFractionDigits: 2 })}` : null,
      amountCents: parsed.amountCents,
      referenceNumber: parsed.referenceNumber,
      confidence: parsed.confidence,
    };

    if (parsed.senderName && parsed.amountCents) {
      steps.push({
        step: "parse",
        status: "success",
        message: `AI extracted: ${parsed.senderName}, ${parsedData.amount}, ${parsed.referenceNumber || "no reference"}`,
      });
    } else if (parsed.error) {
      steps.push({
        step: "parse",
        status: "failure",
        message: `AI parsing error: ${parsed.error}`,
      });
    } else {
      const missing: string[] = [];
      if (!parsed.senderName) missing.push("sender name");
      if (!parsed.amountCents) missing.push("amount");
      steps.push({
        step: "parse",
        status: "failure",
        message: `Could not extract: ${missing.join(", ")}`,
      });
    }
  } catch (error) {
    steps.push({
      step: "parse",
      status: "failure",
      message: `Parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }

  // Step 3: Match tenant
  if (parsedData?.senderName) {
    try {
      const tenant = await matchTenantByName(parsedData.senderName);
      if (tenant) {
        matchedTenant = {
          id: tenant.userId,
          name: tenant.name,
          email: tenant.email,
          unit: tenant.unitLabel && tenant.buildingName
            ? `${tenant.buildingName} - ${tenant.unitLabel}`
            : tenant.unitLabel || null,
        };
        steps.push({
          step: "match",
          status: "success",
          message: `Matched tenant: ${tenant.name} (${matchedTenant.unit || "no unit assigned"})`,
        });
      } else {
        steps.push({
          step: "match",
          status: "failure",
          message: `No tenant found matching "${parsedData.senderName}"`,
        });
      }
    } catch (error) {
      steps.push({
        step: "match",
        status: "failure",
        message: `Tenant matching failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  } else {
    steps.push({
      step: "match",
      status: "skipped",
      message: "Tenant matching skipped - no sender name extracted",
    });
  }

  // Step 4: Reconcile invoice (simulated)
  if (matchedTenant && parsedData?.amountCents) {
    try {
      const invoice = await findOldestPendingInvoice(matchedTenant.id, parsedData.amountCents);
      if (invoice) {
        matchedInvoice = {
          id: invoice.invoiceId,
          periodMonth: invoice.periodMonth,
          amountCents: invoice.amountCents,
          status: invoice.status,
          unitLabel: invoice.unitLabel,
          buildingName: invoice.buildingName,
        };
        steps.push({
          step: "reconcile",
          status: "success",
          message: `Would mark invoice ${invoice.periodMonth} (${invoice.buildingName} - ${invoice.unitLabel}) as PAID (DRY RUN - no changes made)`,
        });
      } else {
        // Try to find any pending invoices for this tenant to show what's available
        const pendingInvoices = await findPendingInvoicesForTenant(matchedTenant.id);
        if (pendingInvoices.length > 0) {
          const invoiceList = pendingInvoices
            .map((inv) => `${inv.periodMonth} ($${(inv.amountCents / 100).toLocaleString()})`)
            .join(", ");
          steps.push({
            step: "reconcile",
            status: "failure",
            message: `No invoice found matching amount ${parsedData.amount}. Pending invoices for ${matchedTenant.name}: ${invoiceList}`,
          });
        } else {
          steps.push({
            step: "reconcile",
            status: "failure",
            message: `No pending invoices found for ${matchedTenant.name}`,
          });
        }
      }
    } catch (error) {
      steps.push({
        step: "reconcile",
        status: "failure",
        message: `Invoice reconciliation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  } else if (!matchedTenant) {
    steps.push({
      step: "reconcile",
      status: "skipped",
      message: "Invoice reconciliation skipped - no tenant matched",
    });
  } else {
    steps.push({
      step: "reconcile",
      status: "skipped",
      message: "Invoice reconciliation skipped - no amount extracted",
    });
  }

  return c.json({
    data: {
      steps,
      parsed: parsedData,
      matchedTenant,
      invoice: matchedInvoice,
    },
  });
});

export { etransferRouter };
