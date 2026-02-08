import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { env } from "../../env";
import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import { logAuditAction, AuditActions } from "../../lib/audit";

const adminDocumentsRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
adminDocumentsRouter.use("*", authMiddleware);
adminDocumentsRouter.use("*", adminMiddleware);

// Uploads directory path - use UPLOADS_DIR env var for Render persistent disk
const UPLOADS_BASE = env.UPLOADS_DIR || path.resolve(process.cwd(), "uploads");
const DOCUMENTS_DIR = path.join(UPLOADS_BASE, "tenant-documents");

// Allowed file types for tenant documents
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ALLOWED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB for documents

// Document types
const DOCUMENT_TYPES = ["LEASE", "ADDENDUM", "SIGNED_AGREEMENT", "OTHER"] as const;

/**
 * Validate file type by checking both MIME type and extension
 */
function isValidFileType(mimeType: string, filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_MIME_TYPES.has(mimeType) && ALLOWED_EXTENSIONS.has(ext);
}

/**
 * Sanitize filename to prevent path traversal
 */
function sanitizeFilename(filename: string): string {
  const basename = path.basename(filename);
  return basename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * GET /api/admin/documents
 * List all documents for all tenants or filter by tenant
 * Query params:
 *   - userId: filter by specific tenant
 */
adminDocumentsRouter.get("/", async (c) => {
  const userIdFilter = c.req.query("userId");

  const documents = await prisma.tenantDocument.findMany({
    where: userIdFilter ? { userId: userIdFilter } : undefined,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      uploadedBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({
    data: documents.map((doc) => ({
      id: doc.id,
      userId: doc.userId,
      userName: doc.user.name,
      userEmail: doc.user.email,
      documentType: doc.documentType,
      fileName: doc.fileName,
      fileUrl: doc.fileUrl,
      description: doc.description,
      uploadedById: doc.uploadedById,
      uploadedByName: doc.uploadedBy.name,
      createdAt: doc.createdAt.toISOString(),
    })),
  });
});

/**
 * GET /api/admin/documents/:userId
 * List all documents for a specific tenant
 */
adminDocumentsRouter.get("/:userId", async (c) => {
  const userId = c.req.param("userId");

  // Verify tenant exists
  const tenant = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!tenant) {
    return c.json({ error: { message: "Tenant not found", code: "NOT_FOUND" } }, 404);
  }

  const documents = await prisma.tenantDocument.findMany({
    where: { userId },
    include: {
      uploadedBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({
    data: {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
      },
      documents: documents.map((doc) => ({
        id: doc.id,
        documentType: doc.documentType,
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        description: doc.description,
        uploadedById: doc.uploadedById,
        uploadedByName: doc.uploadedBy.name,
        createdAt: doc.createdAt.toISOString(),
      })),
    },
  });
});

/**
 * POST /api/admin/documents/:userId/upload
 * Upload a document for a specific tenant
 * Multipart form data:
 *   - file: The document file (PDF, JPG, PNG)
 *   - documentType: LEASE, ADDENDUM, SIGNED_AGREEMENT, or OTHER
 *   - description: Optional description
 */
adminDocumentsRouter.post("/:userId/upload", async (c) => {
  const adminUser = c.get("user");
  const userId = c.req.param("userId");

  // Verify tenant exists
  const tenant = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!tenant) {
    return c.json({ error: { message: "Tenant not found", code: "NOT_FOUND" } }, 404);
  }

  try {
    // Parse multipart form data
    const formData = await c.req.formData();
    const file = formData.get("file");
    const documentType = formData.get("documentType");
    const description = formData.get("description");

    // Validate required fields
    if (!file || !(file instanceof File)) {
      return c.json(
        { error: { message: "No file provided", code: "NO_FILE" } },
        400
      );
    }

    if (!documentType || typeof documentType !== "string") {
      return c.json(
        { error: { message: "Document type is required", code: "NO_TYPE" } },
        400
      );
    }

    if (!DOCUMENT_TYPES.includes(documentType as typeof DOCUMENT_TYPES[number])) {
      return c.json(
        { error: { message: `Invalid document type. Must be one of: ${DOCUMENT_TYPES.join(", ")}`, code: "INVALID_TYPE" } },
        400
      );
    }

    // Validate file type
    const sanitizedOriginalName = sanitizeFilename(file.name);
    if (!isValidFileType(file.type, sanitizedOriginalName)) {
      return c.json(
        { error: { message: "Invalid file type. Only PDF, JPG, and PNG are allowed.", code: "INVALID_FILE_TYPE" } },
        400
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return c.json(
        { error: { message: "File too large. Maximum size is 25MB.", code: "FILE_TOO_LARGE" } },
        400
      );
    }

    if (file.size < 100) {
      return c.json(
        { error: { message: "File appears to be empty or corrupted.", code: "FILE_TOO_SMALL" } },
        400
      );
    }

    // Create uploads directory if it doesn't exist
    if (!existsSync(DOCUMENTS_DIR)) {
      await mkdir(DOCUMENTS_DIR, { recursive: true });
    }

    // Generate unique filename
    const uniqueId = crypto.randomUUID();
    const safeExtension = path.extname(sanitizedOriginalName).toLowerCase() || ".pdf";
    const filename = `${userId}-${uniqueId}${safeExtension}`;

    // Ensure filepath is within DOCUMENTS_DIR
    const filepath = path.join(DOCUMENTS_DIR, filename);
    const resolvedPath = path.resolve(filepath);
    const resolvedDocumentsDir = path.resolve(DOCUMENTS_DIR);

    if (!resolvedPath.startsWith(resolvedDocumentsDir)) {
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
    const documentUrl = `/api/uploads/tenant-documents/${filename}`;

    // Create document record
    const document = await prisma.tenantDocument.create({
      data: {
        userId,
        documentType,
        fileName: sanitizedOriginalName,
        fileUrl: documentUrl,
        description: description ? String(description).trim().substring(0, 500) : null,
        uploadedById: adminUser.id,
      },
    });

    // Log audit action
    await logAuditAction({
      adminUserId: adminUser.id,
      action: AuditActions.DOCUMENT_UPLOAD,
      entityType: "TenantDocument",
      entityId: document.id,
      metadata: {
        tenantId: userId,
        tenantName: tenant.name,
        tenantEmail: tenant.email,
        documentType,
        fileName: sanitizedOriginalName,
      },
    });

    console.log(
      `[DOCUMENTS] Admin ${adminUser.email} uploaded ${documentType} document for tenant ${tenant.email}`
    );

    return c.json({
      data: {
        success: true,
        document: {
          id: document.id,
          documentType: document.documentType,
          fileName: document.fileName,
          fileUrl: document.fileUrl,
          description: document.description,
          createdAt: document.createdAt.toISOString(),
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
 * DELETE /api/admin/documents/:documentId
 * Delete a tenant document
 */
adminDocumentsRouter.delete("/:documentId", async (c) => {
  const adminUser = c.get("user");
  const documentId = c.req.param("documentId");

  // Find the document
  const document = await prisma.tenantDocument.findUnique({
    where: { id: documentId },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!document) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }

  try {
    // Delete the file from disk
    const filename = path.basename(document.fileUrl);
    const filepath = path.join(DOCUMENTS_DIR, filename);
    const resolvedPath = path.resolve(filepath);
    const resolvedDocumentsDir = path.resolve(DOCUMENTS_DIR);

    if (resolvedPath.startsWith(resolvedDocumentsDir) && existsSync(resolvedPath)) {
      await unlink(resolvedPath);
    }

    // Delete the database record
    await prisma.tenantDocument.delete({
      where: { id: documentId },
    });

    // Log audit action
    await logAuditAction({
      adminUserId: adminUser.id,
      action: AuditActions.DOCUMENT_DELETE,
      entityType: "TenantDocument",
      entityId: documentId,
      metadata: {
        tenantId: document.userId,
        tenantName: document.user.name,
        tenantEmail: document.user.email,
        documentType: document.documentType,
        fileName: document.fileName,
      },
    });

    console.log(
      `[DOCUMENTS] Admin ${adminUser.email} deleted ${document.documentType} document for tenant ${document.user.email}`
    );

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

export { adminDocumentsRouter };
