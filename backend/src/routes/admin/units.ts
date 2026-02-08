import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { CreateUnitSchema, UpdateUnitSchema } from "../../types";
import type { UnitAssetsSummary, WarrantyStatus, AssetServiceStatus } from "../../types";

const unitsRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
unitsRouter.use("*", authMiddleware);
unitsRouter.use("*", adminMiddleware);

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
): AssetServiceStatus {
  if (!lastServiceDate || !serviceInterval) {
    return "UNKNOWN";
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
      return "UNKNOWN";
  }

  const now = new Date();
  const daysUntilService = Math.ceil(
    (nextServiceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilService < 0) return "OVERDUE";
  if (daysUntilService <= 14) return "DUE_SOON";
  return "OK";
}

/**
 * Calculate asset summary for a unit
 */
function calculateAssetsSummary(assets: any[]): UnitAssetsSummary {
  let warrantyExpiring = 0;
  let warrantyExpired = 0;
  let serviceOverdue = 0;
  let serviceDueSoon = 0;
  let totalManuals = 0;

  for (const asset of assets) {
    const warrantyStatus = calculateWarrantyStatus(asset.warrantyExpirationDate);
    const serviceStatus = calculateServiceStatus(asset.lastServiceDate, asset.serviceInterval);

    if (warrantyStatus === "EXPIRING_SOON") warrantyExpiring++;
    if (warrantyStatus === "EXPIRED") warrantyExpired++;
    if (serviceStatus === "OVERDUE") serviceOverdue++;
    if (serviceStatus === "DUE_SOON") serviceDueSoon++;

    // Count files as manuals
    totalManuals += asset.files?.length ?? 0;
  }

  return {
    totalAssets: assets.length,
    totalManuals,
    warrantyExpiring,
    warrantyExpired,
    serviceOverdue,
    serviceDueSoon,
    hasIssues: warrantyExpired > 0 || serviceOverdue > 0,
  };
}

/**
 * GET /api/admin/units
 * List all units with tenancy info (supports multiple tenants per unit)
 * Optional query params: status (VACANT, OCCUPIED, MAINTENANCE)
 */
unitsRouter.get("/", async (c) => {
  const statusFilter = c.req.query("status");

  const where: any = {};
  if (statusFilter) {
    where.status = statusFilter;
  }

  const units = await prisma.unit.findMany({
    where,
    include: {
      property: {
        select: {
          id: true,
          name: true,
        },
      },
      tenancies: {
        where: {
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
        },
        orderBy: {
          roleInUnit: "asc", // PRIMARY comes before OCCUPANT alphabetically
        },
      },
      assets: {
        include: {
          files: true,
        },
      },
    },
    orderBy: {
      unitLabel: "asc",
    },
  });

  return c.json({
    data: units.map((unit) => {
      const activeTenants = unit.tenancies.map((tenancy) => ({
        id: tenancy.user.id,
        name: tenancy.user.name,
        email: tenancy.user.email,
        tenancyId: tenancy.id,
        startDate: tenancy.startDate.toISOString(),
        roleInUnit: tenancy.roleInUnit,
      }));

      const primaryTenant = activeTenants.find((t) => t.roleInUnit === "PRIMARY") || null;
      const occupantCount = activeTenants.filter((t) => t.roleInUnit === "OCCUPANT").length;

      // Calculate asset summary
      const assetsSummary = calculateAssetsSummary(unit.assets);

      return {
        id: unit.id,
        propertyId: unit.propertyId,
        propertyName: unit.property.name,
        buildingName: unit.buildingName,
        unitLabel: unit.unitLabel,
        rentAmountCents: unit.rentAmountCents,
        rentDueDay: unit.rentDueDay,
        status: unit.status,
        description: unit.description,
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        sqft: unit.sqft,
        createdAt: unit.createdAt.toISOString(),
        // All active tenants with their roles
        tenants: activeTenants,
        // Primary tenant for quick access (backward compatible)
        primaryTenant,
        // Count of occupants
        occupantCount,
        // Legacy field for backward compatibility
        currentTenant: primaryTenant,
        // Asset summary for indicator
        assetsSummary,
      };
    }),
  });
});

/**
 * POST /api/admin/units
 * Create a new unit
 */
unitsRouter.post("/", zValidator("json", CreateUnitSchema), async (c) => {
  const data = c.req.valid("json");

  // Find or create property
  let property = await prisma.property.findUnique({
    where: { id: data.propertyId },
  });

  // If property not found, try to find any existing property or create a default one
  if (!property) {
    // First, check if any property exists
    property = await prisma.property.findFirst();

    // If no properties exist at all, create a default one based on the building name
    if (!property) {
      // Parse the building name to extract address info if possible
      const buildingName = data.buildingName || "Default Property";
      property = await prisma.property.create({
        data: {
          name: buildingName,
          address: buildingName,
          city: "Ottawa",
          province: "Ontario",
          postalCode: "K1K 2H2",
        },
      });
    }
  }

  // Check for duplicate unit label in the same building
  const existingUnit = await prisma.unit.findFirst({
    where: {
      propertyId: property.id,
      buildingName: data.buildingName,
      unitLabel: data.unitLabel,
    },
  });

  if (existingUnit) {
    return c.json({ error: { message: "Unit already exists in this building", code: "DUPLICATE" } }, 400);
  }

  const unit = await prisma.unit.create({
    data: {
      propertyId: property.id,
      buildingName: data.buildingName,
      unitLabel: data.unitLabel,
      rentAmountCents: data.rentAmountCents || null,
      rentDueDay: data.rentDueDay || 1,
      description: data.description || null,
      bedrooms: data.bedrooms || null,
      bathrooms: data.bathrooms || null,
      sqft: data.sqft || null,
      status: "VACANT",
    },
  });

  return c.json({
    data: {
      id: unit.id,
      propertyId: unit.propertyId,
      buildingName: unit.buildingName,
      unitLabel: unit.unitLabel,
      rentAmountCents: unit.rentAmountCents,
      rentDueDay: unit.rentDueDay,
      status: unit.status,
      description: unit.description,
      bedrooms: unit.bedrooms,
      bathrooms: unit.bathrooms,
      sqft: unit.sqft,
      createdAt: unit.createdAt.toISOString(),
    },
  });
});

/**
 * PUT /api/admin/units/:id
 * Update a unit
 */
unitsRouter.put("/:id", zValidator("json", UpdateUnitSchema), async (c) => {
  const id = c.req.param("id");
  const data = c.req.valid("json");

  // Verify unit exists
  const existingUnit = await prisma.unit.findUnique({
    where: { id },
  });

  if (!existingUnit) {
    return c.json({ error: { message: "Unit not found", code: "NOT_FOUND" } }, 404);
  }

  // Check for duplicate unit label/buildingName combination if changing
  if ((data.buildingName || data.unitLabel) &&
      (data.buildingName !== existingUnit.buildingName || data.unitLabel !== existingUnit.unitLabel)) {
    const duplicateUnit = await prisma.unit.findFirst({
      where: {
        propertyId: existingUnit.propertyId,
        buildingName: data.buildingName ?? existingUnit.buildingName,
        unitLabel: data.unitLabel ?? existingUnit.unitLabel,
        id: { not: id },
      },
    });

    if (duplicateUnit) {
      return c.json({ error: { message: "Unit already exists in this building", code: "DUPLICATE" } }, 400);
    }
  }

  const unit = await prisma.unit.update({
    where: { id },
    data: {
      buildingName: data.buildingName,
      unitLabel: data.unitLabel,
      rentAmountCents: data.rentAmountCents,
      rentDueDay: data.rentDueDay,
      description: data.description,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      sqft: data.sqft,
    },
  });

  return c.json({
    data: {
      id: unit.id,
      propertyId: unit.propertyId,
      buildingName: unit.buildingName,
      unitLabel: unit.unitLabel,
      rentAmountCents: unit.rentAmountCents,
      rentDueDay: unit.rentDueDay,
      status: unit.status,
      description: unit.description,
      bedrooms: unit.bedrooms,
      bathrooms: unit.bathrooms,
      sqft: unit.sqft,
      createdAt: unit.createdAt.toISOString(),
    },
  });
});

/**
 * GET /api/admin/units/buildings
 * List all unique building names for the creatable select dropdown
 */
unitsRouter.get("/buildings", async (c) => {
  const buildings = await prisma.unit.findMany({
    select: {
      buildingName: true,
    },
    distinct: ["buildingName"],
    where: {
      buildingName: {
        not: "",
      },
    },
    orderBy: {
      buildingName: "asc",
    },
  });

  return c.json({
    data: buildings.map((b) => b.buildingName),
  });
});

/**
 * DELETE /api/admin/units/:id
 * Delete a unit
 */
unitsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");

  // Verify unit exists
  const unit = await prisma.unit.findUnique({
    where: { id },
    include: {
      tenancies: {
        where: { isActive: true },
      },
    },
  });

  if (!unit) {
    return c.json({ error: { message: "Unit not found", code: "NOT_FOUND" } }, 404);
  }

  // Don't allow deletion if unit has active tenancy
  if (unit.tenancies.length > 0) {
    return c.json(
      { error: { message: "Cannot delete unit with active tenancy", code: "HAS_TENANCY" } },
      400
    );
  }

  await prisma.unit.delete({
    where: { id },
  });

  return c.json({ data: { success: true } });
});

/**
 * GET /api/admin/units/rent-roll
 * Generate rent roll data for a specific building and period
 * Query params: buildingName (required), periodMonth (optional, defaults to current month)
 */
unitsRouter.get("/rent-roll", async (c) => {
  const buildingName = c.req.query("buildingName");
  const periodMonth = c.req.query("periodMonth");

  if (!buildingName) {
    return c.json(
      { error: { message: "Building name is required", code: "MISSING_BUILDING" } },
      400
    );
  }

  // Get all units for the building with tenant info
  const units = await prisma.unit.findMany({
    where: {
      buildingName,
    },
    include: {
      tenancies: {
        where: {
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
        },
        orderBy: {
          roleInUnit: "asc",
        },
      },
    },
    orderBy: {
      unitLabel: "asc",
    },
  });

  // Calculate totals
  let totalRentCents = 0;
  let occupiedUnits = 0;
  let vacantUnits = 0;

  const rentRollData = units.map((unit) => {
    const tenants = unit.tenancies.map((t) => ({
      id: t.user.id,
      name: t.user.name,
      email: t.user.email,
      roleInUnit: t.roleInUnit,
      moveInDate: t.startDate.toISOString(),
    }));

    const primaryTenant = tenants.find((t) => t.roleInUnit === "PRIMARY");
    const isOccupied = unit.status === "OCCUPIED" && tenants.length > 0;

    if (isOccupied) {
      occupiedUnits++;
      totalRentCents += unit.rentAmountCents || 0;
    } else {
      vacantUnits++;
    }

    // Format bed/bath description
    const bedBath = [
      unit.bedrooms ? `${unit.bedrooms} Bed` : null,
      unit.bathrooms ? `${unit.bathrooms} Bath` : null,
    ]
      .filter(Boolean)
      .join(" / ");

    return {
      unitId: unit.id,
      unitLabel: unit.unitLabel,
      sqft: unit.sqft,
      bedrooms: unit.bedrooms,
      bathrooms: unit.bathrooms,
      description: bedBath || unit.description || "-",
      status: unit.status,
      rentAmountCents: unit.rentAmountCents,
      tenants,
      primaryTenantName: primaryTenant?.name || (isOccupied ? "Occupied" : "Vacant"),
      moveInDate: primaryTenant?.moveInDate || null,
    };
  });

  return c.json({
    data: {
      buildingName,
      periodMonth: periodMonth || new Date().toISOString().slice(0, 7),
      generatedAt: new Date().toISOString(),
      summary: {
        totalUnits: units.length,
        occupiedUnits,
        vacantUnits,
        totalMonthlyRentCents: totalRentCents,
        occupancyRate: units.length > 0 ? Math.round((occupiedUnits / units.length) * 100) : 0,
      },
      units: rentRollData,
    },
  });
});

export { unitsRouter };
