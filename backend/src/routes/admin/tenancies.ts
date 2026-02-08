import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";

const adminTenanciesRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
adminTenanciesRouter.use("*", authMiddleware);
adminTenanciesRouter.use("*", adminMiddleware);

/**
 * GET /api/admin/tenancies
 * List tenancies with user and unit details
 * Query params:
 *   - active: "true" to filter only active tenancies
 *
 * Used by UnifiedCreateRequestDialog for move-out request form
 */
adminTenanciesRouter.get("/", async (c) => {
  const activeOnly = c.req.query("active") === "true";

  const where: { isActive?: boolean } = {};
  if (activeOnly) {
    where.isActive = true;
  }

  const tenancies = await prisma.tenancy.findMany({
    where,
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
    orderBy: [
      { isActive: "desc" },
      { startDate: "desc" },
    ],
  });

  return c.json({
    data: tenancies.map((tenancy) => ({
      id: tenancy.id,
      userId: tenancy.userId,
      unitId: tenancy.unitId,
      startDate: tenancy.startDate.toISOString(),
      endDate: tenancy.endDate?.toISOString() ?? null,
      isActive: tenancy.isActive,
      user: {
        id: tenancy.user.id,
        name: tenancy.user.name,
        email: tenancy.user.email,
      },
      unit: {
        id: tenancy.unit.id,
        unitLabel: tenancy.unit.unitLabel,
        buildingName: tenancy.unit.buildingName,
      },
    })),
  });
});

export { adminTenanciesRouter };
