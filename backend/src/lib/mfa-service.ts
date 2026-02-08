/**
 * Admin MFA Service for GA Developments Property Management
 *
 * @module mfa-service
 * @description Handles Multi-Factor Authentication for admin users including
 * code generation, verification, and session management.
 */

import { prisma } from "../prisma";
import { sendEmail } from "./email";
import {
  generateMfaCode,
  hashMfaCode,
  verifyMfaCode,
  MFA_CODE_EXPIRY_MS,
  MFA_VERIFICATION_VALIDITY_MS,
  MAX_MFA_ATTEMPTS,
  MFA_LOCKOUT_DURATION_MS,
} from "./security";

/**
 * MFA challenge result interface
 */
interface MfaChallengeResult {
  success: boolean;
  challengeId?: string;
  expiresAt?: Date;
  error?: string;
}

/**
 * MFA verification result interface
 */
interface MfaVerificationResult {
  success: boolean;
  error?: string;
  attemptsRemaining?: number;
  lockedUntil?: Date;
}

// In-memory rate limiting store (use Redis in production for multi-instance)
const mfaAttempts = new Map<string, { count: number; lockedUntil?: Date }>();

/**
 * Creates an MFA challenge for an admin user
 * Generates a 6-digit code and sends it via email
 *
 * @param {string} userId - The admin user's ID
 * @param {string} sessionId - The session ID to associate with this challenge
 * @param {string} ipAddress - Request IP address for logging
 * @param {string} userAgent - Request user agent for logging
 * @returns {Promise<MfaChallengeResult>} Challenge creation result
 */
export async function createMfaChallenge(
  userId: string,
  sessionId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<MfaChallengeResult> {
  try {
    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, role: true },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    if (user.role !== "ADMIN") {
      return { success: false, error: "MFA is only required for admin users" };
    }

    // Generate MFA code
    const code = generateMfaCode();
    const hashedCode = hashMfaCode(code);
    const expiresAt = new Date(Date.now() + MFA_CODE_EXPIRY_MS);

    // Invalidate any existing challenges for this user
    await prisma.adminMfaChallenge.updateMany({
      where: {
        userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });

    // Create new challenge
    const challenge = await prisma.adminMfaChallenge.create({
      data: {
        userId,
        code: hashedCode,
        sessionId,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    // Send verification email
    await sendEmail({
      to: user.email,
      subject: "GA Developments Admin Verification Code",
      html: generateMfaEmailHtml(user.name, code, expiresAt),
      emailType: "MANUAL",
      toGroup: "MFA_VERIFICATION",
    });

    console.log(`[MFA] Challenge created for admin ${user.email} (ID: ${challenge.id})`);

    return {
      success: true,
      challengeId: challenge.id,
      expiresAt,
    };
  } catch (error) {
    console.error("[MFA] Error creating challenge:", error);
    return { success: false, error: "Failed to create MFA challenge" };
  }
}

/**
 * Verifies an MFA code for an admin user
 *
 * @param {string} userId - The admin user's ID
 * @param {string} code - The 6-digit code entered by user
 * @param {string} ipAddress - Request IP address for rate limiting
 * @returns {Promise<MfaVerificationResult>} Verification result
 */
export async function verifyMfaChallenge(
  userId: string,
  code: string,
  ipAddress: string
): Promise<MfaVerificationResult> {
  const rateLimitKey = `${userId}:${ipAddress}`;

  // Check rate limiting
  const attempts = mfaAttempts.get(rateLimitKey);
  if (attempts?.lockedUntil && attempts.lockedUntil > new Date()) {
    return {
      success: false,
      error: "Too many attempts. Please try again later.",
      lockedUntil: attempts.lockedUntil,
    };
  }

  try {
    // Find valid challenge
    const challenge = await prisma.adminMfaChallenge.findFirst({
      where: {
        userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!challenge) {
      incrementAttempts(rateLimitKey);
      return {
        success: false,
        error: "No valid verification code found. Please request a new code.",
        attemptsRemaining: getRemainingAttempts(rateLimitKey),
      };
    }

    // Verify code
    if (!verifyMfaCode(code, challenge.code)) {
      incrementAttempts(rateLimitKey);
      const remaining = getRemainingAttempts(rateLimitKey);

      if (remaining <= 0) {
        const lockedUntil = new Date(Date.now() + MFA_LOCKOUT_DURATION_MS);
        mfaAttempts.set(rateLimitKey, { count: MAX_MFA_ATTEMPTS, lockedUntil });
        return {
          success: false,
          error: "Too many failed attempts. Account temporarily locked.",
          lockedUntil,
        };
      }

      return {
        success: false,
        error: "Invalid verification code",
        attemptsRemaining: remaining,
      };
    }

    // Mark challenge as used
    await prisma.adminMfaChallenge.update({
      where: { id: challenge.id },
      data: { usedAt: new Date() },
    });

    // Update user's MFA verification timestamp
    await prisma.user.update({
      where: { id: userId },
      data: { mfaLastVerifiedAt: new Date() },
    });

    // Clear rate limiting
    mfaAttempts.delete(rateLimitKey);

    console.log(`[MFA] Successfully verified for user ${userId}`);

    return { success: true };
  } catch (error) {
    console.error("[MFA] Error verifying challenge:", error);
    return { success: false, error: "Verification failed. Please try again." };
  }
}

/**
 * Checks if an admin user needs MFA verification
 * Returns true if MFA hasn't been verified in the last 24 hours
 *
 * @param {string} userId - The admin user's ID
 * @returns {Promise<boolean>} True if MFA verification is required
 */
export async function requiresMfaVerification(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, mfaEnabled: true, mfaLastVerifiedAt: true },
  });

  if (!user || user.role !== "ADMIN") {
    return false;
  }

  // If MFA not enabled, don't require it (admin can enable in settings)
  if (!user.mfaEnabled) {
    return false;
  }

  // If never verified or verification expired, require MFA
  if (!user.mfaLastVerifiedAt) {
    return true;
  }

  const verificationAge = Date.now() - user.mfaLastVerifiedAt.getTime();
  return verificationAge > MFA_VERIFICATION_VALIDITY_MS;
}

/**
 * Enables MFA for an admin user
 *
 * @param {string} userId - The admin user's ID
 * @returns {Promise<boolean>} True if MFA was enabled
 */
export async function enableMfa(userId: string): Promise<boolean> {
  try {
    await prisma.user.update({
      where: { id: userId, role: "ADMIN" },
      data: { mfaEnabled: true },
    });
    console.log(`[MFA] Enabled for user ${userId}`);
    return true;
  } catch (error) {
    console.error("[MFA] Error enabling:", error);
    return false;
  }
}

/**
 * Disables MFA for an admin user (requires current MFA verification)
 *
 * @param {string} userId - The admin user's ID
 * @returns {Promise<boolean>} True if MFA was disabled
 */
export async function disableMfa(userId: string): Promise<boolean> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaLastVerifiedAt: null },
    });
    console.log(`[MFA] Disabled for user ${userId}`);
    return true;
  } catch (error) {
    console.error("[MFA] Error disabling:", error);
    return false;
  }
}

/**
 * Cleans up expired MFA challenges
 * Should be run periodically via cron
 */
export async function cleanupExpiredChallenges(): Promise<number> {
  const result = await prisma.adminMfaChallenge.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { usedAt: { not: null } },
      ],
    },
  });
  return result.count;
}

// Helper functions

function incrementAttempts(key: string): void {
  const current = mfaAttempts.get(key) || { count: 0 };
  mfaAttempts.set(key, { count: current.count + 1 });
}

function getRemainingAttempts(key: string): number {
  const current = mfaAttempts.get(key) || { count: 0 };
  return Math.max(0, MAX_MFA_ATTEMPTS - current.count);
}

function generateMfaEmailHtml(name: string, code: string, expiresAt: Date): string {
  const expiresIn = Math.round((expiresAt.getTime() - Date.now()) / 60000);

  return `
    <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 8px;">GA Developments</h1>
        <p style="color: #666; font-size: 14px;">Admin Portal Verification</p>
      </div>

      <div style="background: #f8f8f8; border-radius: 8px; padding: 30px; margin-bottom: 30px;">
        <p style="color: #333; font-size: 16px; margin-bottom: 20px;">Hello ${name},</p>

        <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
          Your verification code for the Admin Portal is:
        </p>

        <div style="background: #1a1a1a; color: #fff; font-size: 32px; letter-spacing: 8px; padding: 20px; text-align: center; border-radius: 8px; font-family: monospace;">
          ${code}
        </div>

        <p style="color: #666; font-size: 14px; margin-top: 20px; text-align: center;">
          This code expires in ${expiresIn} minutes
        </p>
      </div>

      <div style="border-top: 1px solid #eee; padding-top: 20px;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          If you did not request this code, please ignore this email or contact support immediately.
        </p>
        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 10px;">
          GA Developments Property Management<br>
          This is an automated security message.
        </p>
      </div>
    </div>
  `;
}
