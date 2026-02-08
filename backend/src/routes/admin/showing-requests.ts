import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { ShowingRequestStatusSchema, AdminCreateShowingRequestSchema } from "../../types";

const showingRequestsRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
showingRequestsRouter.use("*", authMiddleware);
showingRequestsRouter.use("*", adminMiddleware);

/**
 * GET /api/admin/showing-requests
 * List all showing requests
 */
showingRequestsRouter.get("/", async (c) => {
  const status = c.req.query("status");

  const where: any = {};
  if (status) where.status = status;

  const showingRequests = await prisma.showingRequest.findMany({
    where,
    include: {
      property: {
        select: {
          id: true,
          name: true,
          address: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return c.json({
    data: showingRequests.map((sr) => ({
      id: sr.id,
      propertyId: sr.propertyId,
      property: sr.property,
      name: sr.name,
      email: sr.email,
      phone: sr.phone,
      message: sr.message,
      status: sr.status,
      createdAt: sr.createdAt.toISOString(),
      updatedAt: sr.updatedAt.toISOString(),
    })),
  });
});

/**
 * POST /api/admin/showing-requests
 * Create a showing request for a prospective tenant
 */
showingRequestsRouter.post(
  "/",
  zValidator("json", AdminCreateShowingRequestSchema),
  async (c) => {
    const data = c.req.valid("json");

    // Verify property exists
    const property = await prisma.property.findUnique({
      where: { id: data.propertyId },
      select: {
        id: true,
        name: true,
        address: true,
      },
    });

    if (!property) {
      return c.json(
        { error: { message: "Property not found", code: "NOT_FOUND" } },
        404
      );
    }

    // Build the message with optional fields
    let message = data.message || "";
    if (data.preferredDate) {
      message = message ? `${message}\n\nPreferred Date: ${data.preferredDate}` : `Preferred Date: ${data.preferredDate}`;
    }
    if (data.preferredUnit) {
      message = message ? `${message}\nPreferred Unit: ${data.preferredUnit}` : `Preferred Unit: ${data.preferredUnit}`;
    }

    // Create the showing request with SCHEDULED status since admin is creating it
    const showingRequest = await prisma.showingRequest.create({
      data: {
        propertyId: data.propertyId,
        name: data.name,
        email: data.email,
        phone: data.phone ?? null,
        message: message || null,
        status: "SCHEDULED",
      },
      include: {
        property: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    });

    return c.json({
      data: {
        id: showingRequest.id,
        propertyId: showingRequest.propertyId,
        property: showingRequest.property,
        name: showingRequest.name,
        email: showingRequest.email,
        phone: showingRequest.phone,
        message: showingRequest.message,
        status: showingRequest.status,
        createdAt: showingRequest.createdAt.toISOString(),
        updatedAt: showingRequest.updatedAt.toISOString(),
      },
    }, 201);
  }
);

/**
 * PUT /api/admin/showing-requests/:id
 * Update showing request status
 */
const UpdateShowingRequestSchema = z.object({
  status: ShowingRequestStatusSchema,
});

showingRequestsRouter.put("/:id", zValidator("json", UpdateShowingRequestSchema), async (c) => {
  const id = c.req.param("id");
  const data = c.req.valid("json");

  // Verify showing request exists
  const existing = await prisma.showingRequest.findUnique({
    where: { id },
  });

  if (!existing) {
    return c.json({ error: { message: "Showing request not found", code: "NOT_FOUND" } }, 404);
  }

  const showingRequest = await prisma.showingRequest.update({
    where: { id },
    data: {
      status: data.status,
    },
    include: {
      property: {
        select: {
          id: true,
          name: true,
          address: true,
        },
      },
    },
  });

  return c.json({
    data: {
      id: showingRequest.id,
      propertyId: showingRequest.propertyId,
      property: showingRequest.property,
      name: showingRequest.name,
      email: showingRequest.email,
      phone: showingRequest.phone,
      message: showingRequest.message,
      status: showingRequest.status,
      createdAt: showingRequest.createdAt.toISOString(),
      updatedAt: showingRequest.updatedAt.toISOString(),
    },
  });
});

export { showingRequestsRouter };
