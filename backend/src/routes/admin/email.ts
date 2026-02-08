import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { SendEmailSchema } from "../../types";
import { sendEmail, sendTestEmail, getEmailConfigStatus, isEmailConfigured, getEmailTemplate } from "../../lib/email";

const emailRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
emailRouter.use("*", authMiddleware);
emailRouter.use("*", adminMiddleware);

/**
 * GET /api/admin/email/config
 * Get email configuration status for admin UI
 */
emailRouter.get("/config", async (c) => {
  const status = getEmailConfigStatus();
  return c.json({ data: status });
});

/**
 * POST /api/admin/email/test
 * Send a test email to a specified address or the admin's email
 */
const TestEmailSchema = z.object({
  to: z.string().email().optional(),
});

emailRouter.post("/test", zValidator("json", TestEmailSchema.optional()), async (c) => {
  const user = c.get("user");
  let body: { to?: string } | undefined;
  try {
    body = await c.req.json();
  } catch {
    body = undefined;
  }
  const recipientEmail = body?.to || user.email;

  console.log(`[EMAIL TEST] Admin ${user.email} sending test email to: ${recipientEmail}`);

  if (!isEmailConfigured()) {
    const errorMsg = "Email not configured. Set RESEND_API_KEY environment variable.";
    console.error(`[EMAIL TEST] ${errorMsg}`);
    return c.json(
      {
        ok: false,
        error: errorMsg,
        configured: false,
      },
      400
    );
  }

  const configStatus = getEmailConfigStatus();
  console.log(`[EMAIL TEST] Email provider: ${configStatus.provider}, from: ${configStatus.fromEmail}`);

  const result = await sendTestEmail({
    to: recipientEmail,
    createdById: user.id,
  });

  if (result.success) {
    console.log(`[EMAIL TEST] Successfully sent test email to ${recipientEmail}`);
    return c.json({
      ok: true,
      sentTo: recipientEmail,
      sentAt: new Date().toISOString(),
      provider: configStatus.provider,
    });
  } else {
    console.error(`[EMAIL TEST] Failed to send test email: ${result.error}`);
    return c.json(
      {
        ok: false,
        error: result.error || "Failed to send test email",
        sentTo: recipientEmail,
        provider: configStatus.provider,
      },
      500
    );
  }
});

/**
 * POST /api/admin/email/send
 * Send mass email to tenants
 */
emailRouter.post("/send", zValidator("json", SendEmailSchema), async (c) => {
  const data = c.req.valid("json");
  const user = c.get("user");

  // Get list of recipients based on recipient type
  let recipients: { id: string; email: string; name: string }[] = [];
  let toGroup = "";

  if (data.recipients === "ALL") {
    // Get all active tenants
    const tenants = await prisma.user.findMany({
      where: {
        role: "TENANT",
        status: "ACTIVE",
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
    recipients = tenants;
    toGroup = "All Tenants";
  } else if (data.recipients === "UNITS" && data.unitIds && data.unitIds.length > 0) {
    // Get tenants for specific units
    const tenancies = await prisma.tenancy.findMany({
      where: {
        unitId: { in: data.unitIds },
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        unit: {
          select: {
            unitLabel: true,
          },
        },
      },
    });
    recipients = tenancies.map((t) => t.user);

    // Get unit labels for the group description
    const unitLabels = tenancies.map((t) => t.unit.unitLabel);
    toGroup = `Units: ${unitLabels.join(", ")}`;
  } else if (data.recipients === "CUSTOM" && data.userIds && data.userIds.length > 0) {
    // Get specific users
    const users = await prisma.user.findMany({
      where: {
        id: { in: data.userIds },
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
    recipients = users;
    toGroup = "Custom Selection";
  }

  if (recipients.length === 0) {
    return c.json({ error: { message: "No recipients found", code: "NO_RECIPIENTS" } }, 400);
  }

  // Convert plain text to HTML paragraphs and wrap with professional template
  const formattedContent = data.bodyHtml
    .split(/\n\n+/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  const wrappedHtml = getEmailTemplate(formattedContent, data.subject);

  // Send emails if configured
  let sendSuccess = false;
  let sendError: string | undefined;

  if (isEmailConfigured()) {
    const result = await sendEmail({
      to: recipients.map((r) => r.email),
      subject: data.subject,
      html: wrappedHtml,
      emailType: "MANUAL",
      toGroup,
      createdById: user.id,
      source: "Admin",
    });
    sendSuccess = result.success;
    sendError = result.error;
  } else {
    // Log the email even if not configured (for tracking purposes)
    await prisma.emailLog.create({
      data: {
        createdById: user.id,
        subject: data.subject,
        bodyHtml: wrappedHtml,
        toGroup: toGroup,
        toEmails: JSON.stringify(recipients.map((r) => r.email)),
        emailType: "MANUAL",
        source: "Admin",
        status: "failed",
        errorMessage: "Email not configured - logged but not sent",
      },
    });
    sendError = "Email not configured - logged but not sent";
  }

  return c.json({
    data: {
      subject: data.subject,
      toGroup: toGroup,
      recipientCount: recipients.length,
      recipients: recipients.map((r) => ({ email: r.email, name: r.name })),
      sentAt: new Date().toISOString(),
      sent: sendSuccess,
      error: sendError,
    },
  });
});

/**
 * GET /api/admin/email/logs
 * GET /api/admin/email/history (alias)
 * Get email logs
 */
emailRouter.get("/logs", async (c) => {
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const logs = await prisma.emailLog.findMany({
    take: limit,
    skip: offset,
    orderBy: { sentAt: "desc" },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return c.json({
    data: logs.map((log) => ({
      id: log.id,
      subject: log.subject,
      toGroup: log.toGroup,
      emailType: log.emailType,
      source: log.source,
      status: log.status,
      errorMessage: log.errorMessage,
      sentAt: log.sentAt.toISOString(),
      createdBy: log.createdBy,
      recipientCount: JSON.parse(log.toEmails).length,
    })),
  });
});

// Alias for /logs - frontend uses /history
emailRouter.get("/history", async (c) => {
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const logs = await prisma.emailLog.findMany({
    take: limit,
    skip: offset,
    orderBy: { sentAt: "desc" },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return c.json({
    data: logs.map((log) => ({
      id: log.id,
      subject: log.subject,
      toGroup: log.toGroup,
      emailType: log.emailType,
      source: log.source,
      status: log.status,
      errorMessage: log.errorMessage,
      sentAt: log.sentAt.toISOString(),
      createdBy: log.createdBy,
      recipientCount: JSON.parse(log.toEmails).length,
    })),
  });
});

/**
 * GET /api/admin/email/history/:id
 * Get a single email log with full body for preview
 */
emailRouter.get("/history/:id", async (c) => {
  const { id } = c.req.param();

  const log = await prisma.emailLog.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!log) {
    return c.json({ error: { message: "Email not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: {
      id: log.id,
      subject: log.subject,
      bodyHtml: log.bodyHtml,
      toGroup: log.toGroup,
      toEmails: JSON.parse(log.toEmails),
      emailType: log.emailType,
      source: log.source,
      status: log.status,
      errorMessage: log.errorMessage,
      sentAt: log.sentAt.toISOString(),
      createdBy: log.createdBy,
      recipientCount: JSON.parse(log.toEmails).length,
    },
  });
});

export { emailRouter };
