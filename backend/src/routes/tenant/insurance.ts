import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, tenantMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { env } from "../../env";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import { uploadRateLimit } from "../../lib/rate-limit";

const tenantInsuranceRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
tenantInsuranceRouter.use("*", authMiddleware);
tenantInsuranceRouter.use("*", tenantMiddleware);

// Uploads directory path - use UPLOADS_DIR env var for Render persistent disk, fallback to local
const UPLOADS_BASE = env.UPLOADS_DIR || path.resolve(process.cwd(), "uploads");
const UPLOADS_DIR = path.join(UPLOADS_BASE, "insurance");

// Allowed file types for insurance documents
// SECURITY: Strict allowlist - only specific safe types
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ALLOWED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Validate file type by checking both MIME type and extension
 * SECURITY: Double validation prevents extension spoofing
 */
function isValidFileType(mimeType: string, filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_MIME_TYPES.has(mimeType) && ALLOWED_EXTENSIONS.has(ext);
}

/**
 * Sanitize filename to prevent path traversal
 * SECURITY: Only allow alphanumeric, dash, underscore, and dot
 */
function sanitizeFilename(filename: string): string {
  // Extract just the filename without path
  const basename = path.basename(filename);
  // Remove any characters that aren't alphanumeric, dash, underscore, or dot
  return basename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Helper function to compute effective insurance status
 * Returns EXPIRED if insuranceExpiresAt is in the past
 */
function getEffectiveInsuranceStatus(user: {
  insuranceStatus: string | null;
  insuranceExpiresAt: Date | null;
}): string {
  // If status is APPROVED and expiration date is in the past, return EXPIRED
  if (user.insuranceStatus === "APPROVED" && user.insuranceExpiresAt) {
    const now = new Date();
    if (user.insuranceExpiresAt < now) {
      return "EXPIRED";
    }
  }
  // Default to MISSING if no status set
  return user.insuranceStatus ?? "MISSING";
}

/**
 * GET /api/tenant/insurance/status
 * Get current user's insurance status
 */
tenantInsuranceRouter.get("/status", async (c) => {
  const user = c.get("user");

  // Fetch user with insurance fields
  const tenant = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      insuranceStatus: true,
      insuranceProvider: true,
      insuranceExpiresAt: true,
      insuranceVerifiedAt: true,
      insuranceDocumentUrl: true,
      insuranceRejectionReason: true,
      covieLinkId: true,
      coviePolicyId: true,
    },
  });

  if (!tenant) {
    return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);
  }

  const effectiveStatus = getEffectiveInsuranceStatus(tenant);

  return c.json({
    data: {
      status: effectiveStatus,
      provider: tenant.insuranceProvider,
      expiresAt: tenant.insuranceExpiresAt?.toISOString() ?? null,
      verifiedAt: tenant.insuranceVerifiedAt?.toISOString() ?? null,
      documentUrl: tenant.insuranceDocumentUrl,
      rejectionReason: tenant.insuranceRejectionReason,
      covieLinkId: tenant.covieLinkId,
      coviePolicyId: tenant.coviePolicyId,
    },
  });
});

/**
 * POST /api/tenant/insurance/upload
 * Upload insurance document via multipart/form-data
 * Sets status to PENDING for admin review
 *
 * SECURITY: Rate limited, file type validated, filename sanitized
 */
tenantInsuranceRouter.post("/upload", uploadRateLimit, async (c) => {
  const user = c.get("user");

  try {
    // Parse multipart form data
    const formData = await c.req.formData();
    const file = formData.get("file");
    const provider = formData.get("provider");
    const expiresAt = formData.get("expiresAt");

    // Validate required fields
    if (!file || !(file instanceof File)) {
      return c.json(
        { error: { message: "No file provided", code: "NO_FILE" } },
        400
      );
    }

    if (!provider || typeof provider !== "string" || provider.trim() === "") {
      return c.json(
        { error: { message: "Provider name is required", code: "NO_PROVIDER" } },
        400
      );
    }

    if (!expiresAt || typeof expiresAt !== "string") {
      return c.json(
        { error: { message: "Expiration date is required", code: "NO_EXPIRY" } },
        400
      );
    }

    // SECURITY: Validate file type using both MIME and extension
    const sanitizedOriginalName = sanitizeFilename(file.name);
    if (!isValidFileType(file.type, sanitizedOriginalName)) {
      return c.json(
        { error: { message: "Invalid file type. Only PDF, JPG, and PNG are allowed.", code: "INVALID_TYPE" } },
        400
      );
    }

    // SECURITY: Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return c.json(
        { error: { message: "File too large. Maximum size is 10MB.", code: "FILE_TOO_LARGE" } },
        400
      );
    }

    // SECURITY: Validate file size isn't suspiciously small (possible empty/malformed file)
    if (file.size < 100) {
      return c.json(
        { error: { message: "File appears to be empty or corrupted.", code: "FILE_TOO_SMALL" } },
        400
      );
    }

    // Parse and validate expiration date
    const expirationDate = new Date(expiresAt);
    if (isNaN(expirationDate.getTime())) {
      return c.json(
        { error: { message: "Invalid expiration date", code: "INVALID_DATE" } },
        400
      );
    }

    // Ensure expiration date is in the future
    const now = new Date();
    if (expirationDate <= now) {
      return c.json(
        { error: { message: "Expiration date must be in the future", code: "EXPIRED_DATE" } },
        400
      );
    }

    // SECURITY: Ensure expiration date is not unreasonably far in the future (max 2 years)
    const maxFutureDate = new Date();
    maxFutureDate.setFullYear(maxFutureDate.getFullYear() + 2);
    if (expirationDate > maxFutureDate) {
      return c.json(
        { error: { message: "Expiration date cannot be more than 2 years in the future", code: "DATE_TOO_FAR" } },
        400
      );
    }

    // Create uploads directory if it doesn't exist
    if (!existsSync(UPLOADS_DIR)) {
      await mkdir(UPLOADS_DIR, { recursive: true });
    }

    // SECURITY: Generate completely random filename to prevent any path manipulation
    const uniqueId = crypto.randomUUID();
    const safeExtension = path.extname(sanitizedOriginalName).toLowerCase() || ".pdf";
    const filename = `${user.id}-${uniqueId}${safeExtension}`;

    // SECURITY: Ensure filepath is within UPLOADS_DIR (prevent path traversal)
    const filepath = path.join(UPLOADS_DIR, filename);
    const resolvedPath = path.resolve(filepath);
    const resolvedUploadsDir = path.resolve(UPLOADS_DIR);

    if (!resolvedPath.startsWith(resolvedUploadsDir)) {
      console.error(`[SECURITY] Path traversal attempt detected: ${filepath}`);
      return c.json(
        { error: { message: "Invalid file path", code: "INVALID_PATH" } },
        400
      );
    }

    // Write file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    // Generate the URL path for accessing the file
    const documentUrl = `/api/uploads/insurance/${filename}`;

    // Update user insurance fields
    await prisma.user.update({
      where: { id: user.id },
      data: {
        insuranceStatus: "PENDING",
        insuranceProvider: provider.trim().substring(0, 200), // Limit provider name length
        insuranceExpiresAt: expirationDate,
        insuranceDocumentUrl: documentUrl,
        // Clear any previous rejection
        insuranceRejectionReason: null,
        insuranceVerifiedAt: null,
        // Clear Covie fields if using manual upload
        covieLinkId: null,
        coviePolicyId: null,
      },
    });

    console.log(
      `[INSURANCE] Tenant ${user.id} uploaded insurance document. Provider: ${provider.trim().substring(0, 50)}, Expires: ${expirationDate.toISOString()}`
    );

    return c.json({
      data: {
        success: true,
        status: "PENDING",
        message: "Insurance document uploaded successfully. Awaiting admin review.",
        documentUrl,
      },
    });
  } catch (error) {
    console.error("[INSURANCE] Upload error:", error);
    return c.json(
      { error: { message: "Failed to upload file", code: "UPLOAD_ERROR" } },
      500
    );
  }
});

/**
 * POST /api/tenant/insurance/covie/start
 * Start Covie integration flow
 * For now, returns a placeholder since we don't have Covie API keys yet
 */
tenantInsuranceRouter.post("/covie/start", async (c) => {
  const user = c.get("user");

  // Check if Covie is configured
  const covieConfigured = env.COVIE_CLIENT_ID && env.COVIE_CLIENT_SECRET;

  console.log(`[INSURANCE] Tenant ${user.email} attempted to start Covie integration. Covie configured: ${covieConfigured}`);

  if (!covieConfigured) {
    // Covie not configured - return friendly message
    return c.json({
      data: {
        available: false,
        message: "Covie integration is coming soon. Please use the manual upload option for now.",
        fallbackUrl: null,
      },
    });
  }

  // TODO: Implement actual Covie integration when API keys are available
  // For now, log the attempt and return a placeholder
  console.log(`[INSURANCE] Covie integration would be initiated for tenant ${user.email}`);

  // In a real implementation, this would:
  // 1. Create a Covie link for the tenant
  // 2. Store the covieLinkId
  // 3. Return a redirect URL for the tenant to complete the Covie flow

  return c.json({
    data: {
      available: true,
      message: "Covie integration is being set up. Please check back soon.",
      // In real implementation, this would be the Covie redirect URL
      redirectUrl: null,
    },
  });
});

export { tenantInsuranceRouter };
