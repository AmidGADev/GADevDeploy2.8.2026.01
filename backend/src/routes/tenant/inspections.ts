import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, tenantMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";

const tenantInspectionsRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
tenantInspectionsRouter.use("*", authMiddleware);
tenantInspectionsRouter.use("*", tenantMiddleware);

// Map URL-friendly format to database enum
function mapInspectionType(urlType: string): "MOVE_IN" | "MOVE_OUT" | null {
  const mapping: Record<string, "MOVE_IN" | "MOVE_OUT"> = {
    "move-in": "MOVE_IN",
    "move_in": "MOVE_IN",
    "MOVE_IN": "MOVE_IN",
    "move-out": "MOVE_OUT",
    "move_out": "MOVE_OUT",
    "MOVE_OUT": "MOVE_OUT",
  };
  return mapping[urlType] || null;
}

// Format inspection for response
function formatInspection(inspection: any, tenancyId: string) {
  return {
    id: inspection.id,
    tenancyId,
    inspectionType: inspection.inspectionType,
    status: inspection.status,
    isFinalized: inspection.isFinalized,
    finalizedAt: inspection.finalizedAt?.toISOString() || null,
    notes: inspection.notes,
    damageNotes: inspection.damageNotes,
    damageFound: inspection.damageFound,
    keysReturned: inspection.keysReturned,
    items: inspection.items.map((item: any) => ({
      id: item.id,
      category: item.category,
      condition: item.condition,
      notes: item.notes,
      photos: item.photos.map((photo: any) => ({
        id: photo.id,
        url: `/api/uploads/${photo.storageKey}`,
        caption: photo.caption,
      })),
    })),
  };
}

/**
 * GET /api/tenant/inspections
 * Get both move-in and move-out inspections in a single call (optimized)
 */
tenantInspectionsRouter.get("/", async (c) => {
  const user = c.get("user");

  // Get the tenant's active tenancy with both inspections
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
    include: {
      inspections: {
        include: {
          items: {
            orderBy: { id: "asc" },
            include: {
              photos: {
                select: {
                  id: true,
                  storageKey: true,
                  filename: true,
                  caption: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!tenancy) {
    return c.json({
      data: {
        moveIn: null,
        moveOut: null,
      },
    });
  }

  const moveInInspection = tenancy.inspections.find((i) => i.inspectionType === "MOVE_IN");
  const moveOutInspection = tenancy.inspections.find((i) => i.inspectionType === "MOVE_OUT");

  return c.json({
    data: {
      moveIn: moveInInspection ? formatInspection(moveInInspection, tenancy.id) : null,
      moveOut: moveOutInspection ? formatInspection(moveOutInspection, tenancy.id) : null,
    },
  });
});

/**
 * GET /api/tenant/inspections/:inspectionType
 * Get tenant's inspection (read-only view)
 * inspectionType = "move-in" or "move-out" (also accepts "MOVE_IN" or "MOVE_OUT")
 */
tenantInspectionsRouter.get("/:inspectionType", async (c) => {
  const user = c.get("user");
  const urlType = c.req.param("inspectionType");

  const inspectionType = mapInspectionType(urlType);
  if (!inspectionType) {
    return c.json(
      { error: { message: "Invalid inspection type. Use 'move-in' or 'move-out'", code: "INVALID_TYPE" } },
      400
    );
  }

  // Get the tenant's active tenancy with inspection
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
    include: {
      inspections: {
        where: {
          inspectionType,
        },
        include: {
          items: {
            orderBy: { id: "asc" },
            include: {
              photos: {
                select: {
                  id: true,
                  storageKey: true,
                  filename: true,
                  caption: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!tenancy) {
    // No active tenancy - return null inspection
    return c.json({ data: null });
  }

  const inspection = tenancy.inspections[0] || null;

  if (!inspection) {
    // No inspection found for this type
    return c.json({ data: null });
  }

  // Return the inspection directly (frontend expects this shape)
  return c.json({
    data: {
      id: inspection.id,
      tenancyId: tenancy.id,
      inspectionType: inspection.inspectionType,
      status: inspection.status,
      isFinalized: inspection.isFinalized,
      finalizedAt: inspection.finalizedAt?.toISOString() || null,
      notes: inspection.notes,
      damageNotes: inspection.damageNotes,
      damageFound: inspection.damageFound,
      keysReturned: inspection.keysReturned,
      items: inspection.items.map((item) => ({
        id: item.id,
        category: item.category,
        condition: item.condition,
        notes: item.notes,
        photos: item.photos.map((photo) => ({
          id: photo.id,
          url: `/api/uploads/${photo.storageKey}`,
          caption: photo.caption,
        })),
      })),
    },
  });
});

export { tenantInspectionsRouter };
