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
import {
  UpdateMoveOutChecklistSchema,
  UpdateMoveOutChecklistItemSchema,
  MoveOutChecklistCategorySchema,
} from "../../types";

const moveOutChecklistRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
moveOutChecklistRouter.use("*", authMiddleware);
moveOutChecklistRouter.use("*", adminMiddleware);

// Uploads directory path
const UPLOADS_BASE = env.UPLOADS_DIR || path.resolve(process.cwd(), "uploads");
const CHECKLIST_PHOTOS_DIR = path.join(UPLOADS_BASE, "checklist-photos");

// Allowed file types for checklist photos
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB for photos

// Default categories for move-out checklist
const DEFAULT_CATEGORIES = [
  { category: "KEYS_ACCESS", label: "Keys & Access" },
  { category: "WALLS_PAINT", label: "Walls & Paint" },
  { category: "FLOORS", label: "Floors" },
  { category: "KITCHEN", label: "Kitchen" },
  { category: "BATHROOM", label: "Bathroom" },
  { category: "APPLIANCES", label: "Appliances" },
  { category: "DOORS_WINDOWS", label: "Doors & Windows" },
] as const;

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
        },
      },
      unit: {
        select: {
          id: true,
          unitLabel: true,
        },
      },
    },
  });
}

/**
 * Format move-out checklist response
 */
function formatMoveOutChecklist(checklist: any) {
  return {
    id: checklist.id,
    tenancyId: checklist.tenancyId,
    status: checklist.status,
    isFinalized: checklist.isFinalized,
    finalizedAt: checklist.finalizedAt?.toISOString() || null,
    finalizedById: checklist.finalizedById,
    notes: checklist.notes,
    damageNotes: checklist.damageNotes,
    damageFound: checklist.damageFound,
    keysReturned: checklist.keysReturned,
    createdAt: checklist.createdAt.toISOString(),
    updatedAt: checklist.updatedAt.toISOString(),
    items: checklist.items?.map(formatMoveOutChecklistItem) || [],
    finalizedBy: checklist.finalizedBy
      ? { id: checklist.finalizedBy.id, name: checklist.finalizedBy.name }
      : null,
  };
}

/**
 * Format move-out checklist item response
 */
function formatMoveOutChecklistItem(item: any) {
  return {
    id: item.id,
    checklistId: item.checklistId,
    category: item.category,
    condition: item.condition,
    notes: item.notes,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    photos: item.photos?.map(formatMoveOutChecklistPhoto) || [],
  };
}

/**
 * Format move-out checklist photo response
 */
function formatMoveOutChecklistPhoto(photo: any) {
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

/**
 * GET /api/admin/move-out-checklist/tenant/:tenantId
 * Get move-out checklist for a tenant's active tenancy
 */
moveOutChecklistRouter.get("/tenant/:tenantId", async (c) => {
  const tenantId = c.req.param("tenantId");

  const tenancy = await getActiveTenancyForUser(tenantId);

  if (!tenancy) {
    return c.json(
      { error: { message: "No active tenancy found for this tenant", code: "NOT_FOUND" } },
      404
    );
  }

  const checklist = await prisma.moveOutChecklist.findUnique({
    where: { tenancyId: tenancy.id },
    include: {
      items: {
        include: {
          photos: true,
        },
        orderBy: { createdAt: "asc" },
      },
      finalizedBy: {
        select: { id: true, name: true },
      },
    },
  });

  if (!checklist) {
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
        checklist: null,
      },
    });
  }

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
      checklist: formatMoveOutChecklist(checklist),
    },
  });
});

/**
 * POST /api/admin/move-out-checklist/tenant/:tenantId/initialize
 * Initialize move-out checklist with default items
 */
moveOutChecklistRouter.post("/tenant/:tenantId/initialize", async (c) => {
  const tenantId = c.req.param("tenantId");

  const tenancy = await getActiveTenancyForUser(tenantId);

  if (!tenancy) {
    return c.json(
      { error: { message: "No active tenancy found for this tenant", code: "NOT_FOUND" } },
      404
    );
  }

  // Check if checklist already exists
  const existingChecklist = await prisma.moveOutChecklist.findUnique({
    where: { tenancyId: tenancy.id },
  });

  if (existingChecklist) {
    return c.json(
      { error: { message: "Move-out checklist already exists for this tenancy", code: "ALREADY_EXISTS" } },
      400
    );
  }

  // Create checklist with default items
  const checklist = await prisma.moveOutChecklist.create({
    data: {
      tenancyId: tenancy.id,
      status: "NOT_STARTED",
      items: {
        create: DEFAULT_CATEGORIES.map((cat) => ({
          category: cat.category,
        })),
      },
    },
    include: {
      items: {
        include: {
          photos: true,
        },
        orderBy: { createdAt: "asc" },
      },
      finalizedBy: {
        select: { id: true, name: true },
      },
    },
  });

  console.log(
    `[MOVE-OUT-CHECKLIST] Initialized checklist for tenant ${tenancy.user.email} in unit ${tenancy.unit.unitLabel}`
  );

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
      checklist: formatMoveOutChecklist(checklist),
    },
  });
});

/**
 * PUT /api/admin/move-out-checklist/:checklistId
 * Update checklist (status, notes, keys returned, damage)
 */
moveOutChecklistRouter.put(
  "/:checklistId",
  zValidator("json", UpdateMoveOutChecklistSchema),
  async (c) => {
    const checklistId = c.req.param("checklistId");
    const data = c.req.valid("json");

    const checklist = await prisma.moveOutChecklist.findUnique({
      where: { id: checklistId },
    });

    if (!checklist) {
      return c.json(
        { error: { message: "Checklist not found", code: "NOT_FOUND" } },
        404
      );
    }

    if (checklist.isFinalized) {
      return c.json(
        { error: { message: "Cannot modify a finalized checklist", code: "CHECKLIST_FINALIZED" } },
        400
      );
    }

    const updatedChecklist = await prisma.moveOutChecklist.update({
      where: { id: checklistId },
      data: {
        status: data.status,
        notes: data.notes,
        damageNotes: data.damageNotes,
        damageFound: data.damageFound,
        keysReturned: data.keysReturned,
      },
      include: {
        items: {
          include: {
            photos: true,
          },
          orderBy: { createdAt: "asc" },
        },
        finalizedBy: {
          select: { id: true, name: true },
        },
      },
    });

    return c.json({ data: formatMoveOutChecklist(updatedChecklist) });
  }
);

/**
 * PUT /api/admin/move-out-checklist/:checklistId/finalize
 * Finalize the checklist (locks it)
 * Returns warnings for potential issues (does not block finalization)
 */
moveOutChecklistRouter.put("/:checklistId/finalize", async (c) => {
  const checklistId = c.req.param("checklistId");
  const user = c.get("user");

  const checklist = await prisma.moveOutChecklist.findUnique({
    where: { id: checklistId },
    include: {
      items: {
        include: {
          photos: true,
        },
      },
    },
  });

  if (!checklist) {
    return c.json(
      { error: { message: "Checklist not found", code: "NOT_FOUND" } },
      404
    );
  }

  if (checklist.isFinalized) {
    return c.json(
      { error: { message: "Checklist is already finalized", code: "ALREADY_FINALIZED" } },
      400
    );
  }

  // Validate all items have conditions set
  const incompleteItems = checklist.items.filter((item) => !item.condition);
  if (incompleteItems.length > 0) {
    return c.json(
      {
        error: {
          message: `Cannot finalize: ${incompleteItems.length} item(s) have no condition set`,
          code: "INCOMPLETE_ITEMS",
        },
      },
      400
    );
  }

  // Calculate warnings (do not block finalization)
  const warnings: { noPhotos?: boolean; damageWithoutEvidence?: boolean } = {};

  // Check if no photos uploaded across all items
  const totalPhotos = checklist.items.reduce((sum, item) => sum + item.photos.length, 0);
  if (totalPhotos === 0) {
    warnings.noPhotos = true;
  }

  // Check if damageFound=true but no damageNotes and no photos on damage items
  if (checklist.damageFound) {
    const hasDamageNotes = checklist.damageNotes && checklist.damageNotes.trim().length > 0;
    // Check items with POOR or DAMAGED condition for photos
    const damageItems = checklist.items.filter(
      (item) => item.condition === "POOR" || item.condition === "DAMAGED"
    );
    const damageItemsWithPhotos = damageItems.filter((item) => item.photos.length > 0);

    if (!hasDamageNotes && damageItemsWithPhotos.length === 0) {
      warnings.damageWithoutEvidence = true;
    }
  }

  const updatedChecklist = await prisma.moveOutChecklist.update({
    where: { id: checklistId },
    data: {
      isFinalized: true,
      finalizedAt: new Date(),
      finalizedById: user.id,
      status: "COMPLETED",
    },
    include: {
      items: {
        include: {
          photos: true,
        },
        orderBy: { createdAt: "asc" },
      },
      finalizedBy: {
        select: { id: true, name: true },
      },
    },
  });

  console.log(`[MOVE-OUT-CHECKLIST] Checklist ${checklistId} finalized by ${user.email}`);

  return c.json({
    data: formatMoveOutChecklist(updatedChecklist),
    warnings: Object.keys(warnings).length > 0 ? warnings : undefined,
  });
});

/**
 * PUT /api/admin/move-out-checklist/:checklistId/reopen
 * Reopen a finalized checklist
 */
moveOutChecklistRouter.put("/:checklistId/reopen", async (c) => {
  const checklistId = c.req.param("checklistId");
  const user = c.get("user");

  const checklist = await prisma.moveOutChecklist.findUnique({
    where: { id: checklistId },
  });

  if (!checklist) {
    return c.json(
      { error: { message: "Checklist not found", code: "NOT_FOUND" } },
      404
    );
  }

  if (!checklist.isFinalized) {
    return c.json(
      { error: { message: "Checklist is not finalized", code: "NOT_FINALIZED" } },
      400
    );
  }

  const updatedChecklist = await prisma.moveOutChecklist.update({
    where: { id: checklistId },
    data: {
      isFinalized: false,
      finalizedAt: null,
      finalizedById: null,
      status: "IN_PROGRESS",
    },
    include: {
      items: {
        include: {
          photos: true,
        },
        orderBy: { createdAt: "asc" },
      },
      finalizedBy: {
        select: { id: true, name: true },
      },
    },
  });

  console.log(`[MOVE-OUT-CHECKLIST] Checklist ${checklistId} reopened by ${user.email}`);

  return c.json({ data: formatMoveOutChecklist(updatedChecklist) });
});

/**
 * PUT /api/admin/move-out-checklist/item/:itemId
 * Update an item's condition/notes
 */
moveOutChecklistRouter.put(
  "/item/:itemId",
  zValidator("json", UpdateMoveOutChecklistItemSchema),
  async (c) => {
    const itemId = c.req.param("itemId");
    const data = c.req.valid("json");

    const item = await prisma.moveOutChecklistItem.findUnique({
      where: { id: itemId },
      include: {
        checklist: true,
      },
    });

    if (!item) {
      return c.json(
        { error: { message: "Checklist item not found", code: "NOT_FOUND" } },
        404
      );
    }

    if (item.checklist.isFinalized) {
      return c.json(
        { error: { message: "Cannot modify items in a finalized checklist", code: "CHECKLIST_FINALIZED" } },
        400
      );
    }

    const updatedItem = await prisma.moveOutChecklistItem.update({
      where: { id: itemId },
      data: {
        condition: data.condition,
        notes: data.notes,
      },
      include: {
        photos: true,
      },
    });

    // Auto-update checklist status to IN_PROGRESS if it's NOT_STARTED
    if (item.checklist.status === "NOT_STARTED") {
      await prisma.moveOutChecklist.update({
        where: { id: item.checklist.id },
        data: { status: "IN_PROGRESS" },
      });
    }

    return c.json({ data: formatMoveOutChecklistItem(updatedItem) });
  }
);

/**
 * POST /api/admin/move-out-checklist/item/:itemId/photo
 * Upload photo to item (multipart)
 */
moveOutChecklistRouter.post("/item/:itemId/photo", async (c) => {
  const itemId = c.req.param("itemId");

  const item = await prisma.moveOutChecklistItem.findUnique({
    where: { id: itemId },
    include: {
      checklist: true,
    },
  });

  if (!item) {
    return c.json(
      { error: { message: "Checklist item not found", code: "NOT_FOUND" } },
      404
    );
  }

  if (item.checklist.isFinalized) {
    return c.json(
      { error: { message: "Cannot add photos to a finalized checklist", code: "CHECKLIST_FINALIZED" } },
      400
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
    const photo = await prisma.moveOutChecklistPhoto.create({
      data: {
        itemId,
        storageKey,
        filename: sanitizedOriginalName,
        caption: caption ? String(caption).trim().substring(0, 500) : null,
        mimeType: file.type,
        sizeBytes: file.size,
      },
    });

    // Auto-update checklist status to IN_PROGRESS if it's NOT_STARTED
    if (item.checklist.status === "NOT_STARTED") {
      await prisma.moveOutChecklist.update({
        where: { id: item.checklist.id },
        data: { status: "IN_PROGRESS" },
      });
    }

    console.log(`[MOVE-OUT-CHECKLIST] Photo uploaded for item ${itemId}`);

    return c.json({ data: formatMoveOutChecklistPhoto(photo) });
  } catch (error) {
    console.error("[MOVE-OUT-CHECKLIST] Photo upload error:", error);
    return c.json(
      { error: { message: "Failed to upload photo", code: "UPLOAD_ERROR" } },
      500
    );
  }
});

/**
 * DELETE /api/admin/move-out-checklist/photo/:photoId
 * Delete a photo
 */
moveOutChecklistRouter.delete("/photo/:photoId", async (c) => {
  const photoId = c.req.param("photoId");

  const photo = await prisma.moveOutChecklistPhoto.findUnique({
    where: { id: photoId },
    include: {
      item: {
        include: {
          checklist: true,
        },
      },
    },
  });

  if (!photo) {
    return c.json(
      { error: { message: "Photo not found", code: "NOT_FOUND" } },
      404
    );
  }

  if (photo.item.checklist.isFinalized) {
    return c.json(
      { error: { message: "Cannot delete photos from a finalized checklist", code: "CHECKLIST_FINALIZED" } },
      400
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
    await prisma.moveOutChecklistPhoto.delete({
      where: { id: photoId },
    });

    console.log(`[MOVE-OUT-CHECKLIST] Photo ${photoId} deleted`);

    return c.json({ data: { success: true } });
  } catch (error) {
    console.error("[MOVE-OUT-CHECKLIST] Photo delete error:", error);
    return c.json(
      { error: { message: "Failed to delete photo", code: "DELETE_ERROR" } },
      500
    );
  }
});

export { moveOutChecklistRouter };
