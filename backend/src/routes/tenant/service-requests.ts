import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authMiddleware, tenantMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { CreateServiceRequestSchema } from "../../types";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { env } from "../../env";
import { notifyMaintenanceRequest } from "../../lib/event-notifications";

const tenantServiceRequestsRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
tenantServiceRequestsRouter.use("*", authMiddleware);
tenantServiceRequestsRouter.use("*", tenantMiddleware);

// Base uploads directory
const UPLOADS_BASE = env.UPLOADS_DIR || path.resolve(process.cwd(), "uploads");
const SERVICE_REQUESTS_UPLOADS = path.join(UPLOADS_BASE, "service-requests");

// Allowed image types
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * GET /api/tenant/service-requests
 * Get all service requests for the tenant's unit (all roommates can see all unit requests)
 */
tenantServiceRequestsRouter.get("/", async (c) => {
  const user = c.get("user");

  // Get the tenant's active tenancy to find the unit
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
  });

  if (!tenancy) {
    return c.json({ data: [] });
  }

  // Get all service requests for the unit (not just created by this user)
  const serviceRequests = await prisma.serviceRequest.findMany({
    where: {
      unitId: tenancy.unitId,
    },
    include: {
      unit: {
        select: {
          id: true,
          unitLabel: true,
          buildingName: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          comments: true,
          attachments: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
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
 * POST /api/tenant/service-requests
 * Create a new service request
 */
tenantServiceRequestsRouter.post("/", zValidator("json", CreateServiceRequestSchema), async (c) => {
  const data = c.req.valid("json");
  const user = c.get("user");

  // Get the tenant's active tenancy
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
  });

  if (!tenancy) {
    return c.json({ error: { message: "No active tenancy found", code: "NO_TENANCY" } }, 400);
  }

  const serviceRequest = await prisma.serviceRequest.create({
    data: {
      createdById: user.id,
      unitId: tenancy.unitId,
      title: data.title,
      description: data.description,
      priority: data.priority || "NORMAL",
      status: "OPEN",
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

  // Trigger MAINTENANCE_REQUEST notification to Communication Center recipients
  notifyMaintenanceRequest({
    title: serviceRequest.title,
    description: serviceRequest.description,
    priority: serviceRequest.priority,
    tenantName: user.name,
    buildingName: serviceRequest.unit.buildingName || "Unknown Building",
    unitLabel: serviceRequest.unit.unitLabel,
  }).catch((err) => {
    console.error("[SERVICE-REQUEST] Failed to send maintenance notification:", err);
  });

  return c.json({
    data: {
      id: serviceRequest.id,
      createdById: serviceRequest.createdById,
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
 * GET /api/tenant/service-requests/:id
 * Get a single service request with comments (any tenant in unit can view)
 */
tenantServiceRequestsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  // Get the tenant's active tenancy to find the unit
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
  });

  if (!tenancy) {
    return c.json({ error: { message: "No active tenancy found", code: "NO_TENANCY" } }, 400);
  }

  // Find service request for this unit
  const serviceRequest = await prisma.serviceRequest.findFirst({
    where: {
      id,
      unitId: tenancy.unitId,
    },
    include: {
      unit: {
        select: {
          id: true,
          unitLabel: true,
          buildingName: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
      comments: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      attachments: {
        select: {
          id: true,
          fileUrl: true,
          fileName: true,
          createdAt: true,
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
      attachments: serviceRequest.attachments.map((att) => ({
        id: att.id,
        fileUrl: att.fileUrl,
        fileName: att.fileName,
        createdAt: att.createdAt.toISOString(),
      })),
    },
  });
});

/**
 * POST /api/tenant/service-requests/:id/comment
 * Add a comment to a service request (any tenant in the unit can comment)
 */
const AddCommentSchema = z.object({
  body: z.string().min(1, "Comment body is required"),
});

tenantServiceRequestsRouter.post("/:id/comment", zValidator("json", AddCommentSchema), async (c) => {
  const id = c.req.param("id");
  const data = c.req.valid("json");
  const user = c.get("user");

  // Get the tenant's active tenancy to find the unit
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
  });

  if (!tenancy) {
    return c.json({ error: { message: "No active tenancy found", code: "NO_TENANCY" } }, 400);
  }

  // Verify service request exists and belongs to this unit
  const serviceRequest = await prisma.serviceRequest.findFirst({
    where: {
      id,
      unitId: tenancy.unitId,
    },
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
 * POST /api/tenant/service-requests/:id/attachments
 * Upload image attachments to a service request
 */
tenantServiceRequestsRouter.post("/:id/attachments", async (c) => {
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
    return c.json({ error: { message: "No active tenancy found", code: "NO_TENANCY" } }, 400);
  }

  // Verify service request exists and belongs to this unit
  const serviceRequest = await prisma.serviceRequest.findFirst({
    where: {
      id,
      unitId: tenancy.unitId,
    },
  });

  if (!serviceRequest) {
    return c.json({ error: { message: "Service request not found", code: "NOT_FOUND" } }, 404);
  }

  // Parse multipart form data
  const formData = await c.req.formData();
  const files = formData.getAll("files") as File[];

  if (!files || files.length === 0) {
    return c.json({ error: { message: "No files provided", code: "NO_FILES" } }, 400);
  }

  // Limit number of files
  if (files.length > 5) {
    return c.json({ error: { message: "Maximum 5 files per upload", code: "TOO_MANY_FILES" } }, 400);
  }

  // Ensure upload directory exists
  await mkdir(SERVICE_REQUESTS_UPLOADS, { recursive: true });

  const uploadedAttachments = [];

  for (const file of files) {
    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return c.json({
        error: {
          message: `Invalid file type: ${file.type}. Allowed types: JPEG, PNG, GIF, WebP`,
          code: "INVALID_FILE_TYPE",
        },
      }, 400);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return c.json({
        error: {
          message: `File too large: ${file.name}. Maximum size is 10MB`,
          code: "FILE_TOO_LARGE",
        },
      }, 400);
    }

    // Generate unique filename
    const ext = path.extname(file.name) || `.${file.type.split("/")[1]}`;
    const uniqueName = `${id}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    const filePath = path.join(SERVICE_REQUESTS_UPLOADS, uniqueName);

    // Write file to disk
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(arrayBuffer));

    // Create database record
    const attachment = await prisma.serviceRequestAttachment.create({
      data: {
        serviceRequestId: id,
        fileUrl: `/api/uploads/service-requests/${uniqueName}`,
        fileName: file.name,
      },
    });

    uploadedAttachments.push({
      id: attachment.id,
      fileUrl: attachment.fileUrl,
      fileName: attachment.fileName,
      createdAt: attachment.createdAt.toISOString(),
    });
  }

  return c.json({ data: uploadedAttachments });
});

export { tenantServiceRequestsRouter };
