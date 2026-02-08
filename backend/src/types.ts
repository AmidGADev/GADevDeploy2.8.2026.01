import { z } from "zod";

// ============================================
// User & Auth Types
// ============================================

export const UserRoleSchema = z.enum(["ADMIN", "TENANT"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: UserRoleSchema,
  status: UserStatusSchema,
  createdAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

// ============================================
// Property Types
// ============================================

export const PropertySchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  city: z.string(),
  province: z.string(),
  postalCode: z.string(),
  heroImageUrl: z.string().nullable(),
  marketingCopyOverview: z.string().nullable(),
  marketingCopyNeighborhood: z.string().nullable(),
  createdAt: z.string(),
});
export type Property = z.infer<typeof PropertySchema>;

// ============================================
// Unit Types
// ============================================

export const UnitStatusSchema = z.enum(["VACANT", "OCCUPIED"]);
export type UnitStatus = z.infer<typeof UnitStatusSchema>;

export const UnitSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  buildingName: z.string(),
  unitLabel: z.string(),
  rentAmountCents: z.number().nullable(),
  rentDueDay: z.number(),
  status: UnitStatusSchema,
  description: z.string().nullable(),
  bedrooms: z.number().nullable(),
  bathrooms: z.number().nullable(),
  sqft: z.number().nullable(),
  createdAt: z.string(),
});
export type Unit = z.infer<typeof UnitSchema>;

export const CreateUnitSchema = z.object({
  propertyId: z.string(),
  buildingName: z.string().min(1, "Building name is required"),
  unitLabel: z.string().min(1, "Unit number is required"),
  rentAmountCents: z.number().optional(),
  rentDueDay: z.number().min(1).max(31).optional(),
  description: z.string().optional(),
  bedrooms: z.number().optional(),
  bathrooms: z.number().optional(),
  sqft: z.number().optional(),
});
export type CreateUnit = z.infer<typeof CreateUnitSchema>;

export const UpdateUnitSchema = z.object({
  buildingName: z.string().min(1).optional(),
  unitLabel: z.string().min(1).optional(),
  rentAmountCents: z.number().optional(),
  rentDueDay: z.number().min(1).max(31).optional(),
  description: z.string().optional(),
  bedrooms: z.number().optional(),
  bathrooms: z.number().optional(),
  sqft: z.number().optional(),
});
export type UpdateUnit = z.infer<typeof UpdateUnitSchema>;

// ============================================
// Tenancy Types
// ============================================

export const RoleInUnitSchema = z.enum(["PRIMARY", "OCCUPANT"]);
export type RoleInUnit = z.infer<typeof RoleInUnitSchema>;

export const TenancySchema = z.object({
  id: z.string(),
  userId: z.string(),
  unitId: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  isActive: z.boolean(),
  roleInUnit: RoleInUnitSchema,
  createdAt: z.string(),
});
export type Tenancy = z.infer<typeof TenancySchema>;

// ============================================
// Showing Request Types
// ============================================

export const ShowingRequestStatusSchema = z.enum(["NEW", "CONTACTED", "SCHEDULED", "COMPLETED", "CANCELLED"]);
export type ShowingRequestStatus = z.infer<typeof ShowingRequestStatusSchema>;

export const ShowingRequestSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  message: z.string().nullable(),
  status: ShowingRequestStatusSchema,
  createdAt: z.string(),
});
export type ShowingRequest = z.infer<typeof ShowingRequestSchema>;

export const CreateShowingRequestSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  message: z.string().optional(),
});
export type CreateShowingRequest = z.infer<typeof CreateShowingRequestSchema>;

// ============================================
// Announcement Types
// ============================================

export const AudienceTypeSchema = z.enum(["ALL", "UNIT", "CUSTOM"]);
export type AudienceType = z.infer<typeof AudienceTypeSchema>;

export const AnnouncementSchema = z.object({
  id: z.string(),
  createdById: z.string(),
  title: z.string(),
  bodyRichtext: z.string(),
  audienceType: AudienceTypeSchema,
  audienceUnits: z.string().nullable(),
  audienceUsers: z.string().nullable(),
  sendEmail: z.boolean(),
  createdAt: z.string(),
});
export type Announcement = z.infer<typeof AnnouncementSchema>;

export const CreateAnnouncementSchema = z.object({
  title: z.string().min(1),
  bodyRichtext: z.string().min(1),
  audienceType: AudienceTypeSchema,
  audienceUnits: z.array(z.string()).optional(),
  audienceUsers: z.array(z.string()).optional(),
  sendEmail: z.boolean().optional(),
  requiresAcknowledgement: z.boolean().optional(),
});
export type CreateAnnouncement = z.infer<typeof CreateAnnouncementSchema>;

// ============================================
// Service Request Types
// ============================================

export const ServiceRequestPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
export type ServiceRequestPriority = z.infer<typeof ServiceRequestPrioritySchema>;

export const ServiceRequestStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);
export type ServiceRequestStatus = z.infer<typeof ServiceRequestStatusSchema>;

export const ServiceRequestSchema = z.object({
  id: z.string(),
  createdById: z.string(),
  unitId: z.string(),
  title: z.string(),
  description: z.string(),
  priority: ServiceRequestPrioritySchema,
  status: ServiceRequestStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ServiceRequest = z.infer<typeof ServiceRequestSchema>;

export const CreateServiceRequestSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  priority: ServiceRequestPrioritySchema.optional(),
});
export type CreateServiceRequest = z.infer<typeof CreateServiceRequestSchema>;

export const AdminCreateServiceRequestSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  priority: ServiceRequestPrioritySchema.optional().default("NORMAL"),
  unitId: z.string().min(1, "Unit is required"),
  tenantId: z.string().optional(), // If not provided, createdById will be the admin
});
export type AdminCreateServiceRequest = z.infer<typeof AdminCreateServiceRequestSchema>;

export const ServiceRequestCommentSchema = z.object({
  id: z.string(),
  serviceRequestId: z.string(),
  userId: z.string(),
  body: z.string(),
  createdAt: z.string(),
});
export type ServiceRequestComment = z.infer<typeof ServiceRequestCommentSchema>;

// ============================================
// Invoice Types
// ============================================

export const InvoiceStatusSchema = z.enum(["OPEN", "PAID", "OVERDUE", "VOID"]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const InvoiceTypeSchema = z.enum(["RENT", "CUSTOM"]);
export type InvoiceType = z.infer<typeof InvoiceTypeSchema>;

export const ChargeCategorySchema = z.enum(["LATE_FEE", "REPAIR", "UTILITY_SURCHARGE", "OTHER"]);
export type ChargeCategory = z.infer<typeof ChargeCategorySchema>;

export const PaymentMethodSchema = z.enum(["stripe", "etransfer"]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const EtransferStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type EtransferStatus = z.infer<typeof EtransferStatusSchema>;

export const InvoiceSchema = z.object({
  id: z.string(),
  unitId: z.string(),
  tenancyId: z.string(),
  periodMonth: z.string(),
  dueDate: z.string(),
  amountCents: z.number(),
  status: InvoiceStatusSchema,
  invoiceType: InvoiceTypeSchema,
  chargeCategory: ChargeCategorySchema.nullable(),
  description: z.string().nullable(),
  stripeCheckoutSessionId: z.string().nullable(),
  paymentMethod: PaymentMethodSchema.nullable(),
  etransferStatus: EtransferStatusSchema.nullable(),
  etransferMarkedAt: z.string().nullable(),
  etransferRejectReason: z.string().nullable(),
  createdAt: z.string(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

// ============================================
// Payment Types
// ============================================

export const PaymentMethodTypeSchema = z.enum(["stripe", "etransfer_manual"]);
export type PaymentMethodType = z.infer<typeof PaymentMethodTypeSchema>;

export const PaymentSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  unitId: z.string(),
  userId: z.string(),
  amountCents: z.number(),
  paidAt: z.string(),
  method: PaymentMethodTypeSchema,
  stripePaymentIntentId: z.string().nullable(),
  receiptUrl: z.string().nullable(),
  approvedByAdminId: z.string().nullable(),
});
export type Payment = z.infer<typeof PaymentSchema>;

// Tenant payment list item (with enhanced fields for tenant portal)
export const TenantPaymentListItemSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  invoice: z.object({
    id: z.string(),
    periodMonth: z.string(),
  }),
  unitId: z.string(),
  unit: z.object({
    id: z.string(),
    unitLabel: z.string(),
  }),
  userId: z.string(),
  amountCents: z.number(),
  paidAt: z.string(),
  method: PaymentMethodTypeSchema,
  stripePaymentIntentId: z.string().nullable(),
  receiptUrl: z.string().nullable(),
  canDownloadReceipt: z.boolean(),
});
export type TenantPaymentListItem = z.infer<typeof TenantPaymentListItemSchema>;

// ============================================
// Email Types
// ============================================

export const EmailTypeSchema = z.enum(["MANUAL", "ANNOUNCEMENT", "AUTOMATION_INVOICE", "AUTOMATION_REMINDER"]);
export type EmailType = z.infer<typeof EmailTypeSchema>;

export const EmailStatusSchema = z.enum(["sent", "failed"]);
export type EmailStatus = z.infer<typeof EmailStatusSchema>;

export const SendEmailSchema = z.object({
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
  recipients: z.enum(["ALL", "UNITS", "CUSTOM"]),
  unitIds: z.array(z.string()).optional(),
  userIds: z.array(z.string()).optional(),
});
export type SendEmail = z.infer<typeof SendEmailSchema>;

export const EmailLogSchema = z.object({
  id: z.string(),
  subject: z.string(),
  toGroup: z.string(),
  emailType: z.string(),
  source: z.enum(["Admin", "System"]),
  status: EmailStatusSchema,
  errorMessage: z.string().nullable(),
  sentAt: z.string(),
  createdBy: z.object({
    id: z.string(),
    name: z.string(),
  }).nullable(),
  recipientCount: z.number(),
});
export type EmailLog = z.infer<typeof EmailLogSchema>;

export const EmailLogDetailSchema = EmailLogSchema.extend({
  bodyHtml: z.string(),
  toEmails: z.array(z.string()),
});
export type EmailLogDetail = z.infer<typeof EmailLogDetailSchema>;

// ============================================
// Email Settings Types
// ============================================

export const EmailSettingsSchema = z.object({
  id: z.string(),
  senderName: z.string(),
  senderEmail: z.string().email(),
  replyToEmail: z.string().email().nullable(),
  verificationStatus: z.enum(["pending", "verified", "failed"]),
  verifiedDomain: z.string().nullable(),
  updatedAt: z.string(),
  updatedBy: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string(),
  }).nullable(),
});
export type EmailSettings = z.infer<typeof EmailSettingsSchema>;

export const UpdateEmailSettingsSchema = z.object({
  senderName: z.string().min(1).max(100).optional(),
  senderEmail: z.string().email().optional(),
  replyToEmail: z.string().email().nullable().optional(),
});
export type UpdateEmailSettings = z.infer<typeof UpdateEmailSettingsSchema>;

// ============================================
// Invite Tenant Types
// ============================================

export const InviteTenantSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  unitId: z.string().min(1, "Unit is required"),
  startDate: z.string().min(1, "Start date is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  roleInUnit: RoleInUnitSchema.optional().default("PRIMARY"),
  leaseStartDate: z.string().optional(),
});
export type InviteTenant = z.infer<typeof InviteTenantSchema>;

// ============================================
// Dashboard Types
// ============================================

export const TenantDashboardSchema = z.object({
  tenant: UserSchema,
  unit: UnitSchema.nullable(),
  tenancy: TenancySchema.nullable(),
  currentInvoice: InvoiceSchema.nullable(),
  recentPayments: z.array(PaymentSchema),
  openServiceRequests: z.number(),
  unreadAnnouncements: z.number(),
});
export type TenantDashboard = z.infer<typeof TenantDashboardSchema>;

export const PropertyHealthStatusSchema = z.enum(["GOOD", "NEEDS_ATTENTION", "CRITICAL"]);
export type PropertyHealthStatus = z.infer<typeof PropertyHealthStatusSchema>;

export const InsuranceComplianceSchema = z.object({
  verified: z.number(),
  missing: z.number(),
  expired: z.number(),
  pending: z.number(),
  total: z.number(),
  complianceRate: z.number(),
});
export type InsuranceCompliance = z.infer<typeof InsuranceComplianceSchema>;

export const PropertyHealthSchema = z.object({
  status: PropertyHealthStatusSchema,
  summary: z.string(),
});
export type PropertyHealth = z.infer<typeof PropertyHealthSchema>;

export const ActionTimestampsSchema = z.object({
  oldestServiceRequest: z.string().nullable(),
  oldestOverdueInvoice: z.string().nullable(),
  oldestShowingRequest: z.string().nullable(),
});
export type ActionTimestamps = z.infer<typeof ActionTimestampsSchema>;

export const RecentServiceRequestSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  priority: z.string(),
  createdAt: z.string(),
  unitLabel: z.string(),
  buildingName: z.string(),
  tenantName: z.string(),
});
export type RecentServiceRequest = z.infer<typeof RecentServiceRequestSchema>;

export const AdminDashboardSchema = z.object({
  // Occupancy Overview
  totalUnits: z.number(),
  occupiedUnits: z.number(),
  vacantUnits: z.number(),
  underRenovationUnits: z.number(),
  occupancyRate: z.number(),
  totalTenants: z.number(),

  // Operations
  openServiceRequests: z.number(),
  overdueInvoices: z.number(),
  overdueInvoicesAmount: z.number(),
  pendingShowingRequests: z.number(),
  urgentServiceRequests: z.number(),
  pendingChecklists: z.number(),

  // Cash Flow Metrics
  expectedMonthlyRevenue: z.number(),
  collectedRevenue: z.number(),
  pendingRevenue: z.number(),
  collectionRate: z.number(),
  monthlyRevenue: z.number(),
  currentMonthLabel: z.string(),

  // Outstanding Invoices
  outstandingInvoicesCount: z.number(),
  outstandingInvoicesAmount: z.number(),

  // Timestamps
  timestamps: ActionTimestampsSchema,

  // Insurance Compliance
  insuranceCompliance: InsuranceComplianceSchema,

  // Property Health
  propertyHealth: PropertyHealthSchema,

  // Recent Activity
  recentServiceRequests: z.array(RecentServiceRequestSchema),

  // Filter Options
  buildings: z.array(z.string()),
});
export type AdminDashboard = z.infer<typeof AdminDashboardSchema>;

// ============================================
// Invitation Types
// ============================================

export const InvitationRoleSchema = z.enum(["ADMIN", "TENANT"]);
export type InvitationRole = z.infer<typeof InvitationRoleSchema>;

export const CreateInvitationSchema = z.object({
  email: z.string().email("Valid email is required"),
  tenantName: z.string().optional(),
  unitId: z.string().optional(),
  role: InvitationRoleSchema.optional().default("TENANT"),
  roleInUnit: RoleInUnitSchema.optional().default("PRIMARY"),
  leaseStartDate: z.string().optional(),
});
export type CreateInvitation = z.infer<typeof CreateInvitationSchema>;

export const AcceptInvitationSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
});
export type AcceptInvitation = z.infer<typeof AcceptInvitationSchema>;

export const InvitationSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  tenantName: z.string().nullable(),
  unitId: z.string().nullable(),
  role: InvitationRoleSchema,
  roleInUnit: RoleInUnitSchema,
  token: z.string(),
  expiresAt: z.string(),
  acceptedAt: z.string().nullable(),
  createdById: z.string(),
  createdAt: z.string(),
  unit: z.object({
    id: z.string(),
    unitLabel: z.string(),
  }).nullable().optional(),
  createdBy: z.object({
    id: z.string(),
    name: z.string(),
  }).nullable().optional(),
});
export type Invitation = z.infer<typeof InvitationSchema>;

export const InvitationPublicSchema = z.object({
  email: z.string().email(),
  tenantName: z.string().nullable(),
  unitLabel: z.string().nullable(),
  role: InvitationRoleSchema,
  roleInUnit: RoleInUnitSchema,
  expiresAt: z.string(),
});
export type InvitationPublic = z.infer<typeof InvitationPublicSchema>;

// ============================================
// e-Transfer Types
// ============================================

export const EtransferSettingsSchema = z.object({
  etransferEnabled: z.boolean(),
  etransferRecipientEmail: z.string(),
  etransferMemoTemplate: z.string(),
});
export type EtransferSettings = z.infer<typeof EtransferSettingsSchema>;

export const UpdateEtransferSettingsSchema = z.object({
  etransferEnabled: z.boolean().optional(),
  etransferRecipientEmail: z.string().email().optional(),
  etransferMemoTemplate: z.string().optional(),
});
export type UpdateEtransferSettings = z.infer<typeof UpdateEtransferSettingsSchema>;

export const EtransferRejectSchema = z.object({
  reason: z.string().optional(),
});
export type EtransferReject = z.infer<typeof EtransferRejectSchema>;

// ============================================
// User Profile Types (for /api/me endpoints)
// ============================================

export const UserProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  role: UserRoleSchema,
  status: UserStatusSchema,
  createdAt: z.string(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const UpdateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  phone: z.string().optional().nullable(),
});
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;

// ============================================
// Insurance Types
// ============================================

export const InsuranceStatusSchema = z.enum(["MISSING", "PENDING", "APPROVED", "REJECTED", "EXPIRED"]);
export type InsuranceStatus = z.infer<typeof InsuranceStatusSchema>;

export const InsuranceProviderSchema = z.enum(["Covie", "Other"]);
export type InsuranceProvider = z.infer<typeof InsuranceProviderSchema>;

// Tenant's insurance status response
export const TenantInsuranceStatusSchema = z.object({
  status: InsuranceStatusSchema,
  provider: z.string().nullable(),
  expiresAt: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  documentUrl: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  covieLinkId: z.string().nullable(),
  coviePolicyId: z.string().nullable(),
});
export type TenantInsuranceStatus = z.infer<typeof TenantInsuranceStatusSchema>;

// Upload insurance document request
export const UploadInsuranceSchema = z.object({
  documentUrl: z.string().url("Valid document URL is required"),
  provider: z.string().min(1, "Provider name is required"),
  expiresAt: z.string().min(1, "Expiration date is required"),
});
export type UploadInsurance = z.infer<typeof UploadInsuranceSchema>;

// Admin insurance list item
export const AdminInsuranceListItemSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  userEmail: z.string(),
  unitLabel: z.string().nullable(),
  buildingName: z.string().nullable(),
  status: InsuranceStatusSchema,
  provider: z.string().nullable(),
  expiresAt: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  documentUrl: z.string().nullable(),
  rejectionReason: z.string().nullable(),
});
export type AdminInsuranceListItem = z.infer<typeof AdminInsuranceListItemSchema>;

// Admin insurance detail
export const AdminInsuranceDetailSchema = AdminInsuranceListItemSchema.extend({
  covieLinkId: z.string().nullable(),
  coviePolicyId: z.string().nullable(),
  tenancyStartDate: z.string().nullable(),
});
export type AdminInsuranceDetail = z.infer<typeof AdminInsuranceDetailSchema>;

// Admin reject insurance request
export const RejectInsuranceSchema = z.object({
  reason: z.string().min(1, "Rejection reason is required"),
});
export type RejectInsurance = z.infer<typeof RejectInsuranceSchema>;

// ============================================
// Debug/Staging Types
// ============================================

export const DebugConfigSchema = z.object({
  debugEnabled: z.boolean(),
  appEnv: z.enum(["production", "staging"]),
  debugMode: z.boolean(),
  debugKeyConfigured: z.boolean(),
  stagingEmailAllowlist: z.array(z.string()),
});
export type DebugConfig = z.infer<typeof DebugConfigSchema>;

export const HealthCheckStatusSchema = z.enum(["pass", "fail", "unconfigured"]);
export type HealthCheckStatus = z.infer<typeof HealthCheckStatusSchema>;

export const HealthCheckItemSchema = z.object({
  status: HealthCheckStatusSchema,
  message: z.string().optional(),
});
export type HealthCheckItem = z.infer<typeof HealthCheckItemSchema>;

export const HealthCheckResponseSchema = z.object({
  checks: z.record(z.string(), HealthCheckItemSchema),
  environment: z.object({
    appEnv: z.string(),
    debugMode: z.boolean(),
    nodeEnv: z.string(),
    backendUrl: z.string(),
  }),
  timestamp: z.string(),
});
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;

export const ApiTestResultSchema = z.object({
  pass: z.boolean(),
  message: z.string(),
  requestId: z.string(),
  durationMs: z.number(),
});
export type ApiTestResult = z.infer<typeof ApiTestResultSchema>;

export const WebhookEventSchema = z.object({
  id: z.string(),
  source: z.string(),
  eventType: z.string(),
  payload: z.any(),
  status: z.enum(["received", "processed", "failed"]),
  error: z.string().nullable(),
  processedAt: z.string().nullable(),
  receivedAt: z.string(),
});
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

export const EmailFailureSchema = z.object({
  id: z.string(),
  subject: z.string(),
  toEmails: z.array(z.string()),
  emailType: z.string(),
  errorMessage: z.string().nullable(),
  sentAt: z.string(),
});
export type EmailFailure = z.infer<typeof EmailFailureSchema>;

export const DatabaseStatsSchema = z.object({
  users: z.object({
    total: z.number(),
    tenants: z.number(),
    admins: z.number(),
  }),
  units: z.number(),
  invoices: z.number(),
  payments: z.number(),
  serviceRequests: z.number(),
  emailLogs: z.number(),
});
export type DatabaseStats = z.infer<typeof DatabaseStatsSchema>;

// ============================================
// Tenant Compliance Types
// ============================================

export const ComplianceIssueTypeSchema = z.enum([
  "RENT_DUE",
  "RENT_OVERDUE",
  "INSURANCE_MISSING",
  "INSURANCE_EXPIRED",
  "DOCUMENTS_REQUIRED",
  "CHECKLIST_INCOMPLETE",
]);
export type ComplianceIssueType = z.infer<typeof ComplianceIssueTypeSchema>;

export const ComplianceIssueSeveritySchema = z.enum(["warning", "critical"]);
export type ComplianceIssueSeverity = z.infer<typeof ComplianceIssueSeveritySchema>;

export const ComplianceIssueSchema = z.object({
  type: ComplianceIssueTypeSchema,
  severity: ComplianceIssueSeveritySchema,
  title: z.string(),
  description: z.string(),
  actionUrl: z.string(),
  dueDate: z.string().optional(),
});
export type ComplianceIssue = z.infer<typeof ComplianceIssueSchema>;

export const ComplianceStatusSchema = z.enum([
  "GOOD_STANDING",
  "ACTION_REQUIRED",
  "NOT_IN_COMPLIANCE",
]);
export type ComplianceStatus = z.infer<typeof ComplianceStatusSchema>;

export const RentStatusSchema = z.enum(["PAID", "DUE", "OVERDUE", "NO_INVOICE"]);
export type RentStatus = z.infer<typeof RentStatusSchema>;

export const ChecklistProgressSchema = z.object({
  completed: z.number(),
  total: z.number(),
  requiredCompleted: z.number(),
  requiredTotal: z.number(),
});
export type ChecklistProgress = z.infer<typeof ChecklistProgressSchema>;

export const ComplianceSummarySchema = z.object({
  rentStatus: RentStatusSchema,
  insuranceStatus: InsuranceStatusSchema,
  documentsCount: z.number(),
  checklistProgress: ChecklistProgressSchema,
});
export type ComplianceSummary = z.infer<typeof ComplianceSummarySchema>;

export const LeaseExpirySchema = z.object({
  endDate: z.string().nullable(),
  daysRemaining: z.number().nullable(),
  showWarning: z.boolean(),
});
export type LeaseExpiry = z.infer<typeof LeaseExpirySchema>;

export const ProfileCompletionSchema = z.object({
  percentage: z.number(),
  missingItems: z.array(z.string()),
});
export type ProfileCompletion = z.infer<typeof ProfileCompletionSchema>;

export const TenantComplianceResponseSchema = z.object({
  status: ComplianceStatusSchema,
  issues: z.array(ComplianceIssueSchema),
  summary: ComplianceSummarySchema,
  leaseExpiry: LeaseExpirySchema.nullable(),
  profileCompletion: ProfileCompletionSchema,
});
export type TenantComplianceResponse = z.infer<typeof TenantComplianceResponseSchema>;

// ============================================
// Building Info Types
// ============================================

export const EmergencyContactSchema = z.object({
  name: z.string(),
  phone: z.string(),
  role: z.string().optional(),
});
export type EmergencyContact = z.infer<typeof EmergencyContactSchema>;

export const BuildingInfoSchema = z.object({
  id: z.string(),
  buildingName: z.string(),
  parkingRules: z.string().nullable(),
  garbageSchedule: z.string().nullable(),
  garbageScheduleStructured: z.string().nullable(),
  quietHours: z.string().nullable(),
  emergencyContacts: z.array(EmergencyContactSchema).nullable(),
  customNotes: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type BuildingInfo = z.infer<typeof BuildingInfoSchema>;

export const CreateBuildingInfoSchema = z.object({
  buildingName: z.string().min(1, "Building name is required"),
  parkingRules: z.string().optional().nullable(),
  garbageSchedule: z.string().optional().nullable(),
  garbageScheduleStructured: z.string().optional().nullable(),
  quietHours: z.string().optional().nullable(),
  emergencyContacts: z.array(EmergencyContactSchema).optional().nullable(),
  customNotes: z.string().optional().nullable(),
});
export type CreateBuildingInfo = z.infer<typeof CreateBuildingInfoSchema>;

export const UpdateBuildingInfoSchema = z.object({
  parkingRules: z.string().optional().nullable(),
  garbageSchedule: z.string().optional().nullable(),
  garbageScheduleStructured: z.string().optional().nullable(),
  quietHours: z.string().optional().nullable(),
  emergencyContacts: z.array(EmergencyContactSchema).optional().nullable(),
  customNotes: z.string().optional().nullable(),
});
export type UpdateBuildingInfo = z.infer<typeof UpdateBuildingInfoSchema>;

// ============================================
// Structured Garbage Schedule Types
// ============================================

export const GarbageCollectionTypeSchema = z.enum(["garbage", "recycling", "compost", "bulk_pickup"]);
export type GarbageCollectionType = z.infer<typeof GarbageCollectionTypeSchema>;

export const GarbageFrequencySchema = z.enum(["weekly", "biweekly", "first_third"]);
export type GarbageFrequency = z.infer<typeof GarbageFrequencySchema>;

export const GarbageScheduleEntrySchema = z.object({
  type: GarbageCollectionTypeSchema,
  days: z.array(z.number().min(0).max(6)), // 0=Sun, 1=Mon, ..., 6=Sat
  frequency: GarbageFrequencySchema,
});
export type GarbageScheduleEntry = z.infer<typeof GarbageScheduleEntrySchema>;

export const GarbageScheduleStructuredSchema = z.object({
  entries: z.array(GarbageScheduleEntrySchema),
});
export type GarbageScheduleStructured = z.infer<typeof GarbageScheduleStructuredSchema>;

// ============================================
// Checklist Types
// ============================================

export const ChecklistTypeSchema = z.enum(["MOVE_IN", "MOVE_OUT"]);
export type ChecklistType = z.infer<typeof ChecklistTypeSchema>;

export const ChecklistItemTypeSchema = z.enum([
  "LEASE_SIGNED",
  "INSURANCE_UPLOADED",
  "INITIAL_PAYMENT",
  "MOVE_IN_INSPECTION",
  "KEYS_RECEIVED",
  "MOVE_OUT_INSPECTION",
  "FORWARDING_ADDRESS",
  "FINAL_CLEAN",
  "KEYS_RETURNED",
  "UTILITIES_TRANSFERRED",
  "CUSTOM",
]);
export type ChecklistItemType = z.infer<typeof ChecklistItemTypeSchema>;

export const ChecklistItemSchema = z.object({
  id: z.string(),
  itemType: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  isRequired: z.boolean(),
  isCompleted: z.boolean(),
  completedAt: z.string().nullable(),
  sortOrder: z.number(),
  checklistType: ChecklistTypeSchema,
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const ChecklistResponseSchema = z.object({
  items: z.array(ChecklistItemSchema),
  progress: z.object({
    completed: z.number(),
    total: z.number(),
    percentage: z.number(),
  }),
});
export type ChecklistResponse = z.infer<typeof ChecklistResponseSchema>;

export const CreateChecklistItemSchema = z.object({
  itemType: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  isRequired: z.boolean().optional().default(true),
  sortOrder: z.number().optional(),
  checklistType: ChecklistTypeSchema.optional().default("MOVE_IN"),
});
export type CreateChecklistItem = z.infer<typeof CreateChecklistItemSchema>;

// ============================================
// Announcement Acknowledgement Types
// ============================================

export const AnnouncementAcknowledgementSchema = z.object({
  id: z.string(),
  announcementId: z.string(),
  userId: z.string(),
  acknowledgedAt: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }).optional(),
});
export type AnnouncementAcknowledgement = z.infer<typeof AnnouncementAcknowledgementSchema>;

export const TenantAnnouncementSchema = z.object({
  id: z.string(),
  createdById: z.string(),
  createdBy: z.object({
    id: z.string(),
    name: z.string(),
  }),
  title: z.string(),
  bodyRichtext: z.string(),
  createdAt: z.string(),
  isRead: z.boolean(),
  readAt: z.string().nullable(),
  requiresAcknowledgement: z.boolean(),
  hasAcknowledged: z.boolean(),
  acknowledgedAt: z.string().nullable(),
});
export type TenantAnnouncement = z.infer<typeof TenantAnnouncementSchema>;

// ============================================
// Unit Asset Types
// ============================================

export const UnitAssetCategorySchema = z.enum([
  "APPLIANCE",
  "HVAC",
  "PLUMBING",
  "ELECTRICAL",
  "SMART_HOME",
  "OTHER",
]);
export type UnitAssetCategory = z.infer<typeof UnitAssetCategorySchema>;

export const ServiceIntervalSchema = z.enum([
  "3_MONTHS",
  "6_MONTHS",
  "ANNUALLY",
  "OTHER",
]);
export type ServiceInterval = z.infer<typeof ServiceIntervalSchema>;

export const WarrantyStatusSchema = z.enum(["ACTIVE", "EXPIRING_SOON", "EXPIRED", "UNKNOWN"]);
export type WarrantyStatus = z.infer<typeof WarrantyStatusSchema>;

export const AssetServiceStatusSchema = z.enum(["OK", "DUE_SOON", "OVERDUE", "UNKNOWN"]);
export type AssetServiceStatus = z.infer<typeof AssetServiceStatusSchema>;

export const UnitAssetFileSchema = z.object({
  id: z.string(),
  storageKey: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  uploadedAt: z.string(),
});
export type UnitAssetFile = z.infer<typeof UnitAssetFileSchema>;

export const UnitAssetLinkSchema = z.object({
  id: z.string(),
  url: z.string(),
  label: z.string(),
  createdAt: z.string(),
});
export type UnitAssetLink = z.infer<typeof UnitAssetLinkSchema>;

export const UnitAssetSchema = z.object({
  id: z.string(),
  unitId: z.string(),
  name: z.string(),
  category: UnitAssetCategorySchema,
  brand: z.string().nullable(),
  modelNumber: z.string().nullable(),
  serialNumber: z.string().nullable(),
  location: z.string().nullable(),
  installDate: z.string().nullable(),
  warrantyExpirationDate: z.string().nullable(),
  lastServiceDate: z.string().nullable(),
  serviceInterval: ServiceIntervalSchema.nullable(),
  serviceNotes: z.string().nullable(),
  serviceProviderContact: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Computed fields
  warrantyStatus: WarrantyStatusSchema,
  serviceStatus: AssetServiceStatusSchema,
  nextServiceDate: z.string().nullable(),
  // Related data
  files: z.array(UnitAssetFileSchema),
  links: z.array(UnitAssetLinkSchema),
});
export type UnitAsset = z.infer<typeof UnitAssetSchema>;

export const CreateUnitAssetSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: UnitAssetCategorySchema,
  brand: z.string().optional(),
  modelNumber: z.string().optional(),
  serialNumber: z.string().optional(),
  location: z.string().optional(),
  installDate: z.string().optional(),
  warrantyExpirationDate: z.string().optional(),
  lastServiceDate: z.string().optional(),
  serviceInterval: ServiceIntervalSchema.optional(),
  serviceNotes: z.string().optional(),
  serviceProviderContact: z.string().optional(),
  notes: z.string().optional(),
});
export type CreateUnitAsset = z.infer<typeof CreateUnitAssetSchema>;

export const UpdateUnitAssetSchema = CreateUnitAssetSchema.partial();
export type UpdateUnitAsset = z.infer<typeof UpdateUnitAssetSchema>;

export const CreateUnitAssetLinkSchema = z.object({
  url: z.string().url("Valid URL is required"),
  label: z.string().min(1, "Label is required"),
});
export type CreateUnitAssetLink = z.infer<typeof CreateUnitAssetLinkSchema>;

// Summary for units table indicator
export const UnitAssetsSummarySchema = z.object({
  totalAssets: z.number(),
  totalManuals: z.number(),
  warrantyExpiring: z.number(),
  warrantyExpired: z.number(),
  serviceOverdue: z.number(),
  serviceDueSoon: z.number(),
  hasIssues: z.boolean(),
});
export type UnitAssetsSummary = z.infer<typeof UnitAssetsSummarySchema>;

// ============================================
// Move-Out Checklist Types
// ============================================

export const MoveOutChecklistStatusSchema = z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]);
export type MoveOutChecklistStatus = z.infer<typeof MoveOutChecklistStatusSchema>;

export const MoveOutChecklistCategorySchema = z.enum([
  "KEYS_ACCESS",
  "WALLS_PAINT",
  "FLOORS",
  "KITCHEN",
  "BATHROOM",
  "APPLIANCES",
  "DOORS_WINDOWS",
]);
export type MoveOutChecklistCategory = z.infer<typeof MoveOutChecklistCategorySchema>;

export const MoveOutChecklistConditionSchema = z.enum([
  "EXCELLENT",
  "GOOD",
  "FAIR",
  "POOR",
  "DAMAGED",
]);
export type MoveOutChecklistCondition = z.infer<typeof MoveOutChecklistConditionSchema>;

export const MoveOutChecklistPhotoSchema = z.object({
  id: z.string(),
  storageKey: z.string(),
  filename: z.string(),
  caption: z.string().nullable(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  uploadedAt: z.string(),
});
export type MoveOutChecklistPhoto = z.infer<typeof MoveOutChecklistPhotoSchema>;

export const MoveOutChecklistItemSchema = z.object({
  id: z.string(),
  checklistId: z.string(),
  category: MoveOutChecklistCategorySchema,
  condition: MoveOutChecklistConditionSchema.nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  photos: z.array(MoveOutChecklistPhotoSchema),
});
export type MoveOutChecklistItem = z.infer<typeof MoveOutChecklistItemSchema>;

export const MoveOutChecklistSchema = z.object({
  id: z.string(),
  tenancyId: z.string(),
  status: MoveOutChecklistStatusSchema,
  isFinalized: z.boolean(),
  finalizedAt: z.string().nullable(),
  finalizedById: z.string().nullable(),
  notes: z.string().nullable(),
  damageNotes: z.string().nullable(),
  damageFound: z.boolean(),
  keysReturned: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  items: z.array(MoveOutChecklistItemSchema),
  finalizedBy: z.object({
    id: z.string(),
    name: z.string(),
  }).nullable(),
});
export type MoveOutChecklist = z.infer<typeof MoveOutChecklistSchema>;

export const UpdateMoveOutChecklistSchema = z.object({
  status: MoveOutChecklistStatusSchema.optional(),
  notes: z.string().optional().nullable(),
  damageNotes: z.string().optional().nullable(),
  damageFound: z.boolean().optional(),
  keysReturned: z.boolean().optional(),
});
export type UpdateMoveOutChecklist = z.infer<typeof UpdateMoveOutChecklistSchema>;

export const UpdateMoveOutChecklistItemSchema = z.object({
  condition: MoveOutChecklistConditionSchema.optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type UpdateMoveOutChecklistItem = z.infer<typeof UpdateMoveOutChecklistItemSchema>;

export const ScheduleMoveOutSchema = z.object({
  moveOutDate: z.string().nullable(),
});
export type ScheduleMoveOut = z.infer<typeof ScheduleMoveOutSchema>;

// ============================================
// Checklist Item Photo Types (for move-in checklist)
// ============================================

export const ChecklistItemPhotoSchema = z.object({
  id: z.string(),
  storageKey: z.string(),
  filename: z.string(),
  caption: z.string().nullable(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  uploadedAt: z.string(),
});
export type ChecklistItemPhoto = z.infer<typeof ChecklistItemPhotoSchema>;

// ============================================
// Compliance List Types
// ============================================

export const MoveInComplianceItemSchema = z.object({
  tenantId: z.string(),
  tenantName: z.string(),
  tenantEmail: z.string(),
  unitId: z.string(),
  unitLabel: z.string(),
  checklistStatus: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "WAIVED"]),
  isLegacyMoveIn: z.boolean(),
  lastUpdated: z.string().nullable(),
  progress: z.object({
    completed: z.number(),
    total: z.number(),
  }),
});
export type MoveInComplianceItem = z.infer<typeof MoveInComplianceItemSchema>;

export const MoveOutComplianceItemSchema = z.object({
  tenantId: z.string(),
  tenantName: z.string(),
  tenantEmail: z.string(),
  unitId: z.string(),
  unitLabel: z.string(),
  moveOutDate: z.string(),
  checklistStatus: MoveOutChecklistStatusSchema,
  isFinalized: z.boolean(),
  isOverdue: z.boolean(),
  lastUpdated: z.string().nullable(),
});
export type MoveOutComplianceItem = z.infer<typeof MoveOutComplianceItemSchema>;

export const MoveOutComplianceStatsSchema = z.object({
  scheduled: z.number(),
  inProgress: z.number(),
  completed: z.number(),
  finalized: z.number(),
  overdue: z.number(),
});
export type MoveOutComplianceStats = z.infer<typeof MoveOutComplianceStatsSchema>;

// ============================================
// Move-Out Request Types
// ============================================

export const MoveOutRequestStatusSchema = z.enum(["PENDING", "ACKNOWLEDGED", "DECLINED"]);
export type MoveOutRequestStatus = z.infer<typeof MoveOutRequestStatusSchema>;

export const MoveOutRequestSchema = z.object({
  id: z.string(),
  tenancyId: z.string(),
  requestedDate: z.string(),
  status: MoveOutRequestStatusSchema,
  adminMessage: z.string().nullable(),
  respondedAt: z.string().nullable(),
  respondedById: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MoveOutRequest = z.infer<typeof MoveOutRequestSchema>;

export const CreateMoveOutRequestSchema = z.object({
  requestedDate: z.string().min(1, "Move-out date is required"),
});
export type CreateMoveOutRequest = z.infer<typeof CreateMoveOutRequestSchema>;

export const RespondMoveOutRequestSchema = z.object({
  status: z.enum(["ACKNOWLEDGED", "DECLINED"]),
  adminMessage: z.string().optional(),
});
export type RespondMoveOutRequest = z.infer<typeof RespondMoveOutRequestSchema>;

export const MoveOutRequestWithDetailsSchema = MoveOutRequestSchema.extend({
  tenant: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  unit: z.object({
    id: z.string(),
    unitLabel: z.string(),
  }),
  respondedBy: z.object({
    id: z.string(),
    name: z.string(),
  }).nullable(),
});
export type MoveOutRequestWithDetails = z.infer<typeof MoveOutRequestWithDetailsSchema>;

export const AdminCreateMoveOutRequestSchema = z.object({
  tenancyId: z.string().min(1, "Tenancy ID is required"),
  requestedDate: z.string().min(1, "Requested date is required"),
  adminMessage: z.string().optional(),
});
export type AdminCreateMoveOutRequest = z.infer<typeof AdminCreateMoveOutRequestSchema>;

export const AdminCreateShowingRequestSchema = z.object({
  propertyId: z.string().min(1, "Property ID is required"),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  message: z.string().optional(),
  preferredDate: z.string().optional(),
  preferredUnit: z.string().optional(),
});
export type AdminCreateShowingRequest = z.infer<typeof AdminCreateShowingRequestSchema>;

// ============================================
// Inspection Types (Generic for Move-In and Move-Out)
// ============================================

export const InspectionTypeSchema = z.enum(["MOVE_IN", "MOVE_OUT"]);
export type InspectionType = z.infer<typeof InspectionTypeSchema>;

export const InspectionStatusSchema = z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "WAIVED"]);
export type InspectionStatus = z.infer<typeof InspectionStatusSchema>;

export const InspectionCategorySchema = z.enum([
  "KEYS_ACCESS",
  "WALLS_PAINT",
  "FLOORS",
  "KITCHEN",
  "BATHROOM",
  "APPLIANCES",
  "DOORS_WINDOWS",
]);
export type InspectionCategory = z.infer<typeof InspectionCategorySchema>;

export const InspectionConditionSchema = z.enum([
  "EXCELLENT",
  "GOOD",
  "FAIR",
  "POOR",
  "DAMAGED",
]);
export type InspectionCondition = z.infer<typeof InspectionConditionSchema>;

export const InspectionPhotoSchema = z.object({
  id: z.string(),
  inspectionItemId: z.string(),
  storageKey: z.string(),
  filename: z.string(),
  caption: z.string().nullable(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  uploadedAt: z.string(),
});
export type InspectionPhoto = z.infer<typeof InspectionPhotoSchema>;

export const InspectionItemSchema = z.object({
  id: z.string(),
  inspectionId: z.string(),
  category: InspectionCategorySchema,
  condition: InspectionConditionSchema.nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  photos: z.array(InspectionPhotoSchema),
});
export type InspectionItem = z.infer<typeof InspectionItemSchema>;

export const InspectionSchema = z.object({
  id: z.string(),
  tenancyId: z.string(),
  inspectionType: InspectionTypeSchema,
  status: InspectionStatusSchema,
  isFinalized: z.boolean(),
  finalizedAt: z.string().nullable(),
  finalizedById: z.string().nullable(),
  notes: z.string().nullable(),
  damageNotes: z.string().nullable(),
  damageFound: z.boolean(),
  keysReturned: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  items: z.array(InspectionItemSchema),
  finalizedBy: z.object({
    id: z.string(),
    name: z.string(),
  }).nullable(),
});
export type Inspection = z.infer<typeof InspectionSchema>;

export const CreateInspectionSchema = z.object({
  tenancyId: z.string().min(1, "Tenancy ID is required"),
  inspectionType: InspectionTypeSchema,
});
export type CreateInspection = z.infer<typeof CreateInspectionSchema>;

export const UpdateInspectionSchema = z.object({
  status: InspectionStatusSchema.optional(),
  notes: z.string().optional().nullable(),
  damageNotes: z.string().optional().nullable(),
  damageFound: z.boolean().optional(),
  keysReturned: z.boolean().optional(),
});
export type UpdateInspection = z.infer<typeof UpdateInspectionSchema>;

export const UpdateInspectionItemSchema = z.object({
  condition: InspectionConditionSchema.optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type UpdateInspectionItem = z.infer<typeof UpdateInspectionItemSchema>;

// Inspection compliance items for admin dashboard
export const InspectionComplianceItemSchema = z.object({
  tenantId: z.string(),
  tenantName: z.string(),
  tenantEmail: z.string(),
  unitId: z.string(),
  unitLabel: z.string(),
  buildingName: z.string(),
  inspectionType: InspectionTypeSchema,
  inspectionStatus: InspectionStatusSchema,
  isFinalized: z.boolean(),
  isLegacyMoveIn: z.boolean(),
  lastUpdated: z.string().nullable(),
  moveOutDate: z.string().nullable(),
  isOverdue: z.boolean(),
  inspectionId: z.string().nullable(),
});
export type InspectionComplianceItem = z.infer<typeof InspectionComplianceItemSchema>;

export const InspectionComplianceStatsSchema = z.object({
  notStarted: z.number(),
  inProgress: z.number(),
  completed: z.number(),
  finalized: z.number(),
  overdue: z.number(),
});
export type InspectionComplianceStats = z.infer<typeof InspectionComplianceStatsSchema>;

// ============================================
// Admin Settings Types
// ============================================

export const NotificationEventTypeSchema = z.enum([
  "MAINTENANCE_REQUEST",
  "INVOICE_OVERDUE",
  "NEW_TENANT",
  "MOVE_OUT_REQUEST",
  "INSURANCE_EXPIRING",
  "PAYMENT_RECEIVED",
]);
export type NotificationEventType = z.infer<typeof NotificationEventTypeSchema>;

export const NotificationRecipientSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  eventTypes: z.array(NotificationEventTypeSchema),
  buildingName: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NotificationRecipient = z.infer<typeof NotificationRecipientSchema>;

export const CreateNotificationRecipientSchema = z.object({
  email: z.string().email("Valid email is required"),
  name: z.string().optional(),
  eventTypes: z.array(NotificationEventTypeSchema).min(1, "At least one event type is required"),
  buildingName: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});
export type CreateNotificationRecipient = z.infer<typeof CreateNotificationRecipientSchema>;

export const UpdateNotificationRecipientSchema = z.object({
  email: z.string().email("Valid email is required").optional(),
  name: z.string().optional().nullable(),
  eventTypes: z.array(NotificationEventTypeSchema).min(1).optional(),
  buildingName: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});
export type UpdateNotificationRecipient = z.infer<typeof UpdateNotificationRecipientSchema>;

// Data Export Types
export const DataExportRecordCountsSchema = z.object({
  units: z.number(),
  tenants: z.number(),
  tenancies: z.number(),
  invoices: z.number(),
  checklistItems: z.number(),
  inspections: z.number(),
  buildingInfos: z.number(),
});
export type DataExportRecordCounts = z.infer<typeof DataExportRecordCountsSchema>;

export const DataExportSchema = z.object({
  id: z.string(),
  exportType: z.string(),
  schemaVersion: z.string(),
  filename: z.string(),
  fileSize: z.number(),
  recordCounts: DataExportRecordCountsSchema,
  status: z.string(),
  downloadedAt: z.string().nullable(),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type DataExport = z.infer<typeof DataExportSchema>;

export const DataExportResultSchema = z.object({
  id: z.string(),
  filename: z.string(),
  fileSize: z.number(),
  schemaVersion: z.string(),
  recordCounts: DataExportRecordCountsSchema,
  exportedAt: z.string(),
  content: z.string(),
});
export type DataExportResult = z.infer<typeof DataExportResultSchema>;

// ============================================
// Import Change Preview Types (for staging/review system)
// ============================================

// Generic update record showing before/after changes
export const ImportUpdateRecordSchema = z.object({
  id: z.string(),
  identifier: z.string(), // Human-readable identifier like "Unit 101 - Building A"
  before: z.record(z.string(), z.unknown()),
  after: z.record(z.string(), z.unknown()),
  changedFields: z.array(z.string()),
});
export type ImportUpdateRecord = z.infer<typeof ImportUpdateRecordSchema>;

// Generic create record
export const ImportCreateRecordSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});
export type ImportCreateRecord = z.infer<typeof ImportCreateRecordSchema>;

// Entity change preview structure
export const EntityChangePreviewSchema = z.object({
  creates: z.array(ImportCreateRecordSchema),
  updates: z.array(ImportUpdateRecordSchema),
  unchangedCount: z.number(),
});
export type EntityChangePreview = z.infer<typeof EntityChangePreviewSchema>;

// Complete change preview for all entity types
export const ImportChangePreviewSchema = z.object({
  units: EntityChangePreviewSchema,
  tenants: EntityChangePreviewSchema,
  tenancies: EntityChangePreviewSchema,
  invoices: EntityChangePreviewSchema,
  checklistItems: EntityChangePreviewSchema,
  inspections: EntityChangePreviewSchema,
  buildingInfos: EntityChangePreviewSchema,
});
export type ImportChangePreview = z.infer<typeof ImportChangePreviewSchema>;

export const ImportValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()).optional(),
  confirmationToken: z.string().optional(),
  expiresAt: z.string().optional(),
  schemaVersion: z.string().optional(),
  recordCounts: DataExportRecordCountsSchema.optional(),
  warnings: z.array(z.string()).optional(),
  changePreview: ImportChangePreviewSchema.optional(),
});
export type ImportValidationResult = z.infer<typeof ImportValidationResultSchema>;

// Approved changes for selective import
// creates array contains indices into the creates array (order matters)
// updates array contains IDs of records to update
export const ApprovedEntityChangesSchema = z.object({
  creates: z.array(z.number()), // Indices of creates to approve
  updates: z.array(z.string()), // IDs of updates to approve
});
export type ApprovedEntityChanges = z.infer<typeof ApprovedEntityChangesSchema>;

export const ApprovedChangesSchema = z.object({
  units: ApprovedEntityChangesSchema,
  tenants: ApprovedEntityChangesSchema,
  tenancies: ApprovedEntityChangesSchema,
  invoices: ApprovedEntityChangesSchema,
  checklistItems: ApprovedEntityChangesSchema,
  inspections: ApprovedEntityChangesSchema,
  buildingInfos: ApprovedEntityChangesSchema,
});
export type ApprovedChanges = z.infer<typeof ApprovedChangesSchema>;

// Import confirm request body
export const ImportConfirmRequestSchema = z.object({
  content: z.string().min(1, "Import content is required"),
  confirmationToken: z.string().min(1, "Confirmation token is required"),
  approvedChanges: ApprovedChangesSchema.optional(),
});
export type ImportConfirmRequest = z.infer<typeof ImportConfirmRequestSchema>;

// Import summary with created/updated/skipped counts per entity type
export const ImportSummaryEntrySchema = z.object({
  created: z.number(),
  updated: z.number(),
  skipped: z.number().optional(), // Optional for backwards compatibility
});
export type ImportSummaryEntry = z.infer<typeof ImportSummaryEntrySchema>;

export const ImportSummarySchema = z.object({
  units: ImportSummaryEntrySchema,
  tenants: ImportSummaryEntrySchema,
  tenancies: ImportSummaryEntrySchema,
  invoices: ImportSummaryEntrySchema,
  checklistItems: ImportSummaryEntrySchema,
  inspections: ImportSummaryEntrySchema,
  buildingInfos: ImportSummaryEntrySchema,
});
export type ImportSummary = z.infer<typeof ImportSummarySchema>;

export const ImportResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  schemaVersion: z.string(),
  recordCounts: DataExportRecordCountsSchema,
  summary: ImportSummarySchema.optional(),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;

// ============================================
// Admin Tenancies Types (for UnifiedCreateRequestDialog)
// ============================================

export const AdminTenancyUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});
export type AdminTenancyUser = z.infer<typeof AdminTenancyUserSchema>;

export const AdminTenancyUnitSchema = z.object({
  id: z.string(),
  unitLabel: z.string(),
  buildingName: z.string(),
});
export type AdminTenancyUnit = z.infer<typeof AdminTenancyUnitSchema>;

export const AdminTenancyListItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  unitId: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  isActive: z.boolean(),
  user: AdminTenancyUserSchema,
  unit: AdminTenancyUnitSchema,
});
export type AdminTenancyListItem = z.infer<typeof AdminTenancyListItemSchema>;

// ============================================
// Admin Properties Types (for UnifiedCreateRequestDialog)
// ============================================

export const AdminPropertyListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
});
export type AdminPropertyListItem = z.infer<typeof AdminPropertyListItemSchema>;

// ============================================
// Tenant Notification Settings & History Types
// ============================================

export const TenantNotificationTypeSchema = z.enum([
  "NEW_INVOICE",
  "PAYMENT_RECEIVED",
  "OVERDUE_ALERT",
  "MAINTENANCE_ACKNOWLEDGED",
  "MAINTENANCE_STATUS_UPDATE",
  "MAINTENANCE_RESOLVED",
  "MOVE_IN_CHECKLIST_REMINDER",
  "INSPECTION_SCHEDULED",
  "ANNOUNCEMENT",
  "BUNDLED_UPDATE",
]);
export type TenantNotificationType = z.infer<typeof TenantNotificationTypeSchema>;

export const TenantNotificationStatusSchema = z.enum([
  "SENT",
  "OPENED",
  "FAILED",
  "BUNDLED",
]);
export type TenantNotificationStatus = z.infer<typeof TenantNotificationStatusSchema>;

export const TenantNotificationSettingsSchema = z.object({
  id: z.string(),
  newInvoice: z.boolean(),
  paymentReceived: z.boolean(),
  overdueAlert: z.boolean(),
  maintenanceAcknowledged: z.boolean(),
  maintenanceStatusUpdate: z.boolean(),
  maintenanceResolved: z.boolean(),
  moveInChecklistReminder: z.boolean(),
  inspectionScheduled: z.boolean(),
  globalMute: z.boolean(),
  overdueReminderHours: z.number(),
  bundleWindowMinutes: z.number(),
  updatedAt: z.string(),
});
export type TenantNotificationSettings = z.infer<typeof TenantNotificationSettingsSchema>;

export const UpdateTenantNotificationSettingsSchema = z.object({
  newInvoice: z.boolean().optional(),
  paymentReceived: z.boolean().optional(),
  overdueAlert: z.boolean().optional(),
  maintenanceAcknowledged: z.boolean().optional(),
  maintenanceStatusUpdate: z.boolean().optional(),
  maintenanceResolved: z.boolean().optional(),
  moveInChecklistReminder: z.boolean().optional(),
  inspectionScheduled: z.boolean().optional(),
  globalMute: z.boolean().optional(),
  overdueReminderHours: z.number().min(24).max(168).optional(),
  bundleWindowMinutes: z.number().min(15).max(120).optional(),
});
export type UpdateTenantNotificationSettings = z.infer<typeof UpdateTenantNotificationSettingsSchema>;

export const TenantNotificationHistoryItemSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  notificationType: TenantNotificationTypeSchema,
  subject: z.string(),
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  status: TenantNotificationStatusSchema,
  errorMessage: z.string().nullable(),
  bundledIntoId: z.string().nullable(),
  emailMessageId: z.string().nullable(),
  openedAt: z.string().nullable(),
  sentAt: z.string(),
});
export type TenantNotificationHistoryItem = z.infer<typeof TenantNotificationHistoryItemSchema>;

export const TenantNotificationHistoryResponseSchema = z.object({
  items: z.array(TenantNotificationHistoryItemSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});
export type TenantNotificationHistoryResponse = z.infer<typeof TenantNotificationHistoryResponseSchema>;

// ============================================
// Admin Calendar Event Types (with notification support)
// ============================================

export const EventCategorySchema = z.enum(["logistics", "milestone", "compliance", "holiday", "move"]);
export type EventCategory = z.infer<typeof EventCategorySchema>;

export const NotificationMethodSchema = z.enum(["EMAIL", "DASHBOARD", "BOTH"]);
export type NotificationMethod = z.infer<typeof NotificationMethodSchema>;

export const ReminderTriggerSchema = z.enum(["AT_EVENT", "24_HOURS_BEFORE", "3_DAYS_BEFORE"]);
export type ReminderTrigger = z.infer<typeof ReminderTriggerSchema>;

export const EventSourceTypeSchema = z.enum(["MANUAL", "GARBAGE_SCHEDULE", "TENANT_MOVE"]);
export type EventSourceType = z.infer<typeof EventSourceTypeSchema>;

// ============================================
// Calendar Sync Types
// ============================================

export const CalendarSyncResultSchema = z.object({
  success: z.boolean(),
  adminEventsCreated: z.number(),
  adminEventsDeleted: z.number(),
  tenantsAffected: z.number(),
  errors: z.array(z.string()),
  timestamp: z.string(),
});
export type CalendarSyncResult = z.infer<typeof CalendarSyncResultSchema>;

export const TenantMoveEventSyncResultSchema = z.object({
  success: z.boolean(),
  eventId: z.string().nullable(),
  action: z.enum(["created", "updated", "deleted", "none"]),
  error: z.string().optional(),
});
export type TenantMoveEventSyncResult = z.infer<typeof TenantMoveEventSyncResultSchema>;

export const BuildingSyncStatusSchema = z.object({
  hasSchedule: z.boolean(),
  eventCount: z.number(),
  lastEventDate: z.string().nullable(),
  tenantsInBuilding: z.number(),
});
export type BuildingSyncStatus = z.infer<typeof BuildingSyncStatusSchema>;

export const AdminCalendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  eventDate: z.string(),
  endDate: z.string().nullable(),
  allDay: z.boolean(),
  category: EventCategorySchema,
  buildingName: z.string().nullable(),
  unitId: z.string().nullable(),
  createdById: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Tenant Visibility
  isVisibleToTenant: z.boolean(),
  // Notification Settings
  notifyAdmins: z.boolean(),
  notifyTenants: z.boolean(),
  notificationMethod: NotificationMethodSchema.nullable(),
  reminderTrigger: ReminderTriggerSchema.nullable(),
  notificationsSentAt: z.string().nullable(),
  reminderSentAt: z.string().nullable(),
  // Source tracking
  sourceType: EventSourceTypeSchema.nullable(),
  sourceId: z.string().nullable(),
});
export type AdminCalendarEvent = z.infer<typeof AdminCalendarEventSchema>;

export const CreateAdminCalendarEventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().nullable(),
  eventDate: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid date"),
  endDate: z.string().optional().nullable().refine((val) => !val || !isNaN(Date.parse(val)), "Invalid end date"),
  allDay: z.boolean().default(true),
  category: EventCategorySchema.default("logistics"),
  buildingName: z.string().optional().nullable(),
  unitId: z.string().optional().nullable(),
  // Tenant visibility
  isVisibleToTenant: z.boolean().default(false),
  // Notification settings
  notifyAdmins: z.boolean().default(false),
  notifyTenants: z.boolean().default(false),
  notificationMethod: NotificationMethodSchema.optional().nullable(),
  reminderTrigger: ReminderTriggerSchema.optional().nullable(),
  // Source tracking (for auto-generated events)
  sourceType: EventSourceTypeSchema.optional().nullable(),
  sourceId: z.string().optional().nullable(),
});
export type CreateAdminCalendarEvent = z.infer<typeof CreateAdminCalendarEventSchema>;

export const UpdateAdminCalendarEventSchema = CreateAdminCalendarEventSchema.partial();
export type UpdateAdminCalendarEvent = z.infer<typeof UpdateAdminCalendarEventSchema>;

// ============================================
// Tenant Communication Preferences Types
// ============================================

export const TenantCommunicationPreferenceSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  // Category opt-outs
  financialAlerts: z.boolean(),
  operationsAlerts: z.boolean(),
  complianceAlerts: z.boolean(),
  announcementsAlerts: z.boolean(),
  emergencyAlerts: z.boolean(),
  // Delivery preferences
  preferredMethod: NotificationMethodSchema,
  quietHoursEnabled: z.boolean(),
  quietHoursStart: z.string().nullable(),
  quietHoursEnd: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TenantCommunicationPreference = z.infer<typeof TenantCommunicationPreferenceSchema>;

export const UpdateTenantCommunicationPreferenceSchema = z.object({
  financialAlerts: z.boolean().optional(),
  operationsAlerts: z.boolean().optional(),
  complianceAlerts: z.boolean().optional(),
  announcementsAlerts: z.boolean().optional(),
  emergencyAlerts: z.boolean().optional(),
  preferredMethod: NotificationMethodSchema.optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().optional().nullable(),
  quietHoursEnd: z.string().optional().nullable(),
});
export type UpdateTenantCommunicationPreference = z.infer<typeof UpdateTenantCommunicationPreferenceSchema>;

// ============================================
// Calendar Communication History Types
// ============================================

export const CalendarNotificationTypeSchema = z.enum([
  "EVENT_CREATED",
  "REMINDER_24H",
  "REMINDER_3D",
  "AT_EVENT",
]);
export type CalendarNotificationType = z.infer<typeof CalendarNotificationTypeSchema>;

export const CalendarDeliveryStatusSchema = z.enum(["SENT", "DELIVERED", "FAILED", "SKIPPED"]);
export type CalendarDeliveryStatus = z.infer<typeof CalendarDeliveryStatusSchema>;

export const CalendarSkipReasonSchema = z.enum(["OPT_OUT", "GLOBAL_MUTE", "PREFERENCE_DISABLED"]);
export type CalendarSkipReason = z.infer<typeof CalendarSkipReasonSchema>;

export const RecipientTypeSchema = z.enum(["ADMIN", "TENANT"]);
export type RecipientType = z.infer<typeof RecipientTypeSchema>;

export const CalendarCommunicationHistorySchema = z.object({
  id: z.string(),
  eventId: z.string(),
  recipientId: z.string(),
  recipientType: RecipientTypeSchema,
  recipientEmail: z.string(),
  notificationType: CalendarNotificationTypeSchema,
  deliveryMethod: NotificationMethodSchema,
  status: CalendarDeliveryStatusSchema,
  skipReason: CalendarSkipReasonSchema.nullable(),
  emailMessageId: z.string().nullable(),
  errorMessage: z.string().nullable(),
  sentAt: z.string(),
});
export type CalendarCommunicationHistory = z.infer<typeof CalendarCommunicationHistorySchema>;

// Response schema for calendar events with notification info
export const AdminCalendarEventResponseSchema = AdminCalendarEventSchema.extend({
  unitLabel: z.string().optional(),
  isCustom: z.boolean().optional(),
});
export type AdminCalendarEventResponse = z.infer<typeof AdminCalendarEventResponseSchema>;

// ============================================
// System Backup Types
// ============================================

export const BackupTriggerTypeSchema = z.enum(["AUTOMATIC", "MANUAL"]);
export type BackupTriggerType = z.infer<typeof BackupTriggerTypeSchema>;

export const BackupStatusSchema = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"]);
export type BackupStatus = z.infer<typeof BackupStatusSchema>;

export const BackupFrequencySchema = z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"]);
export type BackupFrequency = z.infer<typeof BackupFrequencySchema>;

export const SystemBackupSchema = z.object({
  id: z.string(),
  triggerType: BackupTriggerTypeSchema,
  status: BackupStatusSchema,
  filename: z.string().nullable(),
  fileSize: z.number().nullable(),
  recordCounts: z.object({
    units: z.number(),
    tenants: z.number(),
    tenancies: z.number(),
    invoices: z.number(),
    checklistItems: z.number(),
    inspections: z.number(),
    buildingInfos: z.number(),
  }).nullable(),
  schemaVersion: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  downloadedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdById: z.string().nullable(),
  createdAt: z.string(),
});
export type SystemBackup = z.infer<typeof SystemBackupSchema>;

export const SystemBackupListResponseSchema = z.array(SystemBackupSchema);
export type SystemBackupListResponse = z.infer<typeof SystemBackupListResponseSchema>;

export const TriggerBackupResponseSchema = z.object({
  id: z.string(),
  triggerType: BackupTriggerTypeSchema,
  status: BackupStatusSchema,
  filename: z.string().nullable(),
  fileSize: z.number().nullable(),
  recordCounts: z.object({
    units: z.number(),
    tenants: z.number(),
    tenancies: z.number(),
    invoices: z.number(),
    checklistItems: z.number(),
    inspections: z.number(),
    buildingInfos: z.number(),
  }).nullable(),
  schemaVersion: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type TriggerBackupResponse = z.infer<typeof TriggerBackupResponseSchema>;

export const BackupDownloadResponseSchema = z.object({
  backupId: z.string(),
  filename: z.string(),
  content: z.string(),
});
export type BackupDownloadResponse = z.infer<typeof BackupDownloadResponseSchema>;

// ============================================
// Email Template Types
// ============================================

export const EmailTemplateKeySchema = z.enum([
  "WELCOME_EMAIL",
  "RENT_REMINDER",
  "OVERDUE_ALERT",
  "MAINTENANCE_UPDATE",
  "NEW_INVOICE",
]);
export type EmailTemplateKey = z.infer<typeof EmailTemplateKeySchema>;

export const EmailTemplatePlaceholderSchema = z.object({
  key: z.string(),
  description: z.string(),
  example: z.string(),
});
export type EmailTemplatePlaceholder = z.infer<typeof EmailTemplatePlaceholderSchema>;

// Automation Settings Schema
export const EmailTemplateAutomationSchema = z.object({
  timingOffset: z.number().min(0).max(365).default(3),
  timingUnit: z.enum(["days", "hours"]).default("days"),
  timingDirection: z.enum(["before", "after"]).default("before"),
  frequency: z.enum(["once", "daily", "weekly", "custom"]).default("once"),
  frequencyInterval: z.number().min(1).max(90).nullable().optional(),
  maxSendCount: z.number().min(1).max(10).nullable().optional(),
  triggerCondition: z.string().nullable().optional(),
  sendWindowStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).default("09:00"),
  sendWindowEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).default("17:00"),
  sendWindowTimezone: z.string().default("America/Toronto"),
});
export type EmailTemplateAutomation = z.infer<typeof EmailTemplateAutomationSchema>;

export const EmailTemplateSchema = z.object({
  id: z.string(),
  templateKey: EmailTemplateKeySchema,
  name: z.string(),
  description: z.string().nullable(),
  subject: z.string(),
  body: z.string(),
  isActive: z.boolean(),
  placeholders: z.array(EmailTemplatePlaceholderSchema),
  // Automation Settings
  timingOffset: z.number(),
  timingUnit: z.string(),
  timingDirection: z.string(),
  frequency: z.string(),
  frequencyInterval: z.number().nullable(),
  maxSendCount: z.number().nullable(),
  triggerCondition: z.string().nullable(),
  sendWindowStart: z.string(),
  sendWindowEnd: z.string(),
  sendWindowTimezone: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedById: z.string().nullable(),
});
export type EmailTemplate = z.infer<typeof EmailTemplateSchema>;

export const UpdateEmailTemplateSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  isActive: z.boolean().optional(),
  // Automation Settings (optional)
  timingOffset: z.number().min(0).max(365).optional(),
  timingUnit: z.enum(["days", "hours"]).optional(),
  timingDirection: z.enum(["before", "after"]).optional(),
  frequency: z.enum(["once", "daily", "weekly", "custom"]).optional(),
  frequencyInterval: z.number().min(1).max(90).nullable().optional(),
  maxSendCount: z.number().min(1).max(10).nullable().optional(),
  triggerCondition: z.string().nullable().optional(),
  sendWindowStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  sendWindowEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  sendWindowTimezone: z.string().optional(),
});
export type UpdateEmailTemplate = z.infer<typeof UpdateEmailTemplateSchema>;

export const TestEmailTemplateSchema = z.object({
  templateKey: EmailTemplateKeySchema,
  recipientEmail: z.string().email("Valid email required"),
});
export type TestEmailTemplate = z.infer<typeof TestEmailTemplateSchema>;

// ============================================
// Data Purge Types
// ============================================

export const DataPurgeRequestSchema = z.object({
  confirmationText: z.literal("PURGE DATA"),
});
export type DataPurgeRequest = z.infer<typeof DataPurgeRequestSchema>;

export const DataPurgeDeletedCountsSchema = z.object({
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
});
export type DataPurgeDeletedCounts = z.infer<typeof DataPurgeDeletedCountsSchema>;

export const DataPurgePreservedCountsSchema = z.object({
  adminUsers: z.number(),
  emailTemplates: z.number(),
});
export type DataPurgePreservedCounts = z.infer<typeof DataPurgePreservedCountsSchema>;

export const DataPurgeResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  deletedCounts: DataPurgeDeletedCountsSchema,
  preservedCounts: DataPurgePreservedCountsSchema,
});
export type DataPurgeResponse = z.infer<typeof DataPurgeResponseSchema>;

// ============================================
// e-Transfer Automation Center Types
// ============================================

export const EtransferEndpointConfigSchema = z.object({
  webhookUrl: z.string(),
  webhookSecret: z.string().nullable(),
  isConfigured: z.boolean(),
  customWebhookUrl: z.string().nullable(),
});
export type EtransferEndpointConfig = z.infer<typeof EtransferEndpointConfigSchema>;

export const UpdateEtransferEndpointConfigSchema = z.object({
  webhookUrl: z.string().url().optional(),
});
export type UpdateEtransferEndpointConfig = z.infer<typeof UpdateEtransferEndpointConfigSchema>;

export const TestWebhookStepStatusSchema = z.enum(["success", "failure", "skipped"]);
export type TestWebhookStepStatus = z.infer<typeof TestWebhookStepStatusSchema>;

export const TestWebhookStepSchema = z.object({
  step: z.string(),
  status: TestWebhookStepStatusSchema,
  message: z.string(),
});
export type TestWebhookStep = z.infer<typeof TestWebhookStepSchema>;

export const TestWebhookParsedDataSchema = z.object({
  senderName: z.string().nullable(),
  amount: z.string().nullable(),
  amountCents: z.number().nullable(),
  referenceNumber: z.string().nullable(),
  confidence: z.number().nullable(),
});
export type TestWebhookParsedData = z.infer<typeof TestWebhookParsedDataSchema>;

export const TestWebhookMatchedTenantSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  unit: z.string().nullable(),
});
export type TestWebhookMatchedTenant = z.infer<typeof TestWebhookMatchedTenantSchema>;

export const TestWebhookMatchedInvoiceSchema = z.object({
  id: z.string(),
  periodMonth: z.string(),
  amountCents: z.number(),
  status: z.string(),
  unitLabel: z.string(),
  buildingName: z.string(),
});
export type TestWebhookMatchedInvoice = z.infer<typeof TestWebhookMatchedInvoiceSchema>;

export const TestWebhookRequestSchema = z.object({
  rawEmailContent: z.string().min(1, "Raw email content is required"),
  rawEmailSubject: z.string().optional(),
});
export type TestWebhookRequest = z.infer<typeof TestWebhookRequestSchema>;

export const TestWebhookResponseSchema = z.object({
  steps: z.array(TestWebhookStepSchema),
  parsed: TestWebhookParsedDataSchema.nullable(),
  matchedTenant: TestWebhookMatchedTenantSchema.nullable(),
  invoice: TestWebhookMatchedInvoiceSchema.nullable(),
});
export type TestWebhookResponse = z.infer<typeof TestWebhookResponseSchema>;

export const ReconciliationTypeSchema = z.enum(["AUTO", "MANUAL", "FLAGGED"]);
export type ReconciliationType = z.infer<typeof ReconciliationTypeSchema>;

export const EtransferPaymentHistoryItemSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  tenantName: z.string().nullable(),
  tenantEmail: z.string(),
  unitId: z.string(),
  buildingName: z.string(),
  unitLabel: z.string(),
  invoiceId: z.string(),
  periodMonth: z.string(),
  amountCents: z.number(),
  method: z.string(),
  referenceNumber: z.string().nullable(),
  paidAt: z.string(),
  approvedByAdminId: z.string().nullable(),
  rawEmailContent: z.string().nullable(),
  reconciliationType: ReconciliationTypeSchema,
});
export type EtransferPaymentHistoryItem = z.infer<typeof EtransferPaymentHistoryItemSchema>;



