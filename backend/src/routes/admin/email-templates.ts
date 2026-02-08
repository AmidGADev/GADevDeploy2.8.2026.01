import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import {
  EmailTemplateKeySchema,
  UpdateEmailTemplateSchema,
  TestEmailTemplateSchema,
  type EmailTemplateKey,
  type EmailTemplatePlaceholder,
} from "../../types";
import { sendEmail, getEmailTemplate } from "../../lib/email";
import { env } from "../../env";

const emailTemplatesRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
emailTemplatesRouter.use("*", authMiddleware);
emailTemplatesRouter.use("*", adminMiddleware);

// Default templates with their placeholders and automation settings
const DEFAULT_TEMPLATES: Record<
  EmailTemplateKey,
  {
    name: string;
    description: string;
    subject: string;
    body: string;
    placeholders: EmailTemplatePlaceholder[];
    // Default automation settings
    timingOffset: number;
    timingUnit: "days" | "hours";
    timingDirection: "before" | "after";
    frequency: "once" | "daily" | "weekly" | "custom";
    frequencyInterval: number | null;
    maxSendCount: number | null;
    triggerCondition: string | null;
  }
> = {
  WELCOME_EMAIL: {
    name: "Welcome Email",
    description: "Sent to new tenants when their account is created",
    subject: "Welcome Home to {{building_name}}!",
    body: `<p>We're thrilled to have you!</p>

<p>Welcome to the GA Developments family, {{tenant_name}}.</p>

<p>Your new home at <strong>{{building_name}}</strong>, <strong>Unit {{unit_number}}</strong> is almost ready. We've created a personal Tenant Portal to make your move-in and stay as seamless as possible.</p>

<p><strong>Your Login Credentials:</strong></p>
<p>Email: {{tenant_email}}<br/>
Password: {{temporary_password}}</p>

<p style="text-align: center;">
  <a href="{{portal_url}}" class="email-button">Log In to Your Portal</a>
</p>

<p><strong>What You Can Do in Your Portal:</strong></p>
<ul>
  <li><strong>Instant Payments</strong> — View and pay rent invoices with ease</li>
  <li><strong>Quick Support</strong> — Submit and track maintenance requests in real-time</li>
  <li><strong>Stay Informed</strong> — Get real-time announcements and updates from management</li>
  <li><strong>Complete History</strong> — Access your full payment history and important documents anytime</li>
</ul>

<p>We're here to make your living experience exceptional. If you have any questions, don't hesitate to reach out at <a href="mailto:info@gadevelopments.ca">info@gadevelopments.ca</a>.</p>

<p>Welcome home!</p>

<p style="font-size: 12px; color: #718096;"><strong>Security Tip:</strong> For your protection, we recommend changing your password after your first login.</p>`,
    placeholders: [
      { key: "tenant_name", description: "Tenant's first name", example: "John" },
      { key: "tenant_email", description: "Tenant's email address", example: "john.smith@email.com" },
      { key: "building_name", description: "Building name", example: "711 Carsons Terrace" },
      { key: "unit_number", description: "Unit number/label", example: "B2" },
      { key: "temporary_password", description: "Auto-generated temporary password", example: "TempPass123!" },
      { key: "portal_url", description: "Link to tenant portal login", example: "https://app.gadevelopments.ca/login" },
    ],
    // Welcome emails are triggered immediately on account creation
    timingOffset: 0,
    timingUnit: "hours",
    timingDirection: "after",
    frequency: "once",
    frequencyInterval: null,
    maxSendCount: 1,
    triggerCondition: JSON.stringify({ trigger: "account_creation" }),
  },
  RENT_REMINDER: {
    name: "Rent Reminder",
    description: "Sent before rent is due",
    subject: "Reminder: Rent Due in 3 Days - {{building_name}} Unit {{unit_number}}",
    body: `<p>Hello {{tenant_name}},</p>

<p>This is a friendly reminder that your rent payment of <strong>{{amount_due}}</strong> for <strong>{{building_name}}, Unit {{unit_number}}</strong> is due on <strong>{{due_date}}</strong>.</p>

<div class="info-box">
  <p><strong>Payment Details:</strong></p>
  <p>Amount Due: {{amount_due}}</p>
  <p>Due Date: {{due_date}}</p>
  <p>Unit: {{building_name}} - {{unit_number}}</p>
</div>

<p>You can make your payment easily through the Tenant Portal:</p>

<div class="button-container">
  <a href="{{portal_url}}" class="email-button">Pay Now</a>
</div>

<p>If you have already made your payment, please disregard this reminder.</p>

<p>Thank you for being a valued resident at GA Developments!</p>`,
    placeholders: [
      { key: "tenant_name", description: "Tenant's full name", example: "John Smith" },
      { key: "building_name", description: "Building name", example: "711 Carsons" },
      { key: "unit_number", description: "Unit number/label", example: "B2" },
      { key: "amount_due", description: "Formatted amount due", example: "$1,500.00" },
      { key: "due_date", description: "Payment due date", example: "February 1, 2026" },
      { key: "portal_url", description: "Link to tenant portal", example: "https://app.gadevelopments.ca/login" },
    ],
    // Default: 3 days before due date, send once
    timingOffset: 3,
    timingUnit: "days",
    timingDirection: "before",
    frequency: "once",
    frequencyInterval: null,
    maxSendCount: 1,
    triggerCondition: JSON.stringify({ trigger: "due_date", stopOnPayment: true }),
  },
  OVERDUE_ALERT: {
    name: "Overdue Payment Alert",
    description: "Sent after rent is overdue",
    subject: "⚠️ Payment Overdue - {{building_name}} Unit {{unit_number}}",
    body: `<p>Hello {{tenant_name}},</p>

<p>Our records indicate that your rent payment for <strong>{{building_name}}, Unit {{unit_number}}</strong> is now <strong>overdue</strong>.</p>

<div class="info-box" style="border-left: 4px solid #dc2626;">
  <p><strong>⚠️ Overdue Payment:</strong></p>
  <p>Amount Due: {{amount_due}}</p>
  <p>Original Due Date: {{due_date}}</p>
  <p>Days Overdue: {{days_overdue}}</p>
</div>

<p>Please make your payment as soon as possible to avoid any late fees or further action.</p>

<div class="button-container">
  <a href="{{portal_url}}" class="email-button" style="background: #dc2626;">Pay Now</a>
</div>

<p>If you are experiencing financial difficulties, please contact us immediately at info@gadevelopments.ca to discuss payment arrangements.</p>

<p>If you have already made your payment, please allow 1-2 business days for processing.</p>`,
    placeholders: [
      { key: "tenant_name", description: "Tenant's full name", example: "John Smith" },
      { key: "building_name", description: "Building name", example: "711 Carsons" },
      { key: "unit_number", description: "Unit number/label", example: "B2" },
      { key: "amount_due", description: "Formatted amount due", example: "$1,500.00" },
      { key: "due_date", description: "Original due date", example: "February 1, 2026" },
      { key: "days_overdue", description: "Number of days overdue", example: "3" },
      { key: "portal_url", description: "Link to tenant portal", example: "https://app.gadevelopments.ca/login" },
    ],
    // Default: 1 day after due date, repeat every 3 days until paid
    timingOffset: 1,
    timingUnit: "days",
    timingDirection: "after",
    frequency: "custom",
    frequencyInterval: 3,
    maxSendCount: 5,
    triggerCondition: JSON.stringify({ trigger: "due_date", stopOnPayment: true }),
  },
  MAINTENANCE_UPDATE: {
    name: "Maintenance Update",
    description: "Sent when a maintenance ticket status changes",
    subject: "Maintenance Update: {{ticket_title}} - {{new_status}}",
    body: `<p>Hello {{tenant_name}},</p>

<p>There's an update on your maintenance request for <strong>{{building_name}}, Unit {{unit_number}}</strong>.</p>

<div class="info-box">
  <p><strong>Request Details:</strong></p>
  <p>Title: {{ticket_title}}</p>
  <p>Previous Status: {{old_status}}</p>
  <p>New Status: <strong>{{new_status}}</strong></p>
  <p>Submitted: {{submitted_date}}</p>
</div>

{{#if status_message}}
<p><strong>Note from Management:</strong></p>
<p style="background: #f8fafc; padding: 12px; border-radius: 6px; font-style: italic;">{{status_message}}</p>
{{/if}}

<p>You can view the full details and add comments through your Tenant Portal:</p>

<div class="button-container">
  <a href="{{portal_url}}" class="email-button">View Request</a>
</div>

<p>Thank you for your patience!</p>`,
    placeholders: [
      { key: "tenant_name", description: "Tenant's full name", example: "John Smith" },
      { key: "building_name", description: "Building name", example: "711 Carsons" },
      { key: "unit_number", description: "Unit number/label", example: "B2" },
      { key: "ticket_title", description: "Maintenance request title", example: "Leaky faucet in bathroom" },
      { key: "old_status", description: "Previous status", example: "Pending" },
      { key: "new_status", description: "New status", example: "In Progress" },
      { key: "submitted_date", description: "Date request was submitted", example: "January 28, 2026" },
      { key: "status_message", description: "Optional message from management", example: "Plumber scheduled for tomorrow" },
      { key: "portal_url", description: "Link to tenant portal", example: "https://app.gadevelopments.ca/login" },
    ],
    // Maintenance updates are event-driven, sent immediately on status change
    timingOffset: 0,
    timingUnit: "hours",
    timingDirection: "after",
    frequency: "once",
    frequencyInterval: null,
    maxSendCount: null,
    triggerCondition: JSON.stringify({ trigger: "status_change", statuses: ["all"] }),
  },
  NEW_INVOICE: {
    name: "New Invoice Posted",
    description: "Sent when a new invoice is generated",
    subject: "New Invoice: {{invoice_period}} - {{building_name}} Unit {{unit_number}}",
    body: `<p>Hello {{tenant_name}},</p>

<p>A new invoice has been posted to your account for <strong>{{building_name}}, Unit {{unit_number}}</strong>.</p>

<div class="info-box">
  <p><strong>Invoice Details:</strong></p>
  <p>Period: {{invoice_period}}</p>
  <p>Amount: <strong>{{amount_due}}</strong></p>
  <p>Due Date: {{due_date}}</p>
</div>

<p>You can view the full invoice details and make a payment through your Tenant Portal:</p>

<div class="button-container">
  <a href="{{portal_url}}" class="email-button">View Invoice</a>
</div>

<p>Thank you for being a valued resident at GA Developments!</p>`,
    placeholders: [
      { key: "tenant_name", description: "Tenant's full name", example: "John Smith" },
      { key: "building_name", description: "Building name", example: "711 Carsons" },
      { key: "unit_number", description: "Unit number/label", example: "B2" },
      { key: "invoice_period", description: "Invoice billing period", example: "February 2026" },
      { key: "amount_due", description: "Formatted invoice amount", example: "$1,500.00" },
      { key: "due_date", description: "Payment due date", example: "February 1, 2026" },
      { key: "portal_url", description: "Link to tenant portal", example: "https://app.gadevelopments.ca/login" },
    ],
    // New invoices are event-driven, sent immediately on creation
    timingOffset: 0,
    timingUnit: "hours",
    timingDirection: "after",
    frequency: "once",
    frequencyInterval: null,
    maxSendCount: 1,
    triggerCondition: JSON.stringify({ trigger: "invoice_created" }),
  },
};

/**
 * Initialize default templates if they don't exist
 */
async function ensureDefaultTemplates(): Promise<void> {
  for (const [key, template] of Object.entries(DEFAULT_TEMPLATES)) {
    const existing = await prisma.emailTemplate.findUnique({
      where: { templateKey: key },
    });

    if (!existing) {
      await prisma.emailTemplate.create({
        data: {
          templateKey: key,
          name: template.name,
          description: template.description,
          subject: template.subject,
          body: template.body,
          placeholders: JSON.stringify(template.placeholders),
          isActive: true,
          // Automation settings
          timingOffset: template.timingOffset,
          timingUnit: template.timingUnit,
          timingDirection: template.timingDirection,
          frequency: template.frequency,
          frequencyInterval: template.frequencyInterval,
          maxSendCount: template.maxSendCount,
          triggerCondition: template.triggerCondition,
        },
      });
    }
  }
}

/**
 * Validate placeholders in template content
 */
function validatePlaceholders(
  content: string,
  validPlaceholders: string[]
): { valid: boolean; invalidPlaceholders: string[] } {
  const placeholderRegex = /\{\{(\w+)\}\}/g;
  const usedPlaceholders: string[] = [];
  let match;

  while ((match = placeholderRegex.exec(content)) !== null) {
    if (match[1]) {
      usedPlaceholders.push(match[1]);
    }
  }

  const invalidPlaceholders = usedPlaceholders.filter(
    (p) => !validPlaceholders.includes(p)
  );

  return {
    valid: invalidPlaceholders.length === 0,
    invalidPlaceholders,
  };
}

/**
 * Replace placeholders with test/sample data
 */
function replacePlaceholders(
  content: string,
  placeholders: EmailTemplatePlaceholder[]
): string {
  let result = content;
  for (const placeholder of placeholders) {
    const regex = new RegExp(`\\{\\{${placeholder.key}\\}\\}`, "g");
    result = result.replace(regex, placeholder.example);
  }
  // Remove any conditional blocks for test emails
  result = result.replace(/\{\{#if \w+\}\}/g, "");
  result = result.replace(/\{\{\/if\}\}/g, "");
  return result;
}

/**
 * GET /api/admin/email-templates
 * List all email templates
 */
emailTemplatesRouter.get("/", async (c) => {
  // Ensure default templates exist
  await ensureDefaultTemplates();

  const templates = await prisma.emailTemplate.findMany({
    orderBy: { name: "asc" },
  });

  const formattedTemplates = templates.map((t) => ({
    ...t,
    placeholders: JSON.parse(t.placeholders as string),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));

  return c.json({ data: formattedTemplates });
});

/**
 * GET /api/admin/email-templates/:key
 * Get a single template by key
 */
emailTemplatesRouter.get("/:key", async (c) => {
  const key = c.req.param("key");

  // Validate key
  const parseResult = EmailTemplateKeySchema.safeParse(key);
  if (!parseResult.success) {
    return c.json({ error: { message: "Invalid template key", code: "INVALID_KEY" } }, 400);
  }

  // Ensure default templates exist
  await ensureDefaultTemplates();

  const template = await prisma.emailTemplate.findUnique({
    where: { templateKey: key },
  });

  if (!template) {
    return c.json({ error: { message: "Template not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: {
      ...template,
      placeholders: JSON.parse(template.placeholders as string),
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    },
  });
});

/**
 * PUT /api/admin/email-templates/:key
 * Update a template
 */
emailTemplatesRouter.put(
  "/:key",
  zValidator("json", UpdateEmailTemplateSchema),
  async (c) => {
    const key = c.req.param("key");
    const data = c.req.valid("json");
    const userId = c.get("user").id;

    // Validate key
    const parseResult = EmailTemplateKeySchema.safeParse(key);
    if (!parseResult.success) {
      return c.json({ error: { message: "Invalid template key", code: "INVALID_KEY" } }, 400);
    }

    // Ensure default templates exist
    await ensureDefaultTemplates();

    const template = await prisma.emailTemplate.findUnique({
      where: { templateKey: key },
    });

    if (!template) {
      return c.json({ error: { message: "Template not found", code: "NOT_FOUND" } }, 404);
    }

    // Get valid placeholders for this template
    const placeholders = JSON.parse(template.placeholders as string) as EmailTemplatePlaceholder[];
    const validPlaceholderKeys = placeholders.map((p) => p.key);

    // Validate placeholders in subject
    const subjectValidation = validatePlaceholders(data.subject, validPlaceholderKeys);
    if (!subjectValidation.valid) {
      return c.json({
        error: {
          message: `Invalid placeholders in subject: ${subjectValidation.invalidPlaceholders.join(", ")}`,
          code: "INVALID_PLACEHOLDERS",
          invalidPlaceholders: subjectValidation.invalidPlaceholders,
        },
      }, 400);
    }

    // Validate placeholders in body
    const bodyValidation = validatePlaceholders(data.body, validPlaceholderKeys);
    if (!bodyValidation.valid) {
      return c.json({
        error: {
          message: `Invalid placeholders in body: ${bodyValidation.invalidPlaceholders.join(", ")}`,
          code: "INVALID_PLACEHOLDERS",
          invalidPlaceholders: bodyValidation.invalidPlaceholders,
        },
      }, 400);
    }

    const updated = await prisma.emailTemplate.update({
      where: { templateKey: key },
      data: {
        subject: data.subject,
        body: data.body,
        isActive: data.isActive ?? template.isActive,
        // Automation settings
        timingOffset: data.timingOffset ?? template.timingOffset,
        timingUnit: data.timingUnit ?? template.timingUnit,
        timingDirection: data.timingDirection ?? template.timingDirection,
        frequency: data.frequency ?? template.frequency,
        frequencyInterval: data.frequencyInterval !== undefined ? data.frequencyInterval : template.frequencyInterval,
        maxSendCount: data.maxSendCount !== undefined ? data.maxSendCount : template.maxSendCount,
        triggerCondition: data.triggerCondition !== undefined ? data.triggerCondition : template.triggerCondition,
        sendWindowStart: data.sendWindowStart ?? template.sendWindowStart,
        sendWindowEnd: data.sendWindowEnd ?? template.sendWindowEnd,
        sendWindowTimezone: data.sendWindowTimezone ?? template.sendWindowTimezone,
        updatedById: userId,
      },
    });

    return c.json({
      data: {
        ...updated,
        placeholders: JSON.parse(updated.placeholders as string),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  }
);

/**
 * POST /api/admin/email-templates/:key/reset
 * Reset a template to its default content
 */
emailTemplatesRouter.post("/:key/reset", async (c) => {
  const key = c.req.param("key");
  const userId = c.get("user").id;

  // Validate key
  const parseResult = EmailTemplateKeySchema.safeParse(key);
  if (!parseResult.success) {
    return c.json({ error: { message: "Invalid template key", code: "INVALID_KEY" } }, 400);
  }

  const typedKey = key as EmailTemplateKey;
  const defaultTemplate = DEFAULT_TEMPLATES[typedKey];

  if (!defaultTemplate) {
    return c.json({ error: { message: "Template not found", code: "NOT_FOUND" } }, 404);
  }

  const updated = await prisma.emailTemplate.update({
    where: { templateKey: key },
    data: {
      subject: defaultTemplate.subject,
      body: defaultTemplate.body,
      updatedById: userId,
    },
  });

  return c.json({
    data: {
      ...updated,
      placeholders: JSON.parse(updated.placeholders as string),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
});

/**
 * POST /api/admin/email-templates/test
 * Send a test email with sample data
 */
emailTemplatesRouter.post(
  "/test",
  zValidator("json", TestEmailTemplateSchema),
  async (c) => {
    const { templateKey, recipientEmail } = c.req.valid("json");
    const userId = c.get("user").id;

    // Ensure default templates exist
    await ensureDefaultTemplates();

    const template = await prisma.emailTemplate.findUnique({
      where: { templateKey },
    });

    if (!template) {
      return c.json({ error: { message: "Template not found", code: "NOT_FOUND" } }, 404);
    }

    const placeholders = JSON.parse(template.placeholders as string) as EmailTemplatePlaceholder[];

    // Replace placeholders with example data
    const subject = `[TEST] ${replacePlaceholders(template.subject, placeholders)}`;
    const body = replacePlaceholders(template.body, placeholders);

    // Wrap in email template
    const html = getEmailTemplate(body, subject);

    // Send the test email
    const result = await sendEmail({
      to: recipientEmail,
      subject,
      html,
      emailType: "TEST",
      toGroup: `Test: ${template.name}`,
      createdById: userId,
    });

    if (!result.success) {
      return c.json({
        error: {
          message: result.error || "Failed to send test email",
          code: "SEND_FAILED",
        },
      }, 500);
    }

    return c.json({
      data: {
        success: true,
        message: `Test email sent to ${recipientEmail}`,
        templateKey,
        recipientEmail,
      },
    });
  }
);

export default emailTemplatesRouter;
