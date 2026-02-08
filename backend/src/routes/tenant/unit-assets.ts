import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, tenantMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import type { WarrantyStatus, AssetServiceStatus } from "../../types";

/**
 * Tenant Unit Assets Router
 * Read-only access to unit assets for tenants with active tenancy
 */

const tenantUnitAssetsRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
tenantUnitAssetsRouter.use("*", authMiddleware);
tenantUnitAssetsRouter.use("*", tenantMiddleware);

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
 * GET /api/tenant/unit-assets
 * List all assets for the tenant's unit (only if they have active tenancy)
 */
tenantUnitAssetsRouter.get("/", async (c) => {
  const user = c.get("user");

  // Find tenant's active tenancy
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
    select: {
      unitId: true,
      unit: {
        select: {
          id: true,
          unitLabel: true,
        },
      },
    },
  });

  if (!tenancy) {
    return c.json({
      error: { message: "No active tenancy found", code: "NO_TENANCY" },
    }, 404);
  }

  const assets = await prisma.unitAsset.findMany({
    where: { unitId: tenancy.unitId },
    include: {
      files: true,
      links: true,
    },
    orderBy: { name: "asc" },
  });

  return c.json({
    data: {
      unit: {
        id: tenancy.unit.id,
        unitLabel: tenancy.unit.unitLabel,
      },
      assets: assets.map(transformAsset),
    },
  });
});

/**
 * GET /api/tenant/unit-assets/:assetId
 * Get details of a specific asset (only if in tenant's unit)
 */
tenantUnitAssetsRouter.get("/:assetId", async (c) => {
  const user = c.get("user");
  const assetId = c.req.param("assetId");

  // Find tenant's active tenancy
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
    select: {
      unitId: true,
    },
  });

  if (!tenancy) {
    return c.json({
      error: { message: "No active tenancy found", code: "NO_TENANCY" },
    }, 404);
  }

  // Find asset and verify it belongs to tenant's unit
  const asset = await prisma.unitAsset.findFirst({
    where: {
      id: assetId,
      unitId: tenancy.unitId,
    },
    include: {
      files: true,
      links: true,
    },
  });

  if (!asset) {
    return c.json({
      error: { message: "Asset not found", code: "NOT_FOUND" },
    }, 404);
  }

  return c.json({
    data: transformAsset(asset),
  });
});

export { tenantUnitAssetsRouter };
