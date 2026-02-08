import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { env } from "../../env";
import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import {
  CreateUnitAssetSchema,
  UpdateUnitAssetSchema,
  CreateUnitAssetLinkSchema,
  type WarrantyStatus,
  type AssetServiceStatus,
} from "../../types";

const adminUnitAssetsRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
adminUnitAssetsRouter.use("*", authMiddleware);
adminUnitAssetsRouter.use("*", adminMiddleware);

// Uploads directory path
const UPLOADS_BASE = env.UPLOADS_DIR || path.resolve(process.cwd(), "uploads");
const UNIT_ASSETS_DIR = path.join(UPLOADS_BASE, "unit-assets");

// Allowed file types
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ALLOWED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

/**
 * Calculate warranty status based on expiration date
 */
function calculateWarrantyStatus(warrantyExpirationDate: Date | null): WarrantyStatus {
  if (!warrantyExpirationDate) return "UNKNOWN";

  const now = new Date();
  const daysUntilExpiry = Math.ceil(
    (warrantyExpirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilExpiry < 0) return "EXPIRED";
  if (daysUntilExpiry <= 30) return "EXPIRING_SOON";
  return "ACTIVE";
}

/**
 * Calculate service status based on last service date and interval
 */
function calculateServiceStatus(
  lastServiceDate: Date | null,
  serviceInterval: string | null
): { status: AssetServiceStatus; nextServiceDate: string | null } {
  if (!lastServiceDate || !serviceInterval) {
    return { status: "UNKNOWN", nextServiceDate: null };
  }

  const nextServiceDate = new Date(lastServiceDate);

  switch (serviceInterval) {
    case "3_MONTHS":
      nextServiceDate.setMonth(nextServiceDate.getMonth() + 3);
      break;
    case "6_MONTHS":
      nextServiceDate.setMonth(nextServiceDate.getMonth() + 6);
      break;
    case "ANNUALLY":
      nextServiceDate.setFullYear(nextServiceDate.getFullYear() + 1);
      break;
    default:
      return { status: "UNKNOWN", nextServiceDate: null };
  }

  const now = new Date();
  const daysUntilService = Math.ceil(
    (nextServiceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  let status: AssetServiceStatus;
  if (daysUntilService < 0) {
    status = "OVERDUE";
  } else if (daysUntilService <= 14) {
    status = "DUE_SOON";
  } else {
    status = "OK";
  }

  return { status, nextServiceDate: nextServiceDate.toISOString() };
}

/**
 * Transform a database asset to the API response format
 */
function transformAsset(asset: any) {
  const warrantyStatus = calculateWarrantyStatus(asset.warrantyExpirationDate);
  const { status: serviceStatus, nextServiceDate } = calculateServiceStatus(
    asset.lastServiceDate,
    asset.serviceInterval
  );

  return {
    id: asset.id,
    unitId: asset.unitId,
    name: asset.name,
    category: asset.category,
    brand: asset.brand,
    modelNumber: asset.modelNumber,
    serialNumber: asset.serialNumber,
    location: asset.location,
    installDate: asset.installDate?.toISOString() ?? null,
    warrantyExpirationDate: asset.warrantyExpirationDate?.toISOString() ?? null,
    lastServiceDate: asset.lastServiceDate?.toISOString() ?? null,
    serviceInterval: asset.serviceInterval,
    serviceNotes: asset.serviceNotes,
    serviceProviderContact: asset.serviceProviderContact,
    notes: asset.notes,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    warrantyStatus,
    serviceStatus,
    nextServiceDate,
    files: asset.files.map((f: any) => ({
      id: f.id,
      storageKey: f.storageKey,
      filename: f.filename,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      uploadedAt: f.uploadedAt.toISOString(),
    })),
    links: asset.links.map((l: any) => ({
      id: l.id,
      url: l.url,
      label: l.label,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}

/**
 * Sanitize filename to prevent path traversal
 */
function sanitizeFilename(filename: string): string {
  const basename = path.basename(filename);
  return basename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Validate file type
 */
function isValidFileType(mimeType: string, filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_MIME_TYPES.has(mimeType) && ALLOWED_EXTENSIONS.has(ext);
}

/**
 * GET /api/admin/units/:unitId/assets
 * List all assets for a unit
 */
adminUnitAssetsRouter.get("/:unitId/assets", async (c) => {
  const unitId = c.req.param("unitId");

  // Verify unit exists
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
  });

  if (!unit) {
    return c.json({ error: { message: "Unit not found", code: "NOT_FOUND" } }, 404);
  }

  const assets = await prisma.unitAsset.findMany({
    where: { unitId },
    include: {
      files: true,
      links: true,
    },
    orderBy: { name: "asc" },
  });

  return c.json({
    data: assets.map(transformAsset),
  });
});

/**
 * POST /api/admin/units/:unitId/assets
 * Create a new asset
 */
adminUnitAssetsRouter.post(
  "/:unitId/assets",
  zValidator("json", CreateUnitAssetSchema),
  async (c) => {
    const unitId = c.req.param("unitId");
    const data = c.req.valid("json");

    // Verify unit exists
    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
    });

    if (!unit) {
      return c.json({ error: { message: "Unit not found", code: "NOT_FOUND" } }, 404);
    }

    const asset = await prisma.unitAsset.create({
      data: {
        unitId,
        name: data.name,
        category: data.category,
        brand: data.brand ?? null,
        modelNumber: data.modelNumber ?? null,
        serialNumber: data.serialNumber ?? null,
        location: data.location ?? null,
        installDate: data.installDate ? new Date(data.installDate) : null,
        warrantyExpirationDate: data.warrantyExpirationDate
          ? new Date(data.warrantyExpirationDate)
          : null,
        lastServiceDate: data.lastServiceDate ? new Date(data.lastServiceDate) : null,
        serviceInterval: data.serviceInterval ?? null,
        serviceNotes: data.serviceNotes ?? null,
        serviceProviderContact: data.serviceProviderContact ?? null,
        notes: data.notes ?? null,
      },
      include: {
        files: true,
        links: true,
      },
    });

    console.log(`[UNIT-ASSETS] Created asset ${asset.id} for unit ${unitId}`);

    return c.json({
      data: transformAsset(asset),
    });
  }
);

/**
 * GET /api/admin/units/:unitId/assets/:assetId
 * Get a single asset
 */
adminUnitAssetsRouter.get("/:unitId/assets/:assetId", async (c) => {
  const unitId = c.req.param("unitId");
  const assetId = c.req.param("assetId");

  const asset = await prisma.unitAsset.findFirst({
    where: { id: assetId, unitId },
    include: {
      files: true,
      links: true,
    },
  });

  if (!asset) {
    return c.json({ error: { message: "Asset not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: transformAsset(asset),
  });
});

/**
 * PUT /api/admin/units/:unitId/assets/:assetId
 * Update an asset
 */
adminUnitAssetsRouter.put(
  "/:unitId/assets/:assetId",
  zValidator("json", UpdateUnitAssetSchema),
  async (c) => {
    const unitId = c.req.param("unitId");
    const assetId = c.req.param("assetId");
    const data = c.req.valid("json");

    // Verify asset exists and belongs to unit
    const existingAsset = await prisma.unitAsset.findFirst({
      where: { id: assetId, unitId },
    });

    if (!existingAsset) {
      return c.json({ error: { message: "Asset not found", code: "NOT_FOUND" } }, 404);
    }

    const asset = await prisma.unitAsset.update({
      where: { id: assetId },
      data: {
        name: data.name,
        category: data.category,
        brand: data.brand,
        modelNumber: data.modelNumber,
        serialNumber: data.serialNumber,
        location: data.location,
        installDate: data.installDate !== undefined
          ? (data.installDate ? new Date(data.installDate) : null)
          : undefined,
        warrantyExpirationDate: data.warrantyExpirationDate !== undefined
          ? (data.warrantyExpirationDate ? new Date(data.warrantyExpirationDate) : null)
          : undefined,
        lastServiceDate: data.lastServiceDate !== undefined
          ? (data.lastServiceDate ? new Date(data.lastServiceDate) : null)
          : undefined,
        serviceInterval: data.serviceInterval,
        serviceNotes: data.serviceNotes,
        serviceProviderContact: data.serviceProviderContact,
        notes: data.notes,
      },
      include: {
        files: true,
        links: true,
      },
    });

    console.log(`[UNIT-ASSETS] Updated asset ${assetId}`);

    return c.json({
      data: transformAsset(asset),
    });
  }
);

/**
 * DELETE /api/admin/units/:unitId/assets/:assetId
 * Delete an asset
 */
adminUnitAssetsRouter.delete("/:unitId/assets/:assetId", async (c) => {
  const unitId = c.req.param("unitId");
  const assetId = c.req.param("assetId");

  // Verify asset exists and belongs to unit
  const asset = await prisma.unitAsset.findFirst({
    where: { id: assetId, unitId },
    include: { files: true },
  });

  if (!asset) {
    return c.json({ error: { message: "Asset not found", code: "NOT_FOUND" } }, 404);
  }

  // Delete files from disk
  for (const file of asset.files) {
    const filepath = path.join(UNIT_ASSETS_DIR, file.storageKey);
    const resolvedPath = path.resolve(filepath);
    const resolvedDir = path.resolve(UNIT_ASSETS_DIR);

    if (resolvedPath.startsWith(resolvedDir) && existsSync(resolvedPath)) {
      try {
        await unlink(resolvedPath);
      } catch (err) {
        console.error(`[UNIT-ASSETS] Failed to delete file ${file.storageKey}:`, err);
      }
    }
  }

  // Delete asset (cascade deletes files and links)
  await prisma.unitAsset.delete({
    where: { id: assetId },
  });

  console.log(`[UNIT-ASSETS] Deleted asset ${assetId}`);

  return c.json({ data: { success: true } });
});

/**
 * POST /api/admin/units/:unitId/assets/:assetId/files
 * Upload a file to an asset
 */
adminUnitAssetsRouter.post("/:unitId/assets/:assetId/files", async (c) => {
  const unitId = c.req.param("unitId");
  const assetId = c.req.param("assetId");

  // Verify asset exists and belongs to unit
  const asset = await prisma.unitAsset.findFirst({
    where: { id: assetId, unitId },
  });

  if (!asset) {
    return c.json({ error: { message: "Asset not found", code: "NOT_FOUND" } }, 404);
  }

  try {
    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return c.json({ error: { message: "No file provided", code: "NO_FILE" } }, 400);
    }

    const sanitizedName = sanitizeFilename(file.name);
    if (!isValidFileType(file.type, sanitizedName)) {
      return c.json(
        { error: { message: "Invalid file type. Only PDF, JPG, and PNG are allowed.", code: "INVALID_FILE_TYPE" } },
        400
      );
    }

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
    if (!existsSync(UNIT_ASSETS_DIR)) {
      await mkdir(UNIT_ASSETS_DIR, { recursive: true });
    }

    // Generate unique filename: {assetId}-{uuid}.{ext}
    const uniqueId = crypto.randomUUID();
    const ext = path.extname(sanitizedName).toLowerCase() || ".pdf";
    const storageKey = `${assetId}-${uniqueId}${ext}`;

    const filepath = path.join(UNIT_ASSETS_DIR, storageKey);
    const resolvedPath = path.resolve(filepath);
    const resolvedDir = path.resolve(UNIT_ASSETS_DIR);

    if (!resolvedPath.startsWith(resolvedDir)) {
      console.error(`[SECURITY] Path traversal attempt detected: ${filepath}`);
      return c.json({ error: { message: "Invalid file path", code: "INVALID_PATH" } }, 400);
    }

    // Write file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    // Create file record
    const assetFile = await prisma.unitAssetFile.create({
      data: {
        unitAssetId: assetId,
        storageKey,
        filename: sanitizedName,
        mimeType: file.type,
        sizeBytes: file.size,
      },
    });

    console.log(`[UNIT-ASSETS] Uploaded file ${storageKey} for asset ${assetId}`);

    return c.json({
      data: {
        id: assetFile.id,
        storageKey: assetFile.storageKey,
        filename: assetFile.filename,
        mimeType: assetFile.mimeType,
        sizeBytes: assetFile.sizeBytes,
        uploadedAt: assetFile.uploadedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[UNIT-ASSETS] Upload error:", error);
    return c.json(
      { error: { message: "Failed to upload file", code: "UPLOAD_ERROR" } },
      500
    );
  }
});

/**
 * DELETE /api/admin/units/:unitId/assets/:assetId/files/:fileId
 * Delete a file from an asset
 */
adminUnitAssetsRouter.delete("/:unitId/assets/:assetId/files/:fileId", async (c) => {
  const unitId = c.req.param("unitId");
  const assetId = c.req.param("assetId");
  const fileId = c.req.param("fileId");

  // Verify file exists and belongs to the asset
  const file = await prisma.unitAssetFile.findFirst({
    where: {
      id: fileId,
      unitAssetId: assetId,
      unitAsset: { unitId },
    },
  });

  if (!file) {
    return c.json({ error: { message: "File not found", code: "NOT_FOUND" } }, 404);
  }

  // Delete file from disk
  const filepath = path.join(UNIT_ASSETS_DIR, file.storageKey);
  const resolvedPath = path.resolve(filepath);
  const resolvedDir = path.resolve(UNIT_ASSETS_DIR);

  if (resolvedPath.startsWith(resolvedDir) && existsSync(resolvedPath)) {
    try {
      await unlink(resolvedPath);
    } catch (err) {
      console.error(`[UNIT-ASSETS] Failed to delete file ${file.storageKey}:`, err);
    }
  }

  // Delete file record
  await prisma.unitAssetFile.delete({
    where: { id: fileId },
  });

  console.log(`[UNIT-ASSETS] Deleted file ${fileId} from asset ${assetId}`);

  return c.json({ data: { success: true } });
});

/**
 * POST /api/admin/units/:unitId/assets/:assetId/links
 * Add a link to an asset
 */
adminUnitAssetsRouter.post(
  "/:unitId/assets/:assetId/links",
  zValidator("json", CreateUnitAssetLinkSchema),
  async (c) => {
    const unitId = c.req.param("unitId");
    const assetId = c.req.param("assetId");
    const data = c.req.valid("json");

    // Verify asset exists and belongs to unit
    const asset = await prisma.unitAsset.findFirst({
      where: { id: assetId, unitId },
    });

    if (!asset) {
      return c.json({ error: { message: "Asset not found", code: "NOT_FOUND" } }, 404);
    }

    const link = await prisma.unitAssetLink.create({
      data: {
        unitAssetId: assetId,
        url: data.url,
        label: data.label,
      },
    });

    console.log(`[UNIT-ASSETS] Added link ${link.id} to asset ${assetId}`);

    return c.json({
      data: {
        id: link.id,
        url: link.url,
        label: link.label,
        createdAt: link.createdAt.toISOString(),
      },
    });
  }
);

/**
 * DELETE /api/admin/units/:unitId/assets/:assetId/links/:linkId
 * Delete a link from an asset
 */
adminUnitAssetsRouter.delete("/:unitId/assets/:assetId/links/:linkId", async (c) => {
  const unitId = c.req.param("unitId");
  const assetId = c.req.param("assetId");
  const linkId = c.req.param("linkId");

  // Verify link exists and belongs to the asset
  const link = await prisma.unitAssetLink.findFirst({
    where: {
      id: linkId,
      unitAssetId: assetId,
      unitAsset: { unitId },
    },
  });

  if (!link) {
    return c.json({ error: { message: "Link not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.unitAssetLink.delete({
    where: { id: linkId },
  });

  console.log(`[UNIT-ASSETS] Deleted link ${linkId} from asset ${assetId}`);

  return c.json({ data: { success: true } });
});

export { adminUnitAssetsRouter };
