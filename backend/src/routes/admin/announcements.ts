import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { CreateAnnouncementSchema } from "../../types";
import { sendEmail, isEmailConfigured } from "../../lib/email";

const announcementsRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
announcementsRouter.use("*", authMiddleware);
announcementsRouter.use("*", adminMiddleware);

/**
 * GET /api/admin/announcements
 * List all announcements
 */
announcementsRouter.get("/", async (c) => {
  const announcements = await prisma.announcement.findMany({
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      _count: {
        select: {
          announcementReads: true,
          acknowledgements: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return c.json({
    data: announcements.map((a) => ({
      id: a.id,
      createdById: a.createdById,
      createdBy: a.createdBy,
      title: a.title,
      bodyRichtext: a.bodyRichtext,
      audienceType: a.audienceType,
      audienceUnits: a.audienceUnits ? JSON.parse(a.audienceUnits) : null,
      audienceUsers: a.audienceUsers ? JSON.parse(a.audienceUsers) : null,
      sendEmail: a.sendEmail,
      requiresAcknowledgement: a.requiresAcknowledgement,
      createdAt: a.createdAt.toISOString(),
      readCount: a._count.announcementReads,
      acknowledgementCount: a._count.acknowledgements,
    })),
  });
});

/**
 * POST /api/admin/announcements
 * Create an announcement
 */
announcementsRouter.post("/", zValidator("json", CreateAnnouncementSchema), async (c) => {
  const data = c.req.valid("json");
  const user = c.get("user");

  const announcement = await prisma.announcement.create({
    data: {
      createdById: user.id,
      title: data.title,
      bodyRichtext: data.bodyRichtext,
      audienceType: data.audienceType,
      audienceUnits: data.audienceUnits ? JSON.stringify(data.audienceUnits) : null,
      audienceUsers: data.audienceUsers ? JSON.stringify(data.audienceUsers) : null,
      sendEmail: data.sendEmail ?? false,
      requiresAcknowledgement: data.requiresAcknowledgement ?? false,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  // If sendEmail is true, send emails to the audience
  if (data.sendEmail) {
    // Get list of recipients based on audience type
    // IMPORTANT: Always filter to ACTIVE users only - deactivated/deleted users should not receive emails
    let recipients: { email: string; name: string }[] = [];

    if (data.audienceType === "ALL") {
      // Get all active tenants
      const tenants = await prisma.user.findMany({
        where: {
          role: "TENANT",
          status: "ACTIVE",
          deletedAt: null,
        },
        select: {
          email: true,
          name: true,
        },
      });
      recipients = tenants;
    } else if (data.audienceType === "UNIT" && data.audienceUnits) {
      // Get tenants for specific units (only active users)
      const tenancies = await prisma.tenancy.findMany({
        where: {
          unitId: { in: data.audienceUnits },
          isActive: true,
          user: {
            status: "ACTIVE",
            deletedAt: null,
          },
        },
        include: {
          user: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      });
      recipients = tenancies.map((t) => t.user);
    } else if (data.audienceType === "CUSTOM" && data.audienceUsers) {
      // Get specific users (only active ones)
      const users = await prisma.user.findMany({
        where: {
          id: { in: data.audienceUsers },
          status: "ACTIVE",
          deletedAt: null,
        },
        select: {
          email: true,
          name: true,
        },
      });
      recipients = users;
    }

    // Send announcement emails if there are recipients
    if (recipients.length > 0) {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1a365d; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>GA Developments</h1>
            </div>
            <div class="content">
              <h2>${data.title}</h2>
              ${data.bodyRichtext}
            </div>
            <div class="footer">
              <p>GA Developments<br>709 & 711 Carsons Road, Ottawa, ON K1K 2H2</p>
              <p><a href="https://www.gadevelopments.ca/login">Log in to Tenant Portal</a></p>
            </div>
          </div>
        </body>
        </html>
      `;

      const recipientEmails = recipients.map((r) => r.email);

      const emailResult = await sendEmail({
        to: recipientEmails,
        subject: `Announcement: ${data.title}`,
        html,
        emailType: "ANNOUNCEMENT",
        toGroup: data.audienceType === "ALL" ? "All Tenants" :
                 data.audienceType === "UNIT" ? `Units: ${data.audienceUnits?.join(", ")}` :
                 "Custom Selection",
        createdById: user.id,
      });

      if (!emailResult.success) {
        console.error(`[EMAIL] Failed to send announcement email: ${emailResult.error}`);
      } else {
        console.log(`[EMAIL] Announcement email sent to ${recipientEmails.length} recipients`);
      }
    }
  }

  return c.json({
    data: {
      id: announcement.id,
      createdById: announcement.createdById,
      createdBy: announcement.createdBy,
      title: announcement.title,
      bodyRichtext: announcement.bodyRichtext,
      audienceType: announcement.audienceType,
      audienceUnits: announcement.audienceUnits ? JSON.parse(announcement.audienceUnits) : null,
      audienceUsers: announcement.audienceUsers ? JSON.parse(announcement.audienceUsers) : null,
      sendEmail: announcement.sendEmail,
      requiresAcknowledgement: announcement.requiresAcknowledgement,
      createdAt: announcement.createdAt.toISOString(),
    },
  });
});

/**
 * GET /api/admin/announcements/:id/acknowledgements
 * Get list of users who acknowledged an announcement
 */
announcementsRouter.get("/:id/acknowledgements", async (c) => {
  const id = c.req.param("id");

  // Verify announcement exists
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      requiresAcknowledgement: true,
      audienceType: true,
      audienceUnits: true,
      audienceUsers: true,
    },
  });

  if (!announcement) {
    return c.json({ error: { message: "Announcement not found", code: "NOT_FOUND" } }, 404);
  }

  // Get all acknowledgements for this announcement
  const acknowledgements = await prisma.announcementAcknowledgement.findMany({
    where: { announcementId: id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { acknowledgedAt: "desc" },
  });

  // Calculate expected acknowledgements based on audience
  // Only include active, non-deleted users
  let expectedUsers: { id: string; name: string; email: string }[] = [];

  if (announcement.audienceType === "ALL") {
    // All active tenants
    expectedUsers = await prisma.user.findMany({
      where: {
        role: "TENANT",
        status: "ACTIVE",
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });
  } else if (announcement.audienceType === "UNIT" && announcement.audienceUnits) {
    // Tenants in specific units (only active users)
    const unitIds = JSON.parse(announcement.audienceUnits) as string[];
    const tenancies = await prisma.tenancy.findMany({
      where: {
        unitId: { in: unitIds },
        isActive: true,
        user: {
          status: "ACTIVE",
          deletedAt: null,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
    expectedUsers = tenancies.map((t) => t.user);
  } else if (announcement.audienceType === "CUSTOM" && announcement.audienceUsers) {
    // Specific users (only active ones)
    const userIds = JSON.parse(announcement.audienceUsers) as string[];
    expectedUsers = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        status: "ACTIVE",
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });
  }

  // Find users who have not yet acknowledged
  const acknowledgedUserIds = new Set(acknowledgements.map((a) => a.userId));
  const pendingUsers = expectedUsers.filter((u) => !acknowledgedUserIds.has(u.id));

  return c.json({
    data: {
      announcementId: id,
      title: announcement.title,
      requiresAcknowledgement: announcement.requiresAcknowledgement,
      acknowledged: acknowledgements.map((a) => ({
        id: a.id,
        user: a.user,
        acknowledgedAt: a.acknowledgedAt.toISOString(),
        ipAddress: a.ipAddress,
      })),
      pending: pendingUsers,
      stats: {
        total: expectedUsers.length,
        acknowledged: acknowledgements.length,
        pending: pendingUsers.length,
        percentage: expectedUsers.length > 0
          ? Math.round((acknowledgements.length / expectedUsers.length) * 100)
          : 0,
      },
    },
  });
});

/**
 * DELETE /api/admin/announcements/:id
 * Delete an announcement
 */
announcementsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");

  // Verify announcement exists
  const announcement = await prisma.announcement.findUnique({
    where: { id },
  });

  if (!announcement) {
    return c.json({ error: { message: "Announcement not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.announcement.delete({
    where: { id },
  });

  return c.json({ data: { success: true } });
});

export { announcementsRouter };
