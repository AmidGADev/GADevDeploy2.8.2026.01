/**
 * Backup Scheduler for GA Developments Property Management
 *
 * @module lib/backup-scheduler
 * @description Handles automated backup scheduling with quarterly support.
 * Checks if a backup is due based on configured frequency and executes backups.
 */

import { prisma } from "../prisma";
import { sendEmail } from "./email";
import { createAuditLog } from "./audit-service";
import type { AutoBackupConfig } from "@prisma/client";

// App version for schema versioning
const APP_VERSION = "1.0.0";

// Frequency to days mapping
const FREQUENCY_DAYS: Record<string, number> = {
  DAILY: 1,
  WEEKLY: 7,
  MONTHLY: 30,
  QUARTERLY: 90,
};

/**
 * Check if a scheduled backup is due and run it if necessary.
 * This function should be called periodically (e.g., every hour).
 */
export async function checkAndRunScheduledBackup(): Promise<{
  executed: boolean;
  reason?: string;
  backupId?: string;
  error?: string;
}> {
  try {
    const config = await prisma.autoBackupConfig.findUnique({
      where: { id: "default" },
    });

    if (!config?.enabled) {
      return { executed: false, reason: "Auto-backup not enabled" };
    }

    if (!config.recipientEmail) {
      return { executed: false, reason: "No recipient email configured" };
    }

    // Calculate days since last run
    const daysSinceLastRun = config.lastRunAt
      ? (Date.now() - config.lastRunAt.getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    const requiredDays = FREQUENCY_DAYS[config.frequency] || 7;

    // Check if backup is due
    if (daysSinceLastRun < requiredDays) {
      const daysUntilNext = Math.ceil(requiredDays - daysSinceLastRun);
      return {
        executed: false,
        reason: `Backup not due yet. Next backup in ${daysUntilNext} day(s).`,
      };
    }

    // For weekly/monthly backups, check day of week
    const now = new Date();
    if (config.frequency === "WEEKLY" && now.getUTCDay() !== config.dayOfWeek) {
      return {
        executed: false,
        reason: `Weekly backup scheduled for day ${config.dayOfWeek}, today is day ${now.getUTCDay()}`,
      };
    }

    // Execute the backup
    const result = await executeScheduledBackup(config);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[BACKUP-SCHEDULER] Error:", errorMessage);
    return { executed: false, error: errorMessage };
  }
}

/**
 * Execute a scheduled backup
 */
async function executeScheduledBackup(config: AutoBackupConfig): Promise<{
  executed: boolean;
  backupId?: string;
  error?: string;
}> {
  const now = new Date();

  // Create SystemBackup record with PENDING status
  const backup = await prisma.systemBackup.create({
    data: {
      triggerType: "AUTOMATIC",
      status: "PENDING",
      startedAt: now,
      createdById: null, // null for automatic backups
    },
  });

  try {
    // Update status to IN_PROGRESS
    await prisma.systemBackup.update({
      where: { id: backup.id },
      data: { status: "IN_PROGRESS" },
    });

    console.log(`[BACKUP-SCHEDULER] Starting automated backup ${backup.id}...`);

    // Generate backup data
    const [units, users, tenancies, invoices, checklistItems, inspections, buildingInfos] =
      await Promise.all([
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

    const recordCounts = {
      units: units.length,
      tenants: users.length,
      tenancies: tenancies.length,
      invoices: invoices.length,
      checklistItems: checklistItems.length,
      inspections: inspections.length,
      buildingInfos: buildingInfos.length,
    };

    const exportData = {
      schemaVersion: APP_VERSION,
      exportedAt: now.toISOString(),
      exportType: "AUTOMATIC",
      recordCounts,
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
    const filename = `backup_${config.frequency.toLowerCase()}_${now.toISOString().replace(/[:.]/g, "-")}.json`;

    // Update SystemBackup record with completed status
    await prisma.systemBackup.update({
      where: { id: backup.id },
      data: {
        status: "COMPLETED",
        filename,
        fileSize,
        recordCounts: JSON.stringify(recordCounts),
        schemaVersion: APP_VERSION,
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + config.retentionDays * 24 * 60 * 60 * 1000),
      },
    });

    // Also create DataExport record for compatibility
    await prisma.dataExport.create({
      data: {
        adminUserId: "SYSTEM",
        exportType: "AUTO_BACKUP",
        schemaVersion: APP_VERSION,
        filename,
        fileSize,
        recordCounts: JSON.stringify(recordCounts),
        status: "COMPLETED",
        expiresAt: new Date(Date.now() + config.retentionDays * 24 * 60 * 60 * 1000),
      },
    });

    // Send email notification
    if (config.recipientEmail) {
      const emailHtml = generateBackupEmailHtml(filename, recordCounts, fileSize, config.frequency);

      await sendEmail({
        to: config.recipientEmail,
        subject: `GA Developments - ${config.frequency} Backup - ${now.toLocaleDateString("en-CA")}`,
        html: emailHtml,
        emailType: "MANUAL",
        toGroup: "AUTO_BACKUP",
      });
    }

    // Update AutoBackupConfig
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
      description: `Automated ${config.frequency.toLowerCase()} backup completed: ${filename}`,
      metadata: {
        backupId: backup.id,
        filename,
        fileSize,
        recordCounts,
        recipientEmail: config.recipientEmail,
      },
    });

    console.log(`[BACKUP-SCHEDULER] Backup ${backup.id} completed successfully: ${filename}`);

    return { executed: true, backupId: backup.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Update SystemBackup record with failed status
    await prisma.systemBackup.update({
      where: { id: backup.id },
      data: {
        status: "FAILED",
        errorMessage,
        completedAt: new Date(),
      },
    });

    // Update AutoBackupConfig with error
    await prisma.autoBackupConfig.update({
      where: { id: "default" },
      data: {
        lastRunAt: new Date(),
        lastError: errorMessage,
      },
    });

    console.error(`[BACKUP-SCHEDULER] Backup ${backup.id} failed:`, errorMessage);

    return { executed: false, backupId: backup.id, error: errorMessage };
  }
}

/**
 * Manually trigger a backup (for admin use)
 */
export async function triggerManualBackup(userId: string): Promise<{
  success: boolean;
  backupId?: string;
  error?: string;
}> {
  const now = new Date();

  // Create SystemBackup record
  const backup = await prisma.systemBackup.create({
    data: {
      triggerType: "MANUAL",
      status: "PENDING",
      startedAt: now,
      createdById: userId,
    },
  });

  try {
    // Update status to IN_PROGRESS
    await prisma.systemBackup.update({
      where: { id: backup.id },
      data: { status: "IN_PROGRESS" },
    });

    console.log(`[BACKUP-SCHEDULER] Starting manual backup ${backup.id}...`);

    // Generate backup data (same as scheduled backup)
    const [units, users, tenancies, invoices, checklistItems, inspections, buildingInfos] =
      await Promise.all([
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

    const recordCounts = {
      units: units.length,
      tenants: users.length,
      tenancies: tenancies.length,
      invoices: invoices.length,
      checklistItems: checklistItems.length,
      inspections: inspections.length,
      buildingInfos: buildingInfos.length,
    };

    const exportData = {
      schemaVersion: APP_VERSION,
      exportedAt: now.toISOString(),
      exportType: "MANUAL",
      recordCounts,
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
    const filename = `backup_manual_${now.toISOString().replace(/[:.]/g, "-")}.json`;

    // Get retention days from config
    const config = await prisma.autoBackupConfig.findUnique({
      where: { id: "default" },
    });
    const retentionDays = config?.retentionDays ?? 30;

    // Update SystemBackup record with completed status
    await prisma.systemBackup.update({
      where: { id: backup.id },
      data: {
        status: "COMPLETED",
        filename,
        fileSize,
        recordCounts: JSON.stringify(recordCounts),
        schemaVersion: APP_VERSION,
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
      },
    });

    // Get user info for audit
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, role: true },
    });

    // Create audit log
    await createAuditLog({
      userId,
      userEmail: user?.email ?? "unknown",
      userRole: user?.role ?? "ADMIN",
      action: "EXPORT",
      entityType: "BACKUP",
      description: `Manual backup triggered: ${filename}`,
      metadata: {
        backupId: backup.id,
        filename,
        fileSize,
        recordCounts,
      },
    });

    console.log(`[BACKUP-SCHEDULER] Manual backup ${backup.id} completed: ${filename}`);

    return { success: true, backupId: backup.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Update SystemBackup record with failed status
    await prisma.systemBackup.update({
      where: { id: backup.id },
      data: {
        status: "FAILED",
        errorMessage,
        completedAt: new Date(),
      },
    });

    console.error(`[BACKUP-SCHEDULER] Manual backup ${backup.id} failed:`, errorMessage);

    return { success: false, backupId: backup.id, error: errorMessage };
  }
}

/**
 * Generate HTML email content for backup notification
 */
function generateBackupEmailHtml(
  filename: string,
  recordCounts: Record<string, number>,
  fileSize: number,
  frequency: string
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
        <p style="color: #666; font-size: 14px;">${frequency} Automated Backup Report</p>
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
          <tr>
            <td style="padding: 4px 0; color: #666;">Checklist Items:</td>
            <td style="padding: 4px 0; color: #333;">${recordCounts.checklistItems}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #666;">Building Infos:</td>
            <td style="padding: 4px 0; color: #333;">${recordCounts.buildingInfos}</td>
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
          This is an automated ${frequency.toLowerCase()} backup notification from GA Developments Property Management.
        </p>
      </div>
    </div>
  `;
}

// Scheduler interval reference (for cleanup)
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Initialize the backup scheduler
 * Runs checkAndRunScheduledBackup every hour
 */
export function initBackupScheduler(): void {
  if (schedulerInterval) {
    console.log("[BACKUP-SCHEDULER] Scheduler already initialized");
    return;
  }

  console.log("[BACKUP-SCHEDULER] Initializing backup scheduler (runs every hour)");

  // Run immediately on startup (with a small delay)
  setTimeout(() => {
    checkAndRunScheduledBackup().catch((err) => {
      console.error("[BACKUP-SCHEDULER] Initial check failed:", err);
    });
  }, 5000);

  // Then run every hour (3600000 ms)
  schedulerInterval = setInterval(() => {
    checkAndRunScheduledBackup().catch((err) => {
      console.error("[BACKUP-SCHEDULER] Scheduled check failed:", err);
    });
  }, 3600000);
}

/**
 * Stop the backup scheduler
 */
export function stopBackupScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[BACKUP-SCHEDULER] Scheduler stopped");
  }
}
