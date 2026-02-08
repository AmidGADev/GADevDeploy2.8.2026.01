import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, tenantMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import type { EmergencyContact } from "../../types";

const tenantBuildingInfoRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
tenantBuildingInfoRouter.use("*", authMiddleware);
tenantBuildingInfoRouter.use("*", tenantMiddleware);

/**
 * Helper to parse emergency contacts from JSON string
 */
function parseEmergencyContacts(json: string | null): EmergencyContact[] | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * GET /api/tenant/building-info
 * Get building information for the tenant's building (read-only for tenants)
 */
tenantBuildingInfoRouter.get("/", async (c) => {
  const user = c.get("user");

  // Find the tenant's active tenancy to get their unit's buildingName
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
    include: {
      unit: {
        select: {
          buildingName: true,
        },
      },
    },
  });

  // If no active tenancy, return null values
  if (!tenancy || !tenancy.unit.buildingName) {
    return c.json({
      data: {
        id: null,
        buildingName: null,
        parkingRules: null,
        garbageSchedule: null,
        quietHours: null,
        emergencyContacts: null,
        customNotes: null,
        updatedAt: null,
      },
    });
  }

  const buildingName = tenancy.unit.buildingName;

  // Fetch building info for the tenant's building
  const buildingInfo = await prisma.buildingInfo.findUnique({
    where: { buildingName },
  });

  // If no building info exists for their building, return null values with the buildingName
  if (!buildingInfo) {
    return c.json({
      data: {
        id: null,
        buildingName,
        parkingRules: null,
        garbageSchedule: null,
        quietHours: null,
        emergencyContacts: null,
        customNotes: null,
        updatedAt: null,
      },
    });
  }

  return c.json({
    data: {
      id: buildingInfo.id,
      buildingName: buildingInfo.buildingName,
      parkingRules: buildingInfo.parkingRules,
      garbageSchedule: buildingInfo.garbageSchedule,
      quietHours: buildingInfo.quietHours,
      emergencyContacts: parseEmergencyContacts(buildingInfo.emergencyContacts),
      customNotes: buildingInfo.customNotes,
      updatedAt: buildingInfo.updatedAt?.toISOString() ?? null,
    },
  });
});

export { tenantBuildingInfoRouter };
