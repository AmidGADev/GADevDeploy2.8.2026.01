import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { CreateChecklistItemSchema, ChecklistTypeSchema } from "../../types";
import { env } from "../../env";
import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";

const adminChecklistRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
adminChecklistRouter.use("*", authMiddleware);
adminChecklistRouter.use("*", adminMiddleware);

// Uploads directory path
const UPLOADS_BASE = env.UPLOADS_DIR || path.resolve(process.cwd(), "uploads");
const CHECKLIST_PHOTOS_DIR = path.join(UPLOADS_BASE, "checklist-photos");

// Allowed file types for checklist photos
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB for photos

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
 * Format checklist item photo response
 */
function formatChecklistItemPhoto(photo: any) {
  return {
    id: photo.id,
    storageKey: photo.storageKey,
    filename: photo.filename,
    caption: photo.caption,
    mimeType: photo.mimeType,
    sizeBytes: photo.sizeBytes,
    uploadedAt: photo.uploadedAt.toISOString(),
  };
}

// Default item types for MOVE_IN checklist
const MOVE_IN_DEFAULT_ITEM_TYPES = new Set([
  "LEASE_SIGNED",
  "INSURANCE_UPLOADED",
  "INITIAL_PAYMENT",
  "MOVE_IN_INSPECTION",
  "KEYS_RECEIVED",
]);

// Default item types for MOVE_OUT checklist
const MOVE_OUT_DEFAULT_ITEM_TYPES = new Set([
  "FORWARDING_ADDRESS",
  "FINAL_CLEAN",
  "KEYS_RETURNED",
  "UTILITIES_TRANSFERRED",
  "MOVE_OUT_INSPECTION",
]);

// Combined set for categorization
const DEFAULT_ITEM_TYPES = new Set([
  ...MOVE_IN_DEFAULT_ITEM_TYPES,
  ...MOVE_OUT_DEFAULT_ITEM_TYPES,
]);

// Self-completable item types per checklist type
const SELF_COMPLETABLE_MOVE_IN = new Set(["INSURANCE_UPLOADED"]);
const SELF_COMPLETABLE_MOVE_OUT = new Set(["FORWARDING_ADDRESS", "UTILITIES_TRANSFERRED"]);

/**
 * Helper to get active tenancy for a user
 */
async function getActiveTenancyForUser(userId: string) {
  return prisma.tenancy.findFirst({
    where: {
      userId,
      isActive: true,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          insuranceStatus: true,
        },
      },
      unit: {
        select: {
          id: true,
          unitLabel: true,
          buildingName: true,
        },
      },
    },
  });
}

/**
 * Determine if an item is self-completable based on checklist type and item type
 */
function isSelfCompletable(checklistType: string, itemType: string): boolean {
  if (checklistType === "MOVE_OUT") {
    return SELF_COMPLETABLE_MOVE_OUT.has(itemType);
  }
  return SELF_COMPLETABLE_MOVE_IN.has(itemType);
}

/**
 * Format checklist item response
 */
function formatChecklistItem(item: any) {
  const checklistType = item.checklistType || "MOVE_IN";
  return {
    id: item.id,
    itemType: item.itemType,
    title: item.title,
    description: item.description,
    isRequired: item.isRequired,
    isCompleted: item.isCompleted,
    completedAt: item.completedAt?.toISOString() || null,
    completedBy: item.completedBy || null,
    sortOrder: item.sortOrder,
    checklistType,
    isDefault: DEFAULT_ITEM_TYPES.has(item.itemType),
    selfCompletable: isSelfCompletable(checklistType, item.itemType),
  };
}

/**
 * GET /api/admin/checklist/tenant/:tenantId
 * Get checklist for a tenant's active tenancy (by user ID)
 * Query params:
 *   - type: "MOVE_IN" | "MOVE_OUT" (default: "MOVE_IN")
 */
adminChecklistRouter.get("/tenant/:tenantId", async (c) => {
  const tenantId = c.req.param("tenantId");
  const checklistType = (c.req.query("type") || "MOVE_IN") as "MOVE_IN" | "MOVE_OUT";

  // Validate checklist type
  if (checklistType !== "MOVE_IN" && checklistType !== "MOVE_OUT") {
    return c.json(
      { error: { message: "Invalid checklist type. Must be MOVE_IN or MOVE_OUT", code: "INVALID_TYPE" } },
      400
    );
  }

  // Find the tenant's active tenancy
  const tenancy = await getActiveTenancyForUser(tenantId);

  if (!tenancy) {
    return c.json(
      { error: { message: "No active tenancy found for this tenant", code: "NOT_FOUND" } },
      404
    );
  }

  // Get checklist items for this tenancy filtered by checklist type
  const items = await prisma.checklistItem.findMany({
    where: {
      tenancyId: tenancy.id,
      checklistType,
    },
    include: {
      completedBy: {
        select: { id: true, name: true },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  const completed = items.filter((item) => item.isCompleted).length;
  const total = items.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return c.json({
    data: {
      tenancy: {
        id: tenancy.id,
        userId: tenancy.userId,
        user: tenancy.user,
        unit: tenancy.unit,
        startDate: tenancy.startDate.toISOString(),
        endDate: tenancy.endDate?.toISOString() || null,
        moveOutDate: tenancy.moveOutDate?.toISOString() || null,
        isActive: tenancy.isActive,
      },
      checklistType,
      items: items.map(formatChecklistItem),
      progress: { completed, total, percentage },
    },
  });
});

/**
 * POST /api/admin/checklist/tenant/:tenantId
 * Add a checklist item for a tenant's active tenancy
 */
adminChecklistRouter.post(
  "/tenant/:tenantId",
  zValidator("json", CreateChecklistItemSchema),
  async (c) => {
    const tenantId = c.req.param("tenantId");
    const data = c.req.valid("json");

    const tenancy = await getActiveTenancyForUser(tenantId);
    if (!tenancy) {
      return c.json(
        { error: { message: "No active tenancy found for this tenant", code: "NOT_FOUND" } },
        404
      );
    }

    const maxSortOrder = await prisma.checklistItem.aggregate({
      where: { tenancyId: tenancy.id },
      _max: { sortOrder: true },
    });

    const sortOrder = data.sortOrder ?? (maxSortOrder._max.sortOrder ?? 0) + 1;

    const item = await prisma.checklistItem.create({
      data: {
        tenancyId: tenancy.id,
        itemType: data.itemType || "CUSTOM",
        title: data.title,
        description: data.description || null,
        isRequired: data.isRequired ?? true,
        sortOrder,
      },
    });

    return c.json({ data: formatChecklistItem(item) });
  }
);

/**
 * POST /api/admin/checklist/tenant/:tenantId/initialize
 * Initialize default checklist for a tenant
 * Body: { checklistType: "MOVE_IN" | "MOVE_OUT" } (optional, defaults to MOVE_IN)
 */
adminChecklistRouter.post(
  "/tenant/:tenantId/initialize",
  async (c) => {
    const tenantId = c.req.param("tenantId");

    // Parse body manually to handle empty bodies
    let checklistType: "MOVE_IN" | "MOVE_OUT" = "MOVE_IN";
    try {
      const body = await c.req.json();
      if (body?.checklistType === "MOVE_OUT") {
        checklistType = "MOVE_OUT";
      }
    } catch {
      // Empty body or invalid JSON, use default MOVE_IN
    }

    const tenancy = await prisma.tenancy.findFirst({
      where: {
        userId: tenantId,
        isActive: true,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        unit: {
          select: { id: true, unitLabel: true, buildingName: true },
        },
      },
    });

    if (!tenancy) {
      return c.json(
        { error: { message: "No active tenancy found for this tenant", code: "NOT_FOUND" } },
        404
      );
    }

    // For move-out checklist, tenant must have a moveOutDate set
    if (checklistType === "MOVE_OUT" && !tenancy.moveOutDate) {
      return c.json(
        { error: { message: "Cannot initialize move-out checklist without a scheduled move-out date", code: "NO_MOVE_OUT_DATE" } },
        400
      );
    }

    // Check if items already exist for this checklist type
    const existingItems = await prisma.checklistItem.count({
      where: {
        tenancyId: tenancy.id,
        checklistType,
      },
    });

    if (existingItems > 0) {
      return c.json(
        { error: { message: `${checklistType === "MOVE_IN" ? "Move-in" : "Move-out"} checklist already has items`, code: "ALREADY_EXISTS" } },
        400
      );
    }

    // Default items based on checklist type
    const defaultItems =
      checklistType === "MOVE_OUT"
        ? [
            { itemType: "FORWARDING_ADDRESS", title: "Forwarding Address Provided", description: "Tenant has provided a forwarding address for final correspondence and deposit return", isRequired: true, sortOrder: 1 },
            { itemType: "FINAL_CLEAN", title: "Final Clean of Unit", description: "Unit has been cleaned and is move-out ready", isRequired: true, sortOrder: 2 },
            { itemType: "KEYS_RETURNED", title: "Keys Returned", description: "All keys and access cards have been returned", isRequired: true, sortOrder: 3 },
            { itemType: "UTILITIES_TRANSFERRED", title: "Utilities Transferred", description: "Utilities have been transferred out of tenant's name", isRequired: true, sortOrder: 4 },
            { itemType: "MOVE_OUT_INSPECTION", title: "Move-out Inspection Complete", description: "Move-out inspection has been completed and documented", isRequired: true, sortOrder: 5 },
          ]
        : [
            { itemType: "LEASE_SIGNED", title: "Lease Agreement Signed", description: "The lease agreement has been signed by all parties", isRequired: true, sortOrder: 1 },
            { itemType: "INSURANCE_UPLOADED", title: "Renter's Insurance Uploaded", description: "Valid renter's insurance has been uploaded and verified", isRequired: true, sortOrder: 2 },
            { itemType: "INITIAL_PAYMENT", title: "Initial Payment Complete", description: "First month's rent and deposit have been paid", isRequired: true, sortOrder: 3 },
            { itemType: "MOVE_IN_INSPECTION", title: "Move-in Inspection Complete", description: "Move-in inspection has been completed and documented", isRequired: true, sortOrder: 4 },
            { itemType: "KEYS_RECEIVED", title: "Keys Received", description: "Tenant has received all keys and access cards", isRequired: true, sortOrder: 5 },
          ];

    await prisma.checklistItem.createMany({
      data: defaultItems.map((item) => ({
        tenancyId: tenancy.id,
        checklistType,
        ...item,
      })),
    });

    const items = await prisma.checklistItem.findMany({
      where: {
        tenancyId: tenancy.id,
        checklistType,
      },
      orderBy: { sortOrder: "asc" },
    });

    return c.json({
      data: {
        checklistType,
        items: items.map(formatChecklistItem),
        count: items.length,
      },
    });
  }
);

/**
 * PUT /api/admin/checklist/item/:itemId/complete
 * Mark a checklist item as complete
 */
adminChecklistRouter.put("/item/:itemId/complete", async (c) => {
  const itemId = c.req.param("itemId");
  const user = c.get("user");

  const item = await prisma.checklistItem.findUnique({
    where: { id: itemId },
  });

  if (!item) {
    return c.json(
      { error: { message: "Checklist item not found", code: "NOT_FOUND" } },
      404
    );
  }

  const updatedItem = await prisma.checklistItem.update({
    where: { id: itemId },
    data: {
      isCompleted: true,
      completedAt: new Date(),
      completedById: user.id,
    },
    include: {
      completedBy: {
        select: { id: true, name: true },
      },
    },
  });

  return c.json({ data: formatChecklistItem(updatedItem) });
});

/**
 * PUT /api/admin/checklist/item/:itemId/incomplete
 * Mark a checklist item as incomplete
 */
adminChecklistRouter.put("/item/:itemId/incomplete", async (c) => {
  const itemId = c.req.param("itemId");

  const item = await prisma.checklistItem.findUnique({
    where: { id: itemId },
  });

  if (!item) {
    return c.json(
      { error: { message: "Checklist item not found", code: "NOT_FOUND" } },
      404
    );
  }

  const updatedItem = await prisma.checklistItem.update({
    where: { id: itemId },
    data: {
      isCompleted: false,
      completedAt: null,
      completedById: null,
    },
  });

  return c.json({ data: formatChecklistItem(updatedItem) });
});

/**
 * DELETE /api/admin/checklist/item/:itemId
 * Delete a checklist item (custom items only recommended)
 */
adminChecklistRouter.delete("/item/:itemId", async (c) => {
  const itemId = c.req.param("itemId");

  const item = await prisma.checklistItem.findUnique({
    where: { id: itemId },
  });

  if (!item) {
    return c.json(
      { error: { message: "Checklist item not found", code: "NOT_FOUND" } },
      404
    );
  }

  await prisma.checklistItem.delete({
    where: { id: itemId },
  });

  return c.json({ data: { success: true } });
});

/**
 * POST /api/admin/checklist/item/:itemId/photo
 * Upload photo to move-in checklist item (multipart)
 */
adminChecklistRouter.post("/item/:itemId/photo", async (c) => {
  const itemId = c.req.param("itemId");

  const item = await prisma.checklistItem.findUnique({
    where: { id: itemId },
  });

  if (!item) {
    return c.json(
      { error: { message: "Checklist item not found", code: "NOT_FOUND" } },
      404
    );
  }

  try {
    const formData = await c.req.formData();
    const file = formData.get("file");
    const caption = formData.get("caption");

    if (!file || !(file instanceof File)) {
      return c.json(
        { error: { message: "No file provided", code: "NO_FILE" } },
        400
      );
    }

    const sanitizedOriginalName = sanitizeFilename(file.name);
    if (!isValidFileType(file.type, sanitizedOriginalName)) {
      return c.json(
        { error: { message: "Invalid file type. Only JPG, PNG, and WebP are allowed.", code: "INVALID_FILE_TYPE" } },
        400
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return c.json(
        { error: { message: "File too large. Maximum size is 10MB.", code: "FILE_TOO_LARGE" } },
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
    if (!existsSync(CHECKLIST_PHOTOS_DIR)) {
      await mkdir(CHECKLIST_PHOTOS_DIR, { recursive: true });
    }

    // Generate unique filename
    const uniqueId = crypto.randomUUID();
    const safeExtension = path.extname(sanitizedOriginalName).toLowerCase() || ".jpg";
    const storageKey = `${itemId}-${uniqueId}${safeExtension}`;

    // Ensure filepath is within CHECKLIST_PHOTOS_DIR
    const filepath = path.join(CHECKLIST_PHOTOS_DIR, storageKey);
    const resolvedPath = path.resolve(filepath);
    const resolvedPhotosDir = path.resolve(CHECKLIST_PHOTOS_DIR);

    if (!resolvedPath.startsWith(resolvedPhotosDir)) {
      console.error(`[SECURITY] Path traversal attempt detected: ${filepath}`);
      return c.json(
        { error: { message: "Invalid file path", code: "INVALID_PATH" } },
        400
      );
    }

    // Write file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    // Create photo record
    const photo = await prisma.checklistItemPhoto.create({
      data: {
        checklistItemId: itemId,
        storageKey,
        filename: sanitizedOriginalName,
        caption: caption ? String(caption).trim().substring(0, 500) : null,
        mimeType: file.type,
        sizeBytes: file.size,
      },
    });

    console.log(`[CHECKLIST] Photo uploaded for item ${itemId}`);

    return c.json({ data: formatChecklistItemPhoto(photo) });
  } catch (error) {
    console.error("[CHECKLIST] Photo upload error:", error);
    return c.json(
      { error: { message: "Failed to upload photo", code: "UPLOAD_ERROR" } },
      500
    );
  }
});

/**
 * DELETE /api/admin/checklist/photo/:photoId
 * Delete a photo from move-in checklist item
 */
adminChecklistRouter.delete("/photo/:photoId", async (c) => {
  const photoId = c.req.param("photoId");

  const photo = await prisma.checklistItemPhoto.findUnique({
    where: { id: photoId },
  });

  if (!photo) {
    return c.json(
      { error: { message: "Photo not found", code: "NOT_FOUND" } },
      404
    );
  }

  try {
    // Delete the file from disk
    const filepath = path.join(CHECKLIST_PHOTOS_DIR, photo.storageKey);
    const resolvedPath = path.resolve(filepath);
    const resolvedPhotosDir = path.resolve(CHECKLIST_PHOTOS_DIR);

    if (resolvedPath.startsWith(resolvedPhotosDir) && existsSync(resolvedPath)) {
      await unlink(resolvedPath);
    }

    // Delete the database record
    await prisma.checklistItemPhoto.delete({
      where: { id: photoId },
    });

    console.log(`[CHECKLIST] Photo ${photoId} deleted`);

    return c.json({ data: { success: true } });
  } catch (error) {
    console.error("[CHECKLIST] Photo delete error:", error);
    return c.json(
      { error: { message: "Failed to delete photo", code: "DELETE_ERROR" } },
      500
    );
  }
});

export { adminChecklistRouter };
