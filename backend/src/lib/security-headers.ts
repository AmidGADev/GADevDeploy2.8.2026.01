import type { Context, Next } from "hono";
import { isProduction } from "../env";

/**
 * Security Headers Middleware
 *
 * Adds standard security headers to all responses.
 * OWASP recommendations for web application security.
 */
export async function securityHeaders(c: Context, next: Next) {
  await next();

  // Prevent MIME type sniffing
  c.header("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking - allow framing only from same origin
  // Note: Using frame-ancestors in CSP is preferred, but X-Frame-Options provides fallback
  c.header("X-Frame-Options", "SAMEORIGIN");

  // XSS Protection (legacy, but still useful for older browsers)
  c.header("X-XSS-Protection", "1; mode=block");

  // Referrer Policy - don't leak full URL to external sites
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions Policy - disable features we don't need
  c.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(self)"
  );

  // Only add HSTS in production (requires HTTPS)
  if (isProduction()) {
    // Strict Transport Security - force HTTPS for 1 year
    // includeSubDomains ensures all subdomains also use HTTPS
    c.header(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  // Content Security Policy
  // This is a baseline policy - adjust based on your app's needs
  const cspDirectives = [
    "default-src 'self'",
    // Allow scripts from self and inline (needed for some frameworks)
    // In production, consider using nonces or hashes instead of 'unsafe-inline'
    "script-src 'self' 'unsafe-inline' https://js.stripe.com",
    // Allow styles from self and inline (needed for CSS-in-JS)
    "style-src 'self' 'unsafe-inline'",
    // Allow images from self, data URIs, and common CDNs
    "img-src 'self' data: blob: https:",
    // Allow fonts from self and Google Fonts
    "font-src 'self' https://fonts.gstatic.com",
    // Allow connections to self, backend, and Stripe
    "connect-src 'self' https://api.stripe.com https://*.stripe.com",
    // Allow framing by Stripe (for 3D Secure)
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    // Prevent form submissions to external sites
    "form-action 'self'",
    // Restrict base URI to prevent base tag hijacking
    "base-uri 'self'",
    // Block all object/embed/applet elements
    "object-src 'none'",
    // Upgrade insecure requests to HTTPS
    isProduction() ? "upgrade-insecure-requests" : "",
  ]
    .filter(Boolean)
    .join("; ");

  c.header("Content-Security-Policy", cspDirectives);
}

/**
 * Middleware to hide server information
 * Prevents leaking technology stack details
 */
export async function hideServerInfo(c: Context, next: Next) {
  await next();

  // Remove server header if present
  // Note: Some platforms add this automatically
  c.header("Server", "");
  c.header("X-Powered-By", "");
}

/**
 * Combined security middleware
 * Apply both security headers and server info hiding
 */
export async function securityMiddleware(c: Context, next: Next) {
  await hideServerInfo(c, async () => {
    await securityHeaders(c, next);
  });
}
