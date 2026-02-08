import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";

const dataPurgeRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
dataPurgeRouter.use("*", authMiddleware);
dataPurgeRouter.use("*", adminMiddleware);

// Request body schema with confirmation text
const DataPurgeRequestSchema = z.object({
  confirmationText: z.literal("PURGE DATA"),
});

// Response schema for type safety
const DataPurgeResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  deletedCounts: z.object({
    checklistItemPhotos: z.number(),
    checklistItems: z.number(),
    moveOutChecklistPhotos: z.number(),
    moveOutChecklistItems: z.number(),
    moveOutChecklists: z.number(),
    moveOutRequests: z.number(),
    inspectionPhotos: z.number(),
    inspectionItems: z.number(),
    inspections: z.number(),
    payments: z.number(),
    invoices: z.number(),
    serviceRequestComments: z.number(),
    serviceRequestAttachments: z.number(),
    serviceRequests: z.number(),
    unitAssetFiles: z.number(),
    unitAssetLinks: z.number(),
    unitAssets: z.number(),
    tenantDocuments: z.number(),
    announcementAcknowledgements: z.number(),
    announcementReads: z.number(),
    announcements: z.number(),
    invitations: z.number(),
    tenantNotifications: z.number(),
    tenantCommunicationPreferences: z.number(),
    calendarCommunicationHistory: z.number(),
    adminCalendarEvents: z.number(),
    reminderLogs: z.number(),
    showingRequests: z.number(),
    buildingInfos: z.number(),
    tenancies: z.number(),
    units: z.number(),
    properties: z.number(),
    tenantUsers: z.number(),
    emailLogs: z.number(),
    documents: z.number(),
    paymentIntakeLogs: z.number(),
    tenantSessions: z.number(),
    tenantAccounts: z.number(),
    tenantVerifications: z.number(),
  }),
  preservedCounts: z.object({
    adminUsers: z.number(),
    emailTemplates: z.number(),
  }),
});

export type DataPurgeResponse = z.infer<typeof DataPurgeResponseSchema>;

/**
 * POST /api/admin/data-purge
 * Surgically purge all property data while preserving admin accounts and system configuration.
 *
 * IMPORTANT: This is a destructive operation that cannot be undone.
 * Requires admin role and exact confirmation text "PURGE DATA".
 *
 * Preserves:
 * - Admin user accounts (role = 'ADMIN')
 * - EmailTemplate table
 * - NotificationRecipient table
 * - TenantNotificationSettings table
 * - SystemBackup table
 * - DataExport table
 * - Audit logs (AuditLog, SystemAuditLog, TransactionAuditLog)
 * - AutoBackupConfig
 * - SchemaMigrationLog
 * - Settings table
 * - WebhookEvent table
 * - DebugSession table
 */
dataPurgeRouter.post(
  "/",
  zValidator("json", DataPurgeRequestSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    // Double-check admin role (middleware should have already verified this)
    if (user.role !== "ADMIN") {
      return c.json(
        { error: { message: "Forbidden - Admin access required", code: "FORBIDDEN" } },
        403
      );
    }

    // Verify confirmation text
    if (body.confirmationText !== "PURGE DATA") {
      return c.json(
        { error: { message: "Invalid confirmation text. Please type 'PURGE DATA' to confirm.", code: "INVALID_CONFIRMATION" } },
        400
      );
    }

    try {
      // Execute the surgical purge within a transaction
      const result = await prisma.$transaction(async (tx) => {
        const deletedCounts: Record<string, number> = {};

        // 1. ChecklistItemPhoto (depends on ChecklistItem)
        const checklistItemPhotos = await tx.checklistItemPhoto.deleteMany({});
        deletedCounts.checklistItemPhotos = checklistItemPhotos.count;

        // 2. ChecklistItem (depends on Tenancy)
        const checklistItems = await tx.checklistItem.deleteMany({});
        deletedCounts.checklistItems = checklistItems.count;

        // 3. MoveOutChecklistPhoto (depends on MoveOutChecklistItem)
        const moveOutChecklistPhotos = await tx.moveOutChecklistPhoto.deleteMany({});
        deletedCounts.moveOutChecklistPhotos = moveOutChecklistPhotos.count;

        // 4. MoveOutChecklistItem (depends on MoveOutChecklist)
        const moveOutChecklistItems = await tx.moveOutChecklistItem.deleteMany({});
        deletedCounts.moveOutChecklistItems = moveOutChecklistItems.count;

        // 5. MoveOutChecklist (depends on Tenancy)
        const moveOutChecklists = await tx.moveOutChecklist.deleteMany({});
        deletedCounts.moveOutChecklists = moveOutChecklists.count;

        // 6. MoveOutRequest (depends on Tenancy)
        const moveOutRequests = await tx.moveOutRequest.deleteMany({});
        deletedCounts.moveOutRequests = moveOutRequests.count;

        // 7. InspectionPhoto (depends on InspectionItem)
        const inspectionPhotos = await tx.inspectionPhoto.deleteMany({});
        deletedCounts.inspectionPhotos = inspectionPhotos.count;

        // 8. InspectionItem (depends on Inspection)
        const inspectionItems = await tx.inspectionItem.deleteMany({});
        deletedCounts.inspectionItems = inspectionItems.count;

        // 9. Inspection (depends on Tenancy)
        const inspections = await tx.inspection.deleteMany({});
        deletedCounts.inspections = inspections.count;

        // 10. Payment (depends on Invoice/Unit/User)
        const payments = await tx.payment.deleteMany({});
        deletedCounts.payments = payments.count;

        // 11. Invoice (depends on Tenancy)
        const invoices = await tx.invoice.deleteMany({});
        deletedCounts.invoices = invoices.count;

        // 12. ServiceRequestComment
        const serviceRequestComments = await tx.serviceRequestComment.deleteMany({});
        deletedCounts.serviceRequestComments = serviceRequestComments.count;

        // 13. ServiceRequestAttachment
        const serviceRequestAttachments = await tx.serviceRequestAttachment.deleteMany({});
        deletedCounts.serviceRequestAttachments = serviceRequestAttachments.count;

        // 14. ServiceRequest (depends on Unit)
        const serviceRequests = await tx.serviceRequest.deleteMany({});
        deletedCounts.serviceRequests = serviceRequests.count;

        // 15. UnitAssetFile
        const unitAssetFiles = await tx.unitAssetFile.deleteMany({});
        deletedCounts.unitAssetFiles = unitAssetFiles.count;

        // 16. UnitAssetLink
        const unitAssetLinks = await tx.unitAssetLink.deleteMany({});
        deletedCounts.unitAssetLinks = unitAssetLinks.count;

        // 17. UnitAsset (depends on Unit)
        const unitAssets = await tx.unitAsset.deleteMany({});
        deletedCounts.unitAssets = unitAssets.count;

        // 18. TenantDocument (depends on User)
        const tenantDocuments = await tx.tenantDocument.deleteMany({});
        deletedCounts.tenantDocuments = tenantDocuments.count;

        // 19. AnnouncementAcknowledgement
        const announcementAcknowledgements = await tx.announcementAcknowledgement.deleteMany({});
        deletedCounts.announcementAcknowledgements = announcementAcknowledgements.count;

        // 20. AnnouncementRead
        const announcementReads = await tx.announcementRead.deleteMany({});
        deletedCounts.announcementReads = announcementReads.count;

        // 21. Announcement
        const announcements = await tx.announcement.deleteMany({});
        deletedCounts.announcements = announcements.count;

        // 22. Invitation
        const invitations = await tx.invitation.deleteMany({});
        deletedCounts.invitations = invitations.count;

        // 23. TenantNotification (tenant-related)
        const tenantNotifications = await tx.tenantNotification.deleteMany({});
        deletedCounts.tenantNotifications = tenantNotifications.count;

        // 24. TenantCommunicationPreference
        const tenantCommunicationPreferences = await tx.tenantCommunicationPreference.deleteMany({});
        deletedCounts.tenantCommunicationPreferences = tenantCommunicationPreferences.count;

        // 25. CalendarCommunicationHistory
        const calendarCommunicationHistory = await tx.calendarCommunicationHistory.deleteMany({});
        deletedCounts.calendarCommunicationHistory = calendarCommunicationHistory.count;

        // 26. AdminCalendarEvent
        const adminCalendarEvents = await tx.adminCalendarEvent.deleteMany({});
        deletedCounts.adminCalendarEvents = adminCalendarEvents.count;

        // 27. ReminderLog
        const reminderLogs = await tx.reminderLog.deleteMany({});
        deletedCounts.reminderLogs = reminderLogs.count;

        // 28. ShowingRequest
        const showingRequests = await tx.showingRequest.deleteMany({});
        deletedCounts.showingRequests = showingRequests.count;

        // 29. BuildingInfo
        const buildingInfos = await tx.buildingInfo.deleteMany({});
        deletedCounts.buildingInfos = buildingInfos.count;

        // 30. Tenancy (depends on Unit and User)
        const tenancies = await tx.tenancy.deleteMany({});
        deletedCounts.tenancies = tenancies.count;

        // 31. Unit (depends on Property)
        const units = await tx.unit.deleteMany({});
        deletedCounts.units = units.count;

        // 32. Property
        const properties = await tx.property.deleteMany({});
        deletedCounts.properties = properties.count;

        // 33. EmailLog - Delete all email logs (not in preserve list)
        const emailLogs = await tx.emailLog.deleteMany({});
        deletedCounts.emailLogs = emailLogs.count;

        // 34. Document (new document management system)
        const documents = await tx.document.deleteMany({});
        deletedCounts.documents = documents.count;

        // 35. PaymentIntakeLog (e-transfer webhook logs)
        const paymentIntakeLogs = await tx.paymentIntakeLog.deleteMany({});
        deletedCounts.paymentIntakeLogs = paymentIntakeLogs.count;

        // 36. Delete Sessions for TENANT users
        const tenantSessions = await tx.session.deleteMany({
          where: {
            user: {
              role: { not: "ADMIN" },
            },
          },
        });
        deletedCounts.tenantSessions = tenantSessions.count;

        // 37. Delete Accounts for TENANT users
        const tenantAccounts = await tx.account.deleteMany({
          where: {
            user: {
              role: { not: "ADMIN" },
            },
          },
        });
        deletedCounts.tenantAccounts = tenantAccounts.count;

        // 38. Delete Verifications for TENANT users
        const tenantVerifications = await tx.verification.deleteMany({});
        deletedCounts.tenantVerifications = tenantVerifications.count;

        // 39. Delete TENANT users only (role !== 'ADMIN')
        const tenantUsers = await tx.user.deleteMany({
          where: {
            role: { not: "ADMIN" },
          },
        });
        deletedCounts.tenantUsers = tenantUsers.count;

        // Count preserved items
        const adminUsersCount = await tx.user.count({
          where: { role: "ADMIN" },
        });

        const emailTemplatesCount = await tx.emailTemplate.count();

        return {
          deletedCounts,
          preservedCounts: {
            adminUsers: adminUsersCount,
            emailTemplates: emailTemplatesCount,
          },
        };
      });

      // Create audit log entry
      await prisma.systemAuditLog.create({
        data: {
          adminUserId: user.id,
          action: "PURGE_DATA",
          category: "system",
          description: `System data purged by ${user.email}`,
          metadata: JSON.stringify({
            deletedCounts: result.deletedCounts,
            preservedCounts: result.preservedCounts,
          }),
          ipAddress: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null,
          userAgent: c.req.header("user-agent") || null,
          success: true,
        },
      });

      return c.json({
        data: {
          success: true,
          message: "All property data has been cleared. Admin accounts and email templates preserved.",
          deletedCounts: result.deletedCounts,
          preservedCounts: result.preservedCounts,
        },
      });
    } catch (error) {
      // Log failed purge attempt
      try {
        await prisma.systemAuditLog.create({
          data: {
            adminUserId: user.id,
            action: "PURGE_DATA",
            category: "system",
            description: `System data purge FAILED by ${user.email}`,
            metadata: JSON.stringify({
              error: error instanceof Error ? error.message : "Unknown error",
            }),
            ipAddress: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null,
            userAgent: c.req.header("user-agent") || null,
            success: false,
            errorMessage: error instanceof Error ? error.message : "Unknown error",
          },
        });
      } catch (auditError) {
        // If audit logging fails, log to console
        console.error("Failed to create audit log for failed purge:", auditError);
      }

      console.error("Data purge failed:", error);
      return c.json(
        {
          error: {
            message: "Failed to purge data. The operation has been rolled back.",
            code: "PURGE_FAILED",
            details: error instanceof Error ? error.message : "Unknown error",
          },
        },
        500
      );
    }
  }
);

export default dataPurgeRouter;
