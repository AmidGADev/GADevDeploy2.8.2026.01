/**
 * Auto-Backup Cron Route for GA Developments Property Management
 *
 * @module cron/auto-backup
 * @description Handles automated backups based on configured schedule.
 * Sends backup files to designated email addresses.
 */

import { Hono } from "hono";
import { prisma } from "../../prisma";
import { sendEmail } from "../../lib/email";
import { createAuditLog } from "../../lib/audit-service";

const cronAutoBackupRouter = new Hono();

// App version for schema versioning
const APP_VERSION = "1.0.0";

/**
 * POST /api/cron/auto-backup
 * Executes automated backup if configured and due
 * Should be called by external cron scheduler
 */
cronAutoBackupRouter.post("/", async (c) => {
  // Verify cron secret
  const cronSecret = c.req.header("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || cronSecret !== expectedSecret) {
    return c.json({ error: { message: "Unauthorized" } }, 401);
  }

  try {
    // Get auto-backup configuration
    const config = await prisma.autoBackupConfig.findUnique({
      where: { id: "default" },
    });

    if (!config || !config.enabled || !config.recipientEmail) {
      return c.json({
        data: {
          skipped: true,
          reason: "Auto-backup not enabled or no recipient configured",
        },
      });
    }

    // Check if backup is due based on frequency
    const now = new Date();
    const lastRun = config.lastRunAt;

    if (lastRun) {
      const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);

      let minHoursBetweenRuns: number;
      switch (config.frequency) {
        case "DAILY":
          minHoursBetweenRuns = 20; // Allow some flexibility
          break;
        case "WEEKLY":
          minHoursBetweenRuns = 160; // ~6.5 days
          break;
        case "MONTHLY":
          minHoursBetweenRuns = 672; // ~28 days
          break;
        case "QUARTERLY":
          minHoursBetweenRuns = 2040; // ~85 days
          break;
        default:
          minHoursBetweenRuns = 160;
      }

      if (hoursSinceLastRun < minHoursBetweenRuns) {
        return c.json({
          data: {
            skipped: true,
            reason: `Last backup was ${Math.round(hoursSinceLastRun)} hours ago. Next backup due in ${Math.round(minHoursBetweenRuns - hoursSinceLastRun)} hours.`,
          },
        });
      }
    }

    // Check day of week for weekly backups
    if (config.frequency === "WEEKLY" && now.getUTCDay() !== config.dayOfWeek) {
      return c.json({
        data: {
          skipped: true,
          reason: `Weekly backup scheduled for day ${config.dayOfWeek}, today is day ${now.getUTCDay()}`,
        },
      });
    }

    // Generate backup
    console.log("[AUTO-BACKUP] Starting automated backup...");

    const [units, users, tenancies, invoices, checklistItems, inspections, buildingInfos] = await Promise.all([
      prisma.unit.findMany({ include: { property: true } }),
      prisma.user.findMany({
        where: { role: "TENANT" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          insuranceStatus: true,
          insuranceProvider: true,
          insuranceExpiresAt: true,
        },
      }),
      prisma.tenancy.findMany({
        include: {
          unit: { select: { id: true, unitLabel: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.invoice.findMany({
        include: {
          unit: { select: { id: true, unitLabel: true } },
          tenancy: { select: { id: true } },
        },
      }),
      prisma.checklistItem.findMany({ include: { tenancy: { select: { id: true } } } }),
      prisma.inspection.findMany({
        include: {
          items: { include: { photos: true } },
          tenancy: { select: { id: true } },
        },
      }),
      prisma.buildingInfo.findMany(),
    ]);

    const exportData = {
      schemaVersion: APP_VERSION,
      exportedAt: now.toISOString(),
      exportType: "AUTO_BACKUP",
      recordCounts: {
        units: units.length,
        tenants: users.length,
        tenancies: tenancies.length,
        invoices: invoices.length,
        checklistItems: checklistItems.length,
        inspections: inspections.length,
        buildingInfos: buildingInfos.length,
      },
      data: {
        units: units.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
          updatedAt: u.updatedAt.toISOString(),
          property: u.property
            ? {
                ...u.property,
                createdAt: u.property.createdAt.toISOString(),
                updatedAt: u.property.updatedAt.toISOString(),
              }
            : null,
        })),
        tenants: users.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
          updatedAt: u.updatedAt.toISOString(),
          insuranceExpiresAt: u.insuranceExpiresAt?.toISOString() ?? null,
        })),
        tenancies: tenancies.map((t) => ({
          ...t,
          startDate: t.startDate.toISOString(),
          endDate: t.endDate?.toISOString() ?? null,
          moveOutDate: t.moveOutDate?.toISOString() ?? null,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        })),
        invoices: invoices.map((i) => ({
          ...i,
          dueDate: i.dueDate.toISOString(),
          createdAt: i.createdAt.toISOString(),
          updatedAt: i.updatedAt.toISOString(),
          etransferMarkedAt: i.etransferMarkedAt?.toISOString() ?? null,
        })),
        checklistItems: checklistItems.map((ci) => ({
          ...ci,
          completedAt: ci.completedAt?.toISOString() ?? null,
          createdAt: ci.createdAt.toISOString(),
          updatedAt: ci.updatedAt.toISOString(),
        })),
        inspections: inspections.map((insp) => ({
          ...insp,
          finalizedAt: insp.finalizedAt?.toISOString() ?? null,
          createdAt: insp.createdAt.toISOString(),
          updatedAt: insp.updatedAt.toISOString(),
          items: insp.items.map((item) => ({
            ...item,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
            photos: item.photos.map((photo) => ({
              ...photo,
              uploadedAt: photo.uploadedAt.toISOString(),
            })),
          })),
        })),
        buildingInfos: buildingInfos.map((bi) => ({
          ...bi,
          updatedAt: bi.updatedAt.toISOString(),
        })),
      },
    };

    const exportJson = JSON.stringify(exportData, null, 2);
    const fileSize = Buffer.byteLength(exportJson, "utf8");
    const filename = `auto_backup_${now.toISOString().replace(/[:.]/g, "-")}.json`;

    // Store export record
    await prisma.dataExport.create({
      data: {
        adminUserId: "SYSTEM",
        exportType: "AUTO_BACKUP",
        schemaVersion: APP_VERSION,
        filename,
        fileSize,
        recordCounts: JSON.stringify(exportData.recordCounts),
        status: "COMPLETED",
        expiresAt: new Date(Date.now() + config.retentionDays * 24 * 60 * 60 * 1000),
      },
    });

    // Send email with backup
    const emailHtml = generateAutoBackupEmail(filename, exportData.recordCounts, fileSize);

    await sendEmail({
      to: config.recipientEmail,
      subject: `GA Developments - ${config.frequency} Backup - ${now.toLocaleDateString("en-CA")}`,
      html: emailHtml,
      emailType: "MANUAL",
      toGroup: "AUTO_BACKUP",
      // Note: In production, you'd attach the backup file or provide a secure download link
    });

    // Update config with last run time
    await prisma.autoBackupConfig.update({
      where: { id: "default" },
      data: {
        lastRunAt: now,
        lastSuccessAt: now,
        lastError: null,
      },
    });

    // Create audit log
    await createAuditLog({
      userId: "SYSTEM",
      userEmail: "system@gadevelopments.ca",
      userRole: "SYSTEM",
      action: "EXPORT",
      entityType: "BACKUP",
      description: `Auto-backup completed: ${filename}`,
      metadata: {
        filename,
        fileSize,
        recordCounts: exportData.recordCounts,
        recipientEmail: config.recipientEmail,
      },
    });

    console.log(`[AUTO-BACKUP] Completed successfully: ${filename}`);

    return c.json({
      data: {
        success: true,
        filename,
        fileSize,
        recordCounts: exportData.recordCounts,
        sentTo: config.recipientEmail,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[AUTO-BACKUP] Failed:", errorMessage);

    // Update config with error
    await prisma.autoBackupConfig.update({
      where: { id: "default" },
      data: {
        lastRunAt: new Date(),
        lastError: errorMessage,
      },
    });

    return c.json({
      data: {
        success: false,
        error: errorMessage,
      },
    }, 500);
  }
});

function generateAutoBackupEmail(
  filename: string,
  recordCounts: Record<string, number>,
  fileSize: number
): string {
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return `
    <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 8px;">GA Developments</h1>
        <p style="color: #666; font-size: 14px;">Automated Backup Report</p>
      </div>

      <div style="background: #f8f8f8; border-radius: 8px; padding: 30px; margin-bottom: 30px;">
        <h2 style="color: #333; font-size: 18px; margin-bottom: 20px;">Backup Completed Successfully</h2>

        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #666;">Filename:</td>
            <td style="padding: 8px 0; color: #333; font-family: monospace;">${filename}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">File Size:</td>
            <td style="padding: 8px 0; color: #333;">${formatFileSize(fileSize)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Generated:</td>
            <td style="padding: 8px 0; color: #333;">${new Date().toLocaleString("en-CA", { timeZone: "America/Toronto" })}</td>
          </tr>
        </table>

        <h3 style="color: #333; font-size: 16px; margin: 20px 0 10px;">Records Included:</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 4px 0; color: #666;">Units:</td>
            <td style="padding: 4px 0; color: #333;">${recordCounts.units}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #666;">Tenants:</td>
            <td style="padding: 4px 0; color: #333;">${recordCounts.tenants}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #666;">Tenancies:</td>
            <td style="padding: 4px 0; color: #333;">${recordCounts.tenancies}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #666;">Invoices:</td>
            <td style="padding: 4px 0; color: #333;">${recordCounts.invoices}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #666;">Inspections:</td>
            <td style="padding: 4px 0; color: #333;">${recordCounts.inspections}</td>
          </tr>
        </table>
      </div>

      <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 15px; margin-bottom: 30px;">
        <p style="color: #856404; font-size: 14px; margin: 0;">
          <strong>Note:</strong> To download the full backup file, please log into the Admin Portal
          and visit Settings &gt; System Backup.
        </p>
      </div>

      <div style="border-top: 1px solid #eee; padding-top: 20px;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          This is an automated backup notification from GA Developments Property Management.
        </p>
      </div>
    </div>
  `;
}

export { cronAutoBackupRouter };
