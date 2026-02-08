import { Hono } from "hono";
import { prisma } from "../prisma";
import { authMiddleware, adminMiddleware, tenantMiddleware } from "../middleware/auth";
import type { AuthVariables } from "../middleware/auth";
import { env } from "../env";
import { writeFile, mkdir, unlink, readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import { logAuditAction, AuditActions } from "../lib/audit";

/**
 * Document Management System
 *
 * Features:
 * - PDF-only uploads (security requirement)
 * - 10MB max file size (server protection)
 * - Standardized filename format: {unitId}-{YYYY-MM-DD}-{uuid}.pdf
 * - Secure tenant access (users can only access their own documents)
 * - Persistent disk storage (/var/data/uploads on Render)
 */

const documentManagerRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
documentManagerRouter.use("*", authMiddleware);

// Base uploads directory - use UPLOADS_DIR env var for Render persistent disk
const UPLOADS_BASE = env.UPLOADS_DIR || path.resolve(process.cwd(), "uploads");
const DOCUMENTS_DIR = path.join(UPLOADS_BASE, "documents");

// Security constraints
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB max
const MIN_FILE_SIZE = 100; // Minimum bytes (prevent empty files)
const ALLOWED_MIME_TYPE = "application/pdf";
const ALLOWED_EXTENSION = ".pdf";

// Document categories
const DOCUMENT_CATEGORIES = ["GENERAL", "LEASE", "INSURANCE", "ID", "OTHER"] as const;
type DocumentCategory = typeof DOCUMENT_CATEGORIES[number];

/**
 * Validate that file is a PDF by checking MIME type and extension
 */
function isPdfFile(mimeType: string, filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return mimeType === ALLOWED_MIME_TYPE && ext === ALLOWED_EXTENSION;
}

/**
 * Sanitize filename to prevent path traversal and special characters
 */
function sanitizeFilename(filename: string): string {
  const basename = path.basename(filename);
  return basename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Generate standardized storage key: {unitId}-{date}-{uuid}.pdf
 * Falls back to {userId}-{date}-{uuid}.pdf if no unit
 */
function generateStorageKey(unitId: string | null, userId: string): string {
  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const uuid = crypto.randomUUID().slice(0, 8); // Short UUID for uniqueness
  const prefix = unitId || userId;
  return `${prefix}-${date}-${uuid}.pdf`;
}

/**
 * Ensure uploads directory exists
 */
async function ensureDocumentsDir(): Promise<void> {
  if (!existsSync(DOCUMENTS_DIR)) {
    await mkdir(DOCUMENTS_DIR, { recursive: true });
    console.log(`[DOCUMENTS] Created documents directory: ${DOCUMENTS_DIR}`);
  }
}

// ============================================
// Tenant Endpoints
// ============================================

/**
 * POST /api/documents/upload
 * Tenant uploads their own document (PDF only, max 10MB)
 *
 * Multipart form data:
 *   - file: PDF file (required)
 *   - category: GENERAL, LEASE, INSURANCE, ID, OTHER (optional, defaults to GENERAL)
 *   - description: Brief description (optional, max 500 chars)
 */
documentManagerRouter.post("/upload", tenantMiddleware, async (c) => {
  const user = c.get("user");

  try {
    // Parse multipart form data
    const formData = await c.req.formData();
    const file = formData.get("file");
    const categoryInput = formData.get("category");
    const descriptionInput = formData.get("description");

    // Validate file exists
    if (!file || !(file instanceof File)) {
      return c.json(
        { error: { message: "No file provided", code: "NO_FILE" } },
        400
      );
    }

    // Get original filename
    const originalFilename = sanitizeFilename(file.name);

    // SECURITY CHECK 1: File type (PDF only)
    if (!isPdfFile(file.type, originalFilename)) {
      console.warn(`[DOCUMENTS] Rejected non-PDF upload from user ${user.id}: ${file.type}`);
      return c.json(
        { error: { message: "Only PDF files are allowed", code: "INVALID_FILE_TYPE" } },
        400
      );
    }

    // SECURITY CHECK 2: File size (max 10MB)
    if (file.size > MAX_FILE_SIZE) {
      console.warn(`[DOCUMENTS] Rejected oversized file from user ${user.id}: ${file.size} bytes`);
      return c.json(
        { error: { message: "File too large. Maximum size is 10MB.", code: "FILE_TOO_LARGE" } },
        400
      );
    }

    // SECURITY CHECK 3: Minimum size (prevent empty/corrupted files)
    if (file.size < MIN_FILE_SIZE) {
      return c.json(
        { error: { message: "File appears to be empty or corrupted", code: "FILE_TOO_SMALL" } },
        400
      );
    }

    // Validate category
    const category = categoryInput && typeof categoryInput === "string"
      ? (DOCUMENT_CATEGORIES.includes(categoryInput as DocumentCategory) ? categoryInput : "GENERAL")
      : "GENERAL";

    // Sanitize description
    const description = descriptionInput && typeof descriptionInput === "string"
      ? descriptionInput.trim().substring(0, 500)
      : null;

    // Get tenant's active tenancy to link document to unit
    const tenancy = await prisma.tenancy.findFirst({
      where: {
        userId: user.id,
        isActive: true,
      },
      select: { unitId: true },
    });

    const unitId = tenancy?.unitId || null;

    // Generate storage key with standardized naming
    const storageKey = generateStorageKey(unitId, user.id);

    // Ensure documents directory exists
    await ensureDocumentsDir();

    // Build file path
    const storagePath = path.join(DOCUMENTS_DIR, storageKey);
    const resolvedPath = path.resolve(storagePath);
    const resolvedDocumentsDir = path.resolve(DOCUMENTS_DIR);

    // SECURITY CHECK 4: Path traversal prevention
    if (!resolvedPath.startsWith(resolvedDocumentsDir)) {
      console.error(`[SECURITY] Path traversal attempt: ${storagePath}`);
      return c.json(
        { error: { message: "Invalid file path", code: "INVALID_PATH" } },
        400
      );
    }

    // Write file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(storagePath, buffer);

    // Create database record
    const document = await prisma.document.create({
      data: {
        userId: user.id,
        unitId,
        fileName: originalFilename,
        storagePath,
        storageKey,
        fileSizeBytes: file.size,
        mimeType: ALLOWED_MIME_TYPE,
        category,
        description,
        uploadedById: user.id,
      },
    });

    console.log(`[DOCUMENTS] Tenant ${user.email} uploaded document: ${storageKey}`);

    return c.json({
      data: {
        success: true,
        document: {
          id: document.id,
          fileName: document.fileName,
          category: document.category,
          description: document.description,
          fileSizeBytes: document.fileSizeBytes,
          uploadedAt: document.uploadedAt.toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("[DOCUMENTS] Upload error:", error);
    return c.json(
      { error: { message: "Failed to upload document", code: "UPLOAD_ERROR" } },
      500
    );
  }
});

/**
 * GET /api/documents
 * List all documents for the authenticated tenant
 */
documentManagerRouter.get("/", tenantMiddleware, async (c) => {
  const user = c.get("user");

  const documents = await prisma.document.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      fileName: true,
      category: true,
      description: true,
      fileSizeBytes: true,
      uploadedAt: true,
      unit: {
        select: {
          id: true,
          unitLabel: true,
          buildingName: true,
        },
      },
    },
    orderBy: { uploadedAt: "desc" },
  });

  return c.json({
    data: documents.map((doc) => ({
      id: doc.id,
      fileName: doc.fileName,
      category: doc.category,
      description: doc.description,
      fileSizeBytes: doc.fileSizeBytes,
      uploadedAt: doc.uploadedAt.toISOString(),
      unit: doc.unit
        ? {
            id: doc.unit.id,
            label: doc.unit.buildingName
              ? `${doc.unit.buildingName} - ${doc.unit.unitLabel}`
              : doc.unit.unitLabel,
          }
        : null,
    })),
  });
});

/**
 * GET /api/documents/:documentId/download
 * Download a specific document (tenant can only download their own)
 *
 * SECURITY: Session verification ensures tenant can only access their own files
 */
documentManagerRouter.get("/:documentId/download", async (c) => {
  const user = c.get("user");
  const documentId = c.req.param("documentId");
  const isAdmin = user.role === "ADMIN";

  // Find the document
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      user: {
        select: { id: true, email: true },
      },
    },
  });

  if (!document) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }

  // SECURITY: Tenant can only download their own documents
  if (!isAdmin && document.userId !== user.id) {
    console.warn(`[SECURITY] User ${user.id} attempted to access document owned by ${document.userId}`);
    return c.json({ error: { message: "Access denied", code: "FORBIDDEN" } }, 403);
  }

  // Verify file path is safe
  const resolvedPath = path.resolve(document.storagePath);
  const resolvedDocumentsDir = path.resolve(DOCUMENTS_DIR);

  if (!resolvedPath.startsWith(resolvedDocumentsDir)) {
    console.error(`[SECURITY] Path traversal detected in database record: ${document.storagePath}`);
    return c.json({ error: { message: "Invalid document path", code: "INVALID_PATH" } }, 500);
  }

  try {
    // Check file exists
    const stats = await stat(resolvedPath);
    if (!stats.isFile()) {
      return c.json({ error: { message: "Document file not found", code: "FILE_NOT_FOUND" } }, 404);
    }

    // Read and serve file
    const content = await readFile(resolvedPath);

    // Set secure headers
    c.header("Content-Type", "application/pdf");
    c.header("Content-Length", String(content.length));
    c.header("Content-Disposition", `inline; filename="${document.fileName}"`);
    // Prevent caching of sensitive documents
    c.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
    c.header("Pragma", "no-cache");
    c.header("Expires", "0");

    return new Response(content, {
      status: 200,
      headers: c.res.headers,
    });
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return c.json({ error: { message: "Document file not found", code: "FILE_NOT_FOUND" } }, 404);
    }
    console.error(`[DOCUMENTS] Error serving document: ${error.message}`);
    return c.json({ error: { message: "Failed to retrieve document", code: "SERVER_ERROR" } }, 500);
  }
});

/**
 * DELETE /api/documents/:documentId
 * Tenant deletes their own document
 */
documentManagerRouter.delete("/:documentId", tenantMiddleware, async (c) => {
  const user = c.get("user");
  const documentId = c.req.param("documentId");

  // Find the document (must belong to tenant)
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      userId: user.id, // SECURITY: Can only delete own documents
    },
  });

  if (!document) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }

  try {
    // Delete file from disk
    const resolvedPath = path.resolve(document.storagePath);
    const resolvedDocumentsDir = path.resolve(DOCUMENTS_DIR);

    if (resolvedPath.startsWith(resolvedDocumentsDir) && existsSync(resolvedPath)) {
      await unlink(resolvedPath);
    }

    // Delete database record
    await prisma.document.delete({
      where: { id: documentId },
    });

    console.log(`[DOCUMENTS] Tenant ${user.email} deleted document: ${document.storageKey}`);

    return c.json({
      data: {
        success: true,
        message: "Document deleted successfully",
      },
    });
  } catch (error) {
    console.error("[DOCUMENTS] Delete error:", error);
    return c.json(
      { error: { message: "Failed to delete document", code: "DELETE_ERROR" } },
      500
    );
  }
});

// ============================================
// Admin Endpoints
// ============================================

/**
 * GET /api/documents/admin/all
 * Admin lists all documents in the system
 * Query params:
 *   - userId: Filter by tenant
 *   - unitId: Filter by unit
 *   - category: Filter by category
 */
documentManagerRouter.get("/admin/all", adminMiddleware, async (c) => {
  const userIdFilter = c.req.query("userId");
  const unitIdFilter = c.req.query("unitId");
  const categoryFilter = c.req.query("category");

  const documents = await prisma.document.findMany({
    where: {
      ...(userIdFilter && { userId: userIdFilter }),
      ...(unitIdFilter && { unitId: unitIdFilter }),
      ...(categoryFilter && { category: categoryFilter }),
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      unit: {
        select: {
          id: true,
          unitLabel: true,
          buildingName: true,
        },
      },
      uploadedBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { uploadedAt: "desc" },
  });

  return c.json({
    data: documents.map((doc) => ({
      id: doc.id,
      userId: doc.userId,
      userName: doc.user.name,
      userEmail: doc.user.email,
      unitId: doc.unitId,
      unitLabel: doc.unit
        ? (doc.unit.buildingName
            ? `${doc.unit.buildingName} - ${doc.unit.unitLabel}`
            : doc.unit.unitLabel)
        : null,
      fileName: doc.fileName,
      storageKey: doc.storageKey,
      category: doc.category,
      description: doc.description,
      fileSizeBytes: doc.fileSizeBytes,
      uploadedById: doc.uploadedById,
      uploadedByName: doc.uploadedBy.name,
      uploadedAt: doc.uploadedAt.toISOString(),
    })),
  });
});

/**
 * POST /api/documents/admin/upload/:userId
 * Admin uploads a document for a specific tenant
 */
documentManagerRouter.post("/admin/upload/:userId", adminMiddleware, async (c) => {
  const adminUser = c.get("user");
  const userId = c.req.param("userId");

  // Verify tenant exists
  const tenant = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });

  if (!tenant) {
    return c.json({ error: { message: "Tenant not found", code: "NOT_FOUND" } }, 404);
  }

  try {
    // Parse multipart form data
    const formData = await c.req.formData();
    const file = formData.get("file");
    const categoryInput = formData.get("category");
    const descriptionInput = formData.get("description");
    const unitIdInput = formData.get("unitId");

    // Validate file
    if (!file || !(file instanceof File)) {
      return c.json({ error: { message: "No file provided", code: "NO_FILE" } }, 400);
    }

    const originalFilename = sanitizeFilename(file.name);

    // PDF only check
    if (!isPdfFile(file.type, originalFilename)) {
      return c.json(
        { error: { message: "Only PDF files are allowed", code: "INVALID_FILE_TYPE" } },
        400
      );
    }

    // Size checks
    if (file.size > MAX_FILE_SIZE) {
      return c.json(
        { error: { message: "File too large. Maximum size is 10MB.", code: "FILE_TOO_LARGE" } },
        400
      );
    }

    if (file.size < MIN_FILE_SIZE) {
      return c.json(
        { error: { message: "File appears to be empty or corrupted", code: "FILE_TOO_SMALL" } },
        400
      );
    }

    // Category validation
    const category = categoryInput && typeof categoryInput === "string"
      ? (DOCUMENT_CATEGORIES.includes(categoryInput as DocumentCategory) ? categoryInput : "GENERAL")
      : "GENERAL";

    const description = descriptionInput && typeof descriptionInput === "string"
      ? descriptionInput.trim().substring(0, 500)
      : null;

    // Get unit ID from form or tenant's active tenancy
    let unitId: string | null = null;
    if (unitIdInput && typeof unitIdInput === "string") {
      // Verify unit exists
      const unit = await prisma.unit.findUnique({ where: { id: unitIdInput } });
      if (unit) {
        unitId = unitIdInput;
      }
    } else {
      // Fall back to tenant's active tenancy
      const tenancy = await prisma.tenancy.findFirst({
        where: { userId, isActive: true },
        select: { unitId: true },
      });
      unitId = tenancy?.unitId || null;
    }

    // Generate storage key
    const storageKey = generateStorageKey(unitId, userId);

    // Ensure directory exists
    await ensureDocumentsDir();

    // Build and validate path
    const storagePath = path.join(DOCUMENTS_DIR, storageKey);
    const resolvedPath = path.resolve(storagePath);
    const resolvedDocumentsDir = path.resolve(DOCUMENTS_DIR);

    if (!resolvedPath.startsWith(resolvedDocumentsDir)) {
      console.error(`[SECURITY] Path traversal attempt: ${storagePath}`);
      return c.json({ error: { message: "Invalid file path", code: "INVALID_PATH" } }, 400);
    }

    // Write file
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(storagePath, buffer);

    // Create database record
    const document = await prisma.document.create({
      data: {
        userId,
        unitId,
        fileName: originalFilename,
        storagePath,
        storageKey,
        fileSizeBytes: file.size,
        mimeType: ALLOWED_MIME_TYPE,
        category,
        description,
        uploadedById: adminUser.id,
      },
    });

    // Audit log
    await logAuditAction({
      adminUserId: adminUser.id,
      action: AuditActions.DOCUMENT_UPLOAD,
      entityType: "Document",
      entityId: document.id,
      metadata: {
        tenantId: userId,
        tenantName: tenant.name,
        tenantEmail: tenant.email,
        category,
        fileName: originalFilename,
      },
    });

    console.log(`[DOCUMENTS] Admin ${adminUser.email} uploaded document for tenant ${tenant.email}: ${storageKey}`);

    return c.json({
      data: {
        success: true,
        document: {
          id: document.id,
          fileName: document.fileName,
          storageKey: document.storageKey,
          category: document.category,
          description: document.description,
          fileSizeBytes: document.fileSizeBytes,
          uploadedAt: document.uploadedAt.toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("[DOCUMENTS] Admin upload error:", error);
    return c.json(
      { error: { message: "Failed to upload document", code: "UPLOAD_ERROR" } },
      500
    );
  }
});

/**
 * DELETE /api/documents/admin/:documentId
 * Admin deletes any document
 */
documentManagerRouter.delete("/admin/:documentId", adminMiddleware, async (c) => {
  const adminUser = c.get("user");
  const documentId = c.req.param("documentId");

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (!document) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }

  try {
    // Delete file from disk
    const resolvedPath = path.resolve(document.storagePath);
    const resolvedDocumentsDir = path.resolve(DOCUMENTS_DIR);

    if (resolvedPath.startsWith(resolvedDocumentsDir) && existsSync(resolvedPath)) {
      await unlink(resolvedPath);
    }

    // Delete database record
    await prisma.document.delete({ where: { id: documentId } });

    // Audit log
    await logAuditAction({
      adminUserId: adminUser.id,
      action: AuditActions.DOCUMENT_DELETE,
      entityType: "Document",
      entityId: documentId,
      metadata: {
        tenantId: document.userId,
        tenantName: document.user.name,
        tenantEmail: document.user.email,
        category: document.category,
        fileName: document.fileName,
      },
    });

    console.log(`[DOCUMENTS] Admin ${adminUser.email} deleted document: ${document.storageKey}`);

    return c.json({
      data: {
        success: true,
        message: "Document deleted successfully",
      },
    });
  } catch (error) {
    console.error("[DOCUMENTS] Admin delete error:", error);
    return c.json(
      { error: { message: "Failed to delete document", code: "DELETE_ERROR" } },
      500
    );
  }
});

export { documentManagerRouter };
