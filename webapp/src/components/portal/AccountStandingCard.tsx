import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ComplianceStatus = "GOOD_STANDING" | "ACTION_REQUIRED" | "NOT_IN_COMPLIANCE";
type IssueSeverity = "warning" | "critical";

interface ComplianceIssue {
  type: string;
  severity: IssueSeverity;
  title: string;
  description: string;
  actionUrl: string;
  dueDate?: string;
}

interface ProfileCompletion {
  percentage: number;
  missingItems: string[];
}

export interface ComplianceData {
  status: ComplianceStatus;
  issues: ComplianceIssue[];
  summary: {
    rentStatus: string;
    insuranceStatus: string;
    documentsCount: number;
    checklistProgress: {
      completed: number;
      total: number;
      requiredCompleted: number;
      requiredTotal: number;
    };
  };
  leaseExpiry: {
    endDate: string | null;
    daysRemaining: number | null;
    showWarning: boolean;
  } | null;
  profileCompletion: ProfileCompletion;
}

interface AccountStandingCardProps {
  compliance: ComplianceData;
}

const statusConfig: Record<
  ComplianceStatus,
  {
    icon: typeof CheckCircle;
    title: string;
    description: string;
    bgColor: string;
    borderColor: string;
    iconColor: string;
    textColor: string;
  }
> = {
  GOOD_STANDING: {
    icon: ShieldCheck,
    title: "Good Standing",
    description: "Your account is in good standing. No action required.",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
    borderColor: "border-emerald-200 dark:border-emerald-800",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    textColor: "text-emerald-700 dark:text-emerald-300",
  },
  ACTION_REQUIRED: {
    icon: ShieldAlert,
    title: "Action Required",
    description: "Please address the items below to maintain good standing.",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
    borderColor: "border-amber-200 dark:border-amber-800",
    iconColor: "text-amber-600 dark:text-amber-400",
    textColor: "text-amber-700 dark:text-amber-300",
  },
  NOT_IN_COMPLIANCE: {
    icon: ShieldX,
    title: "Not in Compliance",
    description: "Immediate action required. Please resolve the issues below.",
    bgColor: "bg-red-50 dark:bg-red-950/30",
    borderColor: "border-red-200 dark:border-red-800",
    iconColor: "text-red-600 dark:text-red-400",
    textColor: "text-red-700 dark:text-red-300",
  },
};

export function AccountStandingCard({ compliance }: AccountStandingCardProps) {
  const config = statusConfig[compliance.status];
  const StatusIcon = config.icon;

  return (
    <Card className={cn("border-2", config.borderColor, config.bgColor)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "p-2 rounded-lg",
                compliance.status === "GOOD_STANDING" && "bg-emerald-100 dark:bg-emerald-900/50",
                compliance.status === "ACTION_REQUIRED" && "bg-amber-100 dark:bg-amber-900/50",
                compliance.status === "NOT_IN_COMPLIANCE" && "bg-red-100 dark:bg-red-900/50"
              )}
            >
              <StatusIcon className={cn("h-6 w-6", config.iconColor)} />
            </div>
            <div>
              <CardTitle className={cn("text-lg font-semibold", config.textColor)}>
                {config.title}
              </CardTitle>
              <CardDescription className="text-sm mt-0.5">
                {config.description}
              </CardDescription>
            </div>
          </div>
          <Badge
            variant={
              compliance.status === "GOOD_STANDING"
                ? "default"
                : compliance.status === "ACTION_REQUIRED"
                ? "secondary"
                : "destructive"
            }
            className={cn(
              "font-medium",
              compliance.status === "GOOD_STANDING" &&
                "bg-emerald-600 hover:bg-emerald-600/90"
            )}
          >
            {compliance.status === "GOOD_STANDING"
              ? "Compliant"
              : compliance.status === "ACTION_REQUIRED"
              ? `${compliance.issues.length} Action${compliance.issues.length !== 1 ? "s" : ""}`
              : "Urgent"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Issues List */}
        {compliance.issues.length > 0 ? (
          <div className="space-y-2">
            {compliance.issues.map((issue, index) => (
              <IssueItem key={`${issue.type}-${index}`} issue={issue} />
            ))}
          </div>
        ) : null}

        {/* Profile Completion */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">
              Profile Completion
            </span>
            <span className="text-sm font-semibold">
              {compliance.profileCompletion.percentage}%
            </span>
          </div>
          <Progress
            value={compliance.profileCompletion.percentage}
            className={cn(
              "h-2",
              compliance.profileCompletion.percentage === 100 &&
                "[&>div]:bg-emerald-600"
            )}
          />
          {compliance.profileCompletion.missingItems.length > 0 ? (
            <p className="text-xs text-muted-foreground mt-2">
              Missing: {compliance.profileCompletion.missingItems.join(", ")}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

interface IssueItemProps {
  issue: ComplianceIssue;
}

// Map backend URLs to frontend portal URLs
function mapActionUrl(backendUrl: string): string {
  const urlMap: Record<string, string> = {
    "/tenant/payments": "/portal/invoices",
    "/tenant/insurance": "/portal/insurance",
    "/tenant/documents": "/portal/documents",
    "/tenant/checklist": "/portal/settings",
  };
  return urlMap[backendUrl] || backendUrl.replace("/tenant/", "/portal/");
}

function IssueItem({ issue }: IssueItemProps) {
  const isCritical = issue.severity === "critical";
  const actionUrl = mapActionUrl(issue.actionUrl);

  return (
    <Link to={actionUrl} className="block">
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg transition-colors",
          "bg-white dark:bg-slate-900 border",
          isCritical
            ? "border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/50"
            : "border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/50"
        )}
      >
        <div
          className={cn(
            "p-1.5 rounded-full",
            isCritical
              ? "bg-red-100 dark:bg-red-900/50"
              : "bg-amber-100 dark:bg-amber-900/50"
          )}
        >
          {isCritical ? (
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{issue.title}</span>
            <Badge
              variant="outline"
              className={cn(
                "text-xs px-1.5 py-0",
                isCritical
                  ? "border-red-300 text-red-700 dark:border-red-700 dark:text-red-300"
                  : "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
              )}
            >
              {isCritical ? "Critical" : "Warning"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {issue.description}
          </p>
        </div>

        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </div>
    </Link>
  );
}

export function AccountStandingCardSkeleton() {
  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted animate-pulse" />
            <div className="space-y-2">
              <div className="h-5 w-32 bg-muted animate-pulse rounded" />
              <div className="h-4 w-48 bg-muted animate-pulse rounded" />
            </div>
          </div>
          <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="h-14 bg-muted animate-pulse rounded-lg" />
          <div className="h-14 bg-muted animate-pulse rounded-lg" />
        </div>
        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <div className="h-4 w-28 bg-muted animate-pulse rounded" />
            <div className="h-4 w-8 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-2 bg-muted animate-pulse rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}
