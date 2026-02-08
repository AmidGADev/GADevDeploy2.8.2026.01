import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { env } from "../../env";

const emailSettings = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
emailSettings.use("*", authMiddleware);
emailSettings.use("*", adminMiddleware);

// Schema for updating email settings
const UpdateEmailSettingsSchema = z.object({
  senderName: z.string().min(1).max(100).optional(),
  senderEmail: z.string().email().optional(),
  replyToEmail: z.string().email().nullable().optional(),
});

/**
 * GET /api/admin/email-settings
 * Get current email settings
 */
emailSettings.get("/", async (c) => {
  // Get or create default settings
  let settings = await prisma.emailSettings.findUnique({
    where: { id: "default" },
    include: { updatedBy: { select: { id: true, name: true, email: true } } }
  });

  if (!settings) {
    settings = await prisma.emailSettings.create({
      data: { id: "default" },
      include: { updatedBy: { select: { id: true, name: true, email: true } } }
    });
  }

  // Check if domain is verified (compare against FROM_EMAIL env var domain)
  const fromEmailEnv = env.FROM_EMAIL || "";
  const fromDomain = fromEmailEnv.split("@")[1] || "";
  const settingsDomain = settings.senderEmail.split("@")[1] || "";

  const isVerified = fromDomain && settingsDomain &&
    (fromDomain === settingsDomain || fromDomain.endsWith(`.${settingsDomain}`) || settingsDomain.endsWith(`.${fromDomain}`));

  return c.json({
    data: {
      id: settings.id,
      senderName: settings.senderName,
      senderEmail: settings.senderEmail,
      replyToEmail: settings.replyToEmail,
      verificationStatus: isVerified ? "verified" : "pending",
      verifiedDomain: fromDomain || null,
      updatedAt: settings.updatedAt.toISOString(),
      updatedBy: settings.updatedBy,
    }
  });
});

/**
 * PUT /api/admin/email-settings
 * Update email settings
 */
emailSettings.put("/", zValidator("json", UpdateEmailSettingsSchema), async (c) => {
  const user = c.get("user");
  const { senderName, senderEmail, replyToEmail } = c.req.valid("json");

  const settings = await prisma.emailSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      senderName: senderName || "GA Developments",
      senderEmail: senderEmail || "info@gadevelopments.ca",
      replyToEmail: replyToEmail,
      updatedById: user.id,
    },
    update: {
      ...(senderName !== undefined && { senderName }),
      ...(senderEmail !== undefined && { senderEmail }),
      ...(replyToEmail !== undefined && { replyToEmail }),
      updatedById: user.id,
    },
    include: { updatedBy: { select: { id: true, name: true, email: true } } }
  });

  // Check verification status
  const fromEmailEnv = env.FROM_EMAIL || "";
  const fromDomain = fromEmailEnv.split("@")[1] || "";
  const settingsDomain = settings.senderEmail.split("@")[1] || "";
  const isVerified = fromDomain && settingsDomain &&
    (fromDomain === settingsDomain || fromDomain.endsWith(`.${settingsDomain}`) || settingsDomain.endsWith(`.${fromDomain}`));

  return c.json({
    data: {
      id: settings.id,
      senderName: settings.senderName,
      senderEmail: settings.senderEmail,
      replyToEmail: settings.replyToEmail,
      verificationStatus: isVerified ? "verified" : "pending",
      verifiedDomain: fromDomain || null,
      updatedAt: settings.updatedAt.toISOString(),
      updatedBy: settings.updatedBy,
    }
  });
});

export default emailSettings;
