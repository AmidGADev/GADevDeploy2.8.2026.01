import { Hono } from "hono";
import Stripe from "stripe";
import { prisma } from "../../prisma";
import { env } from "../../env";
import { webhookLogger } from "../../lib/logger";
import { isDebugEnabled } from "../../lib/debug";
import { notifyPaymentReceived } from "../../lib/event-notifications";

const stripeWebhookRouter = new Hono();

/**
 * Store webhook event for debug viewing (redacts sensitive data)
 */
async function storeWebhookEvent(
  source: string,
  eventType: string,
  payload: any,
  status: "received" | "processed" | "failed",
  error?: string
) {
  // Only store in debug mode
  if (!isDebugEnabled()) return;

  try {
    // Redact sensitive fields
    const redactedPayload = { ...payload };
    if (redactedPayload.data?.object) {
      const obj = { ...redactedPayload.data.object };
      // Redact potentially sensitive fields
      if (obj.customer_email) obj.customer_email = "***@***.***";
      if (obj.receipt_email) obj.receipt_email = "***@***.***";
      if (obj.billing_details?.email) obj.billing_details = { ...obj.billing_details, email: "***@***.***" };
      redactedPayload.data.object = obj;
    }

    await prisma.webhookEvent.create({
      data: {
        source,
        eventType,
        payload: JSON.stringify(redactedPayload),
        status,
        error,
        processedAt: status !== "received" ? new Date() : null,
      },
    });
  } catch (err) {
    webhookLogger.error("Failed to store webhook event", { error: err instanceof Error ? err : String(err) });
  }
}

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhook events (payment success)
 */
stripeWebhookRouter.post("/", async (c) => {
  webhookLogger.info("Received Stripe webhook request");

  // Check if Stripe is configured
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    webhookLogger.error("Stripe not configured - missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return c.json({ error: { message: "Stripe not configured", code: "NOT_CONFIGURED" } }, 500);
  }

  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    // Get the raw body for signature verification
    const body = await c.req.text();
    const signature = c.req.header("stripe-signature");

    if (!signature) {
      webhookLogger.error("Missing stripe-signature header");
      return c.json({ error: { message: "Missing stripe-signature header", code: "MISSING_SIGNATURE" } }, 400);
    }

    // Verify the webhook signature
    let event: Stripe.Event;
    try {
      // Use constructEventAsync for Bun compatibility (SubtleCryptoProvider requires async)
      event = await stripe.webhooks.constructEventAsync(body, signature, env.STRIPE_WEBHOOK_SECRET);
      webhookLogger.info(`Signature verified`, { eventType: event.type, eventId: event.id });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      webhookLogger.error("Signature verification failed", { error: message });
      return c.json({ error: { message: "Invalid signature", code: "INVALID_SIGNATURE" } }, 400);
    }

    // Store webhook event for debug viewing
    await storeWebhookEvent("stripe", event.type, event, "received");

    // Handle the event
    let processingError: string | undefined;
    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          webhookLogger.info(`Processing checkout.session.completed`, { sessionId: session.id });
          await handleCheckoutComplete(session);
          break;
        }

        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          webhookLogger.info(`PaymentIntent succeeded`, { paymentIntentId: paymentIntent.id, amount: paymentIntent.amount });
          // The checkout.session.completed event is more reliable for our use case
          break;
        }

        default:
          webhookLogger.info(`Unhandled event type`, { eventType: event.type });
      }

      // Update webhook status to processed
      await storeWebhookEvent("stripe", event.type, event, "processed");
    } catch (err: any) {
      processingError = err.message;
      webhookLogger.error(`Failed to process event`, { eventType: event.type, error: err instanceof Error ? err : String(err) });
      await storeWebhookEvent("stripe", event.type, event, "failed", processingError);
    }

    return c.json({ received: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    webhookLogger.error("Webhook error", { error: error instanceof Error ? error : String(error) });
    return c.json(
      { error: { message, code: "WEBHOOK_ERROR" } },
      500
    );
  }
});

/**
 * Handle checkout.session.completed event
 */
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoiceId;
  const userId = session.metadata?.userId;

  webhookLogger.info("handleCheckoutComplete called", {
    sessionId: session.id,
    invoiceId,
    userId,
    amount: session.amount_total,
  });

  if (!invoiceId) {
    webhookLogger.error("Checkout session missing invoiceId in metadata");
    return;
  }

  // Find the invoice by session ID
  const invoice = await prisma.invoice.findFirst({
    where: {
      OR: [
        { id: invoiceId },
        { stripeCheckoutSessionId: session.id },
      ],
    },
  });

  if (!invoice) {
    webhookLogger.error("Invoice not found", { invoiceId });
    return;
  }

  webhookLogger.info("Found invoice", { invoiceId: invoice.id, currentStatus: invoice.status });

  // Check if already paid (idempotency)
  if (invoice.status === "PAID") {
    webhookLogger.info("Invoice already marked as paid - skipping", { invoiceId });
    return;
  }

  // Get payment intent ID for idempotency check
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id || null;

  // Check if payment already exists with this payment intent (idempotency for duplicate webhooks)
  if (paymentIntentId) {
    const existingPayment = await prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (existingPayment) {
      webhookLogger.info("Payment already recorded for this payment intent - skipping", {
        paymentIntentId,
        existingPaymentId: existingPayment.id
      });
      return;
    }
  }

  // Get the actual user ID (need to look up from tenancy if not in metadata)
  let paymentUserId = userId;

  // Get full invoice details including tenant and unit info for notification
  const invoiceWithDetails = await prisma.invoice.findUnique({
    where: { id: invoice.id },
    include: {
      unit: {
        select: {
          buildingName: true,
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

  if (!paymentUserId && invoiceWithDetails?.tenancy?.userId) {
    paymentUserId = invoiceWithDetails.tenancy.userId;
  }

  if (!paymentUserId) {
    webhookLogger.error("Could not determine user ID for payment", { invoiceId });
    return;
  }

  // Use transaction to ensure atomicity - both invoice update and payment creation succeed or fail together
  await prisma.$transaction(async (tx) => {
    // Update invoice status to PAID
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "PAID",
        stripePaymentIntentId: paymentIntentId,
      },
    });

    // Create payment record
    await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        unitId: invoice.unitId,
        userId: paymentUserId!,
        amountCents: session.amount_total || invoice.amountCents,
        method: "stripe",
        stripePaymentIntentId: paymentIntentId,
        receiptUrl: null, // Receipt URL comes from a different event
      },
    });
  });

  webhookLogger.info("Invoice marked as PAID and payment recorded", { invoiceId: invoice.id });

  // Send payment received notification to Communication Center recipients
  if (invoiceWithDetails) {
    await notifyPaymentReceived({
      tenantName: invoiceWithDetails.tenancy.user.name,
      tenantEmail: invoiceWithDetails.tenancy.user.email,
      buildingName: invoiceWithDetails.unit.buildingName,
      unitLabel: invoiceWithDetails.unit.unitLabel,
      periodMonth: invoiceWithDetails.periodMonth,
      amountCents: session.amount_total || invoiceWithDetails.amountCents,
      paymentMethod: "stripe",
    });
  }
}

export { stripeWebhookRouter };
