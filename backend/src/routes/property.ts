import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { CreateShowingRequestSchema } from "../types";

const propertyRouter = new Hono();

/**
 * GET /api/property
 * Get the property info for the public landing page
 */
propertyRouter.get("/", async (c) => {
  // Get the first property (single-property system)
  const property = await prisma.property.findFirst({
    include: {
      units: {
        where: {
          status: "VACANT",
        },
        select: {
          id: true,
          unitLabel: true,
          rentAmountCents: true,
          description: true,
          bedrooms: true,
          bathrooms: true,
          sqft: true,
        },
        orderBy: {
          unitLabel: "asc",
        },
      },
    },
  });

  if (!property) {
    return c.json({ error: { message: "Property not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: {
      id: property.id,
      name: property.name,
      address: property.address,
      city: property.city,
      province: property.province,
      postalCode: property.postalCode,
      heroImageUrl: property.heroImageUrl,
      marketingCopyOverview: property.marketingCopyOverview,
      marketingCopyNeighborhood: property.marketingCopyNeighborhood,
      createdAt: property.createdAt.toISOString(),
      vacantUnits: property.units.map((unit) => ({
        id: unit.id,
        unitLabel: unit.unitLabel,
        rentAmountCents: unit.rentAmountCents,
        description: unit.description,
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        sqft: unit.sqft,
      })),
    },
  });
});

/**
 * POST /api/property/showing-request
 * Submit a showing request (public form)
 */
propertyRouter.post(
  "/showing-request",
  zValidator("json", CreateShowingRequestSchema),
  async (c) => {
    const data = c.req.valid("json");

    // Get the first property
    const property = await prisma.property.findFirst();

    if (!property) {
      return c.json({ error: { message: "Property not found", code: "NOT_FOUND" } }, 404);
    }

    const showingRequest = await prisma.showingRequest.create({
      data: {
        propertyId: property.id,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        message: data.message || null,
        status: "NEW",
      },
    });

    return c.json({
      data: {
        id: showingRequest.id,
        propertyId: showingRequest.propertyId,
        name: showingRequest.name,
        email: showingRequest.email,
        phone: showingRequest.phone,
        message: showingRequest.message,
        status: showingRequest.status,
        createdAt: showingRequest.createdAt.toISOString(),
      },
    });
  }
);

export { propertyRouter };
