import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { ServiceRequestStatusSchema, ServiceRequestPrioritySchema, AdminCreateServiceRequestSchema } from "../../types";
import { notifyMaintenanceRequest } from "../../lib/event-notifications";

const serviceRequestsRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
serviceRequestsRouter.use("*", authMiddleware);
serviceRequestsRouter.use("*", adminMiddleware);

/**
 * GET /api/admin/service-requests
 * List all service requests
 */
serviceRequestsRouter.get("/", async (c) => {
  const status = c.req.query("status");
  const priority = c.req.query("priority");

  const where: any = {};
  if (status) where.status = status;
  if (priority) where.priority = priority;

  const serviceRequests = await prisma.serviceRequest.findMany({
    where,
    include: {
      createdBy: {
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
      _count: {
        select: {
          comments: true,
          attachments: true,
        },
      },
    },
    orderBy: [
      { priority: "desc" }, // URGENT first
      { createdAt: "desc" },
    ],
  });

  return c.json({
    data: serviceRequests.map((sr) => ({
      id: sr.id,
      createdById: sr.createdById,
      createdBy: sr.createdBy,
      unitId: sr.unitId,
      unit: sr.unit,
      title: sr.title,
      description: sr.description,
      priority: sr.priority,
      status: sr.status,
      createdAt: sr.createdAt.toISOString(),
      updatedAt: sr.updatedAt.toISOString(),
      commentCount: sr._count.comments,
      attachmentCount: sr._count.attachments,
    })),
  });
});

/**
 * GET /api/admin/service-requests/options
 * Get available tenants and units for creating service requests
 */
serviceRequestsRouter.get("/options", async (c) => {
  // Get all active tenancies with their user and unit info
  const tenancies = await prisma.tenancy.findMany({
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
      unit: {
        select: {
          id: true,
          unitLabel: true,
          property: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: [
      { unit: { unitLabel: "asc" } },
      { user: { name: "asc" } },
    ],
  });

  // Build a map of tenants with their units
  const tenantsMap = new Map<string, {
    id: string;
    name: string;
    email: string;
    units: Array<{
      id: string;
      unitLabel: string;
      propertyName: string;
    }>;
  }>();

  for (const tenancy of tenancies) {
    const existing = tenantsMap.get(tenancy.user.id);
    const unitInfo = {
      id: tenancy.unit.id,
      unitLabel: tenancy.unit.unitLabel,
      propertyName: tenancy.unit.property.name,
    };

    if (existing) {
      existing.units.push(unitInfo);
    } else {
      tenantsMap.set(tenancy.user.id, {
        id: tenancy.user.id,
        name: tenancy.user.name,
        email: tenancy.user.email,
        units: [unitInfo],
      });
    }
  }

  // Also get all units for cases where admin creates without a tenant
  const allUnits = await prisma.unit.findMany({
    select: {
      id: true,
      unitLabel: true,
      property: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [
      { property: { name: "asc" } },
      { unitLabel: "asc" },
    ],
  });

  return c.json({
    data: {
      tenants: Array.from(tenantsMap.values()),
      units: allUnits.map((unit) => ({
        id: unit.id,
        unitLabel: unit.unitLabel,
        propertyName: unit.property.name,
      })),
    },
  });
});

/**
 * GET /api/admin/service-requests/:id
 * Get full details of a service request including comments and attachments
 */
serviceRequestsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");

  const serviceRequest = await prisma.serviceRequest.findUnique({
    where: { id },
    include: {
      createdBy: {
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
          propertyId: true,
        },
      },
      comments: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      attachments: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!serviceRequest) {
    return c.json({ error: { message: "Service request not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: {
      id: serviceRequest.id,
      createdById: serviceRequest.createdById,
      createdBy: serviceRequest.createdBy,
      unitId: serviceRequest.unitId,
      unit: serviceRequest.unit,
      title: serviceRequest.title,
      description: serviceRequest.description,
      priority: serviceRequest.priority,
      status: serviceRequest.status,
      createdAt: serviceRequest.createdAt.toISOString(),
      updatedAt: serviceRequest.updatedAt.toISOString(),
      comments: serviceRequest.comments.map((comment) => ({
        id: comment.id,
        serviceRequestId: comment.serviceRequestId,
        userId: comment.userId,
        user: comment.user,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
      })),
      attachments: serviceRequest.attachments.map((attachment) => ({
        id: attachment.id,
        fileUrl: attachment.fileUrl,
        fileName: attachment.fileName,
        createdAt: attachment.createdAt.toISOString(),
      })),
    },
  });
});

/**
 * PUT /api/admin/service-requests/:id
 * Update service request status/priority
 */
const UpdateServiceRequestSchema = z.object({
  status: ServiceRequestStatusSchema.optional(),
  priority: ServiceRequestPrioritySchema.optional(),
});

serviceRequestsRouter.put("/:id", zValidator("json", UpdateServiceRequestSchema), async (c) => {
  const id = c.req.param("id");
  const data = c.req.valid("json");

  // Verify service request exists
  const existing = await prisma.serviceRequest.findUnique({
    where: { id },
  });

  if (!existing) {
    return c.json({ error: { message: "Service request not found", code: "NOT_FOUND" } }, 404);
  }

  const serviceRequest = await prisma.serviceRequest.update({
    where: { id },
    data: {
      status: data.status,
      priority: data.priority,
    },
    include: {
      createdBy: {
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
  });

  return c.json({
    data: {
      id: serviceRequest.id,
      createdById: serviceRequest.createdById,
      createdBy: serviceRequest.createdBy,
      unitId: serviceRequest.unitId,
      unit: serviceRequest.unit,
      title: serviceRequest.title,
      description: serviceRequest.description,
      priority: serviceRequest.priority,
      status: serviceRequest.status,
      createdAt: serviceRequest.createdAt.toISOString(),
      updatedAt: serviceRequest.updatedAt.toISOString(),
    },
  });
});

/**
 * POST /api/admin/service-requests/:id/comment
 * Add a comment to a service request
 */
const AddCommentSchema = z.object({
  body: z.string().min(1, "Comment body is required"),
});

serviceRequestsRouter.post("/:id/comment", zValidator("json", AddCommentSchema), async (c) => {
  const id = c.req.param("id");
  const data = c.req.valid("json");
  const user = c.get("user");

  // Verify service request exists
  const serviceRequest = await prisma.serviceRequest.findUnique({
    where: { id },
  });

  if (!serviceRequest) {
    return c.json({ error: { message: "Service request not found", code: "NOT_FOUND" } }, 404);
  }

  const comment = await prisma.serviceRequestComment.create({
    data: {
      serviceRequestId: id,
      userId: user.id,
      body: data.body,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });

  return c.json({
    data: {
      id: comment.id,
      serviceRequestId: comment.serviceRequestId,
      userId: comment.userId,
      user: comment.user,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
    },
  });
});

/**
 * POST /api/admin/service-requests
 * Create a new service request (admin creates on behalf of tenant or themselves)
 */
serviceRequestsRouter.post("/", zValidator("json", AdminCreateServiceRequestSchema), async (c) => {
  const data = c.req.valid("json");
  const user = c.get("user");

  // Verify the unit exists
  const unit = await prisma.unit.findUnique({
    where: { id: data.unitId },
    include: {
      property: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!unit) {
    return c.json({ error: { message: "Unit not found", code: "NOT_FOUND" } }, 404);
  }

  // If tenantId is provided, verify the tenant exists
  if (data.tenantId) {
    const tenant = await prisma.user.findUnique({
      where: { id: data.tenantId },
    });

    if (!tenant) {
      return c.json({ error: { message: "Tenant not found", code: "NOT_FOUND" } }, 404);
    }
  }

  // Use tenantId if provided, otherwise use the admin's userId
  const createdById = data.tenantId || user.id;

  const serviceRequest = await prisma.serviceRequest.create({
    data: {
      title: data.title,
      description: data.description,
      priority: data.priority,
      unitId: data.unitId,
      createdById,
    },
    include: {
      createdBy: {
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
          property: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  // Trigger MAINTENANCE_REQUEST notification to Communication Center recipients
  notifyMaintenanceRequest({
    title: serviceRequest.title,
    description: serviceRequest.description,
    priority: serviceRequest.priority,
    tenantName: serviceRequest.createdBy.name,
    buildingName: serviceRequest.unit.buildingName || "Unknown Building",
    unitLabel: serviceRequest.unit.unitLabel,
  }).catch((err) => {
    console.error("[SERVICE-REQUEST] Failed to send maintenance notification:", err);
  });

  return c.json({
    data: {
      id: serviceRequest.id,
      createdById: serviceRequest.createdById,
      createdBy: serviceRequest.createdBy,
      unitId: serviceRequest.unitId,
      unit: serviceRequest.unit,
      title: serviceRequest.title,
      description: serviceRequest.description,
      priority: serviceRequest.priority,
      status: serviceRequest.status,
      createdAt: serviceRequest.createdAt.toISOString(),
      updatedAt: serviceRequest.updatedAt.toISOString(),
    },
  });
});

export { serviceRequestsRouter };
