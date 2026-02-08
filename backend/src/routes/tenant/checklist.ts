import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, tenantMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";

const tenantChecklistRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
tenantChecklistRouter.use("*", authMiddleware);
tenantChecklistRouter.use("*", tenantMiddleware);

// Self-completable item types per checklist type
const SELF_COMPLETABLE_MOVE_IN = new Set(["INSURANCE_UPLOADED"]);
const SELF_COMPLETABLE_MOVE_OUT = new Set(["FORWARDING_ADDRESS", "UTILITIES_TRANSFERRED"]);

/**
 * Determine if an item is self-completable based on checklist type and item type
 */
function isSelfCompletable(checklistType: string, itemType: string): boolean {
  if (checklistType === "MOVE_OUT") {
    return SELF_COMPLETABLE_MOVE_OUT.has(itemType);
  }
  return SELF_COMPLETABLE_MOVE_IN.has(itemType);
}

/**
 * GET /api/tenant/checklist
 * Get tenant's checklist items for their active tenancy
 * Query params:
 *   - type: "MOVE_IN" | "MOVE_OUT" (default: "MOVE_IN")
 */
tenantChecklistRouter.get("/", async (c) => {
  const user = c.get("user");
  const checklistType = (c.req.query("type") || "MOVE_IN") as "MOVE_IN" | "MOVE_OUT";

  // Validate checklist type
  if (checklistType !== "MOVE_IN" && checklistType !== "MOVE_OUT") {
    return c.json(
      { error: { message: "Invalid checklist type. Must be MOVE_IN or MOVE_OUT", code: "INVALID_TYPE" } },
      400
    );
  }

  // Get the tenant's active tenancy
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
  });

  if (!tenancy) {
    return c.json({
      data: {
        checklistType,
        items: [],
        progress: {
          completed: 0,
          total: 0,
          percentage: 0,
        },
      },
    });
  }

  // Get checklist items for this tenancy filtered by checklist type
  const items = await prisma.checklistItem.findMany({
    where: {
      tenancyId: tenancy.id,
      checklistType,
    },
    orderBy: { sortOrder: "asc" },
  });

  const completed = items.filter((item) => item.isCompleted).length;
  const total = items.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return c.json({
    data: {
      checklistType,
      items: items.map((item) => ({
        id: item.id,
        itemType: item.itemType,
        title: item.title,
        description: item.description,
        isRequired: item.isRequired,
        isCompleted: item.isCompleted,
        completedAt: item.completedAt?.toISOString() || null,
        sortOrder: item.sortOrder,
        checklistType: item.checklistType,
        selfCompletable: isSelfCompletable(item.checklistType, item.itemType),
      })),
      progress: {
        completed,
        total,
        percentage,
      },
    },
  });
});

/**
 * PUT /api/tenant/checklist/:id/complete
 * Mark a checklist item as complete (only for items tenant can self-complete)
 * For MOVE_IN: INSURANCE_UPLOADED can be self-completed
 * For MOVE_OUT: FORWARDING_ADDRESS and UTILITIES_TRANSFERRED can be self-completed
 */
tenantChecklistRouter.put("/:id/complete", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  // Get the tenant's active tenancy
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
  });

  if (!tenancy) {
    return c.json(
      { error: { message: "No active tenancy found", code: "NO_TENANCY" } },
      404
    );
  }

  // Find the checklist item
  const item = await prisma.checklistItem.findFirst({
    where: {
      id,
      tenancyId: tenancy.id,
    },
  });

  if (!item) {
    return c.json(
      { error: { message: "Checklist item not found", code: "NOT_FOUND" } },
      404
    );
  }

  // Check if the item is self-completable based on checklist type
  const selfCompletable = isSelfCompletable(item.checklistType, item.itemType);
  if (!selfCompletable) {
    return c.json(
      {
        error: {
          message: "This item can only be completed by an admin",
          code: "NOT_ALLOWED",
        },
      },
      403
    );
  }

  // For INSURANCE_UPLOADED, check if user has valid insurance
  if (item.itemType === "INSURANCE_UPLOADED") {
    // Fetch current user's insurance status
    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { insuranceStatus: true },
    });

    if (
      !currentUser ||
      !currentUser.insuranceStatus ||
      currentUser.insuranceStatus === "MISSING" ||
      currentUser.insuranceStatus === "REJECTED" ||
      currentUser.insuranceStatus === "EXPIRED"
    ) {
      return c.json(
        {
          error: {
            message: "Please upload valid insurance documentation first",
            code: "INSURANCE_NOT_VALID",
          },
        },
        400
      );
    }
  }

  // Mark as complete
  const updatedItem = await prisma.checklistItem.update({
    where: { id },
    data: {
      isCompleted: true,
      completedAt: new Date(),
      completedById: user.id,
    },
  });

  return c.json({
    data: {
      id: updatedItem.id,
      itemType: updatedItem.itemType,
      title: updatedItem.title,
      description: updatedItem.description,
      isRequired: updatedItem.isRequired,
      isCompleted: updatedItem.isCompleted,
      completedAt: updatedItem.completedAt?.toISOString() || null,
      sortOrder: updatedItem.sortOrder,
      checklistType: updatedItem.checklistType,
      selfCompletable: isSelfCompletable(updatedItem.checklistType, updatedItem.itemType),
    },
  });
});

export { tenantChecklistRouter };
