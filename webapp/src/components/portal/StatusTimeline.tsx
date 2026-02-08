import { Check, Clock, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatusTimelineProps {
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  createdAt: string;
  updatedAt: string;
}

interface TimelineStep {
  label: string;
  description: string;
  step: number;
}

const TIMELINE_STEPS: TimelineStep[] = [
  { label: "Submitted", description: "Request received", step: 1 },
  { label: "In Progress", description: "Being worked on", step: 2 },
  { label: "Completed", description: "Issue resolved", step: 3 },
];

function getStepFromStatus(status: StatusTimelineProps["status"]): number {
  switch (status) {
    case "OPEN":
      return 1;
    case "IN_PROGRESS":
      return 2;
    case "RESOLVED":
    case "CLOSED":
      return 3;
    default:
      return 1;
  }
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function StatusTimeline({ status, createdAt, updatedAt }: StatusTimelineProps) {
  const currentStep = getStepFromStatus(status);

  return (
    <div className="py-4">
      <div className="relative">
        {TIMELINE_STEPS.map((step, index) => {
          const isCompleted = step.step < currentStep;
          const isCurrent = step.step === currentStep;
          const isPending = step.step > currentStep;
          const isLast = index === TIMELINE_STEPS.length - 1;

          // Determine the timestamp to show
          let timestamp: string | null = null;
          if (step.step === 1) {
            // Submitted always shows createdAt
            timestamp = formatDateTime(createdAt);
          } else if (isCompleted || isCurrent) {
            // For completed or current steps after the first, show updatedAt
            timestamp = formatDateTime(updatedAt);
          }

          return (
            <div key={step.step} className="flex gap-4">
              {/* Timeline column with icon and line */}
              <div className="flex flex-col items-center">
                {/* Circle/Icon */}
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-300",
                    isCompleted && "bg-green-500 border-green-500 text-white",
                    isCurrent && "border-accent bg-accent/10 text-accent",
                    isPending && "border-gray-300 bg-gray-50 text-gray-400"
                  )}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : isCurrent ? (
                    <div className="relative">
                      <CircleDot className="w-4 h-4" />
                      {/* Pulsing ring for current step */}
                      <span className="absolute inset-0 rounded-full animate-ping bg-accent/30" />
                    </div>
                  ) : (
                    <Clock className="w-4 h-4" />
                  )}
                </div>

                {/* Connecting line */}
                {!isLast && (
                  <div
                    className={cn(
                      "w-0.5 h-12 mt-1",
                      isCompleted ? "bg-green-500" : "bg-gray-200"
                    )}
                  />
                )}
              </div>

              {/* Content column */}
              <div className="flex-1 pb-8">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <h4
                    className={cn(
                      "font-medium",
                      isCompleted && "text-green-700",
                      isCurrent && "text-accent",
                      isPending && "text-gray-400"
                    )}
                  >
                    {step.label}
                  </h4>
                  {timestamp && (
                    <span className="text-xs text-muted-foreground">
                      {timestamp}
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    "text-sm mt-0.5",
                    isPending ? "text-gray-400" : "text-muted-foreground"
                  )}
                >
                  {isCurrent && status === "RESOLVED"
                    ? "Issue has been resolved"
                    : isCurrent && status === "CLOSED"
                    ? "Request closed"
                    : step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
