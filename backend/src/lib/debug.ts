import { env } from "../env";

/**
 * Environment Utilities
 *
 * Provides environment detection and staging-mode email filtering.
 */

/**
 * Check if debug mode is enabled (for verbose logging)
 */
export function isDebugEnabled(): boolean {
  return env.APP_ENV === "staging" || env.DEBUG_MODE === true;
}

/**
 * Check if we're in production (or production-like environment)
 * Returns true if APP_ENV is "production" or if not explicitly set to "staging" or "development"
 */
export function isProduction(): boolean {
  const appEnv = env.APP_ENV?.toLowerCase();
  // Treat as production unless explicitly in staging or development
  return !appEnv || (appEnv !== "staging" && appEnv !== "development" && appEnv !== "local");
}

/**
 * Get staging email allowlist
 */
export function getStagingEmailAllowlist(): string[] {
  if (!env.STAGING_EMAIL_ALLOWLIST) return [];
  return env.STAGING_EMAIL_ALLOWLIST.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
}

/**
 * Check if an email is allowed in staging mode
 * In production mode, all emails are allowed
 */
export function isEmailAllowedInStaging(email: string): { allowed: boolean; reason?: string } {
  // Always allow in production
  if (isProduction()) {
    return { allowed: true };
  }

  const allowlist = getStagingEmailAllowlist();

  // If no allowlist configured in staging, block all emails with warning
  if (allowlist.length === 0) {
    return {
      allowed: false,
      reason: "No STAGING_EMAIL_ALLOWLIST configured - all emails blocked in staging",
    };
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check if email matches any allowlist entry
  const isAllowed = allowlist.some(pattern => {
    // Support wildcard domain matching (e.g., "*@domain.com")
    if (pattern.startsWith("*@")) {
      const domain = pattern.slice(2);
      return normalizedEmail.endsWith(`@${domain}`);
    }
    // Exact match
    return normalizedEmail === pattern;
  });

  if (!isAllowed) {
    return {
      allowed: false,
      reason: `Email ${email} not in staging allowlist`,
    };
  }

  return { allowed: true };
}
