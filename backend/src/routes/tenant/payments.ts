import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, tenantMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";

const tenantPaymentsRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
tenantPaymentsRouter.use("*", authMiddleware);
tenantPaymentsRouter.use("*", tenantMiddleware);

/**
 * GET /api/tenant/payments
 * Get tenant's payment history with full details
 */
tenantPaymentsRouter.get("/", async (c) => {
  const user = c.get("user");

  const payments = await prisma.payment.findMany({
    where: {
      userId: user.id,
    },
    include: {
      unit: {
        select: {
          id: true,
          unitLabel: true,
        },
      },
      invoice: {
        select: {
          id: true,
          periodMonth: true,
        },
      },
    },
    orderBy: { paidAt: "desc" },
  });

  return c.json({
    data: payments.map((p) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      invoice: p.invoice,
      unitId: p.unitId,
      unit: p.unit,
      userId: p.userId,
      amountCents: p.amountCents,
      paidAt: p.paidAt.toISOString(),
      method: p.method as "stripe" | "etransfer_manual",
      stripePaymentIntentId: p.stripePaymentIntentId,
      receiptUrl: p.receiptUrl,
      // All completed payments can have receipts downloaded
      canDownloadReceipt: true,
    })),
  });
});

/**
 * GET /api/tenant/payments/:id/receipt
 * Generate and return an HTML receipt for a specific payment
 */
tenantPaymentsRouter.get("/:id/receipt", async (c) => {
  const user = c.get("user");
  const paymentId = c.req.param("id");

  // Fetch the payment with related data
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      unit: {
        select: {
          id: true,
          unitLabel: true,
          property: {
            select: {
              name: true,
              address: true,
              city: true,
              province: true,
              postalCode: true,
            },
          },
        },
      },
      invoice: {
        select: {
          id: true,
          periodMonth: true,
          dueDate: true,
        },
      },
    },
  });

  // Check if payment exists
  if (!payment) {
    return c.json({ error: { message: "Payment not found", code: "NOT_FOUND" } }, 404);
  }

  // Verify the payment belongs to the authenticated tenant
  if (payment.userId !== user.id) {
    return c.json({ error: { message: "Access denied", code: "FORBIDDEN" } }, 403);
  }

  // Format the payment date
  const paidAtDate = new Date(payment.paidAt);
  const formattedDate = paidAtDate.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Format the invoice period (YYYY-MM to readable format)
  const periodMonth = payment.invoice.periodMonth;
  const periodParts = periodMonth.split("-");
  const year = periodParts[0] ?? "2024";
  const month = periodParts[1] ?? "01";
  const periodDate = new Date(parseInt(year), parseInt(month) - 1, 1);
  const formattedPeriod = periodDate.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
  });

  // Format amount
  const amountDollars = (payment.amountCents / 100).toFixed(2);

  // Get payment method display name
  const paymentMethodDisplay = payment.method === "stripe" ? "Credit Card (Stripe)" : "e-Transfer";

  // Generate the HTML receipt
  const receiptHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt - ${payment.id}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
      padding: 20px;
    }

    .receipt-container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      overflow: hidden;
      position: relative;
    }

    .header {
      background: linear-gradient(135deg, #1a365d 0%, #2563eb 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }

    .header h1 {
      font-size: 24px;
      margin-bottom: 5px;
      font-weight: 600;
    }

    .header p {
      font-size: 14px;
      opacity: 0.9;
    }

    .receipt-title {
      text-align: center;
      padding: 20px;
      border-bottom: 1px solid #e5e7eb;
    }

    .receipt-title h2 {
      font-size: 20px;
      color: #1a365d;
      margin-bottom: 5px;
    }

    .receipt-number {
      font-size: 12px;
      color: #6b7280;
    }

    .paid-stamp {
      position: absolute;
      top: 120px;
      right: 30px;
      transform: rotate(15deg);
      border: 4px solid #22c55e;
      color: #22c55e;
      padding: 5px 15px;
      font-size: 24px;
      font-weight: bold;
      border-radius: 8px;
      opacity: 0.7;
    }

    .content {
      padding: 30px;
    }

    .section {
      margin-bottom: 25px;
    }

    .section-title {
      font-size: 12px;
      text-transform: uppercase;
      color: #6b7280;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }

    .section-content {
      font-size: 15px;
      color: #1f2937;
    }

    .section-content strong {
      font-weight: 600;
    }

    .details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    .amount-section {
      background: #f8fafc;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin-top: 20px;
    }

    .amount-label {
      font-size: 12px;
      text-transform: uppercase;
      color: #6b7280;
      margin-bottom: 5px;
    }

    .amount-value {
      font-size: 32px;
      font-weight: 700;
      color: #1a365d;
    }

    .footer {
      background: #f8fafc;
      padding: 20px 30px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }

    .footer p {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 5px;
    }

    .footer .official {
      font-weight: 600;
      color: #1f2937;
    }

    @media print {
      body {
        background: white;
        padding: 0;
      }

      .receipt-container {
        box-shadow: none;
        border-radius: 0;
      }

      .no-print {
        display: none;
      }
    }

    .print-button {
      display: block;
      width: 100%;
      padding: 12px;
      background: #1a365d;
      color: white;
      border: none;
      font-size: 16px;
      cursor: pointer;
      margin-top: 20px;
      border-radius: 8px;
    }

    .print-button:hover {
      background: #2563eb;
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="paid-stamp">PAID</div>

    <div class="header">
      <h1>GA Developments</h1>
      <p>${payment.unit.property.address}</p>
      <p>${payment.unit.property.city}, ${payment.unit.property.province} ${payment.unit.property.postalCode}</p>
    </div>

    <div class="receipt-title">
      <h2>Payment Receipt</h2>
      <p class="receipt-number">Receipt #: ${payment.id}</p>
    </div>

    <div class="content">
      <div class="details-grid">
        <div class="section">
          <div class="section-title">Tenant</div>
          <div class="section-content">
            <strong>${payment.user.name}</strong><br>
            ${payment.user.email}
          </div>
        </div>

        <div class="section">
          <div class="section-title">Unit</div>
          <div class="section-content">
            <strong>${payment.unit.unitLabel}</strong><br>
            ${payment.unit.property.name}
          </div>
        </div>

        <div class="section">
          <div class="section-title">Payment Date</div>
          <div class="section-content">
            <strong>${formattedDate}</strong>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Rental Period</div>
          <div class="section-content">
            <strong>${formattedPeriod}</strong>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Payment Method</div>
          <div class="section-content">
            <strong>${paymentMethodDisplay}</strong>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Invoice Reference</div>
          <div class="section-content">
            <strong>${payment.invoiceId}</strong>
          </div>
        </div>
      </div>

      <div class="amount-section">
        <div class="amount-label">Amount Paid</div>
        <div class="amount-value">$${amountDollars} CAD</div>
      </div>
    </div>

    <div class="footer">
      <p class="official">This is an official receipt from GA Developments</p>
      <p>Thank you for your payment</p>
      <p>For questions, contact us at rent@gadevelopments.ca</p>
    </div>
  </div>

  <div class="no-print" style="max-width: 600px; margin: 0 auto;">
    <button class="print-button" onclick="window.print()">Print / Save as PDF</button>
  </div>
</body>
</html>`;

  // Set headers for HTML response
  c.header("Content-Type", "text/html; charset=utf-8");
  c.header("Content-Disposition", `inline; filename="receipt-${payment.id}.html"`);

  return c.html(receiptHtml);
});

export { tenantPaymentsRouter };
