import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard,
  Wrench,
  AlertCircle,
  CheckCircle,
  Building2,
  Calendar,
  MapPin,
  FolderOpen,
  Info,
  ChevronDown,
  ChevronRight,
  Bell,
  AlertTriangle,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { PROPERTY } from "@/lib/constants";
import type { RoleInUnit } from "../../../../backend/src/types";
import type { ComplianceData } from "@/components/portal/AccountStandingCard";
import { LeaseExpiryBanner } from "@/components/portal/LeaseExpiryBanner";
import { cn } from "@/lib/utils";

interface HouseholdMember {
  id: string;
  name: string;
  email: string;
  roleInUnit: RoleInUnit;
}

interface DashboardData {
  tenant: {
    id: string;
    name: string;
    email: string;
  };
  unit: {
    id: string;
    unitLabel: string;
    buildingName?: string | null;
    rentAmountCents: number | null;
  } | null;
  tenancy: {
    startDate: string;
    roleInUnit: RoleInUnit;
  } | null;
  household: HouseholdMember[];
  currentInvoice: {
    id: string;
    periodMonth: string;
    dueDate: string;
    amountCents: number;
    status: string;
  } | null;
  recentPayments: Array<{
    id: string;
    amountCents: number;
    paidAt: string;
  }>;
  openServiceRequests: number;
  unreadAnnouncements: number;
  outstandingBalanceCents: number;
  overdueCount: number;
}

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

export default function TenantDashboard() {
  const [notificationsExpanded, setNotificationsExpanded] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["tenant-dashboard"],
    queryFn: () => api.get<DashboardData>("/api/tenant/dashboard"),
  });

  const { data: compliance, isLoading: complianceLoading } = useQuery({
    queryKey: ["tenant", "compliance"],
    queryFn: () => api.get<ComplianceData>("/api/tenant/compliance"),
  });

  // Handle Stripe payment verification when returning from checkout
  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    const invoiceId = searchParams.get("invoice");

    if (paymentStatus === "success" && invoiceId) {
      setVerifyingPayment(true);

      // Clear the URL params first
      setSearchParams({}, { replace: true });

      // Verify the payment with the backend
      api.post<{ verified: boolean; status: string; message: string }>(
        `/api/tenant/invoices/${invoiceId}/verify-payment`
      )
        .then((result) => {
          if (result.verified && result.status === "PAID") {
            toast({
              title: "Payment Successful",
              description: "Your payment has been processed and your invoice is marked as paid.",
            });
          } else {
            toast({
              title: "Payment Processing",
              description: result.message || "Your payment is being processed. Please check back shortly.",
              variant: "default",
            });
          }
          // Refresh dashboard data
          queryClient.invalidateQueries({ queryKey: ["tenant-dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["tenant-invoices"] });
        })
        .catch((err) => {
          console.error("[PAYMENT] Verification failed:", err);
          toast({
            title: "Payment Verification",
            description: "We couldn't verify your payment status. Please check your invoices.",
            variant: "destructive",
          });
        })
        .finally(() => {
          setVerifyingPayment(false);
        });
    } else if (paymentStatus === "cancelled") {
      setSearchParams({}, { replace: true });
      toast({
        title: "Payment Cancelled",
        description: "Your payment was cancelled. You can try again from the Invoices page.",
        variant: "default",
      });
    }
  }, [searchParams, setSearchParams, toast, queryClient]);

  // Show loading state while verifying payment
  if (verifyingPayment) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-lg font-medium">Verifying your payment...</p>
        <p className="text-sm text-muted-foreground">Please wait while we confirm your payment with Stripe.</p>
      </div>
    );
  }

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <p className="text-muted-foreground">Failed to load dashboard</p>
      </div>
    );
  }

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(cents / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const hasBalance = data.outstandingBalanceCents > 0;
  const hasOverdue = data.overdueCount > 0;
  const hasIssues = compliance?.issues && compliance.issues.length > 0;

  // Get countdown text for invoice
  const getInvoiceCountdown = () => {
    if (!data.currentInvoice) return null;
    const due = new Date(data.currentInvoice.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (data.currentInvoice.status === "OVERDUE" || diffDays < 0) {
      return { text: `${Math.abs(diffDays)} days overdue`, isOverdue: true, isUrgent: true };
    }
    if (diffDays === 0) return { text: "Due today", isOverdue: false, isUrgent: true };
    if (diffDays === 1) return { text: "Due tomorrow", isOverdue: false, isUrgent: true };
    if (diffDays <= 5) return { text: `Due in ${diffDays} days`, isOverdue: false, isUrgent: true };
    return { text: `Due ${formatDate(data.currentInvoice.dueDate)}`, isOverdue: false, isUrgent: false };
  };

  const invoiceCountdown = getInvoiceCountdown();

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* 1. Interactive Header with Building Info */}
      <motion.div variants={itemVariants} className="relative">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-serif font-medium tracking-tight text-foreground">
              Welcome back, {data.tenant.name.split(" ")[0]}
            </h1>
            <p className="text-muted-foreground mt-0.5">
              {data.unit?.buildingName || "Carsons Terrace"} &bull; Unit {data.unit?.unitLabel || "—"}
            </p>
            <p className="text-sm text-muted-foreground/70 mt-0.5">
              {PROPERTY.fullAddress}
            </p>
          </div>
        </div>
      </motion.div>

      {/* 2. Notifications Center - Collapsible */}
      {(hasIssues || (compliance?.leaseExpiry?.showWarning && compliance.leaseExpiry.daysRemaining !== null)) && (
        <motion.div variants={itemVariants}>
          <Card className={cn(
            "border-2 overflow-hidden transition-all",
            hasOverdue ? "border-destructive/50 bg-destructive/5" :
            hasIssues ? "border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20" :
            "border-blue-400/50 bg-blue-50/50 dark:bg-blue-950/20"
          )}>
            <button
              onClick={() => setNotificationsExpanded(!notificationsExpanded)}
              className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-lg",
                  hasOverdue ? "bg-destructive/10" :
                  hasIssues ? "bg-amber-100 dark:bg-amber-900/50" :
                  "bg-blue-100 dark:bg-blue-900/50"
                )}>
                  <Bell className={cn(
                    "h-5 w-5",
                    hasOverdue ? "text-destructive" :
                    hasIssues ? "text-amber-600" : "text-blue-600"
                  )} />
                </div>
                <div className="text-left">
                  <p className="font-medium">Notifications</p>
                  <p className="text-sm text-muted-foreground">
                    {(compliance?.issues?.length || 0) + (compliance?.leaseExpiry?.showWarning ? 1 : 0)} item{((compliance?.issues?.length || 0) + (compliance?.leaseExpiry?.showWarning ? 1 : 0)) !== 1 ? "s" : ""} need your attention
                  </p>
                </div>
              </div>
              <ChevronDown className={cn(
                "h-5 w-5 text-muted-foreground transition-transform",
                notificationsExpanded && "rotate-180"
              )} />
            </button>

            <AnimatePresence>
              {notificationsExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-2">
                    {compliance?.issues?.map((issue, index) => (
                      <NotificationItem
                        key={`${issue.type}-${index}`}
                        severity={issue.severity}
                        title={issue.title}
                        description={issue.description}
                        actionUrl={issue.actionUrl}
                      />
                    ))}
                    {compliance?.leaseExpiry?.showWarning && compliance.leaseExpiry.daysRemaining !== null && (
                      <LeaseExpiryBanner
                        endDate={compliance.leaseExpiry.endDate!}
                        daysRemaining={compliance.leaseExpiry.daysRemaining}
                      />
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>
      )}

      {/* 3. Account Summary Card - Prominent Finance Card */}
      <motion.div variants={itemVariants}>
        <Card className={cn(
          "border-2 overflow-hidden",
          hasOverdue ? "border-destructive/60 bg-gradient-to-br from-destructive/5 to-transparent" :
          hasBalance ? "border-accent/60 bg-gradient-to-br from-accent/5 to-transparent" :
          "border-emerald-400/60 bg-gradient-to-br from-emerald-50 to-transparent dark:from-emerald-950/30"
        )}>
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              {/* Left - Balance Info */}
              <div className="flex items-start gap-4">
                <div className={cn(
                  "p-4 rounded-2xl",
                  hasOverdue ? "bg-destructive/10" :
                  hasBalance ? "bg-accent/10" :
                  "bg-emerald-100 dark:bg-emerald-900/30"
                )}>
                  {hasBalance ? (
                    hasOverdue ? (
                      <AlertTriangle className="h-8 w-8 text-destructive" />
                    ) : (
                      <CreditCard className="h-8 w-8 text-accent" />
                    )
                  ) : (
                    <CheckCircle className="h-8 w-8 text-emerald-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Account Summary
                  </p>
                  <div className="flex items-baseline gap-3 mt-1">
                    <span className={cn(
                      "text-4xl font-bold tracking-tight",
                      hasOverdue ? "text-destructive" :
                      hasBalance ? "text-foreground" :
                      "text-emerald-600"
                    )}>
                      {formatCurrency(data.outstandingBalanceCents)}
                    </span>
                    {!hasBalance && (
                      <span className="text-emerald-600 font-medium">All paid!</span>
                    )}
                  </div>

                  {hasBalance && invoiceCountdown && (
                    <div className={cn(
                      "flex items-center gap-2 mt-2",
                      invoiceCountdown.isOverdue ? "text-destructive" :
                      invoiceCountdown.isUrgent ? "text-amber-600" :
                      "text-muted-foreground"
                    )}>
                      <Clock className="h-4 w-4" />
                      <span className="text-sm font-medium">{invoiceCountdown.text}</span>
                    </div>
                  )}

                  {hasOverdue && (
                    <p className="text-sm text-destructive font-medium mt-1">
                      {data.overdueCount} overdue invoice{data.overdueCount !== 1 ? "s" : ""} — please pay now
                    </p>
                  )}

                  {data.unit?.rentAmountCents && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Monthly rent: {formatCurrency(data.unit.rentAmountCents)}
                    </p>
                  )}
                </div>
              </div>

              {/* Right - Pay Button */}
              {hasBalance && (
                <Link to="/portal/invoices" className="flex-shrink-0">
                  <Button
                    size="lg"
                    className={cn(
                      "w-full lg:w-auto px-10 py-6 text-lg font-bold shadow-lg transition-all",
                      hasOverdue
                        ? "bg-destructive hover:bg-destructive/90"
                        : "bg-emerald-600 hover:bg-emerald-700 text-white"
                    )}
                  >
                    <CreditCard className="h-5 w-5 mr-2" />
                    Pay Rent
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 4. Quick Actions Grid - 4 columns */}
      <motion.div variants={itemVariants}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickActionCard
            icon={Wrench}
            label="Submit Request"
            to="/portal/service-requests"
            badge={data.openServiceRequests > 0 ? data.openServiceRequests : undefined}
          />
          <QuickActionCard
            icon={Calendar}
            label="View Calendar"
            to="/portal/calendar"
          />
          <QuickActionCard
            icon={FolderOpen}
            label="My Documents"
            to="/portal/documents"
          />
          <QuickActionCard
            icon={Info}
            label="Building Info"
            to="/portal/my-unit"
          />
        </div>
      </motion.div>

      {/* 5. Recent Payments (if any) */}
      {data.recentPayments.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">Recent Payments</CardTitle>
                <Link to="/portal/payments">
                  <Button variant="ghost" size="sm" className="text-xs">
                    View All <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {data.recentPayments.slice(0, 3).map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(payment.paidAt)}
                      </span>
                    </div>
                    <span className="font-medium">
                      {formatCurrency(payment.amountCents)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* 6. Resident Profile Card */}
      {data.tenancy && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium text-muted-foreground uppercase tracking-wider">
                Resident Profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <ProfileItem
                  icon={Building2}
                  label="Unit"
                  value={data.unit?.buildingName
                    ? `${data.unit.buildingName} - ${data.unit.unitLabel}`
                    : data.unit?.unitLabel || "Not assigned"}
                  to="/portal/my-unit"
                />
                <ProfileItem
                  icon={MapPin}
                  label="Address"
                  value={PROPERTY.fullAddress}
                />
                <ProfileItem
                  icon={Calendar}
                  label="Move-In Date"
                  value={formatDate(data.tenancy.startDate)}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}

// Quick Action Card Component
interface QuickActionCardProps {
  icon: React.ElementType;
  label: string;
  to: string;
  badge?: number;
}

function QuickActionCard({ icon: Icon, label, to, badge }: QuickActionCardProps) {
  return (
    <Link to={to}>
      <Card className="hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-pointer h-full">
        <CardContent className="p-4 flex flex-col items-center justify-center text-center min-h-[100px] relative">
          {badge !== undefined && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              {badge}
            </Badge>
          )}
          <div className="p-3 rounded-xl bg-muted/50 mb-2">
            <Icon className="h-6 w-6 text-muted-foreground" />
          </div>
          <span className="text-sm font-medium">{label}</span>
        </CardContent>
      </Card>
    </Link>
  );
}

// Profile Item Component
interface ProfileItemProps {
  icon: React.ElementType;
  label: string;
  value: string;
  to?: string;
}

function ProfileItem({ icon: Icon, label, value, to }: ProfileItemProps) {
  const content = (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50",
      to && "hover:bg-muted/50 hover:border-primary/20 transition-colors cursor-pointer"
    )}>
      <div className="p-2 rounded-lg bg-background border border-border/50">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="font-medium text-sm truncate">{value}</p>
      </div>
      {to && <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
    </div>
  );

  if (to) {
    return <Link to={to}>{content}</Link>;
  }
  return content;
}

// Notification Item Component
interface NotificationItemProps {
  severity: "warning" | "critical";
  title: string;
  description: string;
  actionUrl: string;
}

function NotificationItem({ severity, title, description, actionUrl }: NotificationItemProps) {
  const isCritical = severity === "critical";

  // Map backend URLs to frontend portal URLs
  const urlMap: Record<string, string> = {
    "/tenant/payments": "/portal/invoices",
    "/tenant/insurance": "/portal/insurance",
    "/tenant/documents": "/portal/documents",
    "/tenant/checklist": "/portal/settings",
  };
  const mappedUrl = urlMap[actionUrl] || actionUrl.replace("/tenant/", "/portal/");

  return (
    <Link to={mappedUrl}>
      <div className={cn(
        "flex items-center gap-3 p-3 rounded-lg transition-colors",
        "bg-white dark:bg-slate-900 border",
        isCritical
          ? "border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/50"
          : "border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/50"
      )}>
        <div className={cn(
          "p-1.5 rounded-full",
          isCritical ? "bg-red-100 dark:bg-red-900/50" : "bg-amber-100 dark:bg-amber-900/50"
        )}>
          {isCritical ? (
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{title}</span>
            <Badge
              variant="outline"
              className={cn(
                "text-xs px-1.5 py-0",
                isCritical
                  ? "border-red-300 text-red-700 dark:border-red-700 dark:text-red-300"
                  : "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
              )}
            >
              {isCritical ? "Urgent" : "Warning"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </div>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-start gap-4">
        <Skeleton className="h-14 w-14 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>

      {/* Account Summary skeleton */}
      <Skeleton className="h-40 w-full rounded-xl" />

      {/* Quick Actions skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>

      {/* Profile skeleton */}
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
