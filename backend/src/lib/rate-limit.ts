import type { Context, Next } from "hono";
import { apiLogger } from "./logger";

/**
 * Simple in-memory rate limiter for security-sensitive endpoints
 *
 * SECURITY: Protects against brute force attacks on:
 * - Login attempts
 * - Password reset requests
 * - Admin actions
 *
 * RENDER NOTE: This is an in-memory implementation suitable for single-instance deployments.
 * Rate limit state is lost on server restart/redeploy, which is acceptable for:
 * - Render free tier (single instance)
 * - Short-lived attack protection (most brute force attacks are continuous)
 *
 * For multi-instance deployments or persistence across restarts, use Redis-backed rate limiting.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Optional: Key generator function (defaults to IP-based) */
  keyGenerator?: (c: Context) => string;
  /** Optional: Skip function to bypass rate limiting */
  skip?: (c: Context) => boolean;
  /** Optional: Custom message when rate limited */
  message?: string;
}

// In-memory stores for different rate limit contexts
const rateLimitStores = new Map<string, Map<string, RateLimitEntry>>();

// Cleanup old entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [storeName, store] of rateLimitStores) {
    for (const [key, entry] of store) {
      if (entry.resetAt < now) {
        store.delete(key);
      }
    }
  }
}, 5 * 60 * 1000);

/**
 * Get or create a rate limit store
 */
function getStore(name: string): Map<string, RateLimitEntry> {
  let store = rateLimitStores.get(name);
  if (!store) {
    store = new Map();
    rateLimitStores.set(name, store);
  }
  return store;
}

/**
 * Extract client IP from request
 * Handles common proxy headers (X-Forwarded-For, X-Real-IP)
 */
function getClientIp(c: Context): string {
  // Check X-Forwarded-For header (common for proxies like Render)
  const xForwardedFor = c.req.header("x-forwarded-for");
  if (xForwardedFor) {
    // Take the first IP (client IP)
    const ips = xForwardedFor.split(",").map((ip) => ip.trim());
    if (ips[0]) return ips[0];
  }

  // Check X-Real-IP header
  const xRealIp = c.req.header("x-real-ip");
  if (xRealIp) return xRealIp;

  // Check CF-Connecting-IP (Cloudflare)
  const cfIp = c.req.header("cf-connecting-ip");
  if (cfIp) return cfIp;

  // Fallback to connection IP (if available)
  // Note: In Bun/Hono, this might not be directly available
  return "unknown";
}

/**
 * Create a rate limiting middleware
 *
 * @param storeName - Unique name for this rate limit context (e.g., "login", "password-reset")
 * @param config - Rate limit configuration
 */
export function rateLimit(storeName: string, config: RateLimitConfig) {
  const {
    maxRequests,
    windowMs,
    keyGenerator = getClientIp,
    skip,
    message = "Too many requests, please try again later",
  } = config;

  const store = getStore(storeName);

  return async (c: Context, next: Next) => {
    // Check if we should skip rate limiting
    if (skip && skip(c)) {
      return next();
    }

    const key = keyGenerator(c);
    const now = Date.now();

    let entry = store.get(key);

    // Reset if window has passed
    if (!entry || entry.resetAt < now) {
      entry = {
        count: 0,
        resetAt: now + windowMs,
      };
    }

    entry.count++;
    store.set(key, entry);

    // Calculate remaining requests and reset time
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetInSeconds = Math.ceil((entry.resetAt - now) / 1000);

    // Set rate limit headers
    c.header("X-RateLimit-Limit", String(maxRequests));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    // Check if rate limited
    if (entry.count > maxRequests) {
      apiLogger.warn("Rate limit exceeded", {
        storeName,
        key: key.substring(0, 20) + "...", // Partially redact IP
        count: entry.count,
        maxRequests,
      });

      c.header("Retry-After", String(resetInSeconds));

      return c.json(
        {
          error: {
            message,
            code: "RATE_LIMITED",
            retryAfter: resetInSeconds,
          },
        },
        429
      );
    }

    return next();
  };
}

/**
 * Pre-configured rate limiters for common use cases
 */

/**
 * Strict rate limit for login attempts
 * 5 attempts per 15 minutes per IP
 */
export const loginRateLimit = rateLimit("login", {
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: "Too many login attempts. Please try again in 15 minutes.",
});

/**
 * Rate limit for password reset requests
 * 3 requests per hour per IP
 */
export const passwordResetRateLimit = rateLimit("password-reset", {
  maxRequests: 3,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: "Too many password reset requests. Please try again later.",
});

/**
 * Rate limit for account creation
 * 5 accounts per hour per IP
 */
export const signupRateLimit = rateLimit("signup", {
  maxRequests: 5,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: "Too many account creation attempts. Please try again later.",
});

/**
 * Rate limit for admin actions (bulk operations)
 * 100 requests per minute per user
 */
export const adminActionRateLimit = rateLimit("admin-action", {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
  keyGenerator: (c) => {
    const user = c.get("user") as { id?: string } | undefined;
    return user?.id || getClientIp(c);
  },
  message: "Too many requests. Please slow down.",
});

/**
 * Rate limit for email sending
 * 20 emails per hour per user
 */
export const emailSendRateLimit = rateLimit("email-send", {
  maxRequests: 20,
  windowMs: 60 * 60 * 1000, // 1 hour
  keyGenerator: (c) => {
    const user = c.get("user") as { id?: string } | undefined;
    return user?.id || getClientIp(c);
  },
  message: "Email sending limit reached. Please try again later.",
});

/**
 * Rate limit for file uploads
 * 10 uploads per hour per user
 */
export const uploadRateLimit = rateLimit("upload", {
  maxRequests: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
  keyGenerator: (c) => {
    const user = c.get("user") as { id?: string } | undefined;
    return user?.id || getClientIp(c);
  },
  message: "Upload limit reached. Please try again later.",
});

/**
 * General API rate limit (lenient)
 * 1000 requests per minute per IP
 */
export const generalApiRateLimit = rateLimit("general", {
  maxRequests: 1000,
  windowMs: 60 * 1000, // 1 minute
  message: "Too many requests. Please slow down.",
});

/**
 * Rate limit for public/unauthenticated endpoints
 * 60 requests per minute per IP
 */
export const publicEndpointRateLimit = rateLimit("public", {
  maxRequests: 60,
  windowMs: 60 * 1000, // 1 minute
  message: "Too many requests. Please try again later.",
});
