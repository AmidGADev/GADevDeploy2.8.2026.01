import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, tenantMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";

const tenantAnnouncementsRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
tenantAnnouncementsRouter.use("*", authMiddleware);
tenantAnnouncementsRouter.use("*", tenantMiddleware);

/**
 * GET /api/tenant/announcements
 * Get announcements for the tenant
 */
tenantAnnouncementsRouter.get("/", async (c) => {
  const user = c.get("user");

  // Get the tenant's active tenancy
  const tenancy = await prisma.tenancy.findFirst({
    where: {
      userId: user.id,
      isActive: true,
    },
  });

  // Build the query to get relevant announcements
  const whereClause: any = {
    OR: [{ audienceType: "ALL" }],
  };

  if (tenancy) {
    whereClause.OR.push({
      audienceType: "UNIT",
      audienceUnits: { contains: tenancy.unitId },
    });
  }

  whereClause.OR.push({
    audienceType: "CUSTOM",
    audienceUsers: { contains: user.id },
  });

  const announcements = await prisma.announcement.findMany({
    where: whereClause,
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
      announcementReads: {
        where: {
          userId: user.id,
        },
        select: {
          readAt: true,
        },
      },
      acknowledgements: {
        where: {
          userId: user.id,
        },
        select: {
          acknowledgedAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({
    data: announcements.map((a) => ({
      id: a.id,
      createdById: a.createdById,
      createdBy: a.createdBy,
      title: a.title,
      bodyRichtext: a.bodyRichtext,
      createdAt: a.createdAt.toISOString(),
      isRead: a.announcementReads.length > 0,
      readAt: a.announcementReads[0]?.readAt?.toISOString() || null,
      requiresAcknowledgement: a.requiresAcknowledgement,
      hasAcknowledged: a.acknowledgements.length > 0,
      acknowledgedAt: a.acknowledgements[0]?.acknowledgedAt?.toISOString() || null,
    })),
  });
});

/**
 * POST /api/tenant/announcements/:id/read
 * Mark an announcement as read
 */
tenantAnnouncementsRouter.post("/:id/read", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  // Verify announcement exists
  const announcement = await prisma.announcement.findUnique({
    where: { id },
  });

  if (!announcement) {
    return c.json({ error: { message: "Announcement not found", code: "NOT_FOUND" } }, 404);
  }

  // Check if already read
  const existingRead = await prisma.announcementRead.findUnique({
    where: {
      announcementId_userId: {
        announcementId: id,
        userId: user.id,
      },
    },
  });

  if (existingRead) {
    return c.json({
      data: {
        announcementId: id,
        userId: user.id,
        readAt: existingRead.readAt.toISOString(),
        alreadyRead: true,
      },
    });
  }

  // Create read record
  const read = await prisma.announcementRead.create({
    data: {
      announcementId: id,
      userId: user.id,
    },
  });

  return c.json({
    data: {
      announcementId: id,
      userId: user.id,
      readAt: read.readAt.toISOString(),
      alreadyRead: false,
    },
  });
});

/**
 * POST /api/tenant/announcements/:id/acknowledge
 * Acknowledge an announcement that requires acknowledgement
 */
tenantAnnouncementsRouter.post("/:id/acknowledge", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  // Verify announcement exists and requires acknowledgement
  const announcement = await prisma.announcement.findUnique({
    where: { id },
  });

  if (!announcement) {
    return c.json({ error: { message: "Announcement not found", code: "NOT_FOUND" } }, 404);
  }

  if (!announcement.requiresAcknowledgement) {
    return c.json(
      { error: { message: "This announcement does not require acknowledgement", code: "NOT_REQUIRED" } },
      400
    );
  }

  // Check if already acknowledged
  const existingAck = await prisma.announcementAcknowledgement.findUnique({
    where: {
      announcementId_userId: {
        announcementId: id,
        userId: user.id,
      },
    },
  });

  if (existingAck) {
    return c.json({
      data: {
        announcementId: id,
        userId: user.id,
        acknowledgedAt: existingAck.acknowledgedAt.toISOString(),
        alreadyAcknowledged: true,
      },
    });
  }

  // Get client IP for audit purposes
  const ipAddress = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null;

  // Create acknowledgement record
  const ack = await prisma.announcementAcknowledgement.create({
    data: {
      announcementId: id,
      userId: user.id,
      ipAddress,
    },
  });

  // Also mark as read if not already
  await prisma.announcementRead.upsert({
    where: {
      announcementId_userId: {
        announcementId: id,
        userId: user.id,
      },
    },
    create: {
      announcementId: id,
      userId: user.id,
    },
    update: {},
  });

  return c.json({
    data: {
      announcementId: id,
      userId: user.id,
      acknowledgedAt: ack.acknowledgedAt.toISOString(),
      alreadyAcknowledged: false,
    },
  });
});

export { tenantAnnouncementsRouter };
