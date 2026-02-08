import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, tenantMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { env } from "../../env";
import { stripeLogger } from "../../lib/logger";
import { notifyPaymentReceived } from "../../lib/event-notifications";

const tenantInvoicesRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
tenantInvoicesRouter.use("*", authMiddleware);
tenantInvoicesRouter.use("*", tenantMiddleware);

/**
 * GET /api/tenant/invoices/etransfer-settings
 * Get e-Transfer settings for tenant UI
 */
tenantInvoicesRouter.get("/etransfer-settings", async (c) => {
  let settings = await prisma.settings.findUnique({
    where: { id: "default" },
  });

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
 * GET /api/tenant/invoices
 * Get all invoices for the tenant's unit (all roommates can see all unit invoices)
 */
tenantInvoicesRouter.get("/", async (c) => {
  const user = c.get("user");

  // Get the tenant's active tenancy
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
  });

  if (!tenancy) {
    return c.json({ data: [] });
  }

  // Get all invoices for the unit (not just this tenant's tenancyId)
  const invoices = await prisma.invoice.findMany({
    where: {
      unitId: tenancy.unitId,
    },
    include: {
      unit: {
        select: {
          id: true,
          unitLabel: true,
          buildingName: true,
        },
      },
      payments: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: { dueDate: "desc" },
  });

  return c.json({
    data: invoices.map((inv) => ({
      id: inv.id,
      unitId: inv.unitId,
      unit: inv.unit,
      tenancyId: inv.tenancyId,
      periodMonth: inv.periodMonth,
      dueDate: inv.dueDate.toISOString(),
      amountCents: inv.amountCents,
      status: inv.status,
      stripeCheckoutSessionId: inv.stripeCheckoutSessionId,
      paymentMethod: inv.paymentMethod,
      etransferStatus: inv.etransferStatus,
      etransferMarkedAt: inv.etransferMarkedAt?.toISOString() ?? null,
      etransferRejectReason: inv.etransferRejectReason,
      createdAt: inv.createdAt.toISOString(),
      payments: inv.payments.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        paidAt: p.paidAt.toISOString(),
        method: p.method,
        paidBy: p.user,
      })),
    })),
  });
});

/**
 * Helper function to calculate Stripe processing fee
 * Stripe Canada fee: 2.9% + $0.30 CAD per transaction
 * We calculate the total needed so that after Stripe takes their fee, landlord gets the full rent
 *
 * Using integer arithmetic to avoid floating-point precision errors:
 * Formula: totalAmount * 0.971 >= rentAmount + 30
 * Rearranged: totalAmount >= (rentAmount + 30) / 0.971
 * Integer form: totalAmount = ceil((rentAmount + 30) * 1000 / 971)
 */
function calculateStripeFee(rentAmountCents: number): {
  rentAmountCents: number;
  processingFeeCents: number;
  totalAmountCents: number;
} {
  // Use integer multiplication to avoid floating-point precision errors
  // (rentAmountCents + 30) * 1000 / 971, with ceiling
  const numerator = (rentAmountCents + 30) * 1000;
  const totalAmountCents = Math.ceil(numerator / 971);
  const processingFeeCents = totalAmountCents - rentAmountCents;

  return {
    rentAmountCents,
    processingFeeCents,
    totalAmountCents,
  };
}

/**
 * GET /api/tenant/invoices/:id
 * Get a single invoice by ID (for Live Payment Tracker polling)
 */
tenantInvoicesRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  // Get the tenant's active tenancy
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
  });

  if (!tenancy) {
    return c.json({ error: { message: "No active tenancy found", code: "NO_TENANCY" } }, 400);
  }

  // Verify invoice exists and belongs to this unit
  const invoice = await prisma.invoice.findFirst({
    where: {
      id,
      unitId: tenancy.unitId,
    },
    include: {
      unit: {
        select: {
          id: true,
          unitLabel: true,
          buildingName: true,
        },
      },
      payments: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!invoice) {
    return c.json({ error: { message: "Invoice not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: {
      id: invoice.id,
      unitId: invoice.unitId,
      unit: invoice.unit,
      tenancyId: invoice.tenancyId,
      periodMonth: invoice.periodMonth,
      dueDate: invoice.dueDate.toISOString(),
      amountCents: invoice.amountCents,
      status: invoice.status,
      stripeCheckoutSessionId: invoice.stripeCheckoutSessionId,
      paymentMethod: invoice.paymentMethod,
      etransferStatus: invoice.etransferStatus,
      etransferMarkedAt: invoice.etransferMarkedAt?.toISOString() ?? null,
      etransferRejectReason: invoice.etransferRejectReason,
      createdAt: invoice.createdAt.toISOString(),
      payments: invoice.payments.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        paidAt: p.paidAt.toISOString(),
        method: p.method,
        paidBy: p.user,
      })),
    },
  });
});

/**
 * GET /api/tenant/invoices/:id/payment-breakdown
 * Get the payment breakdown showing rent amount and processing fee
 * This allows the frontend to show the fee before the tenant clicks "Pay with Card"
 */
tenantInvoicesRouter.get("/:id/payment-breakdown", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  // Get the tenant's active tenancy
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
  });

  if (!tenancy) {
    return c.json({ error: { message: "No active tenancy found", code: "NO_TENANCY" } }, 400);
  }

  // Verify invoice exists and belongs to this unit
  const invoice = await prisma.invoice.findFirst({
    where: {
      id,
      unitId: tenancy.unitId,
    },
  });

  if (!invoice) {
    return c.json({ error: { message: "Invoice not found", code: "NOT_FOUND" } }, 404);
  }

  const breakdown = calculateStripeFee(invoice.amountCents);

  return c.json({
    data: {
      invoiceId: invoice.id,
      periodMonth: invoice.periodMonth,
      rentAmountCents: breakdown.rentAmountCents,
      processingFeeCents: breakdown.processingFeeCents,
      totalAmountCents: breakdown.totalAmountCents,
      feeDescription: "Card processing fee (2.9% + $0.30)",
    },
  });
});

/**
 * POST /api/tenant/invoices/:id/checkout
 * Create Stripe checkout session for an invoice
 * Any tenant in the unit can pay for any unit invoice
 */
tenantInvoicesRouter.post("/:id/checkout", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  // Get the tenant's active tenancy
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
    include: {
      unit: true,
    },
  });

  if (!tenancy) {
    return c.json({ error: { message: "No active tenancy found", code: "NO_TENANCY" } }, 400);
  }

  // Verify invoice exists and belongs to this unit (not just this tenant's tenancy)
  const invoice = await prisma.invoice.findFirst({
    where: {
      id,
      unitId: tenancy.unitId,
    },
  });

  if (!invoice) {
    return c.json({ error: { message: "Invoice not found", code: "NOT_FOUND" } }, 404);
  }

  // Don't allow checkout for paid or voided invoices
  if (invoice.status === "PAID") {
    return c.json({ error: { message: "Invoice is already paid", code: "ALREADY_PAID" } }, 400);
  }

  if (invoice.status === "VOID") {
    return c.json({ error: { message: "Invoice is voided", code: "VOIDED" } }, 400);
  }

  // Check if Stripe is configured
  if (!env.STRIPE_SECRET_KEY) {
    return c.json(
      { error: { message: "Payment processing is not configured", code: "STRIPE_NOT_CONFIGURED" } },
      500
    );
  }

  try {
    // Dynamic import of Stripe to avoid issues if not configured
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    // Determine frontend URL (use APP_URL or derive from BACKEND_URL)
    const frontendUrl = env.APP_URL || env.BACKEND_URL.replace("-api", "-web").replace("/api", "");

    // Calculate Stripe processing fee using helper function
    const { rentAmountCents, processingFeeCents, totalAmountCents } = calculateStripeFee(invoice.amountCents);

    // SECURITY: Log without PII (user ID is internal, not email)
    stripeLogger.info("Creating checkout session", {
      invoiceId: invoice.id,
      rentAmountCents,
      processingFeeCents,
      totalAmountCents,
      userId: user.id,
    });

    // Create Stripe checkout session with rent and processing fee as separate line items
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "cad",
            product_data: {
              name: `Rent - ${tenancy.unit.unitLabel}`,
              description: `Rent payment for ${invoice.periodMonth}`,
            },
            unit_amount: rentAmountCents,
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: "cad",
            product_data: {
              name: "Card Processing Fee",
              description: "Credit/debit card processing fee (2.9% + $0.30)",
            },
            unit_amount: processingFeeCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${frontendUrl}/portal?payment=success&invoice=${invoice.id}`,
      cancel_url: `${frontendUrl}/portal?payment=cancelled&invoice=${invoice.id}`,
      customer_email: user.email,
      metadata: {
        invoiceId: invoice.id,
        userId: user.id,
        unitId: tenancy.unitId,
        rentAmountCents: String(rentAmountCents),
        processingFeeCents: String(processingFeeCents),
      },
    });

    stripeLogger.info("Checkout session created", {
      invoiceId: invoice.id,
      sessionId: session.id,
      totalAmountCents,
    });

    // Store the session ID on the invoice
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        stripeCheckoutSessionId: session.id,
        paymentMethod: "stripe",
      },
    });

    return c.json({
      data: {
        checkoutUrl: session.url,
        sessionId: session.id,
      },
    });
  } catch (error: any) {
    // SECURITY: Don't log full error which may contain sensitive info
    stripeLogger.error("Checkout session creation failed", {
      invoiceId: invoice.id,
      errorCode: error.code || "UNKNOWN",
    });
    return c.json(
      { error: { message: "Failed to create checkout session", code: "STRIPE_ERROR" } },
      500
    );
  }
});

/**
 * POST /api/tenant/invoices/:id/etransfer-sent
 * Mark an invoice as e-Transfer sent (one-click confirmation)
 */
tenantInvoicesRouter.post("/:id/etransfer-sent", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  // Get the tenant's active tenancy
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
    include: {
      unit: true,
    },
  });

  if (!tenancy) {
    return c.json({ error: { message: "No active tenancy found", code: "NO_TENANCY" } }, 400);
  }

  // Verify invoice exists and belongs to this unit
  const invoice = await prisma.invoice.findFirst({
    where: {
      id,
      unitId: tenancy.unitId,
    },
  });

  if (!invoice) {
    return c.json({ error: { message: "Invoice not found", code: "NOT_FOUND" } }, 404);
  }

  // Don't allow for paid or voided invoices
  if (invoice.status === "PAID") {
    return c.json({ error: { message: "Invoice is already paid", code: "ALREADY_PAID" } }, 400);
  }

  if (invoice.status === "VOID") {
    return c.json({ error: { message: "Invoice is voided", code: "VOIDED" } }, 400);
  }

  // Don't allow if already pending e-Transfer
  if (invoice.etransferStatus === "pending") {
    return c.json({ error: { message: "e-Transfer already marked as sent", code: "ALREADY_PENDING" } }, 400);
  }

  // Check if e-Transfer is enabled
  const settings = await prisma.settings.findUnique({
    where: { id: "default" },
  });

  if (settings && !settings.etransferEnabled) {
    return c.json({ error: { message: "e-Transfer payments are not enabled", code: "ETRANSFER_DISABLED" } }, 400);
  }

  const now = new Date();

  // Update invoice with e-Transfer pending status
  const updatedInvoice = await prisma.invoice.update({
    where: { id },
    data: {
      paymentMethod: "etransfer",
      etransferStatus: "pending",
      etransferMarkedAt: now,
      etransferMarkedById: user.id,
      etransferRejectReason: null, // Clear any previous rejection
    },
    include: {
      unit: true,
    },
  });

  // Log email notification to admin (no PII in logs)
  stripeLogger.info("e-Transfer marked as sent", {
    invoiceId: id,
    userId: user.id,
    unitId: tenancy.unitId,
    periodMonth: invoice.periodMonth,
    amountCents: invoice.amountCents,
  });

  return c.json({
    data: {
      id: updatedInvoice.id,
      status: updatedInvoice.status,
      paymentMethod: updatedInvoice.paymentMethod,
      etransferStatus: updatedInvoice.etransferStatus,
      etransferMarkedAt: updatedInvoice.etransferMarkedAt?.toISOString() ?? null,
    },
  });
});

/**
 * POST /api/tenant/invoices/:id/verify-payment
 * Verify payment status with Stripe and update invoice if paid
 * This is a fallback for when webhooks don't reach the server (e.g., in sandbox environments)
 */
tenantInvoicesRouter.post("/:id/verify-payment", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  // Get the tenant's active tenancy
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
  });

  if (!tenancy) {
    return c.json({ error: { message: "No active tenancy found", code: "NO_TENANCY" } }, 400);
  }

  // Find the invoice with unit details for notification
  const invoice = await prisma.invoice.findFirst({
    where: {
      id,
      unitId: tenancy.unitId,
    },
    include: {
      unit: {
        select: {
          buildingName: true,
          unitLabel: true,
        },
      },
    },
  });

  if (!invoice) {
    return c.json({ error: { message: "Invoice not found", code: "NOT_FOUND" } }, 404);
  }

  // If already paid, return success
  if (invoice.status === "PAID") {
    return c.json({
      data: {
        verified: true,
        status: "PAID",
        message: "Invoice already marked as paid",
      },
    });
  }

  // If no Stripe session, nothing to verify
  if (!invoice.stripeCheckoutSessionId) {
    return c.json({
      data: {
        verified: false,
        status: invoice.status,
        message: "No Stripe session found for this invoice",
      },
    });
  }

  // Check if Stripe is configured
  if (!env.STRIPE_SECRET_KEY) {
    return c.json({ error: { message: "Stripe not configured", code: "NOT_CONFIGURED" } }, 500);
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(invoice.stripeCheckoutSessionId);

    stripeLogger.info("Verifying payment status", {
      invoiceId: invoice.id,
      sessionId: session.id,
      paymentStatus: session.payment_status,
    });

    // Check if payment was completed
    if (session.payment_status === "paid") {
      // Get payment intent ID
      const paymentIntentId = typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id || null;

      // Check if payment already exists (idempotency)
      if (paymentIntentId) {
        const existingPayment = await prisma.payment.findFirst({
          where: { stripePaymentIntentId: paymentIntentId },
        });
        if (existingPayment) {
          // Payment exists but invoice wasn't updated - fix the invoice status
          if (invoice.status !== "PAID") {
            await prisma.invoice.update({
              where: { id: invoice.id },
              data: {
                status: "PAID",
                stripePaymentIntentId: paymentIntentId,
              },
            });
          }
          return c.json({
            data: {
              verified: true,
              status: "PAID",
              message: "Payment verified and invoice updated",
            },
          });
        }
      }

      // Update invoice and create payment record in a transaction
      await prisma.$transaction(async (tx) => {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            status: "PAID",
            stripePaymentIntentId: paymentIntentId,
          },
        });

        await tx.payment.create({
          data: {
            invoiceId: invoice.id,
            unitId: invoice.unitId,
            userId: user.id,
            amountCents: session.amount_total || invoice.amountCents,
            method: "stripe",
            stripePaymentIntentId: paymentIntentId,
            receiptUrl: null,
          },
        });
      });

      stripeLogger.info("Payment verified and invoice marked as PAID", { invoiceId: invoice.id });

      // Send payment received notification to Communication Center recipients
      await notifyPaymentReceived({
        tenantName: user.name,
        tenantEmail: user.email,
        buildingName: invoice.unit.buildingName,
        unitLabel: invoice.unit.unitLabel,
        periodMonth: invoice.periodMonth,
        amountCents: session.amount_total || invoice.amountCents,
        paymentMethod: "stripe",
      });

      return c.json({
        data: {
          verified: true,
          status: "PAID",
          message: "Payment verified and invoice marked as paid",
        },
      });
    }

    // Payment not completed
    return c.json({
      data: {
        verified: false,
        status: invoice.status,
        paymentStatus: session.payment_status,
        message: "Payment not completed in Stripe",
      },
    });
  } catch (error: any) {
    stripeLogger.error("Failed to verify payment", {
      invoiceId: invoice.id,
      error: error.message,
    });
    return c.json(
      { error: { message: "Failed to verify payment status", code: "STRIPE_ERROR" } },
      500
    );
  }
});

export { tenantInvoicesRouter };
