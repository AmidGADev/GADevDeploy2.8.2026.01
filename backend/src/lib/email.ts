import { prisma } from "../prisma";
import { env } from "../env";
import { Resend } from "resend";
import { isEmailAllowedInStaging } from "./debug";
import { emailLogger } from "./logger";

// Initialize Resend client
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

// Email API response type
interface EmailResponse {
  success: boolean;
  statusCode?: number;
  messageId?: string;
  error?: string;
}

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

/**
 * Delay helper for retry logic
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable (transient network issues, rate limits, etc.)
 */
function isRetryableError(error: string | undefined): boolean {
  if (!error) return false;
  const retryablePatterns = [
    'timeout', 'network', 'rate limit', '429', '503', '504',
    'connection', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'
  ];
  const lowerError = error.toLowerCase();
  return retryablePatterns.some(pattern => lowerError.includes(pattern.toLowerCase()));
}

/**
 * Professional branded email template wrapper for GA Developments
 * Wraps content in a clean, professional HTML email layout
 */
export function getEmailTemplate(content: string, title?: string): string {
  const appUrl = env.APP_URL || "https://portal.gadevelopments.ca";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || "GA Developments"}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset styles */
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }

    /* Base styles */
    body {
      margin: 0 !important;
      padding: 0 !important;
      background-color: #f4f4f7;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333333;
    }

    /* Container */
    .email-wrapper {
      width: 100%;
      background-color: #f4f4f7;
      padding: 40px 20px;
    }

    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    }

    /* Header */
    .email-header {
      background: linear-gradient(135deg, #1a365d 0%, #2c5282 100%);
      padding: 32px 40px;
      text-align: center;
    }

    .email-header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 28px;
      font-weight: 600;
      letter-spacing: -0.5px;
    }

    .email-header .tagline {
      margin: 8px 0 0 0;
      color: rgba(255, 255, 255, 0.85);
      font-size: 14px;
      font-weight: 400;
    }

    /* Content */
    .email-content {
      padding: 40px;
    }

    .email-content p {
      margin: 0 0 16px 0;
      color: #4a5568;
      font-size: 16px;
      line-height: 1.7;
    }

    .email-content p:last-child {
      margin-bottom: 0;
    }

    .email-content h2 {
      margin: 0 0 16px 0;
      color: #1a365d;
      font-size: 20px;
      font-weight: 600;
    }

    .email-content ul, .email-content ol {
      margin: 0 0 16px 0;
      padding-left: 24px;
      color: #4a5568;
    }

    .email-content li {
      margin-bottom: 8px;
    }

    .email-content a {
      color: #2c5282;
      text-decoration: underline;
    }

    /* Button */
    .button-container {
      text-align: center;
      margin: 28px 0;
    }

    .email-button {
      display: inline-block;
      background: linear-gradient(135deg, #1a365d 0%, #2c5282 100%);
      color: #ffffff !important;
      padding: 14px 32px;
      text-decoration: none !important;
      border-radius: 6px;
      font-size: 16px;
      font-weight: 600;
      transition: transform 0.2s ease;
    }

    .email-button:hover {
      transform: translateY(-1px);
    }

    /* Info box */
    .info-box {
      background-color: #f7fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 20px;
      margin: 24px 0;
    }

    .info-box p {
      margin: 4px 0;
      font-size: 15px;
    }

    .info-box strong {
      color: #1a365d;
    }

    /* Amount highlight */
    .amount-highlight {
      font-size: 28px;
      font-weight: 700;
      color: #1a365d;
    }

    /* Divider */
    .divider {
      height: 1px;
      background-color: #e2e8f0;
      margin: 32px 0;
    }

    /* Footer */
    .email-footer {
      background-color: #f7fafc;
      padding: 32px 40px;
      border-top: 1px solid #e2e8f0;
    }

    .footer-content {
      text-align: center;
    }

    .footer-content p {
      margin: 0 0 8px 0;
      color: #718096;
      font-size: 13px;
      line-height: 1.6;
    }

    .footer-content .company-name {
      font-weight: 600;
      color: #4a5568;
      font-size: 14px;
    }

    .footer-content .address {
      color: #a0aec0;
      font-size: 12px;
    }

    .footer-links {
      margin-top: 16px;
    }

    .footer-links a {
      color: #2c5282;
      text-decoration: none;
      font-size: 13px;
      margin: 0 12px;
    }

    .footer-links a:hover {
      text-decoration: underline;
    }

    /* Responsive */
    @media only screen and (max-width: 600px) {
      .email-wrapper {
        padding: 20px 10px;
      }

      .email-header {
        padding: 24px 20px;
      }

      .email-header h1 {
        font-size: 24px;
      }

      .email-content {
        padding: 28px 20px;
      }

      .email-footer {
        padding: 24px 20px;
      }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">
      <!-- Header -->
      <div class="email-header">
        <h1>GA Developments</h1>
        <p class="tagline">Property Management</p>
      </div>

      <!-- Content -->
      <div class="email-content">
        ${content}
      </div>

      <!-- Footer -->
      <div class="email-footer">
        <div class="footer-content">
          <p class="company-name">GA Developments</p>
          <p class="address">709 & 711 Carsons Road, Ottawa, ON K1K 2H2</p>
          <p class="address">info@gadevelopments.ca</p>
          <div class="footer-links">
            <a href="${appUrl}">Tenant Portal</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Check if email is configured (supports both Resend and SendGrid)
 */
export function isEmailConfigured(): boolean {
  return !!env.RESEND_API_KEY || !!env.SENDGRID_API_KEY;
}

/**
 * Get email configuration status for admin UI
 */
export function getEmailConfigStatus(): {
  configured: boolean;
  provider: string;
  fromEmail: string;
  warning?: string;
} {
  if (env.RESEND_API_KEY) {
    return {
      configured: true,
      provider: "resend",
      fromEmail: env.FROM_EMAIL,
    };
  }

  if (env.SENDGRID_API_KEY) {
    return {
      configured: true,
      provider: "sendgrid",
      fromEmail: env.FROM_EMAIL,
    };
  }

  return {
    configured: false,
    provider: "none",
    fromEmail: env.FROM_EMAIL,
    warning: "Email not configured. Set RESEND_API_KEY or SENDGRID_API_KEY environment variable.",
  };
}

/**
 * Send email via Resend API (recommended)
 */
async function sendViaResend(options: EmailOptions, senderName?: string, senderEmail?: string): Promise<EmailResponse> {
  const toAddresses = Array.isArray(options.to) ? options.to : [options.to];
  const fromName = senderName || "GA Developments";
  const fromEmail = senderEmail || env.FROM_EMAIL;

  console.log(`[EMAIL] Resend payload: from=${fromName} <${fromEmail}>, to=${toAddresses.join(", ")}, subject=${options.subject}`);
  console.log(`[EMAIL] Using API key: ${env.RESEND_API_KEY ? `${env.RESEND_API_KEY.substring(0, 15)}...` : "NOT SET"}`);
  console.log(`[EMAIL] FROM_EMAIL env: ${env.FROM_EMAIL}`);
  console.log(`[EMAIL] NODE_ENV: ${env.NODE_ENV || "not set"}`);

  if (!resend) {
    console.error("[EMAIL] Resend client not initialized - API key missing");
    return { success: false, error: "Resend API key not configured" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: toAddresses,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
    });

    console.log(`[EMAIL] Resend SDK response: data=${JSON.stringify(data)}, error=${JSON.stringify(error)}`);

    if (error) {
      // Categorize the error
      const errorCode = (error as any).statusCode || (error as any).code || 'UNKNOWN';
      const errorMessage = `[${errorCode}] ${error.message}`;
      console.error(`[EMAIL] Resend error: ${errorMessage}`);
      return { success: false, error: errorMessage, statusCode: errorCode };
    }

    return { success: true, statusCode: 200, messageId: data?.id };
  } catch (error: any) {
    const errorCode = error.statusCode || error.code || 'EXCEPTION';
    const errorMessage = `[${errorCode}] ${error.message}`;
    console.error("[EMAIL] Resend request failed:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Send email via SendGrid API
 */
async function sendViaSendGrid(options: EmailOptions, senderName?: string, senderEmail?: string): Promise<EmailResponse> {
  const toAddresses = Array.isArray(options.to) ? options.to : [options.to];
  const fromName = senderName || "GA Developments";
  const fromEmail = senderEmail || env.FROM_EMAIL;

  const payload = {
    personalizations: [
      {
        to: toAddresses.map((email) => ({ email })),
      },
    ],
    from: {
      email: fromEmail,
      name: fromName,
    },
    reply_to: options.replyTo ? { email: options.replyTo } : undefined,
    subject: options.subject,
    content: [
      ...(options.text ? [{ type: "text/plain", value: options.text }] : []),
      { type: "text/html", value: options.html },
    ],
  };

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 202) {
      const messageId = response.headers.get("x-message-id") || undefined;
      return { success: true, statusCode: 202, messageId };
    }

    const errorBody = await response.text();
    console.error(`[EMAIL] SendGrid error: ${response.status} - ${errorBody}`);
    return { success: false, statusCode: response.status, error: errorBody };
  } catch (error: any) {
    console.error("[EMAIL] SendGrid request failed:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Log email to database
 */
async function logEmail(params: {
  toEmails: string[];
  subject: string;
  bodyHtml: string;
  emailType: "MANUAL" | "ANNOUNCEMENT" | "INVITATION" | "REMINDER" | "PAYMENT_CONFIRMATION" | "TEST";
  toGroup: string;
  status: "sent" | "failed";
  providerResponse?: string;
  errorMessage?: string;
  createdById?: string;
  source?: "Admin" | "System";
}): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        createdById: params.createdById,
        subject: params.subject,
        bodyHtml: params.bodyHtml,
        toGroup: params.toGroup,
        toEmails: JSON.stringify(params.toEmails),
        emailType: params.emailType,
        source: params.source || "System",
        status: params.status,
        errorMessage: params.errorMessage,
      },
    });
  } catch (error) {
    console.error("[EMAIL] Failed to log email:", error);
  }
}

/**
 * Send email with logging (auto-selects provider: Resend > SendGrid)
 * In staging mode, emails are blocked unless the recipient is in STAGING_EMAIL_ALLOWLIST
 */
export async function sendEmail(
  options: EmailOptions & {
    emailType: "MANUAL" | "ANNOUNCEMENT" | "INVITATION" | "REMINDER" | "PAYMENT_CONFIRMATION" | "TEST";
    toGroup: string;
    createdById?: string;
    source?: "Admin" | "System";
  }
): Promise<{ success: boolean; error?: string; blockedEmails?: string[] }> {
  const toEmails = Array.isArray(options.to) ? options.to : [options.to];
  const source = options.source || "System";

  emailLogger.info(`Sending ${options.emailType} email`, { to: toEmails, subject: options.subject, source });

  // Get email settings for sender identity
  let senderName = "GA Developments";
  let senderEmail = env.FROM_EMAIL || "info@gadevelopments.ca";
  let replyToEmail = options.replyTo;

  try {
    const emailSettings = await prisma.emailSettings.findUnique({ where: { id: "default" } });
    if (emailSettings) {
      senderName = emailSettings.senderName;
      // Only use custom email if domain matches verified domain
      const fromDomain = (env.FROM_EMAIL || "").split("@")[1];
      const settingsDomain = emailSettings.senderEmail.split("@")[1];
      if (fromDomain && settingsDomain && fromDomain === settingsDomain) {
        senderEmail = emailSettings.senderEmail;
      }
      // Use reply-to from settings if not explicitly provided
      if (!replyToEmail && emailSettings.replyToEmail) {
        replyToEmail = emailSettings.replyToEmail;
      }
    }
  } catch (e) {
    // Use defaults if settings fetch fails
    emailLogger.warn("Failed to fetch email settings, using defaults");
  }

  // Check staging email allowlist
  const blockedEmails: string[] = [];
  const allowedEmails: string[] = [];

  for (const email of toEmails) {
    const check = isEmailAllowedInStaging(email);
    if (check.allowed) {
      allowedEmails.push(email);
    } else {
      blockedEmails.push(email);
      emailLogger.warn(`Email blocked by staging allowlist`, { email, reason: check.reason });
    }
  }

  // If all emails were blocked, log and return
  if (allowedEmails.length === 0) {
    const error = `All ${toEmails.length} recipient(s) blocked by staging allowlist`;
    emailLogger.warn(error, { blockedEmails });
    await logEmail({
      toEmails,
      subject: options.subject,
      bodyHtml: options.html,
      emailType: options.emailType,
      toGroup: options.toGroup,
      status: "failed",
      errorMessage: error,
      createdById: options.createdById,
      source,
    });
    return { success: false, error, blockedEmails };
  }

  if (!isEmailConfigured()) {
    const error = "Email not configured. Set RESEND_API_KEY or SENDGRID_API_KEY environment variable.";
    emailLogger.error(error);
    await logEmail({
      toEmails,
      subject: options.subject,
      bodyHtml: options.html,
      emailType: options.emailType,
      toGroup: options.toGroup,
      status: "failed",
      errorMessage: error,
      createdById: options.createdById,
      source,
    });
    return { success: false, error };
  }

  // Use only allowed emails with dynamic sender config
  const emailOptions = {
    ...options,
    to: allowedEmails,
    replyTo: replyToEmail,
    _senderName: senderName,
    _senderEmail: senderEmail,
  };

  // Use Resend if available, otherwise SendGrid
  const provider = env.RESEND_API_KEY ? "Resend" : "SendGrid";

  // Retry logic for transient failures
  const MAX_RETRIES = 2;
  let lastError: string | undefined;
  let result: EmailResponse = { success: false };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (env.RESEND_API_KEY) {
      result = await sendViaResend(emailOptions, senderName, senderEmail);
    } else {
      result = await sendViaSendGrid(emailOptions, senderName, senderEmail);
    }

    if (result.success) {
      break;
    }

    lastError = result.error;

    // Only retry if it's a retryable error and not the last attempt
    if (attempt < MAX_RETRIES && isRetryableError(result.error)) {
      emailLogger.warn(`Email send attempt ${attempt} failed, retrying in 60s...`, { error: result.error });
      await delay(60000); // 60 second delay
    } else {
      // Non-retryable error or last attempt - don't retry
      break;
    }
  }

  await logEmail({
    toEmails: allowedEmails,
    subject: options.subject,
    bodyHtml: options.html,
    emailType: options.emailType,
    toGroup: options.toGroup,
    status: result.success ? "sent" : "failed",
    providerResponse: result.messageId,
    errorMessage: result.error,
    createdById: options.createdById,
    source,
  });

  if (result.success) {
    emailLogger.info(`Successfully sent via ${provider}`, { to: allowedEmails, messageId: result.messageId });
  } else {
    emailLogger.error(`Failed to send via ${provider}`, { error: result.error });
  }

  // If some emails were blocked, include that info
  if (blockedEmails.length > 0) {
    return {
      success: result.success,
      error: result.error,
      blockedEmails,
    };
  }

  return { success: result.success, error: result.error };
}

/**
 * Send invitation email
 */
export async function sendInvitationEmail(params: {
  email: string;
  tenantName?: string;
  unitLabel?: string;
  token: string;
  invitedBy: string;
  createdById: string;
}): Promise<{ success: boolean; error?: string }> {
  const appUrl = env.APP_URL;
  const inviteUrl = `${appUrl}/accept-invite?token=${params.token}`;

  const subject = "You've been invited to GA Developments Tenant Portal";
  const content = `
    <p>Hello${params.tenantName ? ` ${params.tenantName}` : ""},</p>
    <p>You've been invited to join the GA Developments Tenant Portal${params.unitLabel ? ` for <strong>Unit ${params.unitLabel}</strong>` : ""}.</p>
    <p>Click the button below to create your account and access the portal:</p>
    <div class="button-container">
      <a href="${inviteUrl}" class="email-button">Accept Invitation</a>
    </div>
    <p>This invitation will expire in 72 hours.</p>
    <p>If you didn't expect this invitation, you can safely ignore this email.</p>
  `;

  const html = getEmailTemplate(content, subject);

  return sendEmail({
    to: params.email,
    subject,
    html,
    emailType: "INVITATION",
    toGroup: params.unitLabel ? `Unit ${params.unitLabel}` : "New Tenant",
    createdById: params.createdById,
  });
}

/**
 * Send test email
 */
export async function sendTestEmail(params: {
  to: string;
  createdById: string;
}): Promise<{ success: boolean; error?: string }> {
  const subject = "Test Email from GA Developments";
  const content = `
    <p>This is a test email from the GA Developments Tenant Portal.</p>
    <p>If you received this email, your email configuration is working correctly!</p>
    <div class="info-box">
      <p><strong>Sent at:</strong> ${new Date().toISOString()}</p>
    </div>
  `;

  const html = getEmailTemplate(content, subject);

  return sendEmail({
    to: params.to,
    subject,
    html,
    emailType: "TEST",
    toGroup: "Test",
    createdById: params.createdById,
  });
}

/**
 * Send payment reminder email
 */
export async function sendPaymentReminderEmail(params: {
  email: string;
  tenantName: string;
  unitLabel: string;
  periodMonth: string;
  amountCents: number;
  dueDate: Date;
}): Promise<{ success: boolean; error?: string }> {
  const appUrl = env.APP_URL;
  const amount = (params.amountCents / 100).toFixed(2);

  const subject = `Rent Payment Reminder - ${params.periodMonth}`;
  const content = `
    <p>Hello ${params.tenantName},</p>
    <p>This is a friendly reminder that your rent payment for <strong>${params.periodMonth}</strong> is due.</p>
    <div class="info-box">
      <p><strong>Unit:</strong> ${params.unitLabel}</p>
      <p><strong>Amount Due:</strong> <span class="amount-highlight">$${amount} CAD</span></p>
      <p><strong>Due Date:</strong> ${params.dueDate.toLocaleDateString("en-CA")}</p>
    </div>
    <div class="button-container">
      <a href="${appUrl}/login" class="email-button">Pay Now</a>
    </div>
    <p>If you've already made this payment, please disregard this reminder.</p>
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
 * Send welcome email to new tenant with account credentials
 * Concierge-style onboarding experience
 */
export async function sendWelcomeEmail(params: {
  email: string;
  tenantName: string;
  unitLabel: string;
  buildingName?: string;
  password: string;
  createdById: string;
}): Promise<{ success: boolean; error?: string }> {
  const appUrl = env.APP_URL;
  const buildingDisplay = params.buildingName || "GA Developments";
  const firstName = params.tenantName.split(" ")[0];

  const subject = `Welcome Home to ${buildingDisplay}! 🏠`;

  const content = `
    <h2 style="color: #1a365d; margin: 0 0 8px 0; font-size: 24px;">We're thrilled to have you!</h2>
    <p style="color: #4a5568; font-size: 17px; margin: 0 0 24px 0;">Welcome to the GA Developments family, ${firstName}.</p>

    <p>Your new home at <strong>${buildingDisplay}</strong>, <strong>Unit ${params.unitLabel}</strong> is almost ready. We've created a personal Tenant Portal to make your move-in and stay as seamless as possible.</p>

    <!-- Property Card -->
    <div style="background: #f8fafc; border-radius: 12px; padding: 24px; margin: 28px 0; border: 1px solid #e2e8f0;">
      <div style="display: flex; align-items: center; margin-bottom: 16px;">
        <div style="background: #1a365d; border-radius: 8px; padding: 10px; margin-right: 14px; display: inline-block;">
          <span style="font-size: 24px; line-height: 1;">🏢</span>
        </div>
        <div>
          <p style="margin: 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; font-weight: 500;">Your New Home</p>
          <p style="margin: 6px 0 0 0; font-size: 26px; font-weight: 700; color: #0f172a;">${buildingDisplay}</p>
          <p style="margin: 2px 0 0 0; font-size: 18px; font-weight: 600; color: #1e293b;">Unit ${params.unitLabel}</p>
        </div>
      </div>
      <div style="background: #ffffff; border-radius: 8px; padding: 16px; margin-top: 16px; border: 1px solid #e2e8f0;">
        <p style="margin: 0 0 12px 0; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Your Login Credentials</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #475569; font-size: 14px; font-weight: 600; width: 80px;">Email:</td>
            <td style="padding: 6px 0; font-weight: 700; font-size: 14px; color: #0f172a;">${params.email}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #475569; font-size: 14px; font-weight: 600; width: 80px;">Password:</td>
            <td style="padding: 6px 0; font-weight: 700; font-size: 14px; color: #0f172a; font-family: monospace; letter-spacing: 1px;">${params.password}</td>
          </tr>
        </table>
      </div>
    </div>

    <div class="button-container" style="text-align: center; margin: 28px 0;">
      <a href="${appUrl}/login" class="email-button" style="display: inline-block; background: linear-gradient(135deg, #1a365d 0%, #2c5282 100%); border-radius: 8px; padding: 16px 32px; font-size: 16px; color: #ffffff; text-decoration: none; font-weight: 600;">Log In to Your Portal</a>
    </div>

    <div class="divider"></div>

    <h3 style="color: #1a365d; font-size: 16px; margin: 0 0 16px 0;">What You Can Do in Your Portal</h3>

    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; vertical-align: top; width: 36px;">
          <span style="font-size: 20px;">⚡</span>
        </td>
        <td style="padding: 12px 0; vertical-align: top;">
          <p style="margin: 0; font-weight: 600; color: #1a365d;">Instant Payments</p>
          <p style="margin: 4px 0 0 0; font-size: 14px; color: #718096;">View and pay rent invoices with ease — no checks, no hassle.</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; vertical-align: top; width: 36px;">
          <span style="font-size: 20px;">🛠️</span>
        </td>
        <td style="padding: 12px 0; vertical-align: top;">
          <p style="margin: 0; font-weight: 600; color: #1a365d;">Quick Support</p>
          <p style="margin: 4px 0 0 0; font-size: 14px; color: #718096;">Submit and track maintenance requests in real-time.</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; vertical-align: top; width: 36px;">
          <span style="font-size: 20px;">📢</span>
        </td>
        <td style="padding: 12px 0; vertical-align: top;">
          <p style="margin: 0; font-weight: 600; color: #1a365d;">Stay Informed</p>
          <p style="margin: 4px 0 0 0; font-size: 14px; color: #718096;">Get real-time announcements and updates from management.</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; vertical-align: top; width: 36px;">
          <span style="font-size: 20px;">📋</span>
        </td>
        <td style="padding: 12px 0; vertical-align: top;">
          <p style="margin: 0; font-weight: 600; color: #1a365d;">Complete History</p>
          <p style="margin: 4px 0 0 0; font-size: 14px; color: #718096;">Access your full payment history and important documents anytime.</p>
        </td>
      </tr>
    </table>

    <p style="margin-top: 24px;">We're here to make your living experience exceptional. If you have any questions, don't hesitate to reach out at <a href="mailto:info@gadevelopments.ca" style="color: #2c5282;">info@gadevelopments.ca</a>.</p>

    <p style="margin-top: 8px;">Welcome home! 🎉</p>

    <!-- Security Note - Subtle Footer -->
    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; font-size: 12px; color: #a0aec0;">
        <strong style="color: #718096;">🔒 Security Tip:</strong> For your protection, we recommend changing your password after your first login.
      </p>
    </div>
  `;

  const html = getEmailTemplate(content, subject);

  return sendEmail({
    to: params.email,
    subject,
    html,
    emailType: "INVITATION",
    toGroup: params.buildingName ? `${params.buildingName} - Unit ${params.unitLabel}` : `Unit ${params.unitLabel}`,
    createdById: params.createdById,
  });
}

/**
 * Send insurance reminder email to tenant
 */
export async function sendInsuranceReminderEmail(
  email: string,
  tenantName: string
): Promise<{ success: boolean; error?: string }> {
  const appUrl = env.APP_URL;

  const subject = "Reminder: Renters Insurance Required";
  const content = `
    <p>Hello ${tenantName},</p>
    <p>This is a reminder that we require proof of renters insurance for your unit.</p>
    <p>Per your lease agreement, all tenants must maintain active renters insurance and provide documentation to management.</p>

    <div class="info-box">
      <p><strong>Requirements:</strong></p>
      <ul style="margin: 8px 0 0 0; padding-left: 20px;">
        <li>Minimum liability coverage of $100,000</li>
        <li>Policy must list our property address</li>
        <li>GA Developments must be listed as interested party</li>
      </ul>
    </div>

    <div class="button-container">
      <a href="${appUrl}/portal/insurance" class="email-button">Upload Insurance</a>
    </div>

    <p>Please log in to the tenant portal and upload your insurance documentation at your earliest convenience.</p>
    <p>If you have any questions about insurance requirements, please contact us at info@gadevelopments.ca.</p>
  `;

  const html = getEmailTemplate(content, subject);

  return sendEmail({
    to: email,
    subject,
    html,
    emailType: "REMINDER",
    toGroup: `Insurance Reminder - ${tenantName}`,
  });
}
