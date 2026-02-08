import { Hono } from "hono";
import { prisma } from "../prisma";
import { authMiddleware } from "../middleware/auth";
import type { AuthVariables } from "../middleware/auth";
import { env } from "../env";
import { readFile, stat } from "fs/promises";
import path from "path";

/**
 * Secure File Uploads Router
 *
 * SECURITY: All file access requires authentication and authorization checks.
 * - Tenants can only access their own insurance documents
 * - Admins can access all files
 * - Service request attachments are accessible by unit members and admins
 */

const uploadsRouter = new Hono<{ Variables: AuthVariables }>();

// Require authentication for all upload access
uploadsRouter.use("*", authMiddleware);

// Base uploads directory
const UPLOADS_BASE = env.UPLOADS_DIR || path.resolve(process.cwd(), "uploads");

// MIME type mapping
const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/**
 * GET /api/uploads/insurance/:filename
 * Serve insurance documents with authorization check
 *
 * SECURITY:
 * - Tenants can only view their own insurance documents
 * - Admins can view any insurance document
 */
uploadsRouter.get("/insurance/:filename", async (c) => {
  const user = c.get("user");
  const filename = c.req.param("filename");

  // Sanitize filename - only allow alphanumeric, dash, underscore, dot
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return c.json({ error: { message: "Invalid filename", code: "INVALID_FILENAME" } }, 400);
  }

  // Construct file path safely
  const filePath = path.join(UPLOADS_BASE, "insurance", filename);
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(path.join(UPLOADS_BASE, "insurance"));

  // SECURITY: Prevent path traversal
  if (!resolvedPath.startsWith(resolvedBase)) {
    console.error(`[SECURITY] Path traversal attempt: ${filename}`);
    return c.json({ error: { message: "Access denied", code: "FORBIDDEN" } }, 403);
  }

  // Check authorization
  const isAdmin = user.role === "ADMIN";

  if (!isAdmin) {
    // For tenants, verify this is their own insurance document
    // Insurance documents are named: {userId}-{uuid}.{ext}
    const expectedPrefix = `${user.id}-`;
    if (!filename.startsWith(expectedPrefix)) {
      console.warn(`[SECURITY] Unauthorized insurance access attempt: user ${user.id} tried to access ${filename}`);
      return c.json({ error: { message: "Access denied", code: "FORBIDDEN" } }, 403);
    }
  }

  try {
    // Check if file exists
    const stats = await stat(resolvedPath);
    if (!stats.isFile()) {
      return c.json({ error: { message: "File not found", code: "NOT_FOUND" } }, 404);
    }

    // Read file
    const content = await readFile(resolvedPath);

    // Determine content type
    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    // Set security headers for file downloads
    c.header("Content-Type", contentType);
    c.header("Content-Length", String(content.length));
    c.header("Content-Disposition", `inline; filename="${filename}"`);
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
      return c.json({ error: { message: "File not found", code: "NOT_FOUND" } }, 404);
    }
    console.error(`[UPLOADS] Error serving insurance file: ${error.message}`);
    return c.json({ error: { message: "Failed to retrieve file", code: "SERVER_ERROR" } }, 500);
  }
});

/**
 * GET /api/uploads/service-requests/:filename
 * Serve service request attachments with authorization check
 *
 * SECURITY:
 * - Only users in the same unit can view attachments
 * - Admins can view any attachment
 */
uploadsRouter.get("/service-requests/:filename", async (c) => {
  const user = c.get("user");
  const filename = c.req.param("filename");

  // Sanitize filename
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return c.json({ error: { message: "Invalid filename", code: "INVALID_FILENAME" } }, 400);
  }

  // Construct file path safely
  const filePath = path.join(UPLOADS_BASE, "service-requests", filename);
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(path.join(UPLOADS_BASE, "service-requests"));

  // SECURITY: Prevent path traversal
  if (!resolvedPath.startsWith(resolvedBase)) {
    console.error(`[SECURITY] Path traversal attempt: ${filename}`);
    return c.json({ error: { message: "Access denied", code: "FORBIDDEN" } }, 403);
  }

  const isAdmin = user.role === "ADMIN";

  if (!isAdmin) {
    // For tenants, verify they have access to this attachment's service request
    // Find the attachment and check if it belongs to a service request in their unit
    const attachment = await prisma.serviceRequestAttachment.findFirst({
      where: {
        fileUrl: { contains: filename },
      },
      include: {
        serviceRequest: {
          include: {
            unit: {
              include: {
                tenancies: {
                  where: {
                    userId: user.id,
                    isActive: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!attachment || attachment.serviceRequest.unit.tenancies.length === 0) {
      console.warn(`[SECURITY] Unauthorized attachment access attempt: user ${user.id} tried to access ${filename}`);
      return c.json({ error: { message: "Access denied", code: "FORBIDDEN" } }, 403);
    }
  }

  try {
    const stats = await stat(resolvedPath);
    if (!stats.isFile()) {
      return c.json({ error: { message: "File not found", code: "NOT_FOUND" } }, 404);
    }

    const content = await readFile(resolvedPath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    c.header("Content-Type", contentType);
    c.header("Content-Length", String(content.length));
    c.header("Content-Disposition", `inline; filename="${filename}"`);
    c.header("Cache-Control", "private, max-age=3600"); // Cache for 1 hour (service request files less sensitive)

    return new Response(content, {
      status: 200,
      headers: c.res.headers,
    });
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return c.json({ error: { message: "File not found", code: "NOT_FOUND" } }, 404);
    }
    console.error(`[UPLOADS] Error serving service request file: ${error.message}`);
    return c.json({ error: { message: "Failed to retrieve file", code: "SERVER_ERROR" } }, 500);
  }
});

/**
 * GET /api/uploads/tenant-documents/:filename
 * Serve tenant documents (lease agreements, signed docs) with authorization check
 *
 * SECURITY:
 * - Tenants can only view their own documents
 * - Admins can view any document
 */
uploadsRouter.get("/tenant-documents/:filename", async (c) => {
  const user = c.get("user");
  const filename = c.req.param("filename");

  // Sanitize filename
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return c.json({ error: { message: "Invalid filename", code: "INVALID_FILENAME" } }, 400);
  }

  // Construct file path safely
  const filePath = path.join(UPLOADS_BASE, "tenant-documents", filename);
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(path.join(UPLOADS_BASE, "tenant-documents"));

  // SECURITY: Prevent path traversal
  if (!resolvedPath.startsWith(resolvedBase)) {
    console.error(`[SECURITY] Path traversal attempt: ${filename}`);
    return c.json({ error: { message: "Access denied", code: "FORBIDDEN" } }, 403);
  }

  const isAdmin = user.role === "ADMIN";

  if (!isAdmin) {
    // For tenants, verify this is their own document
    // Documents are named: {userId}-{uuid}.{ext}
    const expectedPrefix = `${user.id}-`;
    if (!filename.startsWith(expectedPrefix)) {
      console.warn(`[SECURITY] Unauthorized document access attempt: user ${user.id} tried to access ${filename}`);
      return c.json({ error: { message: "Access denied", code: "FORBIDDEN" } }, 403);
    }
  }

  try {
    const stats = await stat(resolvedPath);
    if (!stats.isFile()) {
      return c.json({ error: { message: "File not found", code: "NOT_FOUND" } }, 404);
    }

    const content = await readFile(resolvedPath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    c.header("Content-Type", contentType);
    c.header("Content-Length", String(content.length));
    c.header("Content-Disposition", `inline; filename="${filename}"`);
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
      return c.json({ error: { message: "File not found", code: "NOT_FOUND" } }, 404);
    }
    console.error(`[UPLOADS] Error serving tenant document: ${error.message}`);
    return c.json({ error: { message: "Failed to retrieve file", code: "SERVER_ERROR" } }, 500);
  }
});

/**
 * GET /api/uploads/unit-assets/:filename
 * Serve unit asset files (manuals, warranty docs) with authorization check
 *
 * SECURITY:
 * - Tenants can only view files for assets in their unit
 * - Admins can view any file
 */
uploadsRouter.get("/unit-assets/:filename", async (c) => {
  const user = c.get("user");
  const filename = c.req.param("filename");

  // Sanitize filename
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return c.json({ error: { message: "Invalid filename", code: "INVALID_FILENAME" } }, 400);
  }

  // Construct file path safely
  const filePath = path.join(UPLOADS_BASE, "unit-assets", filename);
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(path.join(UPLOADS_BASE, "unit-assets"));

  // SECURITY: Prevent path traversal
  if (!resolvedPath.startsWith(resolvedBase)) {
    console.error(`[SECURITY] Path traversal attempt: ${filename}`);
    return c.json({ error: { message: "Access denied", code: "FORBIDDEN" } }, 403);
  }

  const isAdmin = user.role === "ADMIN";

  if (!isAdmin) {
    // For tenants, verify this file belongs to an asset in their unit
    // Files are named: {assetId}-{uuid}.{ext}
    // Extract assetId from filename
    const assetIdMatch = filename.match(/^([a-zA-Z0-9]+)-/);
    if (!assetIdMatch) {
      console.warn(`[SECURITY] Invalid unit asset filename format: ${filename}`);
      return c.json({ error: { message: "Access denied", code: "FORBIDDEN" } }, 403);
    }

    const assetId = assetIdMatch[1];

    // Find the asset and check if the tenant has tenancy in that unit
    const assetFile = await prisma.unitAssetFile.findFirst({
      where: {
        storageKey: filename,
        unitAsset: {
          unit: {
            tenancies: {
              some: {
                userId: user.id,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!assetFile) {
      console.warn(`[SECURITY] Unauthorized unit asset access attempt: user ${user.id} tried to access ${filename}`);
      return c.json({ error: { message: "Access denied", code: "FORBIDDEN" } }, 403);
    }
  }

  try {
    const stats = await stat(resolvedPath);
    if (!stats.isFile()) {
      return c.json({ error: { message: "File not found", code: "NOT_FOUND" } }, 404);
    }

    const content = await readFile(resolvedPath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    c.header("Content-Type", contentType);
    c.header("Content-Length", String(content.length));
    c.header("Content-Disposition", `inline; filename="${filename}"`);
    // Cache unit asset files for 1 hour
    c.header("Cache-Control", "private, max-age=3600");

    return new Response(content, {
      status: 200,
      headers: c.res.headers,
    });
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return c.json({ error: { message: "File not found", code: "NOT_FOUND" } }, 404);
    }
    console.error(`[UPLOADS] Error serving unit asset file: ${error.message}`);
    return c.json({ error: { message: "Failed to retrieve file", code: "SERVER_ERROR" } }, 500);
  }
});

/**
 * GET /api/uploads/checklist-photos/:filename
 * Serve checklist photos (move-in and move-out) with authorization check
 *
 * SECURITY:
 * - Only admins can access checklist photos
 */
uploadsRouter.get("/checklist-photos/:filename", async (c) => {
  const user = c.get("user");
  const filename = c.req.param("filename");

  // Only admins can access checklist photos
  if (user.role !== "ADMIN") {
    console.warn(`[SECURITY] Non-admin user ${user.id} tried to access checklist photo ${filename}`);
    return c.json({ error: { message: "Access denied", code: "FORBIDDEN" } }, 403);
  }

  // Sanitize filename
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return c.json({ error: { message: "Invalid filename", code: "INVALID_FILENAME" } }, 400);
  }

  // Construct file path safely
  const filePath = path.join(UPLOADS_BASE, "checklist-photos", filename);
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(path.join(UPLOADS_BASE, "checklist-photos"));

  // SECURITY: Prevent path traversal
  if (!resolvedPath.startsWith(resolvedBase)) {
    console.error(`[SECURITY] Path traversal attempt: ${filename}`);
    return c.json({ error: { message: "Access denied", code: "FORBIDDEN" } }, 403);
  }

  try {
    const stats = await stat(resolvedPath);
    if (!stats.isFile()) {
      return c.json({ error: { message: "File not found", code: "NOT_FOUND" } }, 404);
    }

    const content = await readFile(resolvedPath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    c.header("Content-Type", contentType);
    c.header("Content-Length", String(content.length));
    c.header("Content-Disposition", `inline; filename="${filename}"`);
    // Cache checklist photos for 1 hour
    c.header("Cache-Control", "private, max-age=3600");

    return new Response(content, {
      status: 200,
      headers: c.res.headers,
    });
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return c.json({ error: { message: "File not found", code: "NOT_FOUND" } }, 404);
    }
    console.error(`[UPLOADS] Error serving checklist photo: ${error.message}`);
    return c.json({ error: { message: "Failed to retrieve file", code: "SERVER_ERROR" } }, 500);
  }
});

export { uploadsRouter };
