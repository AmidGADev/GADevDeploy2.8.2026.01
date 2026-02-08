import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";

const adminPropertiesRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
adminPropertiesRouter.use("*", authMiddleware);
adminPropertiesRouter.use("*", adminMiddleware);

/**
 * GET /api/admin/properties
 * List all properties with basic info
 *
 * Used by UnifiedCreateRequestDialog for showing request form
 */
adminPropertiesRouter.get("/", async (c) => {
  const properties = await prisma.property.findMany({
    select: {
      id: true,
      name: true,
      address: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return c.json({
    data: properties,
  });
});

export { adminPropertiesRouter };
