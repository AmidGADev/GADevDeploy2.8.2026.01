import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../../prisma";
import { authMiddleware, tenantMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { CreateMoveOutRequestSchema } from "../../types";
import { notifyMoveOutRequest } from "../../lib/event-notifications";

const tenantMoveOutRequestRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
tenantMoveOutRequestRouter.use("*", authMiddleware);
tenantMoveOutRequestRouter.use("*", tenantMiddleware);

// Minimum days notice required for move-out
const MIN_NOTICE_DAYS = 60;

/**
 * GET /api/tenant/move-out-request
 * Get the tenant's current move-out request (if any)
 */
tenantMoveOutRequestRouter.get("/", async (c) => {
  const user = c.get("user");

  // Get the tenant's active tenancy
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
  });

  if (!tenancy) {
    return c.json({ data: null });
  }

  // Get the most recent move-out request for this tenancy
  const moveOutRequest = await prisma.moveOutRequest.findFirst({
    where: {
      tenancyId: tenancy.id,
    },
    include: {
      respondedBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!moveOutRequest) {
    return c.json({ data: null });
  }

  return c.json({
    data: {
      id: moveOutRequest.id,
      tenancyId: moveOutRequest.tenancyId,
      requestedDate: moveOutRequest.requestedDate.toISOString(),
      status: moveOutRequest.status,
      adminMessage: moveOutRequest.adminMessage,
      respondedAt: moveOutRequest.respondedAt?.toISOString() ?? null,
      respondedById: moveOutRequest.respondedById,
      respondedBy: moveOutRequest.respondedBy,
      createdAt: moveOutRequest.createdAt.toISOString(),
      updatedAt: moveOutRequest.updatedAt.toISOString(),
    },
  });
});

/**
 * POST /api/tenant/move-out-request
 * Submit a new move-out request
 */
tenantMoveOutRequestRouter.post(
  "/",
  zValidator("json", CreateMoveOutRequestSchema),
  async (c) => {
    const data = c.req.valid("json");
    const user = c.get("user");

    // Get the tenant's active tenancy with unit info
    const tenancy = await prisma.tenancy.findFirst({
      where: {
        userId: user.id,
        isActive: true,
      },
      include: {
        unit: {
          select: {
            id: true,
            unitLabel: true,
            buildingName: true,
          },
        },
      },
    });

    if (!tenancy) {
      return c.json(
        { error: { message: "No active tenancy found", code: "NO_TENANCY" } },
        400
      );
    }

    // Check if there's already a pending move-out request
    const existingRequest = await prisma.moveOutRequest.findFirst({
      where: {
        tenancyId: tenancy.id,
        status: "PENDING",
      },
    });

    if (existingRequest) {
      return c.json(
        {
          error: {
            message: "You already have a pending move-out request",
            code: "EXISTING_REQUEST",
          },
        },
        400
      );
    }

    // Parse and validate the requested date
    const requestedDate = new Date(data.requestedDate);
    if (isNaN(requestedDate.getTime())) {
      return c.json(
        { error: { message: "Invalid date format", code: "INVALID_DATE" } },
        400
      );
    }

    // Enforce minimum 60 days notice
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minDate = new Date(today);
    minDate.setDate(minDate.getDate() + MIN_NOTICE_DAYS);

    const requestedDateOnly = new Date(requestedDate);
    requestedDateOnly.setHours(0, 0, 0, 0);

    if (requestedDateOnly < minDate) {
      const daysUntilRequested = Math.ceil(
        (requestedDateOnly.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      return c.json(
        {
          error: {
            message: `Move-out date must be at least ${MIN_NOTICE_DAYS} days from today. The earliest available date is ${minDate.toLocaleDateString("en-CA")}. You selected a date that is only ${Math.max(0, daysUntilRequested)} days away.`,
            code: "INSUFFICIENT_NOTICE",
          },
        },
        400
      );
    }

    // Create the move-out request
    const moveOutRequest = await prisma.moveOutRequest.create({
      data: {
        tenancyId: tenancy.id,
        requestedDate,
        status: "PENDING",
      },
    });

    // Trigger MOVE_OUT_REQUEST notification to Communication Center recipients
    notifyMoveOutRequest({
      tenantName: user.name,
      tenantEmail: user.email,
      buildingName: tenancy.unit.buildingName || "Unknown Building",
      unitLabel: tenancy.unit.unitLabel,
      requestedDate: requestedDate.toLocaleDateString("en-CA"),
    }).catch((err) => {
      console.error("[MOVE-OUT-REQUEST] Failed to send move-out notification:", err);
    });

    return c.json({
      data: {
        id: moveOutRequest.id,
        tenancyId: moveOutRequest.tenancyId,
        requestedDate: moveOutRequest.requestedDate.toISOString(),
        status: moveOutRequest.status,
        adminMessage: moveOutRequest.adminMessage,
        respondedAt: moveOutRequest.respondedAt?.toISOString() ?? null,
        respondedById: moveOutRequest.respondedById,
        createdAt: moveOutRequest.createdAt.toISOString(),
        updatedAt: moveOutRequest.updatedAt.toISOString(),
      },
    });
  }
);

export { tenantMoveOutRequestRouter };
