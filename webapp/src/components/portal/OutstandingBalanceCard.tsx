import { Link } from "react-router-dom";
import { DollarSign, CheckCircle, AlertTriangle, Clock, CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface OutstandingBalanceCardProps {
  balanceCents: number;
  overdueCount: number;
  currentInvoice?: {
    periodMonth: string;
    dueDate: string;
    amountCents: number;
    status: string;
  } | null;
  hasOtherHouseholdMembers?: boolean;
}

export function OutstandingBalanceCard({
  balanceCents,
  overdueCount,
  currentInvoice,
  hasOtherHouseholdMembers = false,
}: OutstandingBalanceCardProps) {
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(cents / 100);
  };

  const getDaysUntilDue = (dueDate: string) => {
    const due = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const hasBalance = balanceCents > 0;
  const hasOverdue = overdueCount > 0;

  // Calculate countdown for current invoice
  const daysUntilDue = currentInvoice ? getDaysUntilDue(currentInvoice.dueDate) : null;
  const isInvoiceOverdue = currentInvoice?.status === "OVERDUE" || (daysUntilDue !== null && daysUntilDue < 0);
  const isUrgent = daysUntilDue !== null && daysUntilDue <= 3 && daysUntilDue >= 0;

  const getCountdownText = () => {
    if (!currentInvoice || daysUntilDue === null) return null;
    if (isInvoiceOverdue) {
      const overdueDays = Math.abs(daysUntilDue);
      return `OVERDUE - ${overdueDays} day${overdueDays !== 1 ? "s" : ""} past due`;
    }
    if (daysUntilDue === 0) return "Due TODAY";
    if (daysUntilDue === 1) return "Due TOMORROW";
    return `Due in ${daysUntilDue} days`;
  };

  const countdownText = getCountdownText();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 }}
    >
      <Card
        className={cn(
          "overflow-hidden border-2 transition-all duration-300",
          hasOverdue && "border-destructive/60 animate-pulse-border",
          hasBalance && !hasOverdue && isUrgent && "border-amber-500",
          hasBalance && !hasOverdue && !isUrgent && "border-accent",
          !hasBalance && "border-emerald-400/60 bg-emerald-50/50 dark:bg-emerald-950/20"
        )}
      >
        <CardContent
          className={cn(
            "p-4 md:p-6",
            hasOverdue && "bg-destructive/5",
            hasBalance && !hasOverdue && isUrgent && "bg-amber-50 dark:bg-amber-950/20",
            hasBalance && !hasOverdue && !isUrgent && "bg-accent/5"
          )}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Left side - Balance and invoice info */}
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "p-3 rounded-xl",
                  hasOverdue && "bg-destructive/10",
                  hasBalance && !hasOverdue && isUrgent && "bg-amber-100 dark:bg-amber-900/30",
                  hasBalance && !hasOverdue && !isUrgent && "bg-accent/10",
                  !hasBalance && "bg-emerald-100 dark:bg-emerald-900/30"
                )}
              >
                {hasBalance ? (
                  hasOverdue ? (
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                  ) : (
                    <CreditCard
                      className={cn(
                        "h-6 w-6",
                        isUrgent ? "text-amber-600" : "text-accent"
                      )}
                    />
                  )
                ) : (
                  <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p
                    className={cn(
                      "text-xs font-medium uppercase tracking-wider",
                      hasOverdue && "text-destructive",
                      hasBalance && !hasOverdue && isUrgent && "text-amber-700 dark:text-amber-400",
                      hasBalance && !hasOverdue && !isUrgent && "text-muted-foreground",
                      !hasBalance && "text-emerald-700 dark:text-emerald-400"
                    )}
                  >
                    Outstanding Balance
                  </p>
                  {currentInvoice && hasBalance && (
                    <Badge
                      variant={hasOverdue ? "destructive" : isUrgent ? "secondary" : "outline"}
                      className={cn(
                        "text-xs",
                        isUrgent && !hasOverdue && "bg-amber-100 text-amber-700 border-amber-300"
                      )}
                    >
                      {currentInvoice.periodMonth}
                    </Badge>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span
                    className={cn(
                      "text-3xl font-bold tracking-tight",
                      hasOverdue && "text-destructive",
                      hasBalance && !hasOverdue && isUrgent && "text-amber-700 dark:text-amber-300",
                      hasBalance && !hasOverdue && !isUrgent && "text-foreground",
                      !hasBalance && "text-emerald-700 dark:text-emerald-300"
                    )}
                  >
                    {formatCurrency(balanceCents)}
                  </span>
                  {!hasBalance && (
                    <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      All caught up!
                    </span>
                  )}
                </div>

                {/* Countdown / Due date info */}
                {hasBalance && countdownText && (
                  <div
                    className={cn(
                      "flex items-center gap-1.5 mt-2 text-sm font-medium",
                      hasOverdue && "text-destructive",
                      isUrgent && !hasOverdue && "text-amber-600",
                      !hasOverdue && !isUrgent && "text-muted-foreground"
                    )}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    <span>{countdownText}</span>
                  </div>
                )}

                {hasOverdue && (
                  <p className="text-sm text-destructive font-medium mt-1">
                    {overdueCount} overdue invoice{overdueCount !== 1 ? "s" : ""} - pay now to avoid late fees
                  </p>
                )}

                {hasOtherHouseholdMembers && hasBalance && (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    Payment by any household member completes rent for the unit.
                  </p>
                )}
              </div>
            </div>

            {/* Right side - Action button */}
            {hasBalance && (
              <div className="flex-shrink-0">
                <Link to="/portal/invoices">
                  <Button
                    size="lg"
                    className={cn(
                      "w-full md:w-auto font-semibold px-8 shadow-lg",
                      hasOverdue
                        ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        : "bg-accent hover:bg-accent/90 text-accent-foreground"
                    )}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pay Now
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
