import { Hono } from "hono";
import { prisma } from "../../prisma";
import { env } from "../../env";
import { sendEmail, getEmailTemplate } from "../../lib/email";

/**
 * Cron Routes for Automatic Rent Invoice Generation
 *
 * This endpoint automatically generates monthly rent invoices for all occupied units
 * 5 days before the rent due date. It reuses the exact same logic as the admin
 * "Generate Invoices" button but runs automatically.
 *
 * Security: Protected by CRON_SECRET environment variable
 *
 * Deployment:
 *   - Create a Render Cron Job that calls:
 *     POST https://your-api.com/api/cron/invoices/generate-monthly
 *     Header: x-cron-secret: YOUR_SECRET
 *   - Schedule: Daily at 2:00 AM (0 2 * * *)
 */

const cronInvoiceGenerationRouter = new Hono();

/**
 * Middleware to verify cron secret
 */
cronInvoiceGenerationRouter.use("*", async (c, next) => {
  const cronSecret = c.req.header("x-cron-secret") || c.req.query("secret");
  const expectedSecret = env.CRON_SECRET || env.DEBUG_ACCESS_KEY;

  if (!expectedSecret) {
    console.error("[CRON-INVOICES] No CRON_SECRET or DEBUG_ACCESS_KEY configured");
    return c.json({ error: { message: "Cron not configured", code: "NOT_CONFIGURED" } }, 500);
  }

  if (cronSecret !== expectedSecret) {
    console.warn("[CRON-INVOICES] Unauthorized cron request attempt");
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  await next();
});

/**
 * Send invoice notification email to tenant
 */
async function sendInvoiceEmail(params: {
  email: string;
  tenantName: string;
  unitLabel: string;
  periodMonth: string;
  amountCents: number;
  dueDate: Date;
}): Promise<{ success: boolean; error?: string }> {
  const appUrl = env.APP_URL || "https://portal.gadevelopments.ca";
  const amount = (params.amountCents / 100).toFixed(2);
  const dueDateStr = params.dueDate.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const subject = `Your Rent Invoice for ${params.periodMonth} is Ready`;
  const content = `
    <p>Hello ${params.tenantName},</p>
    <p>Your rent invoice for <strong>${params.periodMonth}</strong> has been generated and is now available in your tenant portal.</p>
    <div class="info-box">
      <p><strong>Unit:</strong> ${params.unitLabel}</p>
      <p><strong>Amount Due:</strong> <span class="amount-highlight">$${amount} CAD</span></p>
      <p><strong>Due Date:</strong> ${dueDateStr}</p>
    </div>
    <div class="button-container">
      <a href="${appUrl}/login" class="email-button">View Invoice & Pay</a>
    </div>
    <p>You can pay through the tenant portal using e-Transfer or by following the instructions in your portal.</p>
    <p>If you have any questions, please contact us at info@gadevelopments.ca.</p>
  `;

  const html = getEmailTemplate(content, subject);

  return sendEmail({
    to: params.email,
    subject,
    html,
    emailType: "REMINDER",
    toGroup: `Unit ${params.unitLabel}`,
  });
}

/**
 * POST /api/cron/invoices/generate-monthly
 *
 * Automatically generates rent invoices for the upcoming month.
 * Runs daily and checks if invoices need to be created based on rent due dates.
 *
 * Logic:
 * - For each occupied unit, check if rent invoice for the target month exists
 * - If not, create it using the same logic as admin "Generate Invoices"
 * - Send email notification to tenant
 * - Idempotent: never creates duplicates (checked via unitId + periodMonth unique constraint)
 *
 * Query params:
 *   - dryRun: If "true", only log what would be created without actually creating
 *   - daysLead: Days before due date to generate (default: 5)
 */
cronInvoiceGenerationRouter.post("/generate-monthly", async (c) => {
  const dryRun = c.req.query("dryRun") === "true";
  const daysLead = parseInt(c.req.query("daysLead") || "5", 10);

  console.log(`[CRON-INVOICES] Starting auto-generation job - dryRun: ${dryRun}, daysLead: ${daysLead}`);

  try {
    // Get all occupied units with active tenancies
    const occupiedUnits = await prisma.unit.findMany({
      where: {
        status: "OCCUPIED",
        tenancies: {
          some: {
            isActive: true,
          },
        },
      },
      include: {
        tenancies: {
          where: { isActive: true },
          orderBy: { roleInUnit: "asc" }, // PRIMARY first
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

    console.log(`[CRON-INVOICES] Found ${occupiedUnits.length} occupied units`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const results = {
      created: 0,
      skipped: 0,
      errors: [] as { unitLabel: string; error: string }[],
      emailsSent: 0,
      emailsFailed: 0,
      details: [] as {
        unitLabel: string;
        periodMonth: string;
        status: "created" | "skipped" | "error";
        reason?: string;
        emailSent?: boolean;
      }[],
    };

    for (const unit of occupiedUnits) {
      try {
        // Get primary tenancy (or first active)
        const primaryTenancy = unit.tenancies.find((t) => t.roleInUnit === "PRIMARY");
        const tenancy = primaryTenancy ?? unit.tenancies[0];

        if (!tenancy) {
          results.errors.push({ unitLabel: unit.unitLabel, error: "No active tenancy found" });
          results.details.push({
            unitLabel: unit.unitLabel,
            periodMonth: "N/A",
            status: "error",
            reason: "No active tenancy found",
          });
          continue;
        }

        if (!unit.rentAmountCents) {
          results.errors.push({ unitLabel: unit.unitLabel, error: "No rent amount configured" });
          results.details.push({
            unitLabel: unit.unitLabel,
            periodMonth: "N/A",
            status: "error",
            reason: "No rent amount configured",
          });
          continue;
        }

        // Calculate which month's invoice to generate
        // Logic: If today is within `daysLead` of the rentDueDay, generate for this month
        // Otherwise, generate for next month if we're within `daysLead` of next month's due
        const rentDueDay = unit.rentDueDay || 1;

        // Determine target period month
        let targetYear = today.getFullYear();
        let targetMonth = today.getMonth() + 1; // 1-indexed

        // Check if we need this month's invoice
        const thisMonthDue = new Date(targetYear, targetMonth - 1, Math.min(rentDueDay, new Date(targetYear, targetMonth, 0).getDate()));
        const daysUntilThisMonthDue = Math.ceil((thisMonthDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // Check if we need next month's invoice
        let nextMonth = targetMonth + 1;
        let nextYear = targetYear;
        if (nextMonth > 12) {
          nextMonth = 1;
          nextYear++;
        }
        const nextMonthDue = new Date(nextYear, nextMonth - 1, Math.min(rentDueDay, new Date(nextYear, nextMonth, 0).getDate()));
        const daysUntilNextMonthDue = Math.ceil((nextMonthDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // Determine which period to generate for
        let periodYear = targetYear;
        let periodMonth = targetMonth;
        let dueDate = thisMonthDue;

        if (daysUntilThisMonthDue < 0) {
          // This month's due date already passed, check next month
          if (daysUntilNextMonthDue <= daysLead && daysUntilNextMonthDue >= 0) {
            periodYear = nextYear;
            periodMonth = nextMonth;
            dueDate = nextMonthDue;
          } else {
            // Neither period is in range, skip
            results.skipped++;
            results.details.push({
              unitLabel: unit.unitLabel,
              periodMonth: `${targetYear}-${String(targetMonth).padStart(2, "0")}`,
              status: "skipped",
              reason: `Not within lead time (this month: ${daysUntilThisMonthDue}d, next: ${daysUntilNextMonthDue}d)`,
            });
            continue;
          }
        } else if (daysUntilThisMonthDue <= daysLead) {
          // This month is within lead time, generate for this month
          periodYear = targetYear;
          periodMonth = targetMonth;
          dueDate = thisMonthDue;
        } else if (daysUntilNextMonthDue <= daysLead && daysUntilNextMonthDue >= 0) {
          // Next month is within lead time
          periodYear = nextYear;
          periodMonth = nextMonth;
          dueDate = nextMonthDue;
        } else {
          // Neither period is in range
          results.skipped++;
          results.details.push({
            unitLabel: unit.unitLabel,
            periodMonth: `${targetYear}-${String(targetMonth).padStart(2, "0")}`,
            status: "skipped",
            reason: `Not within lead time (this month: ${daysUntilThisMonthDue}d, next: ${daysUntilNextMonthDue}d)`,
          });
          continue;
        }

        const periodMonthStr = `${periodYear}-${String(periodMonth).padStart(2, "0")}`;

        // Check if RENT invoice already exists (idempotency check)
        const existingInvoice = await prisma.invoice.findFirst({
          where: {
            unitId: unit.id,
            periodMonth: periodMonthStr,
            invoiceType: "RENT",
          },
        });

        if (existingInvoice) {
          results.skipped++;
          results.details.push({
            unitLabel: unit.unitLabel,
            periodMonth: periodMonthStr,
            status: "skipped",
            reason: "Invoice already exists",
          });
          continue;
        }

        if (dryRun) {
          results.created++;
          results.details.push({
            unitLabel: unit.unitLabel,
            periodMonth: periodMonthStr,
            status: "created",
            reason: "Dry run - would create",
          });
          continue;
        }

        // Create the invoice (same logic as admin endpoint)
        const dueDateNoon = new Date(Date.UTC(periodYear, periodMonth - 1, dueDate.getDate(), 12, 0, 0));

        await prisma.invoice.create({
          data: {
            unitId: unit.id,
            tenancyId: tenancy.id,
            periodMonth: periodMonthStr,
            dueDate: dueDateNoon,
            amountCents: unit.rentAmountCents,
            status: "OPEN",
            invoiceType: "RENT",
          },
        });

        results.created++;
        console.log(`[CRON-INVOICES] Created invoice for ${unit.unitLabel}: ${periodMonthStr} - $${(unit.rentAmountCents / 100).toFixed(2)}`);

        // Send email notification to tenant
        const tenant = tenancy.user;
        if (tenant.email && tenant.status === "ACTIVE") {
          try {
            const emailResult = await sendInvoiceEmail({
              email: tenant.email,
              tenantName: tenant.name,
              unitLabel: unit.unitLabel,
              periodMonth: periodMonthStr,
              amountCents: unit.rentAmountCents,
              dueDate: dueDateNoon,
            });

            if (emailResult.success) {
              results.emailsSent++;
              console.log(`[CRON-INVOICES] Sent invoice email to ${tenant.email}`);
            } else {
              results.emailsFailed++;
              console.error(`[CRON-INVOICES] Failed to send email to ${tenant.email}: ${emailResult.error}`);
            }

            results.details.push({
              unitLabel: unit.unitLabel,
              periodMonth: periodMonthStr,
              status: "created",
              emailSent: emailResult.success,
            });
          } catch (emailErr: any) {
            results.emailsFailed++;
            console.error(`[CRON-INVOICES] Email error for ${tenant.email}:`, emailErr);
            results.details.push({
              unitLabel: unit.unitLabel,
              periodMonth: periodMonthStr,
              status: "created",
              emailSent: false,
            });
          }
        } else {
          results.details.push({
            unitLabel: unit.unitLabel,
            periodMonth: periodMonthStr,
            status: "created",
            reason: tenant.status !== "ACTIVE" ? "Tenant not active" : "No tenant email",
          });
        }
      } catch (err: any) {
        console.error(`[CRON-INVOICES] Error processing ${unit.unitLabel}:`, err);
        results.errors.push({ unitLabel: unit.unitLabel, error: err.message });
        results.details.push({
          unitLabel: unit.unitLabel,
          periodMonth: "N/A",
          status: "error",
          reason: err.message,
        });
      }
    }

    console.log(
      `[CRON-INVOICES] Job complete - Created: ${results.created}, Skipped: ${results.skipped}, Errors: ${results.errors.length}, Emails sent: ${results.emailsSent}, Emails failed: ${results.emailsFailed}`
    );

    return c.json({
      data: {
        success: true,
        dryRun,
        daysLead,
        timestamp: new Date().toISOString(),
        summary: {
          created: results.created,
          skipped: results.skipped,
          errorCount: results.errors.length,
          emailsSent: results.emailsSent,
          emailsFailed: results.emailsFailed,
        },
        errors: results.errors.length > 0 ? results.errors : undefined,
        details: results.details,
      },
    });
  } catch (error: any) {
    console.error("[CRON-INVOICES] Job failed:", error);
    return c.json(
      { error: { message: error.message || "Failed to generate invoices", code: "CRON_FAILED" } },
      500
    );
  }
});

/**
 * GET /api/cron/invoices/status
 *
 * Check what invoices would be generated on the next run
 */
cronInvoiceGenerationRouter.get("/status", async (c) => {
  const daysLead = parseInt(c.req.query("daysLead") || "5", 10);

  const occupiedUnits = await prisma.unit.findMany({
    where: {
      status: "OCCUPIED",
      tenancies: {
        some: {
          isActive: true,
        },
      },
    },
    include: {
      tenancies: {
        where: { isActive: true },
        orderBy: { roleInUnit: "asc" },
        include: {
          user: {
            select: {
              name: true,
              email: true,
              status: true,
            },
          },
        },
      },
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const status = await Promise.all(
    occupiedUnits.map(async (unit) => {
      const rentDueDay = unit.rentDueDay || 1;
      const targetMonth = today.getMonth() + 1;
      const targetYear = today.getFullYear();

      const thisMonthDue = new Date(targetYear, targetMonth - 1, Math.min(rentDueDay, new Date(targetYear, targetMonth, 0).getDate()));
      const daysUntilDue = Math.ceil((thisMonthDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      const periodMonthStr = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;

      const existingInvoice = await prisma.invoice.findFirst({
        where: {
          unitId: unit.id,
          periodMonth: periodMonthStr,
          invoiceType: "RENT",
        },
      });

      const tenancy = unit.tenancies[0];

      return {
        unitLabel: unit.unitLabel,
        rentAmountCents: unit.rentAmountCents,
        rentDueDay,
        periodMonth: periodMonthStr,
        daysUntilDue,
        invoiceExists: !!existingInvoice,
        invoiceStatus: existingInvoice?.status ?? null,
        wouldGenerate: !existingInvoice && daysUntilDue <= daysLead && daysUntilDue >= 0,
        tenant: tenancy?.user
          ? {
              name: tenancy.user.name,
              email: tenancy.user.email,
              status: tenancy.user.status,
            }
          : null,
      };
    })
  );

  return c.json({
    data: {
      timestamp: new Date().toISOString(),
      daysLead,
      unitsChecked: occupiedUnits.length,
      wouldGenerate: status.filter((s) => s.wouldGenerate).length,
      alreadyExist: status.filter((s) => s.invoiceExists).length,
      units: status,
    },
  });
});

export { cronInvoiceGenerationRouter };
