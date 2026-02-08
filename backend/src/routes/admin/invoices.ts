import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { InvoiceStatusSchema, ChargeCategorySchema } from "../../types";

const invoicesRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
invoicesRouter.use("*", authMiddleware);
invoicesRouter.use("*", adminMiddleware);

/**
 * GET /api/admin/invoices/buildings
 * Get distinct building names for filtering
 */
invoicesRouter.get("/buildings", async (c) => {
  const units = await prisma.unit.findMany({
    select: {
      buildingName: true,
    },
    distinct: ["buildingName"],
    orderBy: {
      buildingName: "asc",
    },
  });

  const buildings = units
    .map((u) => u.buildingName)
    .filter((name): name is string => name !== null && name.trim() !== "");

  return c.json({ data: buildings });
});

/**
 * GET /api/admin/invoices
 * List all invoices with filters
 */
invoicesRouter.get("/", async (c) => {
  const status = c.req.query("status");
  const unitId = c.req.query("unitId");
  const periodMonth = c.req.query("periodMonth");
  const buildingName = c.req.query("buildingName");
  const search = c.req.query("search");

  const where: any = {};
  if (status) where.status = status;
  if (unitId) where.unitId = unitId;
  if (periodMonth) where.periodMonth = periodMonth;
  if (buildingName) {
    where.unit = { buildingName };
  }
  if (search) {
    where.OR = [
      { unit: { unitLabel: { contains: search } } },
      { unit: { buildingName: { contains: search } } },
      { tenancy: { user: { name: { contains: search } } } },
      { tenancy: { user: { email: { contains: search } } } },
    ];
  }

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      unit: {
        select: {
          id: true,
          unitLabel: true,
          buildingName: true,
          status: true,
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
      payments: {
        select: {
          id: true,
          amountCents: true,
          paidAt: true,
          method: true,
          approvedByAdminId: true,
        },
      },
    },
    orderBy: [
      { dueDate: "desc" },
      { createdAt: "desc" },
    ],
  });

  return c.json({
    data: invoices.map((inv) => ({
      id: inv.id,
      unitId: inv.unitId,
      unit: inv.unit,
      tenancyId: inv.tenancyId,
      tenant: inv.tenancy.user,
      periodMonth: inv.periodMonth,
      dueDate: inv.dueDate.toISOString(),
      amountCents: inv.amountCents,
      status: inv.status,
      invoiceType: inv.invoiceType,
      chargeCategory: inv.chargeCategory,
      description: inv.description,
      stripeCheckoutSessionId: inv.stripeCheckoutSessionId,
      createdAt: inv.createdAt.toISOString(),
      payments: inv.payments.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        paidAt: p.paidAt.toISOString(),
        method: p.method,
        approvedByAdminId: p.approvedByAdminId,
      })),
    })),
  });
});

/**
 * POST /api/admin/invoices
 * Create an invoice manually (rent or custom)
 */
const CreateInvoiceSchema = z.object({
  unitId: z.string().min(1, "Unit is required"),
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/, "Period must be in YYYY-MM format"),
  dueDate: z.string().min(1, "Due date is required"),
  amountCents: z.number().min(0, "Amount must be non-negative"),
  invoiceType: z.enum(["RENT", "CUSTOM"]).default("RENT"),
  chargeCategory: ChargeCategorySchema.optional(),
  description: z.string().optional(),
});

invoicesRouter.post("/", zValidator("json", CreateInvoiceSchema), async (c) => {
  const data = c.req.valid("json");

  // Verify unit exists
  const unit = await prisma.unit.findUnique({
    where: { id: data.unitId },
  });

  if (!unit) {
    return c.json({ error: { message: "Unit not found", code: "NOT_FOUND" } }, 404);
  }

  // Get active tenancy for the unit and verify tenant is active
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      unitId: data.unitId,
      isActive: true,
    },
    include: {
      user: {
        select: {
          id: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!tenancy) {
    return c.json({ error: { message: "No active tenancy for this unit", code: "NO_TENANCY" } }, 400);
  }

  // Prevent creating invoices for deactivated or deleted tenants
  if (tenancy.user.status === "INACTIVE" || tenancy.user.deletedAt) {
    return c.json(
      { error: { message: "Cannot create invoice for deactivated tenant", code: "TENANT_INACTIVE" } },
      400
    );
  }

  // Validate due date is not in the past (warn but allow for backfills)
  const dueDate = new Date(data.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dueDate < today) {
    // Allow past due dates but log a warning - this may be intentional for backdating
    console.log(`[INVOICE] Warning: Creating invoice with past due date ${data.dueDate} for unit ${data.unitId}`);
  }

  // Validate custom invoice requirements
  if (data.invoiceType === "CUSTOM" && !data.chargeCategory) {
    return c.json(
      { error: { message: "Charge category is required for custom invoices", code: "VALIDATION_ERROR" } },
      400
    );
  }

  // Only check for duplicates on RENT invoices (one rent invoice per unit/month)
  // CUSTOM invoices can have multiple per unit/month
  if (data.invoiceType === "RENT") {
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        unitId: data.unitId,
        periodMonth: data.periodMonth,
        invoiceType: "RENT",
      },
    });

    if (existingInvoice) {
      return c.json(
        { error: { message: "A Rent invoice already exists for this unit and period", code: "DUPLICATE" } },
        400
      );
    }
  }

  const invoice = await prisma.invoice.create({
    data: {
      unitId: data.unitId,
      tenancyId: tenancy.id,
      periodMonth: data.periodMonth,
      dueDate: new Date(data.dueDate),
      amountCents: data.amountCents,
      status: "OPEN",
      invoiceType: data.invoiceType,
      chargeCategory: data.invoiceType === "CUSTOM" ? data.chargeCategory : null,
      description: data.invoiceType === "CUSTOM" ? data.description : null,
    },
    include: {
      unit: {
        select: {
          id: true,
          unitLabel: true,
          buildingName: true,
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
  });

  console.log(`[INVOICES] Created ${data.invoiceType} invoice for ${unit.unitLabel}: $${(data.amountCents / 100).toFixed(2)}`);

  return c.json({
    data: {
      id: invoice.id,
      unitId: invoice.unitId,
      unit: invoice.unit,
      tenancyId: invoice.tenancyId,
      tenant: invoice.tenancy.user,
      periodMonth: invoice.periodMonth,
      dueDate: invoice.dueDate.toISOString(),
      amountCents: invoice.amountCents,
      status: invoice.status,
      invoiceType: invoice.invoiceType,
      chargeCategory: invoice.chargeCategory,
      description: invoice.description,
      createdAt: invoice.createdAt.toISOString(),
    },
  });
});

/**
 * PUT /api/admin/invoices/:id
 * Update an invoice (void, etc.)
 */
const UpdateInvoiceSchema = z.object({
  status: InvoiceStatusSchema.optional(),
  amountCents: z.number().min(0).optional(),
  dueDate: z.string().optional(),
});

invoicesRouter.put("/:id", zValidator("json", UpdateInvoiceSchema), async (c) => {
  const id = c.req.param("id");
  const data = c.req.valid("json");

  // Verify invoice exists
  const existing = await prisma.invoice.findUnique({
    where: { id },
  });

  if (!existing) {
    return c.json({ error: { message: "Invoice not found", code: "NOT_FOUND" } }, 404);
  }

  // Don't allow status change if invoice is already paid
  if (existing.status === "PAID" && data.status && data.status !== "PAID") {
    return c.json(
      { error: { message: "Cannot change status of a paid invoice", code: "ALREADY_PAID" } },
      400
    );
  }

  const invoice = await prisma.invoice.update({
    where: { id },
    data: {
      status: data.status,
      amountCents: data.amountCents,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    },
    include: {
      unit: {
        select: {
          id: true,
          unitLabel: true,
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
  });

  return c.json({
    data: {
      id: invoice.id,
      unitId: invoice.unitId,
      unit: invoice.unit,
      tenancyId: invoice.tenancyId,
      tenant: invoice.tenancy.user,
      periodMonth: invoice.periodMonth,
      dueDate: invoice.dueDate.toISOString(),
      amountCents: invoice.amountCents,
      status: invoice.status,
      createdAt: invoice.createdAt.toISOString(),
    },
  });
});

/**
 * POST /api/admin/invoices/generate
 * Generate invoices for all occupied units for a given period
 * Note: Invoice is per unit, uses PRIMARY tenancy for the tenancyId reference
 */
const GenerateInvoicesSchema = z.object({
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/, "Period must be in YYYY-MM format"),
});

invoicesRouter.post("/generate", zValidator("json", GenerateInvoicesSchema), async (c) => {
  const { periodMonth } = c.req.valid("json");

  console.log(`[INVOICES] Generating invoices for period: ${periodMonth}`);

  // Get all units with active tenancies
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
        orderBy: {
          roleInUnit: "asc", // PRIMARY comes first alphabetically
        },
      },
    },
  });

  console.log(`[INVOICES] Found ${occupiedUnits.length} occupied units`);

  let createdCount = 0;
  let skippedCount = 0;
  const errors: { unitLabel: string; error: string }[] = [];
  const created: { unitLabel: string; amountCents: number }[] = [];

  for (const unit of occupiedUnits) {
    try {
      // Prefer PRIMARY tenancy, fallback to any active tenancy
      const primaryTenancy = unit.tenancies.find((t) => t.roleInUnit === "PRIMARY");
      const tenancy = primaryTenancy ?? unit.tenancies[0];
      if (!tenancy) {
        errors.push({ unitLabel: unit.unitLabel, error: "No active tenancy found" });
        continue;
      }

      // Skip if unit has no rent amount configured
      if (!unit.rentAmountCents) {
        errors.push({ unitLabel: unit.unitLabel, error: "No rent amount configured" });
        continue;
      }

      // Check if RENT invoice already exists for this unit and period
      const existingInvoice = await prisma.invoice.findFirst({
        where: {
          unitId: unit.id,
          periodMonth: periodMonth,
          invoiceType: "RENT",
        },
      });

      if (existingInvoice) {
        skippedCount++;
        continue;
      }

      // Calculate due date based on unit's rentDueDay and the period month (America/Toronto timezone)
      const parts = periodMonth.split("-");
      const year = parseInt(parts[0] ?? "0", 10);
      const month = parseInt(parts[1] ?? "0", 10);
      const dueDay = Math.min(unit.rentDueDay, new Date(year, month, 0).getDate()); // Handle months with fewer days

      // Create date in Toronto timezone (EST/EDT)
      const dueDate = new Date(Date.UTC(year, month - 1, dueDay, 12, 0, 0)); // Noon UTC to avoid timezone issues

      // Create the invoice
      await prisma.invoice.create({
        data: {
          unitId: unit.id,
          tenancyId: tenancy.id,
          periodMonth: periodMonth,
          dueDate: dueDate,
          amountCents: unit.rentAmountCents,
          status: "OPEN",
          invoiceType: "RENT",
        },
      });

      createdCount++;
      created.push({ unitLabel: unit.unitLabel, amountCents: unit.rentAmountCents });
      console.log(`[INVOICES] Created invoice for ${unit.unitLabel}: $${(unit.rentAmountCents / 100).toFixed(2)}`);
    } catch (err: any) {
      console.error(`[INVOICES] Error creating invoice for ${unit.unitLabel}:`, err);
      errors.push({ unitLabel: unit.unitLabel, error: err.message });
    }
  }

  console.log(`[INVOICES] Generation complete: created=${createdCount}, skipped=${skippedCount}, errors=${errors.length}`);

  return c.json({
    data: {
      periodMonth,
      created: createdCount,
      skipped: skippedCount,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      invoices: created,
    },
  });
});

/**
 * PUT /api/admin/invoices/:id/paid
 * Mark an invoice as paid and create a payment record
 */
invoicesRouter.put("/:id/paid", async (c) => {
  const id = c.req.param("id");

  // Verify invoice exists
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      tenancy: true,
    },
  });

  if (!invoice) {
    return c.json({ error: { message: "Invoice not found", code: "NOT_FOUND" } }, 404);
  }

  if (invoice.status === "PAID") {
    return c.json({ error: { message: "Invoice is already paid", code: "ALREADY_PAID" } }, 400);
  }

  if (invoice.status === "VOID") {
    return c.json({ error: { message: "Cannot mark a voided invoice as paid", code: "INVOICE_VOID" } }, 400);
  }

  const now = new Date();

  // Update invoice status and create payment record in a transaction
  const [updatedInvoice, payment] = await prisma.$transaction([
    prisma.invoice.update({
      where: { id },
      data: { status: "PAID" },
      include: {
        unit: {
          select: {
            id: true,
            unitLabel: true,
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
    }),
    prisma.payment.create({
      data: {
        invoiceId: id,
        unitId: invoice.unitId,
        userId: invoice.tenancy.userId,
        amountCents: invoice.amountCents,
        paidAt: now,
      },
    }),
  ]);

  return c.json({
    data: {
      id: updatedInvoice.id,
      unitId: updatedInvoice.unitId,
      unit: updatedInvoice.unit,
      tenancyId: updatedInvoice.tenancyId,
      tenant: updatedInvoice.tenancy.user,
      periodMonth: updatedInvoice.periodMonth,
      dueDate: updatedInvoice.dueDate.toISOString(),
      amountCents: updatedInvoice.amountCents,
      status: updatedInvoice.status,
      createdAt: updatedInvoice.createdAt.toISOString(),
      payment: {
        id: payment.id,
        amountCents: payment.amountCents,
        paidAt: payment.paidAt.toISOString(),
      },
    },
  });
});

/**
 * PUT /api/admin/invoices/:id/void
 * Mark an invoice as void
 */
invoicesRouter.put("/:id/void", async (c) => {
  const id = c.req.param("id");

  // Verify invoice exists
  const existing = await prisma.invoice.findUnique({
    where: { id },
  });

  if (!existing) {
    return c.json({ error: { message: "Invoice not found", code: "NOT_FOUND" } }, 404);
  }

  if (existing.status === "PAID") {
    return c.json({ error: { message: "Cannot void a paid invoice", code: "ALREADY_PAID" } }, 400);
  }

  const invoice = await prisma.invoice.update({
    where: { id },
    data: { status: "VOID" },
    include: {
      unit: {
        select: {
          id: true,
          unitLabel: true,
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
  });

  return c.json({
    data: {
      id: invoice.id,
      unitId: invoice.unitId,
      unit: invoice.unit,
      tenancyId: invoice.tenancyId,
      tenant: invoice.tenancy.user,
      periodMonth: invoice.periodMonth,
      dueDate: invoice.dueDate.toISOString(),
      amountCents: invoice.amountCents,
      status: invoice.status,
      createdAt: invoice.createdAt.toISOString(),
    },
  });
});

/**
 * POST /api/admin/invoices/:id/reminder
 * Send a payment reminder for an invoice
 */
invoicesRouter.post("/:id/reminder", async (c) => {
  const id = c.req.param("id");

  // Verify invoice exists
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      unit: {
        select: {
          id: true,
          unitLabel: true,
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
  });

  if (!invoice) {
    return c.json({ error: { message: "Invoice not found", code: "NOT_FOUND" } }, 404);
  }

  if (invoice.status === "PAID") {
    return c.json({ error: { message: "Invoice is already paid", code: "ALREADY_PAID" } }, 400);
  }

  if (invoice.status === "VOID") {
    return c.json({ error: { message: "Cannot send reminder for voided invoice", code: "INVOICE_VOID" } }, 400);
  }

  // Log the reminder (in production, this would send an email)
  console.log(`[REMINDER] Payment reminder sent for invoice ${invoice.id} to ${invoice.tenancy.user.email}`);
  console.log(`  - Unit: ${invoice.unit.unitLabel}`);
  console.log(`  - Period: ${invoice.periodMonth}`);
  console.log(`  - Amount: $${(invoice.amountCents / 100).toFixed(2)}`);
  console.log(`  - Due: ${invoice.dueDate.toISOString()}`);

  return c.json({
    data: {
      success: true,
      invoiceId: invoice.id,
      sentTo: invoice.tenancy.user.email,
      sentAt: new Date().toISOString(),
    },
  });
});

export { invoicesRouter };
