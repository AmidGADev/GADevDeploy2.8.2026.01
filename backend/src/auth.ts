import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { prisma } from "./prisma";
import { env, isProduction } from "./env";
import { Resend } from "resend";
import * as crypto from "crypto";

// Detect database provider from DATABASE_URL
const isPostgres = env.DATABASE_URL.startsWith("postgres");

// Initialize Resend for password reset emails
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/**
 * Secure password hashing using Node.js crypto scrypt
 * Parameters provide similar security to bcrypt cost 10
 * N=16384 (2^14), r=8, p=1
 */
async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) reject(err);
      // Format: $scrypt$N$r$p$salt$hash (base64 encoded)
      const encoded = `$scrypt$16384$8$1$${salt.toString("base64")}$${derivedKey.toString("base64")}`;
      resolve(encoded);
    });
  });
}

/**
 * Verify password against stored hash
 * Supports our scrypt format and Better Auth's default format for migration
 */
async function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  const { hash, password } = data;

  // Check if it's our scrypt format
  if (hash.startsWith("$scrypt$")) {
    const parts = hash.split("$");
    if (parts.length !== 7) return false;

    const N = parts[2];
    const r = parts[3];
    const p = parts[4];
    const saltB64 = parts[5];
    const hashB64 = parts[6];

    if (!N || !r || !p || !saltB64 || !hashB64) return false;

    const salt = Buffer.from(saltB64, "base64");
    const expectedHash = Buffer.from(hashB64, "base64");

    return new Promise((resolve) => {
      crypto.scrypt(password, salt, 64, { N: parseInt(N), r: parseInt(r), p: parseInt(p) }, (err, derivedKey) => {
        if (err) {
          resolve(false);
          return;
        }
        resolve(crypto.timingSafeEqual(derivedKey, expectedHash));
      });
    });
  }

  // For any other format (including Better Auth's default), return false
  // Users with old password formats will need to use "Forgot Password" to reset
  return false;
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: isPostgres ? "postgresql" : "sqlite" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BACKEND_URL,
  trustedOrigins: [
    // Local development
    "http://localhost:*",
    "http://127.0.0.1:*",
    // Vibecode preview environments
    "https://*.dev.vibecode.run",
    "https://*.vibecode.run",
    "https://*.vibecodeapp.com",
    "https://*.share.sandbox.dev",
    // Production domains (explicit for gadevelopments.ca)
    "https://gadevelopments.ca",
    "https://www.gadevelopments.ca",
    "https://api.gadevelopments.ca",
    // Backend URL (for same-origin requests)
    env.BACKEND_URL,
  ].filter(Boolean),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Invite-only system, no public verification needed
    // Custom password hashing using scrypt (similar security to bcrypt cost 10)
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
    // Forgot password configuration
    sendResetPassword: async ({ user, url }) => {
      if (!resend) {
        console.error("[AUTH] Cannot send password reset email: RESEND_API_KEY not configured");
        return;
      }

      try {
        await resend.emails.send({
          from: env.FROM_EMAIL,
          to: user.email,
          subject: "Reset Your Password - GA Developments",
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Reset Your Password</title>
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #1a1a2e; margin: 0;">GA Developments</h1>
                <p style="color: #666; margin: 5px 0 0 0;">Tenant Portal</p>
              </div>

              <div style="background: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
                <h2 style="margin-top: 0; color: #1a1a2e;">Reset Your Password</h2>
                <p>Hi ${user.name || "there"},</p>
                <p>We received a request to reset your password for your GA Developments tenant portal account.</p>
                <p>Click the button below to set a new password:</p>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${url}" style="background: #1a1a2e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500;">
                    Reset Password
                  </a>
                </div>

                <p style="color: #666; font-size: 14px;">This link will expire in 1 hour for security reasons.</p>
                <p style="color: #666; font-size: 14px;">If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>
              </div>

              <div style="text-align: center; color: #999; font-size: 12px;">
                <p>GA Developments - Carsons Terrace Rentals</p>
                <p>709 & 711 Carsons Road, Ottawa, ON</p>
              </div>
            </body>
            </html>
          `,
        });
        console.log(`[AUTH] Password reset email sent to ${user.email}`);
      } catch (error) {
        console.error("[AUTH] Failed to send password reset email:", error);
        throw error;
      }
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "TENANT",
        input: false, // Don't allow users to set their own role
      },
      status: {
        type: "string",
        required: false,
        defaultValue: "ACTIVE",
        input: false,
      },
    },
  },
  session: {
    // Session expires after 7 days of inactivity
    expiresIn: 60 * 60 * 24 * 7, // 7 days in seconds
    // Update session expiry on activity
    updateAge: 60 * 60 * 24, // Update every 24 hours
  },
  plugins: [
    admin({
      defaultRole: "TENANT",
      adminRole: "ADMIN",
    }),
  ],
  advanced: {
    // SECURITY: CSRF protection is now enabled (default)
    // trustedOrigins handles cross-origin requests safely
    // disableCSRFCheck: false is the default, so we remove the explicit disable
    defaultCookieAttributes: {
      sameSite: "none", // Required for cross-origin requests (Vibecode preview)
      secure: true, // HTTPS only
      httpOnly: true, // No JavaScript access
      path: "/",
    },
  },
});

// Export auth types
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
