import { z } from "zod";

/**
 * Environment variable schema using Zod
 * This ensures all required environment variables are present and valid
 *
 * SECURITY: This module validates environment variables at startup.
 * Never log or expose the actual values of secret variables.
 */
const envSchema = z.object({
  // Server Configuration
  PORT: z.string().optional().default("3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).optional().default("development"),
  BACKEND_URL: z.url("BACKEND_URL must be a valid URL").default("http://localhost:3000"), // Set via the Vibecode enviroment at run-time

  // Database
  DATABASE_URL: z.string().default("file:./dev.db"),

  // Auth (REQUIRED - app will not start without this)
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters for security"),

  // Debug/Staging Mode Configuration
  APP_ENV: z.enum(["production", "staging"]).default("production"),
  DEBUG_MODE: z.preprocess((val) => val === "true" || val === true, z.boolean()).default(false),
  DEBUG_ACCESS_KEY: z.string().optional(), // Required for debug access in staging
  STAGING_EMAIL_ALLOWLIST: z.string().optional(), // Comma-separated list of allowed emails in staging

  // Stripe (optional for now)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Email - supports Resend (recommended) or SendGrid
  RESEND_API_KEY: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().default("info@gadevelopments.ca"),
  APP_URL: z.string().url().default("https://www.gadevelopments.ca"),

  // Covie Insurance Integration (optional - for future implementation)
  COVIE_CLIENT_ID: z.string().optional(),
  COVIE_CLIENT_SECRET: z.string().optional(),
  COVIE_WEBHOOK_SECRET: z.string().optional(),

  // Cron job authentication (optional - falls back to DEBUG_ACCESS_KEY)
  CRON_SECRET: z.string().optional(),

  // Payment Intake Webhook (for Interac e-Transfer email forwarding)
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(), // For AI parsing of e-Transfer emails

  // File uploads directory (for Render persistent disk, set to /var/data/uploads)
  UPLOADS_DIR: z.string().optional(),
});

/**
 * List of environment variable names that contain secrets (for logging purposes)
 * NEVER log the values of these variables
 */
const SECRET_VAR_NAMES = [
  "BETTER_AUTH_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "SENDGRID_API_KEY",
  "COVIE_CLIENT_SECRET",
  "COVIE_WEBHOOK_SECRET",
  "DEBUG_ACCESS_KEY",
  "CRON_SECRET",
  "PAYMENT_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
  "DATABASE_URL", // May contain credentials
];

/**
 * Validate and parse environment variables
 * SECURITY: Only logs variable names on error, never values
 */
function validateEnv() {
  try {
    const parsed = envSchema.parse(process.env);

    // Additional production safety checks
    if (parsed.APP_ENV === "production" || parsed.NODE_ENV === "production") {
      const warnings: string[] = [];

      // Warn if debug mode is enabled in production
      if (parsed.DEBUG_MODE) {
        warnings.push("DEBUG_MODE is enabled in production - this should be disabled");
      }

      // Check for weak auth secret
      if (parsed.BETTER_AUTH_SECRET.length < 64) {
        warnings.push("BETTER_AUTH_SECRET should be at least 64 characters in production");
      }

      // Ensure UPLOADS_DIR is set for persistent storage
      if (!parsed.UPLOADS_DIR) {
        warnings.push("UPLOADS_DIR not set - file uploads will not persist across deployments");
      }

      if (warnings.length > 0) {
        console.warn("⚠️  Production configuration warnings:");
        warnings.forEach((w) => console.warn(`  - ${w}`));
      }
    }

    console.log("✅ Environment variables validated successfully");
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Environment variable validation failed:");
      error.issues.forEach((err: z.ZodIssue) => {
        // Only log the variable name, never the value
        const varName = err.path.join(".");
        console.error(`  - ${varName}: ${err.message}`);
      });
      console.error("\nPlease check your environment variables and ensure all required values are set.");
      console.error("See SECURITY.md for the list of required environment variables.");
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Validated and typed environment variables
 */
export const env = validateEnv();

/**
 * Type of the validated environment variables
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
  return env.APP_ENV === "production" || env.NODE_ENV === "production";
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return env.NODE_ENV === "development" && env.APP_ENV !== "production";
}

/**
 * Get a safe representation of env vars for logging (secrets redacted)
 * Use this instead of logging env directly
 */
export function getSafeEnvSummary(): Record<string, string> {
  const summary: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (SECRET_VAR_NAMES.includes(key)) {
      summary[key] = value ? "[SET]" : "[NOT SET]";
    } else {
      summary[key] = String(value);
    }
  }

  return summary;
}
