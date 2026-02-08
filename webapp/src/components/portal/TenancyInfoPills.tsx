import { Link } from "react-router-dom";
import { Building2, Calendar, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface TenancyInfoPillsProps {
  unit?: {
    unitLabel: string;
    buildingName?: string | null;
  } | null;
  tenancy?: {
    startDate: string;
  } | null;
  propertyAddress: string;
}

interface InfoPill {
  icon: React.ElementType;
  label: string;
  value: string;
  to?: string;
}

export function TenancyInfoPills({
  unit,
  tenancy,
  propertyAddress,
}: TenancyInfoPillsProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const pills: InfoPill[] = [
    {
      icon: Building2,
      label: "Building & Unit",
      value: unit?.buildingName
        ? `${unit.buildingName} - ${unit.unitLabel}`
        : unit?.unitLabel || "Not assigned",
      to: "/portal/my-unit",
    },
    {
      icon: Calendar,
      label: "Move-in Date",
      value: tenancy?.startDate ? formatDate(tenancy.startDate) : "N/A",
    },
    {
      icon: MapPin,
      label: "Address",
      value: propertyAddress,
    },
  ];

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.3,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 sm:grid-cols-3 gap-3"
    >
      {pills.map((pill) => (
        <motion.div key={pill.label} variants={item}>
          <InfoPillCard pill={pill} />
        </motion.div>
      ))}
    </motion.div>
  );
}

function InfoPillCard({ pill }: { pill: InfoPill }) {
  const Icon = pill.icon;

  const content = (
    <div
      className={cn(
        "flex items-center gap-3 p-4 rounded-xl",
        "bg-muted/50 border border-border/50",
        "transition-all duration-200",
        pill.to && "hover:bg-muted hover:border-border cursor-pointer"
      )}
    >
      <div className="p-2 rounded-lg bg-background border border-border/50">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          {pill.label}
        </p>
        <p className="font-medium text-sm mt-0.5">{pill.value}</p>
      </div>
    </div>
  );

  if (pill.to) {
    return <Link to={pill.to}>{content}</Link>;
  }

  return content;
}
