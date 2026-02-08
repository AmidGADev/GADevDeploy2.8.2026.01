import { prisma } from "../prisma";
import { env } from "../env";
import { unlink, access, constants } from "fs/promises";
import path from "path";

const UPLOADS_BASE = env.UPLOADS_DIR || path.resolve(process.cwd(), "uploads");

/**
 * Safely delete a file if it exists
 * Returns true if file was deleted, false if it didn't exist
 */
async function safeDeleteFile(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    await unlink(filePath);
    console.log(`[FILE CLEANUP] Deleted: ${filePath}`);
    return true;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      // File doesn't exist, that's fine
      return false;
    }
    console.error(`[FILE CLEANUP] Error deleting ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Extract filename from a file URL or path
 */
function extractFilename(fileUrl: string): string | null {
  if (!fileUrl) return null;
  // Handle both URLs and plain filenames
  if (fileUrl.startsWith("http")) {
    try {
      const url = new URL(fileUrl);
      const parts = url.pathname.split("/");
      return parts[parts.length - 1] || null;
    } catch {
      return null;
    }
  }
  // Plain filename or relative path
  return path.basename(fileUrl);
}

interface FileCleanupResult {
  deleted: number;
  failed: number;
  notFound: number;
  details: Array<{
    path: string;
    status: "deleted" | "failed" | "not_found";
  }>;
}

/**
 * Delete all files associated with a user
 * This includes:
 * - Insurance documents (User.insuranceDocumentUrl)
 * - Tenant documents (TenantDocument.fileUrl)
 * - Service request attachments (ServiceRequestAttachment.fileUrl)
 * - Checklist photos (ChecklistItemPhoto.storageKey via tenancy)
 * - Move-out checklist photos (MoveOutChecklistPhoto.storageKey via tenancy)
 */
export async function deleteUserFiles(userId: string): Promise<FileCleanupResult> {
  const result: FileCleanupResult = {
    deleted: 0,
    failed: 0,
    notFound: 0,
    details: [],
  };

  // 1. Get user's insurance document
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { insuranceDocumentUrl: true },
  });

  if (user?.insuranceDocumentUrl) {
    const filename = extractFilename(user.insuranceDocumentUrl);
    if (filename) {
      const filePath = path.join(UPLOADS_BASE, "insurance", filename);
      const deleted = await safeDeleteFile(filePath);
      if (deleted) {
        result.deleted++;
        result.details.push({ path: filePath, status: "deleted" });
      } else {
        result.notFound++;
        result.details.push({ path: filePath, status: "not_found" });
      }
    }
  }

  // 2. Get user's tenant documents
  const tenantDocs = await prisma.tenantDocument.findMany({
    where: { userId },
    select: { fileUrl: true },
  });

  for (const doc of tenantDocs) {
    const filename = extractFilename(doc.fileUrl);
    if (filename) {
      const filePath = path.join(UPLOADS_BASE, "tenant-documents", filename);
      const deleted = await safeDeleteFile(filePath);
      if (deleted) {
        result.deleted++;
        result.details.push({ path: filePath, status: "deleted" });
      } else {
        result.notFound++;
        result.details.push({ path: filePath, status: "not_found" });
      }
    }
  }

  // 3. Get service request attachments created by user
  const serviceRequests = await prisma.serviceRequest.findMany({
    where: { createdById: userId },
    include: {
      attachments: {
        select: { fileUrl: true },
      },
    },
  });

  for (const sr of serviceRequests) {
    for (const attachment of sr.attachments) {
      const filename = extractFilename(attachment.fileUrl);
      if (filename) {
        const filePath = path.join(UPLOADS_BASE, "service-requests", filename);
        const deleted = await safeDeleteFile(filePath);
        if (deleted) {
          result.deleted++;
          result.details.push({ path: filePath, status: "deleted" });
        } else {
          result.notFound++;
          result.details.push({ path: filePath, status: "not_found" });
        }
      }
    }
  }

  // 4. Get checklist photos from user's tenancies
  const tenancies = await prisma.tenancy.findMany({
    where: { userId },
    include: {
      checklistItems: {
        include: {
          photos: {
            select: { storageKey: true },
          },
        },
      },
      moveOutChecklist: {
        include: {
          items: {
            include: {
              photos: {
                select: { storageKey: true },
              },
            },
          },
        },
      },
    },
  });

  for (const tenancy of tenancies) {
    // Move-in checklist photos
    for (const item of tenancy.checklistItems) {
      for (const photo of item.photos) {
        const filePath = path.join(UPLOADS_BASE, "checklist-photos", photo.storageKey);
        const deleted = await safeDeleteFile(filePath);
        if (deleted) {
          result.deleted++;
          result.details.push({ path: filePath, status: "deleted" });
        } else {
          result.notFound++;
          result.details.push({ path: filePath, status: "not_found" });
        }
      }
    }

    // Move-out checklist photos
    if (tenancy.moveOutChecklist) {
      for (const item of tenancy.moveOutChecklist.items) {
        for (const photo of item.photos) {
          const filePath = path.join(UPLOADS_BASE, "checklist-photos", photo.storageKey);
          const deleted = await safeDeleteFile(filePath);
          if (deleted) {
            result.deleted++;
            result.details.push({ path: filePath, status: "deleted" });
          } else {
            result.notFound++;
            result.details.push({ path: filePath, status: "not_found" });
          }
        }
      }
    }
  }

  console.log(
    `[FILE CLEANUP] User ${userId}: ${result.deleted} deleted, ${result.notFound} not found, ${result.failed} failed`
  );

  return result;
}

/**
 * Get a summary of files associated with a user (for preview before deletion)
 */
export async function getUserFilesSummary(
  userId: string
): Promise<{
  insuranceDocuments: number;
  tenantDocuments: number;
  serviceRequestAttachments: number;
  checklistPhotos: number;
  moveOutChecklistPhotos: number;
  total: number;
}> {
  // Insurance document
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { insuranceDocumentUrl: true },
  });
  const insuranceDocuments = user?.insuranceDocumentUrl ? 1 : 0;

  // Tenant documents
  const tenantDocuments = await prisma.tenantDocument.count({
    where: { userId },
  });

  // Service request attachments
  const attachments = await prisma.serviceRequestAttachment.count({
    where: {
      serviceRequest: {
        createdById: userId,
      },
    },
  });

  // Checklist photos
  const checklistPhotos = await prisma.checklistItemPhoto.count({
    where: {
      checklistItem: {
        tenancy: {
          userId,
        },
      },
    },
  });

  // Move-out checklist photos
  const moveOutChecklistPhotos = await prisma.moveOutChecklistPhoto.count({
    where: {
      item: {
        checklist: {
          tenancy: {
            userId,
          },
        },
      },
    },
  });

  return {
    insuranceDocuments,
    tenantDocuments,
    serviceRequestAttachments: attachments,
    checklistPhotos,
    moveOutChecklistPhotos,
    total:
      insuranceDocuments +
      tenantDocuments +
      attachments +
      checklistPhotos +
      moveOutChecklistPhotos,
  };
}
