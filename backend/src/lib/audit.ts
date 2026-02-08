import { prisma } from "../prisma";

/**
 * Log an admin action to the audit log
 */
export async function logAuditAction(params: {
  adminUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      adminUserId: params.adminUserId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadataJson: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });
}

/**
 * Common audit actions
 */
export const AuditActions = {
  // Invitation actions
  INVITATION_CREATE: "INVITATION_CREATE",
  INVITATION_DELETE: "INVITATION_DELETE",
  INVITATION_RESEND: "INVITATION_RESEND",
  INVITATION_ACCEPT: "INVITATION_ACCEPT",

  // User actions
  USER_CREATE: "USER_CREATE",
  USER_UPDATE: "USER_UPDATE",
  USER_DELETE: "USER_DELETE",
  USER_DEACTIVATE: "USER_DEACTIVATE",
  USER_REACTIVATE: "USER_REACTIVATE",
  USER_SOFT_DELETE: "USER_SOFT_DELETE",
  USER_PERMANENT_DELETE: "USER_PERMANENT_DELETE",

  // Unit actions
  UNIT_CREATE: "UNIT_CREATE",
  UNIT_UPDATE: "UNIT_UPDATE",
  UNIT_DELETE: "UNIT_DELETE",

  // Tenancy actions
  TENANCY_CREATE: "TENANCY_CREATE",
  TENANCY_END: "TENANCY_END",
  TENANCY_MOVE_OUT: "TENANCY_MOVE_OUT",
  TENANT_PROMOTE: "TENANT_PROMOTE",

  // e-Transfer actions
  ETRANSFER_APPROVE: "ETRANSFER_APPROVE",
  ETRANSFER_REJECT: "ETRANSFER_REJECT",
  ETRANSFER_MARKED: "ETRANSFER_MARKED",

  // Settings actions
  SETTINGS_UPDATE: "SETTINGS_UPDATE",

  // Insurance actions
  INSURANCE_APPROVE: "INSURANCE_APPROVE",
  INSURANCE_REJECT: "INSURANCE_REJECT",
  INSURANCE_REMINDER_SENT: "INSURANCE_REMINDER_SENT",

  // Document actions
  DOCUMENT_UPLOAD: "DOCUMENT_UPLOAD",
  DOCUMENT_DELETE: "DOCUMENT_DELETE",
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];
