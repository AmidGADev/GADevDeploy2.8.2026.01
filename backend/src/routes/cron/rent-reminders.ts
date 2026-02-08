import { Hono } from "hono";
import { prisma } from "../../prisma";
import { env } from "../../env";
import { sendPaymentReminderEmail } from "../../lib/email";

/**
 * Cron Routes for Rent Payment Reminders
 *
 * These endpoints are designed to be called by an external scheduler
 * (e.g., Render Cron Jobs, Railway Cron, or any external cron service)
 *
 * Security: Protected by CRON_SECRET environment variable
 */

const cronRentRemindersRouter = new Hono();

/**
 * Middleware to verify cron secret
 * This prevents unauthorized access to cron endpoints
 */
cronRentRemindersRouter.use("*", async (c, next) => {
  const cronSecret = c.req.header("x-cron-secret") || c.req.query("secret");

  // If CRON_SECRET is not set, use DEBUG_ACCESS_KEY as fallback
  const expectedSecret = env.CRON_SECRET || env.DEBUG_ACCESS_KEY;

  if (!expectedSecret) {
    console.error("[CRON] No CRON_SECRET or DEBUG_ACCESS_KEY configured");
    return c.json({ error: { message: "Cron not configured", code: "NOT_CONFIGURED" } }, 500);
  }

  if (cronSecret !== expectedSecret) {
    console.warn("[CRON] Unauthorized cron request attempt");
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  await next();
});

/**
 * POST /api/cron/rent-reminders/send
 *
 * Sends rent payment reminder emails to tenants with unpaid invoices
 * due tomorrow (or on a specified date).
 *
 * This should be scheduled to run daily, ideally at the end of the day
 * (e.g., 6 PM or 8 PM) so tenants receive the reminder the evening before.
 *
 * Query params:
 *   - daysBeforeDue: Number of days before due date to send reminder (default: 1)
 *   - dryRun: If "true", only log what would be sent without actually sending
 */
cronRentRemindersRouter.post("/send", async (c) => {
  const daysBeforeDue = parseInt(c.req.query("daysBeforeDue") || "1", 10);
  const dryRun = c.req.query("dryRun") === "true";

  console.log(`[CRON] Starting rent reminder job - daysBeforeDue: ${daysBeforeDue}, dryRun: ${dryRun}`);

  // Calculate the target due date (tomorrow by default)
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysBeforeDue);
  targetDate.setHours(0, 0, 0, 0);

  const targetDateEnd = new Date(targetDate);
  targetDateEnd.setHours(23, 59, 59, 999);

  console.log(`[CRON] Looking for invoices due between ${targetDate.toISOString()} and ${targetDateEnd.toISOString()}`);

  try {
    // Find all unpaid invoices due on the target date
    const invoices = await prisma.invoice.findMany({
      where: {
        status: { in: ["OPEN", "OVERDUE"] },
        dueDate: {
          gte: targetDate,
          lte: targetDateEnd,
        },
      },
      include: {
        unit: true,
        tenancy: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                status: true,
              },
            },
          },
        },
      },
    });

    console.log(`[CRON] Found ${invoices.length} unpaid invoices due on ${targetDate.toDateString()}`);

    const results = {
      total: invoices.length,
      sent: 0,
      skipped: 0,
      failed: 0,
      details: [] as Array<{
        invoiceId: string;
        tenantEmail: string;
        status: "sent" | "skipped" | "failed";
        reason?: string;
      }>,
    };

    for (const invoice of invoices) {
      const tenant = invoice.tenancy.user;

      // Skip if tenant is not active
      if (tenant.status !== "ACTIVE") {
        results.skipped++;
        results.details.push({
          invoiceId: invoice.id,
          tenantEmail: tenant.email,
          status: "skipped",
          reason: `Tenant status is ${tenant.status}`,
        });
        continue;
      }

      // Check if reminder was already sent for this invoice (reminder #1 = day before)
      const existingReminder = await prisma.reminderLog.findUnique({
        where: {
          invoiceId_reminderNo: {
            invoiceId: invoice.id,
            reminderNo: daysBeforeDue,
          },
        },
      });

      if (existingReminder) {
        results.skipped++;
        results.details.push({
          invoiceId: invoice.id,
          tenantEmail: tenant.email,
          status: "skipped",
          reason: "Reminder already sent",
        });
        continue;
      }

      if (dryRun) {
        results.sent++;
        results.details.push({
          invoiceId: invoice.id,
          tenantEmail: tenant.email,
          status: "sent",
          reason: "Dry run - would have sent",
        });
        continue;
      }

      // Send the reminder email
      try {
        const emailResult = await sendPaymentReminderEmail({
          email: tenant.email,
          tenantName: tenant.name,
          unitLabel: invoice.unit.unitLabel,
          periodMonth: invoice.periodMonth,
          amountCents: invoice.amountCents,
          dueDate: invoice.dueDate,
        });

        if (emailResult.success) {
          // Log the reminder as sent
          await prisma.reminderLog.create({
            data: {
              invoiceId: invoice.id,
              reminderNo: daysBeforeDue,
            },
          });

          results.sent++;
          results.details.push({
            invoiceId: invoice.id,
            tenantEmail: tenant.email,
            status: "sent",
          });

          console.log(`[CRON] Sent rent reminder to ${tenant.email} for invoice ${invoice.id}`);
        } else {
          results.failed++;
          results.details.push({
            invoiceId: invoice.id,
            tenantEmail: tenant.email,
            status: "failed",
            reason: emailResult.error,
          });

          console.error(`[CRON] Failed to send reminder to ${tenant.email}: ${emailResult.error}`);
        }
      } catch (error: any) {
        results.failed++;
        results.details.push({
          invoiceId: invoice.id,
          tenantEmail: tenant.email,
          status: "failed",
          reason: error.message,
        });

        console.error(`[CRON] Error sending reminder to ${tenant.email}:`, error);
      }
    }

    console.log(`[CRON] Rent reminder job complete - Sent: ${results.sent}, Skipped: ${results.skipped}, Failed: ${results.failed}`);

    return c.json({
      data: {
        success: true,
        dryRun,
        targetDate: targetDate.toISOString(),
        ...results,
      },
    });
  } catch (error: any) {
    console.error("[CRON] Rent reminder job failed:", error);
    return c.json(
      { error: { message: error.message || "Failed to process reminders", code: "CRON_FAILED" } },
      500
    );
  }
});

/**
 * GET /api/cron/rent-reminders/status
 *
 * Check the status of upcoming invoices that would receive reminders
 */
cronRentRemindersRouter.get("/status", async (c) => {
  const daysBeforeDue = parseInt(c.req.query("daysBeforeDue") || "1", 10);

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysBeforeDue);
  targetDate.setHours(0, 0, 0, 0);

  const targetDateEnd = new Date(targetDate);
  targetDateEnd.setHours(23, 59, 59, 999);

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["OPEN", "OVERDUE"] },
      dueDate: {
        gte: targetDate,
        lte: targetDateEnd,
      },
    },
    include: {
      unit: {
        select: { unitLabel: true },
      },
      tenancy: {
        include: {
          user: {
            select: { name: true, email: true, status: true },
          },
        },
      },
    },
  });

  // Check which already have reminders
  const invoicesWithReminderStatus = await Promise.all(
    invoices.map(async (invoice) => {
      const existingReminder = await prisma.reminderLog.findUnique({
        where: {
          invoiceId_reminderNo: {
            invoiceId: invoice.id,
            reminderNo: daysBeforeDue,
          },
        },
      });

      return {
        invoiceId: invoice.id,
        unitLabel: invoice.unit.unitLabel,
        periodMonth: invoice.periodMonth,
        amountCents: invoice.amountCents,
        dueDate: invoice.dueDate.toISOString(),
        tenantName: invoice.tenancy.user.name,
        tenantEmail: invoice.tenancy.user.email,
        tenantStatus: invoice.tenancy.user.status,
        reminderAlreadySent: !!existingReminder,
        reminderSentAt: existingReminder?.sentAt.toISOString() ?? null,
      };
    })
  );

  return c.json({
    data: {
      targetDate: targetDate.toISOString(),
      daysBeforeDue,
      invoiceCount: invoices.length,
      invoices: invoicesWithReminderStatus,
    },
  });
});

export { cronRentRemindersRouter };
