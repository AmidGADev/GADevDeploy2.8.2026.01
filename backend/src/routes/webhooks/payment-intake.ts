import { Hono } from "hono";
import { prisma } from "../../prisma";
import { env } from "../../env";
import { webhookLogger } from "../../lib/logger";
import { notifyPaymentReceived } from "../../lib/event-notifications";
import {
  parseInteracEmail,
  matchTenantByName,
  findOldestPendingInvoice,
} from "../../lib/payment-parser";

const paymentIntakeRouter = new Hono();

/**
 * Log to SystemAuditLog for admin visibility
 */
async function logSystemActivity(
  action: string,
  description: string,
  metadata?: Record<string, unknown>,
  success: boolean = true
) {
  try {
    await prisma.systemAuditLog.create({
      data: {
        adminUserId: "SYSTEM_WEBHOOK",
        action,
        category: "PAYMENT_WEBHOOK",
        description,
        metadata: metadata ? JSON.stringify(metadata) : null,
        success,
      },
    });
  } catch (error) {
    webhookLogger.error("Failed to log system activity", { error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * POST /api/webhooks/rent-payment-intake
 * Receive forwarded Interac e-Transfer emails and process them
 */
paymentIntakeRouter.post("/", async (c) => {
  const receivedAt = new Date();
  webhookLogger.info("Received payment intake webhook");

  // Get source IP for logging
  const webhookSource = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";

  // Security: Check webhook secret key (from env or stored in settings)
  const providedKey = c.req.header("x-webhook-secret") || c.req.header("authorization")?.replace("Bearer ", "");

  // Check env var first, then fall back to stored secret
  let expectedSecret = env.PAYMENT_WEBHOOK_SECRET;
  if (!expectedSecret) {
    const settings = await prisma.settings.findUnique({ where: { id: "default" } });
    expectedSecret = settings?.webhookSecret || "";
  }

  const isVerified = expectedSecret ? providedKey === expectedSecret : false;

  if (expectedSecret && !isVerified) {
    webhookLogger.warn("Payment webhook received without valid secret key", { webhookSource });

    // Still log the attempt for visibility (important for email provider verification)
    await logSystemActivity(
      "PAYMENT_WEBHOOK_UNAUTHORIZED",
      "Unauthorized payment webhook attempt",
      { webhookSource },
      false
    );

    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  let rawBody: string | null = null;
  let rawSubject: string | null = null;
  let rawFrom: string | null = null;
  let rawHeaders: Record<string, string> = {};

  try {
    // Parse incoming data - support both JSON and form-data
    const contentType = c.req.header("content-type") || "";

    if (contentType.includes("application/json")) {
      const json = await c.req.json();
      rawBody = json.body || json.text || json.html || json.content || JSON.stringify(json);
      rawSubject = json.subject || json.Subject || "";
      rawFrom = json.from || json.From || json.sender || "";
      rawHeaders = json.headers || {};
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await c.req.formData();
      rawBody = formData.get("body")?.toString() || formData.get("text")?.toString() || formData.get("html")?.toString() || "";
      rawSubject = formData.get("subject")?.toString() || "";
      rawFrom = formData.get("from")?.toString() || "";
    } else if (contentType.includes("text/plain")) {
      rawBody = await c.req.text();
      // Try to extract subject from first line if formatted as email
      const lines = rawBody.split("\n");
      const subjectLine = lines.find((l) => l.toLowerCase().startsWith("subject:"));
      rawSubject = subjectLine?.replace(/^subject:\s*/i, "") || "";
    } else {
      // Try to parse as JSON anyway
      try {
        const json = await c.req.json();
        rawBody = JSON.stringify(json);
      } catch {
        rawBody = await c.req.text();
      }
    }

    // Create initial log entry
    const intakeLog = await prisma.paymentIntakeLog.create({
      data: {
        rawSubject,
        rawBody,
        rawFrom,
        rawHeaders: JSON.stringify(rawHeaders),
        webhookSource,
        isVerified,
        status: "RECEIVED",
        receivedAt,
      },
    });

    // Log receipt for admin visibility (especially important for email provider verification codes)
    await logSystemActivity(
      "PAYMENT_WEBHOOK_RECEIVED",
      `Payment webhook received from ${webhookSource}`,
      {
        logId: intakeLog.id,
        subject: rawSubject?.substring(0, 100),
        from: rawFrom,
        bodyPreview: rawBody?.substring(0, 200),
        isVerified,
      }
    );

    // If no OpenAI key and body is empty/short, this might be a verification request
    if (!rawBody || rawBody.length < 50) {
      await prisma.paymentIntakeLog.update({
        where: { id: intakeLog.id },
        data: {
          status: "MANUAL_REVIEW",
          reconciliationNote: "Short or empty body - possible verification request",
        },
      });

      await logSystemActivity(
        "PAYMENT_WEBHOOK_VERIFICATION",
        "Possible email provider verification request received",
        { logId: intakeLog.id, bodyLength: rawBody?.length }
      );

      return c.json({ received: true, status: "verification_logged" });
    }

    // Parse the email content using AI
    webhookLogger.info("Parsing email content with AI", { logId: intakeLog.id });
    const parsed = await parseInteracEmail(rawBody || "", rawSubject || "");

    // Check for duplicate transaction by reference number
    if (parsed.referenceNumber) {
      const existingLog = await prisma.paymentIntakeLog.findFirst({
        where: {
          referenceNumber: parsed.referenceNumber,
          status: "PAID",
          id: { not: intakeLog.id },
        },
      });

      if (existingLog) {
        webhookLogger.warn("Duplicate transaction detected", {
          referenceNumber: parsed.referenceNumber,
          existingLogId: existingLog.id,
          newLogId: intakeLog.id,
        });

        await prisma.paymentIntakeLog.update({
          where: { id: intakeLog.id },
          data: {
            status: "FAILED",
            reconciliationNote: `Duplicate: Reference ${parsed.referenceNumber} already processed on ${existingLog.reconciledAt?.toISOString() || "unknown date"}`,
          },
        });

        await logSystemActivity(
          "PAYMENT_WEBHOOK_DUPLICATE",
          `Duplicate transaction rejected: Reference ${parsed.referenceNumber} was already processed`,
          { logId: intakeLog.id, existingLogId: existingLog.id, referenceNumber: parsed.referenceNumber },
          false
        );

        return c.json({
          received: true,
          status: "duplicate_rejected",
          reason: "This transaction reference has already been processed",
          referenceNumber: parsed.referenceNumber,
        });
      }
    }

    // Update log with parsed data
    await prisma.paymentIntakeLog.update({
      where: { id: intakeLog.id },
      data: {
        senderName: parsed.senderName,
        amountCents: parsed.amountCents,
        referenceNumber: parsed.referenceNumber,
        parseConfidence: parsed.confidence,
        parseError: parsed.error,
        parsedAt: new Date(),
        status: parsed.senderName && parsed.amountCents ? "PARSED" : "FAILED",
      },
    });

    // If parsing failed or low confidence, mark for manual review
    if (!parsed.senderName || !parsed.amountCents || parsed.confidence < 0.5) {
      const reason = !parsed.senderName
        ? "Could not extract sender name"
        : !parsed.amountCents
        ? "Could not extract amount"
        : "Low parsing confidence";

      await prisma.paymentIntakeLog.update({
        where: { id: intakeLog.id },
        data: {
          status: "MANUAL_REVIEW",
          reconciliationNote: reason,
        },
      });

      await logSystemActivity(
        "PAYMENT_WEBHOOK_PARSE_FAILED",
        `Manual Review Required: ${reason}`,
        {
          logId: intakeLog.id,
          senderName: parsed.senderName,
          amountCents: parsed.amountCents,
          confidence: parsed.confidence,
        },
        false
      );

      return c.json({
        received: true,
        status: "manual_review",
        reason,
        logId: intakeLog.id,
      });
    }

    // Match tenant by name
    webhookLogger.info("Matching tenant by name", { senderName: parsed.senderName });
    const matchedTenant = await matchTenantByName(parsed.senderName!);

    if (!matchedTenant) {
      await prisma.paymentIntakeLog.update({
        where: { id: intakeLog.id },
        data: {
          status: "MANUAL_REVIEW",
          reconciliationNote: `Manual Review Required: Unmatched payment of $${(parsed.amountCents! / 100).toFixed(2)} from ${parsed.senderName}`,
        },
      });

      await logSystemActivity(
        "PAYMENT_WEBHOOK_NO_TENANT_MATCH",
        `Manual Review Required: Unmatched payment of $${(parsed.amountCents! / 100).toFixed(2)} from ${parsed.senderName}`,
        {
          logId: intakeLog.id,
          senderName: parsed.senderName,
          amountCents: parsed.amountCents,
          referenceNumber: parsed.referenceNumber,
        },
        false
      );

      return c.json({
        received: true,
        status: "no_tenant_match",
        senderName: parsed.senderName,
        amountCents: parsed.amountCents,
        logId: intakeLog.id,
      });
    }

    // Update log with matched tenant
    await prisma.paymentIntakeLog.update({
      where: { id: intakeLog.id },
      data: {
        matchedTenantId: matchedTenant.userId,
        status: "MATCHED",
      },
    });

    // Find matching invoice
    webhookLogger.info("Finding matching invoice", {
      userId: matchedTenant.userId,
      amountCents: parsed.amountCents,
    });
    const matchedInvoice = await findOldestPendingInvoice(matchedTenant.userId, parsed.amountCents!);

    if (!matchedInvoice) {
      await prisma.paymentIntakeLog.update({
        where: { id: intakeLog.id },
        data: {
          status: "MANUAL_REVIEW",
          reconciliationNote: `No matching invoice found for ${matchedTenant.name} - Amount: $${(parsed.amountCents! / 100).toFixed(2)}`,
        },
      });

      await logSystemActivity(
        "PAYMENT_WEBHOOK_NO_INVOICE_MATCH",
        `Manual Review Required: Payment from ${matchedTenant.name} but no matching invoice for $${(parsed.amountCents! / 100).toFixed(2)}`,
        {
          logId: intakeLog.id,
          tenantName: matchedTenant.name,
          tenantEmail: matchedTenant.email,
          amountCents: parsed.amountCents,
          referenceNumber: parsed.referenceNumber,
        },
        false
      );

      return c.json({
        received: true,
        status: "no_invoice_match",
        tenantName: matchedTenant.name,
        amountCents: parsed.amountCents,
        logId: intakeLog.id,
      });
    }

    // RECONCILE: Mark invoice as PAID
    webhookLogger.info("Reconciling payment", {
      invoiceId: matchedInvoice.invoiceId,
      tenantName: matchedTenant.name,
    });

    await prisma.$transaction(async (tx) => {
      // Update invoice status
      await tx.invoice.update({
        where: { id: matchedInvoice.invoiceId },
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
          invoiceId: matchedInvoice.invoiceId,
          unitId: matchedInvoice.unitId,
          userId: matchedTenant.userId,
          amountCents: parsed.amountCents!,
          method: "etransfer",
          receiptUrl: parsed.referenceNumber ? `Interac Ref: ${parsed.referenceNumber}` : null,
        },
      });

      // Update intake log
      await tx.paymentIntakeLog.update({
        where: { id: intakeLog.id },
        data: {
          matchedInvoiceId: matchedInvoice.invoiceId,
          status: "PAID",
          reconciliationNote: `Auto-Payment: $${(parsed.amountCents! / 100).toLocaleString()} from ${matchedTenant.name} reconciled.`,
          reconciledAt: new Date(),
        },
      });
    });

    // Log successful reconciliation
    await logSystemActivity(
      "PAYMENT_AUTO_RECONCILED",
      `Auto-Payment: $${(parsed.amountCents! / 100).toLocaleString()} from ${matchedTenant.name} reconciled.`,
      {
        logId: intakeLog.id,
        tenantName: matchedTenant.name,
        tenantEmail: matchedTenant.email,
        amountCents: parsed.amountCents,
        invoiceId: matchedInvoice.invoiceId,
        periodMonth: matchedInvoice.periodMonth,
        referenceNumber: parsed.referenceNumber,
        buildingName: matchedInvoice.buildingName,
        unitLabel: matchedInvoice.unitLabel,
      }
    );

    // Send payment received notification to Communication Center
    await notifyPaymentReceived({
      tenantName: matchedTenant.name,
      tenantEmail: matchedTenant.email,
      buildingName: matchedInvoice.buildingName,
      unitLabel: matchedInvoice.unitLabel,
      periodMonth: matchedInvoice.periodMonth,
      amountCents: parsed.amountCents!,
      paymentMethod: "etransfer",
    });

    webhookLogger.info("Payment successfully reconciled", {
      logId: intakeLog.id,
      tenantName: matchedTenant.name,
      amountCents: parsed.amountCents,
      invoiceId: matchedInvoice.invoiceId,
    });

    return c.json({
      received: true,
      status: "reconciled",
      tenantName: matchedTenant.name,
      amountCents: parsed.amountCents,
      invoiceId: matchedInvoice.invoiceId,
      referenceNumber: parsed.referenceNumber,
      logId: intakeLog.id,
    });
  } catch (error) {
    webhookLogger.error("Payment intake webhook error", {
      error: error instanceof Error ? error.message : String(error),
    });

    // Log error for admin visibility
    await logSystemActivity(
      "PAYMENT_WEBHOOK_ERROR",
      `Webhook processing error: ${error instanceof Error ? error.message : "Unknown error"}`,
      {
        webhookSource,
        error: error instanceof Error ? error.message : String(error),
        rawSubject,
        rawBodyPreview: rawBody?.substring(0, 200),
      },
      false
    );

    return c.json(
      {
        error: {
          message: "Webhook processing failed",
          code: "PROCESSING_ERROR",
        },
      },
      500
    );
  }
});

/**
 * GET /api/webhooks/rent-payment-intake/status
 * Health check endpoint for the payment webhook
 */
paymentIntakeRouter.get("/status", (c) => {
  return c.json({
    status: "ok",
    configured: {
      webhookSecret: !!env.PAYMENT_WEBHOOK_SECRET,
      openaiKey: !!env.OPENAI_API_KEY,
    },
    endpoint: "/api/webhooks/rent-payment-intake",
  });
});

export { paymentIntakeRouter };
