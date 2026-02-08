import { useQuery } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { api } from "@/lib/api";
import {
  Building2,
  Users,
  Wrench,
  Calendar,
  UserPlus,
  Bell,
  FileCheck,
  AlertCircle,
  CheckCircle2,
  Shield,
  ChevronRight,
  AlertTriangle,
  TrendingUp,
  ChevronDown,
  Home,
  DollarSign,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import type { AdminDashboard as AdminDashboardType } from "../../../../backend/src/types";
import { cn } from "@/lib/utils";

// Helper to format relative time
function formatRelativeTime(dateString: string | null): string | null {
  if (!dateString) return null;

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return "1 month ago";
  return `${Math.floor(diffDays / 30)} months ago`;
}

// Donut Chart Component for Occupancy
function OccupancyDonut({
  occupied,
  vacant,
  renovation,
  total,
}: {
  occupied: number;
  vacant: number;
  renovation: number;
  total: number;
}) {
  const size = 140;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const occupiedPct = total > 0 ? (occupied / total) * 100 : 0;
  const vacantPct = total > 0 ? (vacant / total) * 100 : 0;
  const renovationPct = total > 0 ? (renovation / total) * 100 : 0;

  const occupiedDash = (occupiedPct / 100) * circumference;
  const vacantDash = (vacantPct / 100) * circumference;
  const renovationDash = (renovationPct / 100) * circumference;

  const occupiedOffset = 0;
  const vacantOffset = -occupiedDash;
  const renovationOffset = -(occupiedDash + vacantDash);

  return (
    <div className="relative">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        {/* Occupied - Emerald */}
        {occupied > 0 && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="hsl(152 60% 38%)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${occupiedDash} ${circumference}`}
            strokeDashoffset={occupiedOffset}
            className="transition-all duration-500"
          />
        )}
        {/* Vacant - Slate */}
        {vacant > 0 && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="hsl(215 20% 65%)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${vacantDash} ${circumference}`}
            strokeDashoffset={vacantOffset}
            className="transition-all duration-500"
          />
        )}
        {/* Under Renovation - Amber */}
        {renovation > 0 && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="hsl(40 95% 50%)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${renovationDash} ${circumference}`}
            strokeDashoffset={renovationOffset}
            className="transition-all duration-500"
          />
        )}
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-foreground">{Math.round(occupiedPct)}%</span>
        <span className="text-xs text-muted-foreground">Occupied</span>
      </div>
    </div>
  );
}

// Progress Bar for Cash Flow
function CashFlowProgress({
  collectionRate,
}: {
  collectionRate: number;
}) {
  const percentage = Math.min(collectionRate, 100);

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Collection Progress</span>
        <span className="font-medium">{percentage}%</span>
      </div>
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            percentage >= 90 ? "bg-emerald-500" : percentage >= 70 ? "bg-amber-500" : "bg-red-500"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// Action Item Component for Action Center
interface ActionItemProps {
  title: string;
  count: number;
  timestamp?: string | null;
  icon: React.ElementType;
  variant: "critical" | "warning" | "info";
  onClick: () => void;
}

function ActionItem({ title, count, timestamp, icon: Icon, variant, onClick }: ActionItemProps) {
  const variantStyles = {
    critical: {
      dot: "bg-red-500",
      hover: "hover:bg-red-50",
    },
    warning: {
      dot: "bg-amber-500",
      hover: "hover:bg-amber-50",
    },
    info: {
      dot: "bg-blue-500",
      hover: "hover:bg-blue-50",
    },
  };

  const styles = variantStyles[variant];
  const relativeTime = formatRelativeTime(timestamp || null);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left",
        styles.hover
      )}
    >
      <div className={cn("w-2 h-2 rounded-full flex-shrink-0", styles.dot)} />
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm">{count} {title}</span>
        {relativeTime && (
          <span className="text-xs text-muted-foreground ml-2">oldest {relativeTime}</span>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

// Recent Activity Item
interface ActivityItemProps {
  title: string;
  unit: string;
  building: string;
  tenant: string;
  priority: string;
  createdAt: string;
  onClick: () => void;
}

function ActivityItem({ title, unit, building, tenant, priority, createdAt, onClick }: ActivityItemProps) {
  const relativeTime = formatRelativeTime(createdAt);
  const priorityColors = {
    URGENT: "bg-red-100 text-red-700 border-red-200",
    HIGH: "bg-orange-100 text-orange-700 border-orange-200",
    MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
    LOW: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
    >
      <div className="p-2 rounded-lg bg-muted">
        <Wrench className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{title}</p>
        <p className="text-xs text-muted-foreground">
          {unit} · {building} · {tenant}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Badge
          variant="outline"
          className={cn("text-xs", priorityColors[priority as keyof typeof priorityColors] || priorityColors.LOW)}
        >
          {priority}
        </Badge>
        <span className="text-xs text-muted-foreground">{relativeTime}</span>
      </div>
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const actionCenterRef = useRef<HTMLDivElement>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["admin", "dashboard", selectedBuilding],
    queryFn: () => {
      const params = selectedBuilding ? `?buildingName=${encodeURIComponent(selectedBuilding)}` : "";
      return api.get<AdminDashboardType>(`/api/admin/dashboard${params}`);
    },
  });

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  // Build action items list
  const actionItems: ActionItemProps[] = [];
  if (dashboard) {
    if (dashboard.overdueInvoices > 0) {
      actionItems.push({
        title: "overdue invoices",
        count: dashboard.overdueInvoices,
        timestamp: dashboard.timestamps?.oldestOverdueInvoice,
        icon: AlertCircle,
        variant: "critical",
        onClick: () => navigate("/admin/invoices?status=OVERDUE"),
      });
    }

    if (dashboard.urgentServiceRequests > 0) {
      actionItems.push({
        title: "urgent requests",
        count: dashboard.urgentServiceRequests,
        timestamp: dashboard.timestamps?.oldestServiceRequest,
        icon: AlertTriangle,
        variant: "critical",
        onClick: () => navigate("/admin/service-requests?priority=urgent"),
      });
    }

    if (dashboard.openServiceRequests > 0) {
      actionItems.push({
        title: "open requests",
        count: dashboard.openServiceRequests,
        timestamp: dashboard.timestamps?.oldestServiceRequest,
        icon: Wrench,
        variant: "warning",
        onClick: () => navigate("/admin/service-requests"),
      });
    }

    if (dashboard.insuranceCompliance && (dashboard.insuranceCompliance.missing + dashboard.insuranceCompliance.expired) > 0) {
      actionItems.push({
        title: "insurance issues",
        count: dashboard.insuranceCompliance.missing + dashboard.insuranceCompliance.expired,
        icon: Shield,
        variant: "warning",
        onClick: () => navigate("/admin/insurance"),
      });
    }

    if (dashboard.pendingShowingRequests > 0) {
      actionItems.push({
        title: "showing requests",
        count: dashboard.pendingShowingRequests,
        timestamp: dashboard.timestamps?.oldestShowingRequest,
        icon: Calendar,
        variant: "info",
        onClick: () => navigate("/admin/showing-requests"),
      });
    }

    if (dashboard.pendingChecklists > 0) {
      actionItems.push({
        title: "pending checklists",
        count: dashboard.pendingChecklists,
        icon: FileCheck,
        variant: "info",
        onClick: () => navigate("/admin/tenants"),
      });
    }
  }

  // Property health status for header
  const healthStatus = dashboard?.propertyHealth?.status || "GOOD";
  const healthConfig = {
    GOOD: { color: "text-emerald-600", bg: "bg-emerald-500" },
    NEEDS_ATTENTION: { color: "text-amber-600", bg: "bg-amber-500" },
    CRITICAL: { color: "text-red-600", bg: "bg-red-500" },
  };

  // Check if we're in a zero-state (no units/properties)
  const isEmptyState = !isLoading && dashboard && dashboard.totalUnits === 0;

  // Empty state when no units exist
  if (isEmptyState) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-serif font-medium tracking-tight text-slate-900">
            Portfolio Overview
          </h1>
        </div>

        <div className="border-2 border-dashed rounded-xl p-8 text-center bg-muted/10">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center mb-4 shadow-inner">
            <Building2 className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-base font-medium text-foreground mb-1">Welcome to Your Dashboard</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
            Get started by adding your first property and units to begin managing your portfolio.
          </p>
          <Button onClick={() => navigate('/admin/units')}>Add Your First Property</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Building Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-medium tracking-tight text-slate-900">
            Portfolio Overview
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <div className={cn("w-2 h-2 rounded-full", healthConfig[healthStatus].bg)} />
            <span className={cn("text-sm font-medium", healthConfig[healthStatus].color)}>
              {healthStatus === "GOOD" ? "All Systems Healthy" :
               healthStatus === "NEEDS_ATTENTION" ? "Needs Attention" : "Critical Issues"}
            </span>
          </div>
        </div>

        {/* Building Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto justify-between gap-2">
              <Building2 className="h-4 w-4" />
              <span>{selectedBuilding || "All Buildings"}</span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => setSelectedBuilding(null)}>
              <Building2 className="h-4 w-4 mr-2" />
              All Buildings
            </DropdownMenuItem>
            {dashboard?.buildings?.map((building) => (
              <DropdownMenuItem
                key={building}
                onClick={() => setSelectedBuilding(building)}
              >
                <Home className="h-4 w-4 mr-2" />
                {building}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Quick Actions - Critical Landlord Actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => navigate("/admin/invoices")}
          className="gap-2"
        >
          <DollarSign className="h-4 w-4" />
          Generate Invoices
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate("/admin/service-requests")}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          New Service Request
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate("/admin/announcements")}
          className="gap-2"
        >
          <Bell className="h-4 w-4" />
          Send Announcement
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate("/admin/tenants")}
          className="gap-2"
        >
          <UserPlus className="h-4 w-4" />
          Invite Tenant
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate("/admin/units")}
          className="gap-2"
        >
          <Building2 className="h-4 w-4" />
          Add Unit
        </Button>
      </div>

      {/* Main Grid: Occupancy + Cash Flow + Action Center */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Occupancy Overview Card */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Occupancy Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <Skeleton className="h-32 w-32 rounded-full" />
              </div>
            ) : dashboard ? (
              <div className="flex flex-col items-center gap-4">
                <OccupancyDonut
                  occupied={dashboard.occupiedUnits}
                  vacant={dashboard.vacantUnits}
                  renovation={dashboard.underRenovationUnits}
                  total={dashboard.totalUnits}
                />
                <div className="grid grid-cols-3 gap-3 w-full text-center">
                  <div>
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-lg font-semibold">{dashboard.occupiedUnits}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Occupied</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <div className="w-2 h-2 rounded-full bg-slate-400" />
                      <span className="text-lg font-semibold">{dashboard.vacantUnits}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Vacant</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-lg font-semibold">{dashboard.underRenovationUnits}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Renovation</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t w-full justify-center">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{dashboard.totalTenants} Active Tenants</span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Cash Flow Card */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Cash Flow – {dashboard?.currentMonthLabel || "This Month"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : dashboard ? (
              <div className="space-y-4">
                <div>
                  <p className="text-2xl font-bold text-emerald-600">
                    {formatCurrency(dashboard.collectedRevenue)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    of {formatCurrency(dashboard.expectedMonthlyRevenue)} expected
                  </p>
                </div>

                <CashFlowProgress collectionRate={dashboard.collectionRate} />

                {/* Outstanding section - consolidated view */}
                <div className="pt-2 border-t">
                  {dashboard.overdueInvoices > 0 ? (
                    <button
                      onClick={() => navigate("/admin/invoices?status=OVERDUE")}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <div className="text-left">
                          <p className="text-sm font-medium text-red-700">
                            {formatCurrency(dashboard.overdueInvoicesAmount)} overdue
                          </p>
                          <p className="text-xs text-red-600">
                            {dashboard.overdueInvoices} invoice{dashboard.overdueInvoices !== 1 ? "s" : ""} past due
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-red-400" />
                    </button>
                  ) : dashboard.pendingRevenue > 0 ? (
                    <button
                      onClick={() => navigate("/admin/invoices?status=OPEN")}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="text-left">
                        <p className="text-sm font-medium">
                          {formatCurrency(dashboard.pendingRevenue)} pending
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {dashboard.outstandingInvoicesCount} invoice{dashboard.outstandingInvoicesCount !== 1 ? "s" : ""} awaiting payment
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm text-emerald-700">All payments collected</span>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Action Center Card */}
        <Card className="lg:col-span-1" ref={actionCenterRef}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Action Center
              {actionItems.length > 0 && (
                <Badge variant="secondary" className="ml-auto">
                  {actionItems.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : actionItems.length > 0 ? (
              <div className="divide-y max-h-64 overflow-y-auto">
                {actionItems.map((item, index) => (
                  <ActionItem key={index} {...item} />
                ))}
              </div>
            ) : (
              <div className="p-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">All caught up!</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Recent Activity + Insurance Compliance */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent Maintenance Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                Recent Maintenance
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/admin/service-requests")}
                className="text-xs"
              >
                View All
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : dashboard?.recentServiceRequests && dashboard.recentServiceRequests.length > 0 ? (
              <div className="divide-y">
                {dashboard.recentServiceRequests.map((req) => (
                  <ActivityItem
                    key={req.id}
                    title={req.title}
                    unit={req.unitLabel}
                    building={req.buildingName}
                    tenant={req.tenantName}
                    priority={req.priority}
                    createdAt={req.createdAt}
                    onClick={() => navigate(`/admin/service-requests?id=${req.id}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="p-6 text-center">
                <Wrench className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No recent requests</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Insurance Compliance - Simplified */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Insurance Status
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/admin/insurance")}
                className="text-xs"
              >
                Manage
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : dashboard?.insuranceCompliance ? (
              dashboard.insuranceCompliance.total === 0 ? (
                <div className="p-4 text-center">
                  <Shield className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No tenants to track</p>
                </div>
              ) : (
              <div className="space-y-4">
                {/* Summary Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span className="text-lg font-semibold text-emerald-700">
                        {dashboard.insuranceCompliance.verified}
                      </span>
                    </div>
                    <p className="text-xs text-emerald-600 mt-0.5">Verified</p>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <span className="text-lg font-semibold text-amber-700">
                        {dashboard.insuranceCompliance.pending}
                      </span>
                    </div>
                    <p className="text-xs text-amber-600 mt-0.5">Pending Review</p>
                  </div>
                </div>

                {/* Issues */}
                {(dashboard.insuranceCompliance.missing > 0 || dashboard.insuranceCompliance.expired > 0) && (
                  <div className="space-y-2">
                    {dashboard.insuranceCompliance.missing > 0 && (
                      <button
                        onClick={() => navigate("/admin/insurance?status=missing")}
                        className="w-full flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-red-600" />
                          <span className="text-sm font-medium text-red-700">
                            {dashboard.insuranceCompliance.missing} tenant{dashboard.insuranceCompliance.missing !== 1 ? "s" : ""} missing insurance
                          </span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-red-400" />
                      </button>
                    )}
                    {dashboard.insuranceCompliance.expired > 0 && (
                      <button
                        onClick={() => navigate("/admin/insurance?status=expired")}
                        className="w-full flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <span className="text-sm font-medium text-amber-700">
                            {dashboard.insuranceCompliance.expired} tenant{dashboard.insuranceCompliance.expired !== 1 ? "s" : ""} with expired insurance
                          </span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-amber-400" />
                      </button>
                    )}
                  </div>
                )}

                {/* All Good State */}
                {dashboard.insuranceCompliance.missing === 0 &&
                 dashboard.insuranceCompliance.expired === 0 &&
                 dashboard.insuranceCompliance.pending === 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <span className="text-sm text-emerald-700">All tenants compliant</span>
                  </div>
                )}
              </div>
              )
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
