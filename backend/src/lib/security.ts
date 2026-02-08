/**
 * Security Utilities for GA Developments Property Management
 *
 * @module security
 * @description Provides cryptographic functions, MFA code generation,
 * input sanitization, and security validation utilities.
 */

import { createHash, randomBytes } from "crypto";

/**
 * Generates a cryptographically secure 6-digit MFA code
 * @returns {string} 6-digit numeric code
 */
export function generateMfaCode(): string {
  // Generate a random number between 100000 and 999999
  const buffer = randomBytes(4);
  const num = buffer.readUInt32BE(0);
  const code = 100000 + (num % 900000);
  return code.toString();
}

/**
 * Hashes an MFA code for secure storage
 * Uses SHA-256 with a pepper for additional security
 * @param {string} code - The plain text MFA code
 * @returns {string} Hashed code
 */
export function hashMfaCode(code: string): string {
  const pepper = process.env.BETTER_AUTH_SECRET || "default-pepper";
  return createHash("sha256")
    .update(code + pepper)
    .digest("hex");
}

/**
 * Verifies an MFA code against its hash
 * @param {string} code - Plain text code to verify
 * @param {string} hash - Stored hash to compare against
 * @returns {boolean} True if codes match
 */
export function verifyMfaCode(code: string, hash: string): boolean {
  const inputHash = hashMfaCode(code);
  // Constant-time comparison to prevent timing attacks
  if (inputHash.length !== hash.length) return false;
  let result = 0;
  for (let i = 0; i < inputHash.length; i++) {
    result |= inputHash.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return result === 0;
}

/**
 * MFA code expiration time in milliseconds (10 minutes)
 */
export const MFA_CODE_EXPIRY_MS = 10 * 60 * 1000;

/**
 * MFA verification validity period in milliseconds (24 hours)
 * After this period, admin must re-verify MFA
 */
export const MFA_VERIFICATION_VALIDITY_MS = 24 * 60 * 60 * 1000;

/**
 * Sanitizes user input to prevent XSS attacks
 * Escapes HTML special characters while preserving safe content
 * @param {string} input - Raw user input
 * @returns {string} Sanitized string safe for HTML rendering
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== "string") return "";

  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;",
    "`": "&#x60;",
    "=": "&#x3D;",
  };

  return input.replace(/[&<>"'`=/]/g, (char) => htmlEntities[char] || char);
}

/**
 * Sanitizes input for safe database storage
 * Removes null bytes and normalizes whitespace
 * @param {string} input - Raw user input
 * @returns {string} Sanitized string
 */
export function sanitizeForDb(input: string): string {
  if (typeof input !== "string") return "";

  return input
    // Remove null bytes (SQL injection vector)
    .replace(/\0/g, "")
    // Normalize unicode (prevent homograph attacks)
    .normalize("NFC")
    // Trim whitespace
    .trim();
}

/**
 * Validates and sanitizes a request object's string fields
 * @param {Record<string, unknown>} obj - Object to sanitize
 * @param {string[]} fields - Fields to sanitize
 * @returns {Record<string, unknown>} Object with sanitized fields
 */
export function sanitizeRequestFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const result = { ...obj };
  for (const field of fields) {
    if (typeof result[field] === "string") {
      result[field] = sanitizeForDb(result[field] as string) as T[keyof T];
    }
  }
  return result;
}

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generates a secure random token
 * @param {number} length - Token length in bytes (default 32)
 * @returns {string} Hex-encoded random token
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString("hex");
}

/**
 * Masks sensitive data for logging
 * @param {string} value - Value to mask
 * @param {number} visibleChars - Number of visible characters at start/end
 * @returns {string} Masked value
 */
export function maskSensitiveData(value: string, visibleChars: number = 4): string {
  if (!value || value.length <= visibleChars * 2) {
    return "*".repeat(value?.length || 8);
  }
  const start = value.slice(0, visibleChars);
  const end = value.slice(-visibleChars);
  const masked = "*".repeat(Math.min(value.length - visibleChars * 2, 8));
  return `${start}${masked}${end}`;
}

/**
 * Rate limiting key generator for MFA attempts
 * @param {string} userId - User ID
 * @param {string} ipAddress - Request IP address
 * @returns {string} Rate limit key
 */
export function getMfaRateLimitKey(userId: string, ipAddress: string): string {
  return `mfa:${userId}:${ipAddress}`;
}

/**
 * Maximum MFA attempts before lockout
 */
export const MAX_MFA_ATTEMPTS = 5;

/**
 * MFA lockout duration in milliseconds (15 minutes)
 */
export const MFA_LOCKOUT_DURATION_MS = 15 * 60 * 1000;
