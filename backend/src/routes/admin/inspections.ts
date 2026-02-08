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
  InspectionTypeSchema,
  UpdateInspectionSchema,
  UpdateInspectionItemSchema,
  InspectionCategorySchema,
} from "../../types";

const inspectionsRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
inspectionsRouter.use("*", authMiddleware);
inspectionsRouter.use("*", adminMiddleware);

// Uploads directory path
const UPLOADS_BASE = env.UPLOADS_DIR || path.resolve(process.cwd(), "uploads");
const INSPECTION_PHOTOS_DIR = path.join(UPLOADS_BASE, "inspection-photos");

// Allowed file types for inspection photos
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB for photos

// Default categories for inspections (same for both move-in and move-out)
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
          buildingName: true,
        },
      },
    },
  });
}

/**
 * Format inspection response
 */
function formatInspection(inspection: any) {
  return {
    id: inspection.id,
    tenancyId: inspection.tenancyId,
    inspectionType: inspection.inspectionType,
    status: inspection.status,
    isFinalized: inspection.isFinalized,
    finalizedAt: inspection.finalizedAt?.toISOString() || null,
    finalizedById: inspection.finalizedById,
    notes: inspection.notes,
    damageNotes: inspection.damageNotes,
    damageFound: inspection.damageFound,
    keysReturned: inspection.keysReturned,
    createdAt: inspection.createdAt.toISOString(),
    updatedAt: inspection.updatedAt.toISOString(),
    items: inspection.items?.map(formatInspectionItem) || [],
    finalizedBy: inspection.finalizedBy
      ? { id: inspection.finalizedBy.id, name: inspection.finalizedBy.name }
      : null,
  };
}

/**
 * Format inspection item response
 */
function formatInspectionItem(item: any) {
  return {
    id: item.id,
    inspectionId: item.inspectionId,
    category: item.category,
    condition: item.condition,
    notes: item.notes,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    photos: item.photos?.map(formatInspectionPhoto) || [],
  };
}

/**
 * Format inspection photo response
 */
function formatInspectionPhoto(photo: any) {
  return {
    id: photo.id,
    inspectionItemId: photo.inspectionItemId,
    storageKey: photo.storageKey,
    filename: photo.filename,
    caption: photo.caption,
    mimeType: photo.mimeType,
    sizeBytes: photo.sizeBytes,
    uploadedAt: photo.uploadedAt.toISOString(),
  };
}

/**
 * GET /api/admin/inspections/tenant/:tenantId/:inspectionType
 * Get inspection for a tenant (type = "move-in" or "move-out")
 */
inspectionsRouter.get(
  "/tenant/:tenantId/:inspectionType",
  async (c) => {
    const tenantId = c.req.param("tenantId");
    const inspectionTypeParam = c.req.param("inspectionType");

    // Convert lowercase URL param to uppercase enum value
    const inspectionType = inspectionTypeParam.toUpperCase().replace("-", "_") as "MOVE_IN" | "MOVE_OUT";

    if (inspectionType !== "MOVE_IN" && inspectionType !== "MOVE_OUT") {
      return c.json(
        { error: { message: "Invalid inspection type. Must be move-in or move-out", code: "INVALID_TYPE" } },
        400
      );
    }

    const tenancy = await getActiveTenancyForUser(tenantId);

    if (!tenancy) {
      return c.json(
        { error: { message: "No active tenancy found for this tenant", code: "NOT_FOUND" } },
        404
      );
    }

    const inspection = await prisma.inspection.findUnique({
      where: {
        tenancyId_inspectionType: {
          tenancyId: tenancy.id,
          inspectionType,
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

    if (!inspection) {
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
          inspection: null,
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
        inspection: formatInspection(inspection),
      },
    });
  }
);

/**
 * POST /api/admin/inspections/tenant/:tenantId/:inspectionType/initialize
 * Create a new inspection with default categories
 */
inspectionsRouter.post(
  "/tenant/:tenantId/:inspectionType/initialize",
  async (c) => {
    const tenantId = c.req.param("tenantId");
    const inspectionTypeParam = c.req.param("inspectionType");

    // Convert lowercase URL param to uppercase enum value
    const inspectionType = inspectionTypeParam.toUpperCase().replace("-", "_") as "MOVE_IN" | "MOVE_OUT";

    if (inspectionType !== "MOVE_IN" && inspectionType !== "MOVE_OUT") {
      return c.json(
        { error: { message: "Invalid inspection type. Must be move-in or move-out", code: "INVALID_TYPE" } },
        400
      );
    }

    const tenancy = await getActiveTenancyForUser(tenantId);

    if (!tenancy) {
      return c.json(
        { error: { message: "No active tenancy found for this tenant", code: "NOT_FOUND" } },
        404
      );
    }

    // Check if inspection already exists
    const existingInspection = await prisma.inspection.findUnique({
      where: {
        tenancyId_inspectionType: {
          tenancyId: tenancy.id,
          inspectionType,
        },
      },
    });

    if (existingInspection) {
      return c.json(
        { error: { message: `${inspectionType.replace("_", "-").toLowerCase()} inspection already exists for this tenancy`, code: "ALREADY_EXISTS" } },
        400
      );
    }

    // Create inspection with default items
    const inspection = await prisma.inspection.create({
      data: {
        tenancyId: tenancy.id,
        inspectionType,
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
      `[INSPECTION] Initialized ${inspectionType} inspection for tenant ${tenancy.user.email} in unit ${tenancy.unit.unitLabel}`
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
        inspection: formatInspection(inspection),
      },
    });
  }
);

/**
 * PUT /api/admin/inspections/:inspectionId
 * Update inspection (status, notes, damageFound, keysReturned)
 */
inspectionsRouter.put(
  "/:inspectionId",
  zValidator("json", UpdateInspectionSchema),
  async (c) => {
    const inspectionId = c.req.param("inspectionId");
    const data = c.req.valid("json");

    const inspection = await prisma.inspection.findUnique({
      where: { id: inspectionId },
    });

    if (!inspection) {
      return c.json(
        { error: { message: "Inspection not found", code: "NOT_FOUND" } },
        404
      );
    }

    if (inspection.isFinalized) {
      return c.json(
        { error: { message: "Cannot modify a finalized inspection", code: "INSPECTION_FINALIZED" } },
        400
      );
    }

    const updatedInspection = await prisma.inspection.update({
      where: { id: inspectionId },
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

    return c.json({ data: formatInspection(updatedInspection) });
  }
);

/**
 * PUT /api/admin/inspections/:inspectionId/finalize
 * Finalize the inspection (locks it)
 * Returns warnings for potential issues (does not block finalization)
 */
inspectionsRouter.put("/:inspectionId/finalize", async (c) => {
  const inspectionId = c.req.param("inspectionId");
  const user = c.get("user");

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: {
      items: {
        include: {
          photos: true,
        },
      },
    },
  });

  if (!inspection) {
    return c.json(
      { error: { message: "Inspection not found", code: "NOT_FOUND" } },
      404
    );
  }

  if (inspection.isFinalized) {
    return c.json(
      { error: { message: "Inspection is already finalized", code: "ALREADY_FINALIZED" } },
      400
    );
  }

  // Validate all items have conditions set
  const incompleteItems = inspection.items.filter((item) => !item.condition);
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
  const totalPhotos = inspection.items.reduce((sum, item) => sum + item.photos.length, 0);
  if (totalPhotos === 0) {
    warnings.noPhotos = true;
  }

  // Check if damageFound=true but no damageNotes and no photos on damage items
  if (inspection.damageFound) {
    const hasDamageNotes = inspection.damageNotes && inspection.damageNotes.trim().length > 0;
    // Check items with POOR or DAMAGED condition for photos
    const damageItems = inspection.items.filter(
      (item) => item.condition === "POOR" || item.condition === "DAMAGED"
    );
    const damageItemsWithPhotos = damageItems.filter((item) => item.photos.length > 0);

    if (!hasDamageNotes && damageItemsWithPhotos.length === 0) {
      warnings.damageWithoutEvidence = true;
    }
  }

  const updatedInspection = await prisma.inspection.update({
    where: { id: inspectionId },
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

  console.log(`[INSPECTION] Inspection ${inspectionId} (${inspection.inspectionType}) finalized by ${user.email}`);

  return c.json({
    data: formatInspection(updatedInspection),
    warnings: Object.keys(warnings).length > 0 ? warnings : undefined,
  });
});

/**
 * PUT /api/admin/inspections/:inspectionId/reopen
 * Reopen a finalized inspection
 */
inspectionsRouter.put("/:inspectionId/reopen", async (c) => {
  const inspectionId = c.req.param("inspectionId");
  const user = c.get("user");

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
  });

  if (!inspection) {
    return c.json(
      { error: { message: "Inspection not found", code: "NOT_FOUND" } },
      404
    );
  }

  if (!inspection.isFinalized) {
    return c.json(
      { error: { message: "Inspection is not finalized", code: "NOT_FINALIZED" } },
      400
    );
  }

  const updatedInspection = await prisma.inspection.update({
    where: { id: inspectionId },
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

  console.log(`[INSPECTION] Inspection ${inspectionId} (${inspection.inspectionType}) reopened by ${user.email}`);

  return c.json({ data: formatInspection(updatedInspection) });
});

/**
 * PUT /api/admin/inspections/item/:itemId
 * Update an item's condition/notes
 */
inspectionsRouter.put(
  "/item/:itemId",
  zValidator("json", UpdateInspectionItemSchema),
  async (c) => {
    const itemId = c.req.param("itemId");
    const data = c.req.valid("json");

    const item = await prisma.inspectionItem.findUnique({
      where: { id: itemId },
      include: {
        inspection: true,
      },
    });

    if (!item) {
      return c.json(
        { error: { message: "Inspection item not found", code: "NOT_FOUND" } },
        404
      );
    }

    if (item.inspection.isFinalized) {
      return c.json(
        { error: { message: "Cannot modify items in a finalized inspection", code: "INSPECTION_FINALIZED" } },
        400
      );
    }

    const updatedItem = await prisma.inspectionItem.update({
      where: { id: itemId },
      data: {
        condition: data.condition,
        notes: data.notes,
      },
      include: {
        photos: true,
      },
    });

    // Auto-update inspection status to IN_PROGRESS if it's NOT_STARTED
    if (item.inspection.status === "NOT_STARTED") {
      await prisma.inspection.update({
        where: { id: item.inspection.id },
        data: { status: "IN_PROGRESS" },
      });
    }

    return c.json({ data: formatInspectionItem(updatedItem) });
  }
);

/**
 * POST /api/admin/inspections/item/:itemId/photo
 * Upload photo to item (multipart)
 */
inspectionsRouter.post("/item/:itemId/photo", async (c) => {
  const itemId = c.req.param("itemId");

  const item = await prisma.inspectionItem.findUnique({
    where: { id: itemId },
    include: {
      inspection: true,
    },
  });

  if (!item) {
    return c.json(
      { error: { message: "Inspection item not found", code: "NOT_FOUND" } },
      404
    );
  }

  if (item.inspection.isFinalized) {
    return c.json(
      { error: { message: "Cannot add photos to a finalized inspection", code: "INSPECTION_FINALIZED" } },
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
    if (!existsSync(INSPECTION_PHOTOS_DIR)) {
      await mkdir(INSPECTION_PHOTOS_DIR, { recursive: true });
    }

    // Generate unique filename
    const uniqueId = crypto.randomUUID();
    const safeExtension = path.extname(sanitizedOriginalName).toLowerCase() || ".jpg";
    const storageKey = `${itemId}-${uniqueId}${safeExtension}`;

    // Ensure filepath is within INSPECTION_PHOTOS_DIR
    const filepath = path.join(INSPECTION_PHOTOS_DIR, storageKey);
    const resolvedPath = path.resolve(filepath);
    const resolvedPhotosDir = path.resolve(INSPECTION_PHOTOS_DIR);

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
    const photo = await prisma.inspectionPhoto.create({
      data: {
        inspectionItemId: itemId,
        storageKey,
        filename: sanitizedOriginalName,
        caption: caption ? String(caption).trim().substring(0, 500) : null,
        mimeType: file.type,
        sizeBytes: file.size,
      },
    });

    // Auto-update inspection status to IN_PROGRESS if it's NOT_STARTED
    if (item.inspection.status === "NOT_STARTED") {
      await prisma.inspection.update({
        where: { id: item.inspection.id },
        data: { status: "IN_PROGRESS" },
      });
    }

    console.log(`[INSPECTION] Photo uploaded for item ${itemId}`);

    return c.json({ data: formatInspectionPhoto(photo) });
  } catch (error) {
    console.error("[INSPECTION] Photo upload error:", error);
    return c.json(
      { error: { message: "Failed to upload photo", code: "UPLOAD_ERROR" } },
      500
    );
  }
});

/**
 * DELETE /api/admin/inspections/photo/:photoId
 * Delete a photo
 */
inspectionsRouter.delete("/photo/:photoId", async (c) => {
  const photoId = c.req.param("photoId");

  const photo = await prisma.inspectionPhoto.findUnique({
    where: { id: photoId },
    include: {
      inspectionItem: {
        include: {
          inspection: true,
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

  if (photo.inspectionItem.inspection.isFinalized) {
    return c.json(
      { error: { message: "Cannot delete photos from a finalized inspection", code: "INSPECTION_FINALIZED" } },
      400
    );
  }

  try {
    // Delete the file from disk
    const filepath = path.join(INSPECTION_PHOTOS_DIR, photo.storageKey);
    const resolvedPath = path.resolve(filepath);
    const resolvedPhotosDir = path.resolve(INSPECTION_PHOTOS_DIR);

    if (resolvedPath.startsWith(resolvedPhotosDir) && existsSync(resolvedPath)) {
      await unlink(resolvedPath);
    }

    // Delete the database record
    await prisma.inspectionPhoto.delete({
      where: { id: photoId },
    });

    console.log(`[INSPECTION] Photo ${photoId} deleted`);

    return c.json({ data: { success: true } });
  } catch (error) {
    console.error("[INSPECTION] Photo delete error:", error);
    return c.json(
      { error: { message: "Failed to delete photo", code: "DELETE_ERROR" } },
      500
    );
  }
});

export { inspectionsRouter };
