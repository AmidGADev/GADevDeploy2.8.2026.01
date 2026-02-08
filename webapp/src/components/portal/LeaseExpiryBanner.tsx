import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar, X, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface LeaseExpiryBannerProps {
  endDate: string;
  daysRemaining: number;
}

type UrgencyLevel = "info" | "warning" | "critical";

function getUrgencyLevel(daysRemaining: number): UrgencyLevel {
  if (daysRemaining <= 30) return "critical";
  if (daysRemaining <= 60) return "warning";
  return "info";
}

const urgencyConfig: Record<
  UrgencyLevel,
  {
    bgColor: string;
    borderColor: string;
    iconColor: string;
    textColor: string;
    icon: typeof Calendar;
    title: string;
  }
> = {
  info: {
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    borderColor: "border-blue-200 dark:border-blue-800",
    iconColor: "text-blue-600 dark:text-blue-400",
    textColor: "text-blue-700 dark:text-blue-300",
    icon: Calendar,
    title: "Lease Expiring Soon",
  },
  warning: {
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
    borderColor: "border-amber-200 dark:border-amber-800",
    iconColor: "text-amber-600 dark:text-amber-400",
    textColor: "text-amber-700 dark:text-amber-300",
    icon: Clock,
    title: "Lease Expiring",
  },
  critical: {
    bgColor: "bg-red-50 dark:bg-red-950/30",
    borderColor: "border-red-200 dark:border-red-800",
    iconColor: "text-red-600 dark:text-red-400",
    textColor: "text-red-700 dark:text-red-300",
    icon: AlertTriangle,
    title: "Lease Expiring Very Soon",
  },
};

export function LeaseExpiryBanner({
  endDate,
  daysRemaining,
}: LeaseExpiryBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [lastDismissedLevel, setLastDismissedLevel] = useState<UrgencyLevel | null>(null);

  const urgencyLevel = getUrgencyLevel(daysRemaining);
  const config = urgencyConfig[urgencyLevel];
  const UrgencyIcon = config.icon;

  // Storage key for persistence
  const storageKey = "lease-expiry-dismissed";

  // Load dismissed state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setLastDismissedLevel(data.level);
        // Re-show if urgency level has increased (threshold changed)
        if (data.level !== urgencyLevel) {
          setDismissed(false);
        } else {
          setDismissed(true);
        }
      } catch {
        setDismissed(false);
      }
    }
  }, [urgencyLevel]);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        level: urgencyLevel,
        dismissedAt: new Date().toISOString(),
      })
    );
  };

  if (dismissed) {
    return null;
  }

  const formattedEndDate = new Date(endDate).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Alert
      className={cn(
        "relative border-2",
        config.bgColor,
        config.borderColor
      )}
    >
      <UrgencyIcon className={cn("h-5 w-5", config.iconColor)} />
      <AlertTitle className={cn("font-semibold", config.textColor)}>
        {config.title}
      </AlertTitle>
      <AlertDescription className="mt-1">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm">
            <span className="text-muted-foreground">
              Your lease expires on{" "}
            </span>
            <span className="font-medium">{formattedEndDate}</span>
            <span className="text-muted-foreground"> - </span>
            <span className={cn("font-semibold", config.textColor)}>
              {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining
            </span>
          </div>
          <Link to="/portal/profile">
            <Button
              size="sm"
              variant={urgencyLevel === "critical" ? "destructive" : "outline"}
              className={cn(
                urgencyLevel === "info" &&
                  "border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/50",
                urgencyLevel === "warning" &&
                  "border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/50"
              )}
            >
              Contact Management
            </Button>
          </Link>
        </div>
      </AlertDescription>
      <button
        onClick={handleDismiss}
        className={cn(
          "absolute top-3 right-3 p-1 rounded-md transition-colors",
          "hover:bg-white/50 dark:hover:bg-slate-800/50",
          "text-muted-foreground hover:text-foreground"
        )}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </Alert>
  );
}
