// Only load Vibecode proxy in non-production (sandbox) environments
if (process.env.NODE_ENV !== "production") {
  import("@vibecodeapp/proxy");
}
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env, isProduction } from "./env";
import { auth } from "./auth";
import { requestTracingMiddleware } from "./lib/logger";
import {
  loginRateLimit,
  signupRateLimit,
  publicEndpointRateLimit,
  generalApiRateLimit,
} from "./lib/rate-limit";
import { securityMiddleware } from "./lib/security-headers";

// Route imports
import { propertyRouter } from "./routes/property";
import { unitsRouter } from "./routes/admin/units";
import { tenantsRouter } from "./routes/admin/tenants";
import { announcementsRouter } from "./routes/admin/announcements";
import { serviceRequestsRouter } from "./routes/admin/service-requests";
import { showingRequestsRouter } from "./routes/admin/showing-requests";
import { invoicesRouter } from "./routes/admin/invoices";
import { dashboardRouter } from "./routes/admin/dashboard";
import { emailRouter } from "./routes/admin/email";
import { tenantDashboardRouter, tenantUnitRouter, tenantTenancyInfoRouter } from "./routes/tenant/dashboard";
import { tenantInvoicesRouter } from "./routes/tenant/invoices";
import { tenantPaymentsRouter } from "./routes/tenant/payments";
import { tenantServiceRequestsRouter } from "./routes/tenant/service-requests";
import { tenantAnnouncementsRouter } from "./routes/tenant/announcements";
import { stripeWebhookRouter } from "./routes/webhooks/stripe";
import { paymentIntakeRouter } from "./routes/webhooks/payment-intake";
import { invitationsRouter } from "./routes/admin/invitations";
import { publicInvitationsRouter } from "./routes/public/invitations";
import { etransferRouter } from "./routes/admin/etransfer";
import { meRouter } from "./routes/me";
import { tenantInsuranceRouter } from "./routes/tenant/insurance";
import { tenantDocumentsRouter } from "./routes/tenant/documents";
import { tenantComplianceRouter } from "./routes/tenant/compliance";
import { tenantBuildingInfoRouter } from "./routes/tenant/building-info";
import { adminInsuranceRouter } from "./routes/admin/insurance";
import { adminDocumentsRouter } from "./routes/admin/documents";
import { adminBuildingInfoRouter } from "./routes/admin/building-info";
import { adminChecklistRouter } from "./routes/admin/checklist";
import { moveOutChecklistRouter } from "./routes/admin/move-out-checklist";
import { complianceRouter } from "./routes/admin/compliance";
import { adminUnitAssetsRouter } from "./routes/admin/unit-assets";
import { uploadsRouter } from "./routes/uploads";
import { cronRentRemindersRouter } from "./routes/cron/rent-reminders";
import { cronInvoiceGenerationRouter } from "./routes/cron/invoice-generation";
import { cronAutoBackupRouter } from "./routes/cron/auto-backup";
import { tenantChecklistRouter } from "./routes/tenant/checklist";
import { tenantMoveOutChecklistRouter } from "./routes/tenant/move-out-checklist";
import { tenantUnitAssetsRouter } from "./routes/tenant/unit-assets";
import { tenantMoveOutRequestRouter } from "./routes/tenant/move-out-request";
import { adminMoveOutRequestRouter } from "./routes/admin/move-out-requests";
import { inspectionsRouter } from "./routes/admin/inspections";
import { tenantInspectionsRouter } from "./routes/tenant/inspections";
import { tenantCalendarRouter } from "./routes/tenant/calendar";
import { adminCalendarRouter } from "./routes/admin/calendar";
import { settingsRouter } from "./routes/admin/settings";
import { adminMfaRouter } from "./routes/admin/mfa";
import { adminTenanciesRouter } from "./routes/admin/tenancies";
import { adminPropertiesRouter } from "./routes/admin/properties";
import { notificationSettingsRouter } from "./routes/admin/notification-settings";
import emailTemplatesRouter from "./routes/admin/email-templates";
import emailSettingsRouter from "./routes/admin/email-settings";
import dataPurgeRouter from "./routes/admin/data-purge";
import { documentManagerRouter } from "./routes/document-manager";

const app = new Hono();

// ============================================
// CORS Configuration
// ============================================
// SECURITY: Strict origin allowlist - only allow known domains
// Each pattern is specific to prevent subdomain abuse
const allowedOrigins = [
  // Local development (only in non-production)
  ...(isProduction() ? [] : [
    /^http:\/\/localhost(:\d+)?$/,
    /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  ]),
  // Vibecode preview environments
  /^https:\/\/[a-z0-9-]+\.dev\.vibecode\.run$/,
  /^https:\/\/[a-z0-9-]+\.vibecode\.run$/,
  /^https:\/\/[a-z0-9-]+\.vibecodeapp\.com$/,
  /^https:\/\/[a-z0-9-]+\.share\.sandbox\.dev$/,
  // Production domains
  /^https:\/\/(www\.)?gadevelopments\.ca$/,
  /^https:\/\/api\.gadevelopments\.ca$/,
];

app.use(
  "*",
  cors({
    origin: (origin) => {
      // No origin (same-origin or non-browser requests)
      if (!origin) return null;

      const isAllowed = allowedOrigins.some((re) => re.test(origin));
      if (!isAllowed) {
        // Log rejected origins for monitoring (use apiLogger for structured logging)
        console.warn(`[CORS] Rejected origin: ${origin}`);
      }
      return isAllowed ? origin : null;
    },
    credentials: true,
    // Explicitly define allowed methods
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // Explicitly define allowed headers
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "X-Request-ID",
    ],
    // Expose these headers to the client
    exposeHeaders: [
      "X-Request-ID",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
    ],
    // Cache preflight requests for 1 hour
    maxAge: 3600,
  })
);

// Logging
app.use("*", logger());

// Security headers middleware
app.use("*", securityMiddleware);

// Request tracing middleware (adds x-request-id header)
app.use("*", requestTracingMiddleware);

// General API rate limiting (applies to all routes)
app.use("*", generalApiRateLimit);

// Health check endpoint (no rate limit needed - used by load balancers)
app.get("/health", (c) => c.json({ status: "ok" }));

// Stripe config check endpoint (for debugging webhook issues)
app.get("/health/stripe", (c) => {
  return c.json({
    stripeSecretKey: env.STRIPE_SECRET_KEY ? "configured" : "missing",
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ? "configured" : "missing",
    webhookEndpoint: "/api/webhooks/stripe",
  });
});

// ============================================
// Secure file uploads (requires authentication)
// ============================================
// SECURITY: Files are served through authenticated route with authorization checks
app.route("/api/uploads", uploadsRouter);

// ============================================
// Auth routes (Better Auth handler)
// ============================================
// Apply stricter rate limiting to auth endpoints
app.use("/api/auth/sign-in/*", loginRateLimit);
app.use("/api/auth/sign-up/*", signupRateLimit);
app.use("/api/auth/forget-password", loginRateLimit); // Same limit as login
app.use("/api/auth/reset-password", loginRateLimit);
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// ============================================
// Public routes (with rate limiting)
// ============================================
app.use("/api/property", publicEndpointRateLimit);
app.use("/api/invitations/*", publicEndpointRateLimit);
app.route("/api/property", propertyRouter);
app.route("/api/invitations", publicInvitationsRouter);

// ============================================
// Webhook routes (no auth required, signature verified)
// ============================================
app.route("/api/webhooks/stripe", stripeWebhookRouter);
app.route("/api/webhooks/rent-payment-intake", paymentIntakeRouter);

// ============================================
// Cron routes (authenticated via CRON_SECRET)
// ============================================
app.route("/api/cron/rent-reminders", cronRentRemindersRouter);
app.route("/api/cron/invoices", cronInvoiceGenerationRouter);
app.route("/api/cron/auto-backup", cronAutoBackupRouter);

// ============================================
// Admin routes
// ============================================
app.route("/api/admin/units", unitsRouter);
app.route("/api/admin/tenants", tenantsRouter);
app.route("/api/admin/announcements", announcementsRouter);
app.route("/api/admin/service-requests", serviceRequestsRouter);
app.route("/api/admin/showing-requests", showingRequestsRouter);
app.route("/api/admin/invoices", invoicesRouter);
app.route("/api/admin/dashboard", dashboardRouter);
app.route("/api/admin/email", emailRouter);
app.route("/api/admin/invitations", invitationsRouter);
app.route("/api/admin/etransfer", etransferRouter);
app.route("/api/admin/insurance", adminInsuranceRouter);
app.route("/api/admin/documents", adminDocumentsRouter);
app.route("/api/admin/building-info", adminBuildingInfoRouter);
app.route("/api/admin/checklist", adminChecklistRouter);
app.route("/api/admin/move-out-checklist", moveOutChecklistRouter);
app.route("/api/admin/compliance", complianceRouter);
app.route("/api/admin/units", adminUnitAssetsRouter);
app.route("/api/admin/move-out-requests", adminMoveOutRequestRouter);
app.route("/api/admin/inspections", inspectionsRouter);
app.route("/api/admin/settings", settingsRouter);
app.route("/api/admin/calendar", adminCalendarRouter);
app.route("/api/admin/mfa", adminMfaRouter);
app.route("/api/admin/tenancies", adminTenanciesRouter);
app.route("/api/admin/properties", adminPropertiesRouter);
app.route("/api/admin/notification-settings", notificationSettingsRouter);
app.route("/api/admin/email-templates", emailTemplatesRouter);
app.route("/api/admin/email-settings", emailSettingsRouter);
app.route("/api/admin/data-purge", dataPurgeRouter);

// ============================================
// Tenant routes
// ============================================
app.route("/api/tenant/dashboard", tenantDashboardRouter);
app.route("/api/tenant/unit", tenantUnitRouter);
app.route("/api/tenant/invoices", tenantInvoicesRouter);
app.route("/api/tenant/payments", tenantPaymentsRouter);
app.route("/api/tenant/service-requests", tenantServiceRequestsRouter);
app.route("/api/tenant/announcements", tenantAnnouncementsRouter);
app.route("/api/tenant/insurance", tenantInsuranceRouter);
app.route("/api/tenant/documents", tenantDocumentsRouter);
app.route("/api/tenant/compliance", tenantComplianceRouter);
app.route("/api/tenant/building-info", tenantBuildingInfoRouter);
app.route("/api/tenant/checklist", tenantChecklistRouter);
app.route("/api/tenant/move-out-checklist", tenantMoveOutChecklistRouter);
app.route("/api/tenant/unit-assets", tenantUnitAssetsRouter);
app.route("/api/tenant/tenancy-info", tenantTenancyInfoRouter);
app.route("/api/tenant/move-out-request", tenantMoveOutRequestRouter);
app.route("/api/tenant/inspections", tenantInspectionsRouter);
app.route("/api/tenant/calendar", tenantCalendarRouter);

// ============================================
// Document Management System
// ============================================
app.route("/api/documents", documentManagerRouter);

// ============================================
// User profile routes (authenticated users)
// ============================================
app.route("/api/me", meRouter);

const port = Number(process.env.PORT) || 3000;

// For Bun runtime
export default {
  port,
  fetch: app.fetch,
};

// For Node.js runtime (tsx, etc.) - only runs when not in Bun
if (typeof Bun === "undefined") {
  (async () => {
    const { serve } = await import("@hono/node-server");
    serve({
      fetch: app.fetch,
      port,
    }, (info) => {
      console.log(`Server running on http://localhost:${info.port}`);
    });
  })();
}
// Reload trigger Tue Jan 27 02:24:36 UTC 2026
