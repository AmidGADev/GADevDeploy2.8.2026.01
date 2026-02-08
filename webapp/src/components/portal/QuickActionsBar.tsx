import { Link } from "react-router-dom";
import { CreditCard, Wrench, FileText, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface QuickActionsBarProps {
  openServiceRequests?: number;
  hasUnpaidInvoice?: boolean;
}

interface QuickAction {
  to: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
  highlight?: boolean;
}

export function QuickActionsBar({
  openServiceRequests = 0,
  hasUnpaidInvoice = false,
}: QuickActionsBarProps) {
  const actions: QuickAction[] = [
    {
      to: "/portal/invoices",
      icon: CreditCard,
      label: "Pay Rent",
      highlight: hasUnpaidInvoice,
    },
    {
      to: "/portal/service-requests",
      icon: Wrench,
      label: "Service Request",
      badge: openServiceRequests > 0 ? openServiceRequests : undefined,
    },
    {
      to: "/portal/documents",
      icon: FileText,
      label: "Documents",
    },
    {
      to: "/portal/insurance",
      icon: Shield,
      label: "Insurance",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="flex flex-wrap gap-2 md:gap-3"
    >
      {actions.map((action) => (
        <QuickActionButton key={action.to} action={action} />
      ))}
    </motion.div>
  );
}

function QuickActionButton({ action }: { action: QuickAction }) {
  const Icon = action.icon;

  return (
    <Link
      to={action.to}
      className={cn(
        "relative inline-flex items-center gap-2 px-4 py-2.5 rounded-full",
        "text-sm font-medium transition-all duration-200",
        "border bg-background hover:bg-muted/80",
        action.highlight
          ? "border-accent bg-accent/10 hover:bg-accent/20 text-accent-foreground"
          : "border-border hover:border-muted-foreground/30"
      )}
    >
      <Icon className={cn("h-4 w-4", action.highlight ? "text-accent" : "text-muted-foreground")} />
      <span className={action.highlight ? "text-accent font-semibold" : ""}>{action.label}</span>
      {action.badge !== undefined ? (
        <Badge
          variant="destructive"
          className="absolute -top-1.5 -right-1.5 h-5 min-w-5 flex items-center justify-center text-xs px-1.5"
        >
          {action.badge}
        </Badge>
      ) : null}
    </Link>
  );
}
