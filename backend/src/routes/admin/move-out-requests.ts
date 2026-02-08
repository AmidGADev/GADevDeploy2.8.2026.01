import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { RespondMoveOutRequestSchema, AdminCreateMoveOutRequestSchema } from "../../types";

const adminMoveOutRequestRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
adminMoveOutRequestRouter.use("*", authMiddleware);
adminMoveOutRequestRouter.use("*", adminMiddleware);

/**
 * GET /api/admin/move-out-requests
 * Get all move-out requests
 */
adminMoveOutRequestRouter.get("/", async (c) => {
  const moveOutRequests = await prisma.moveOutRequest.findMany({
    include: {
      tenancy: {
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
      },
      respondedBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({
    data: moveOutRequests.map((req) => ({
      id: req.id,
      tenancyId: req.tenancyId,
      requestedDate: req.requestedDate.toISOString(),
      status: req.status,
      adminMessage: req.adminMessage,
      respondedAt: req.respondedAt?.toISOString() ?? null,
      respondedById: req.respondedById,
      createdAt: req.createdAt.toISOString(),
      updatedAt: req.updatedAt.toISOString(),
      tenant: req.tenancy.user,
      unit: req.tenancy.unit,
      respondedBy: req.respondedBy,
    })),
  });
});

/**
 * GET /api/admin/move-out-requests/:id
 * Get a single move-out request
 */
adminMoveOutRequestRouter.get("/:id", async (c) => {
  const id = c.req.param("id");

  const moveOutRequest = await prisma.moveOutRequest.findUnique({
    where: { id },
    include: {
      tenancy: {
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
      },
      respondedBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!moveOutRequest) {
    return c.json(
      { error: { message: "Move-out request not found", code: "NOT_FOUND" } },
      404
    );
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
      createdAt: moveOutRequest.createdAt.toISOString(),
      updatedAt: moveOutRequest.updatedAt.toISOString(),
      tenant: moveOutRequest.tenancy.user,
      unit: moveOutRequest.tenancy.unit,
      respondedBy: moveOutRequest.respondedBy,
    },
  });
});

/**
 * POST /api/admin/move-out-requests
 * Create a move-out request on behalf of a tenant
 */
adminMoveOutRequestRouter.post(
  "/",
  zValidator("json", AdminCreateMoveOutRequestSchema),
  async (c) => {
    const data = c.req.valid("json");
    const user = c.get("user");

    // Verify tenancy exists and get tenant/unit info
    const tenancy = await prisma.tenancy.findUnique({
      where: { id: data.tenancyId },
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
          },
        },
      },
    });

    if (!tenancy) {
      return c.json(
        { error: { message: "Tenancy not found", code: "NOT_FOUND" } },
        404
      );
    }

    if (!tenancy.isActive) {
      return c.json(
        { error: { message: "Tenancy is not active", code: "INVALID_STATE" } },
        400
      );
    }

    // Check if there's already an active move-out request for this tenancy
    const existingRequest = await prisma.moveOutRequest.findFirst({
      where: {
        tenancyId: data.tenancyId,
        status: { in: ["PENDING", "ACKNOWLEDGED"] },
      },
    });

    if (existingRequest) {
      return c.json(
        { error: { message: "An active move-out request already exists for this tenancy", code: "DUPLICATE" } },
        409
      );
    }

    const requestedDate = new Date(data.requestedDate);

    // Create the move-out request with ACKNOWLEDGED status since admin is creating it
    const moveOutRequest = await prisma.moveOutRequest.create({
      data: {
        tenancyId: data.tenancyId,
        requestedDate,
        status: "ACKNOWLEDGED",
        adminMessage: data.adminMessage ?? null,
        respondedAt: new Date(),
        respondedById: user.id,
      },
      include: {
        tenancy: {
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
              },
            },
          },
        },
        respondedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Update the tenancy with the move-out date
    await prisma.tenancy.update({
      where: { id: data.tenancyId },
      data: {
        moveOutDate: requestedDate,
      },
    });

    // Log the admin action
    await prisma.auditLog.create({
      data: {
        adminUserId: user.id,
        action: "CREATE_MOVE_OUT_REQUEST",
        entityType: "MoveOutRequest",
        entityId: moveOutRequest.id,
        metadataJson: JSON.stringify({
          tenantId: tenancy.user.id,
          tenantName: tenancy.user.name,
          unitLabel: tenancy.unit.unitLabel,
          requestedDate: requestedDate.toISOString(),
          adminMessage: data.adminMessage,
          createdByAdmin: true,
        }),
      },
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
        tenant: moveOutRequest.tenancy.user,
        unit: moveOutRequest.tenancy.unit,
        respondedBy: moveOutRequest.respondedBy,
      },
    }, 201);
  }
);

/**
 * PUT /api/admin/move-out-requests/:id
 * Respond to a move-out request (acknowledge or decline)
 */
adminMoveOutRequestRouter.put(
  "/:id",
  zValidator("json", RespondMoveOutRequestSchema),
  async (c) => {
    const id = c.req.param("id");
    const data = c.req.valid("json");
    const user = c.get("user");

    // Check if the request exists
    const existingRequest = await prisma.moveOutRequest.findUnique({
      where: { id },
      include: {
        tenancy: true,
      },
    });

    if (!existingRequest) {
      return c.json(
        { error: { message: "Move-out request not found", code: "NOT_FOUND" } },
        404
      );
    }

    // Update the request
    const moveOutRequest = await prisma.moveOutRequest.update({
      where: { id },
      data: {
        status: data.status,
        adminMessage: data.adminMessage ?? null,
        respondedAt: new Date(),
        respondedById: user.id,
      },
      include: {
        tenancy: {
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
              },
            },
          },
        },
        respondedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // If acknowledged, update the tenancy with the move-out date
    if (data.status === "ACKNOWLEDGED") {
      await prisma.tenancy.update({
        where: { id: existingRequest.tenancyId },
        data: {
          moveOutDate: existingRequest.requestedDate,
        },
      });

      // Log the admin action
      await prisma.auditLog.create({
        data: {
          adminUserId: user.id,
          action: "ACKNOWLEDGE_MOVE_OUT_REQUEST",
          entityType: "MoveOutRequest",
          entityId: id,
          metadataJson: JSON.stringify({
            tenantId: moveOutRequest.tenancy.user.id,
            tenantName: moveOutRequest.tenancy.user.name,
            unitLabel: moveOutRequest.tenancy.unit.unitLabel,
            requestedDate: moveOutRequest.requestedDate.toISOString(),
            adminMessage: data.adminMessage,
          }),
        },
      });
    } else if (data.status === "DECLINED") {
      // Log the decline action
      await prisma.auditLog.create({
        data: {
          adminUserId: user.id,
          action: "DECLINE_MOVE_OUT_REQUEST",
          entityType: "MoveOutRequest",
          entityId: id,
          metadataJson: JSON.stringify({
            tenantId: moveOutRequest.tenancy.user.id,
            tenantName: moveOutRequest.tenancy.user.name,
            unitLabel: moveOutRequest.tenancy.unit.unitLabel,
            requestedDate: moveOutRequest.requestedDate.toISOString(),
            adminMessage: data.adminMessage,
          }),
        },
      });
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
        createdAt: moveOutRequest.createdAt.toISOString(),
        updatedAt: moveOutRequest.updatedAt.toISOString(),
        tenant: moveOutRequest.tenancy.user,
        unit: moveOutRequest.tenancy.unit,
        respondedBy: moveOutRequest.respondedBy,
      },
    });
  }
);

export { adminMoveOutRequestRouter };
