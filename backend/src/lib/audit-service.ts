/**
 * Transaction Audit Logging Service for GA Developments Property Management
 *
 * @module audit-service
 * @description Provides comprehensive audit trail for all sensitive operations
 * including invoices, leases, units, payments, and administrative actions.
 */

import { prisma } from "../prisma";

/**
 * Audit log action types
 */
export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "VIEW_SENSITIVE"
  | "EXPORT"
  | "IMPORT"
  | "LOGIN"
  | "LOGOUT"
  | "MFA_VERIFY"
  | "MFA_FAIL"
  | "PERMISSION_DENIED";

/**
 * Auditable entity types
 */
export type AuditEntityType =
  | "INVOICE"
  | "TENANCY"
  | "UNIT"
  | "PAYMENT"
  | "USER"
  | "BACKUP"
  | "SETTINGS"
  | "ANNOUNCEMENT"
  | "SERVICE_REQUEST"
  | "CHECKLIST"
  | "SESSION";

/**
 * Audit log entry interface
 */
interface AuditLogEntry {
  userId: string;
  userEmail: string;
  userRole: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  description: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Creates an audit log entry for a transaction
 *
 * @param {AuditLogEntry} entry - The audit log entry to create
 * @returns {Promise<string>} The created audit log ID
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<string> {
  try {
    const log = await prisma.transactionAuditLog.create({
      data: {
        userId: entry.userId,
        userEmail: entry.userEmail,
        userRole: entry.userRole,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId || null,
        description: entry.description,
        oldValue: entry.oldValue ? JSON.stringify(entry.oldValue) : null,
        newValue: entry.newValue ? JSON.stringify(entry.newValue) : null,
        ipAddress: entry.ipAddress || null,
        userAgent: entry.userAgent || null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      },
    });

    return log.id;
  } catch (error) {
    // Log to console but don't fail the main operation
    console.error("[AUDIT] Failed to create audit log:", error);
    return "";
  }
}

/**
 * Logs an invoice-related action
 */
export async function auditInvoiceAction(
  action: AuditAction,
  invoiceId: string,
  user: { id: string; email: string; role: string },
  description: string,
  oldValue?: unknown,
  newValue?: unknown,
  request?: { ipAddress?: string; userAgent?: string }
): Promise<void> {
  await createAuditLog({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action,
    entityType: "INVOICE",
    entityId: invoiceId,
    description,
    oldValue,
    newValue,
    ipAddress: request?.ipAddress,
    userAgent: request?.userAgent,
  });
}

/**
 * Logs a tenancy/lease-related action
 */
export async function auditTenancyAction(
  action: AuditAction,
  tenancyId: string,
  user: { id: string; email: string; role: string },
  description: string,
  oldValue?: unknown,
  newValue?: unknown,
  request?: { ipAddress?: string; userAgent?: string }
): Promise<void> {
  await createAuditLog({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action,
    entityType: "TENANCY",
    entityId: tenancyId,
    description,
    oldValue,
    newValue,
    ipAddress: request?.ipAddress,
    userAgent: request?.userAgent,
  });
}

/**
 * Logs a unit-related action
 */
export async function auditUnitAction(
  action: AuditAction,
  unitId: string,
  user: { id: string; email: string; role: string },
  description: string,
  oldValue?: unknown,
  newValue?: unknown,
  request?: { ipAddress?: string; userAgent?: string }
): Promise<void> {
  await createAuditLog({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action,
    entityType: "UNIT",
    entityId: unitId,
    description,
    oldValue,
    newValue,
    ipAddress: request?.ipAddress,
    userAgent: request?.userAgent,
  });
}

/**
 * Logs a payment-related action
 */
export async function auditPaymentAction(
  action: AuditAction,
  paymentId: string,
  user: { id: string; email: string; role: string },
  description: string,
  metadata?: Record<string, unknown>,
  request?: { ipAddress?: string; userAgent?: string }
): Promise<void> {
  await createAuditLog({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action,
    entityType: "PAYMENT",
    entityId: paymentId,
    description,
    metadata,
    ipAddress: request?.ipAddress,
    userAgent: request?.userAgent,
  });
}

/**
 * Logs a backup/export-related action
 */
export async function auditBackupAction(
  action: AuditAction,
  user: { id: string; email: string; role: string },
  description: string,
  metadata?: Record<string, unknown>,
  request?: { ipAddress?: string; userAgent?: string }
): Promise<void> {
  await createAuditLog({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action,
    entityType: "BACKUP",
    description,
    metadata,
    ipAddress: request?.ipAddress,
    userAgent: request?.userAgent,
  });
}

/**
 * Logs a security-related action (login, MFA, permission denied)
 */
export async function auditSecurityAction(
  action: AuditAction,
  user: { id: string; email: string; role: string },
  description: string,
  metadata?: Record<string, unknown>,
  request?: { ipAddress?: string; userAgent?: string }
): Promise<void> {
  await createAuditLog({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action,
    entityType: "SESSION",
    description,
    metadata,
    ipAddress: request?.ipAddress,
    userAgent: request?.userAgent,
  });
}

/**
 * Retrieves audit logs with filtering and pagination
 *
 * @param {object} filters - Filter options
 * @param {number} page - Page number (1-indexed)
 * @param {number} pageSize - Number of entries per page
 * @returns {Promise<object>} Paginated audit logs
 */
export async function getAuditLogs(
  filters: {
    userId?: string;
    entityType?: AuditEntityType;
    entityId?: string;
    action?: AuditAction;
    startDate?: Date;
    endDate?: Date;
  },
  page: number = 1,
  pageSize: number = 50
): Promise<{
  logs: Array<{
    id: string;
    timestamp: Date;
    userId: string;
    userEmail: string;
    userRole: string;
    action: string;
    entityType: string;
    entityId: string | null;
    description: string;
    ipAddress: string | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const where: Record<string, unknown> = {};

  if (filters.userId) where.userId = filters.userId;
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.action) where.action = filters.action;

  if (filters.startDate || filters.endDate) {
    where.timestamp = {};
    if (filters.startDate) {
      (where.timestamp as Record<string, unknown>).gte = filters.startDate;
    }
    if (filters.endDate) {
      (where.timestamp as Record<string, unknown>).lte = filters.endDate;
    }
  }

  const [logs, total] = await Promise.all([
    prisma.transactionAuditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        timestamp: true,
        userId: true,
        userEmail: true,
        userRole: true,
        action: true,
        entityType: true,
        entityId: true,
        description: true,
        ipAddress: true,
      },
    }),
    prisma.transactionAuditLog.count({ where }),
  ]);

  return {
    logs,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Gets audit log details including full old/new values
 * Only accessible by admins for security investigation
 *
 * @param {string} logId - The audit log ID
 * @returns {Promise<object|null>} Full audit log entry or null
 */
export async function getAuditLogDetails(logId: string) {
  return prisma.transactionAuditLog.findUnique({
    where: { id: logId },
  });
}

/**
 * Cleans up old audit logs beyond retention period
 * Default retention is 2 years for compliance
 *
 * @param {number} retentionDays - Number of days to retain (default: 730)
 * @returns {Promise<number>} Number of deleted logs
 */
export async function cleanupOldAuditLogs(retentionDays: number = 730): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await prisma.transactionAuditLog.deleteMany({
    where: {
      timestamp: { lt: cutoffDate },
    },
  });

  console.log(`[AUDIT] Cleaned up ${result.count} audit logs older than ${retentionDays} days`);
  return result.count;
}
