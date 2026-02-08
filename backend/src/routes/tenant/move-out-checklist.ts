import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, tenantMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";

const tenantMoveOutChecklistRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
tenantMoveOutChecklistRouter.use("*", authMiddleware);
tenantMoveOutChecklistRouter.use("*", tenantMiddleware);

/**
 * GET /api/tenant/move-out-checklist
 * Get tenant's move-out checklist (read-only view)
 */
tenantMoveOutChecklistRouter.get("/", async (c) => {
  const user = c.get("user");

  // Get the tenant's active tenancy with move-out checklist
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
    include: {
      moveOutChecklist: {
        include: {
          items: {
            orderBy: { id: "asc" },
          },
        },
      },
    },
  });

  if (!tenancy || !tenancy.moveOutDate) {
    return c.json({
      data: {
        moveOutDate: null,
        checklist: null,
      },
    });
  }

  return c.json({
    data: {
      moveOutDate: tenancy.moveOutDate.toISOString(),
      checklist: tenancy.moveOutChecklist
        ? {
            id: tenancy.moveOutChecklist.id,
            status: tenancy.moveOutChecklist.status,
            isFinalized: tenancy.moveOutChecklist.isFinalized,
            items: tenancy.moveOutChecklist.items.map((item) => ({
              id: item.id,
              category: item.category,
              condition: item.condition,
              notes: item.notes,
            })),
          }
        : null,
    },
  });
});

export { tenantMoveOutChecklistRouter };
