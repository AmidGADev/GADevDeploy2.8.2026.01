import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Clock, Repeat, Bell, Info, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AutomationSettingsData {
  timingOffset: number;
  timingUnit: "days" | "hours";
  timingDirection: "before" | "after";
  frequency: "once" | "daily" | "weekly" | "custom";
  frequencyInterval: number | null;
  maxSendCount: number | null;
  triggerCondition: string | null;
  sendWindowStart: string;
  sendWindowEnd: string;
  sendWindowTimezone: string;
}

interface AutomationSettingsProps {
  templateKey: string;
  settings: AutomationSettingsData;
  onChange: (settings: AutomationSettingsData) => void;
}

// Template-specific trigger descriptions
const TRIGGER_INFO: Record<string, { label: string; description: string; targetDate: string }> = {
  WELCOME_EMAIL: {
    label: "Account Creation",
    description: "Sent when a new tenant account is created",
    targetDate: "Account creation date",
  },
  RENT_REMINDER: {
    label: "Payment Due Date",
    description: "Sent relative to the rent due date",
    targetDate: "Invoice due date",
  },
  OVERDUE_ALERT: {
    label: "Payment Due Date",
    description: "Sent when payment is past due",
    targetDate: "Invoice due date",
  },
  MAINTENANCE_UPDATE: {
    label: "Status Change",
    description: "Sent when maintenance ticket status changes",
    targetDate: "Status change event",
  },
  NEW_INVOICE: {
    label: "Invoice Creation",
    description: "Sent when a new invoice is generated",
    targetDate: "Invoice creation date",
  },
};

export function AutomationSettings({
  templateKey,
  settings,
  onChange,
}: AutomationSettingsProps) {
  const triggerInfo = TRIGGER_INFO[templateKey] || {
    label: "Event Trigger",
    description: "Sent based on system events",
    targetDate: "Event date",
  };

  const isEventDriven = ["WELCOME_EMAIL", "MAINTENANCE_UPDATE", "NEW_INVOICE"].includes(templateKey);
  const isTimeBased = ["RENT_REMINDER", "OVERDUE_ALERT"].includes(templateKey);

  const handleChange = <K extends keyof AutomationSettingsData>(
    key: K,
    value: AutomationSettingsData[K]
  ) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b">
        <Clock className="h-4 w-4 text-primary" />
        <h4 className="font-medium text-sm">Automation Settings</h4>
        <Badge variant="secondary" className="ml-auto text-xs">
          {triggerInfo.label}
        </Badge>
      </div>

      {/* Trigger Info Card */}
      <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-sm font-medium">{triggerInfo.description}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Target: {triggerInfo.targetDate}
            </p>
          </div>
        </div>
      </div>

      {/* Timing Section - Only for time-based templates */}
      {isTimeBased && (
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            When to Send
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={365}
              value={settings.timingOffset}
              onChange={(e) => handleChange("timingOffset", parseInt(e.target.value) || 0)}
              className="w-20"
            />
            <Select
              value={settings.timingUnit}
              onValueChange={(v) => handleChange("timingUnit", v as "days" | "hours")}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="days">days</SelectItem>
                <SelectItem value="hours">hours</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={settings.timingDirection}
              onValueChange={(v) => handleChange("timingDirection", v as "before" | "after")}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="before">before</SelectItem>
                <SelectItem value="after">after</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">due date</span>
          </div>
        </div>
      )}

      {/* Frequency Section */}
      <div className="space-y-3">
        <Label className="text-sm font-medium flex items-center gap-2">
          <Repeat className="h-3.5 w-3.5" />
          Frequency
        </Label>
        <div className="flex items-center gap-3">
          <Select
            value={settings.frequency}
            onValueChange={(v) => {
              handleChange("frequency", v as AutomationSettingsData["frequency"]);
              if (v !== "custom") {
                handleChange("frequencyInterval", null);
              }
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="once">Send Once</SelectItem>
              {isTimeBased && (
                <>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="custom">Custom Interval</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>

          {settings.frequency === "custom" && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">every</span>
              <Input
                type="number"
                min={1}
                max={90}
                value={settings.frequencyInterval || 3}
                onChange={(e) => handleChange("frequencyInterval", parseInt(e.target.value) || 3)}
                className="w-16"
              />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
          )}
        </div>

        {/* Max Send Count */}
        {settings.frequency !== "once" && (
          <div className="flex items-center gap-3 mt-2">
            <span className="text-sm text-muted-foreground">Stop after</span>
            <Input
              type="number"
              min={1}
              max={10}
              value={settings.maxSendCount || 5}
              onChange={(e) => handleChange("maxSendCount", parseInt(e.target.value) || 5)}
              className="w-16"
            />
            <span className="text-sm text-muted-foreground">emails</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Maximum emails to send until condition is met (e.g., payment received)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>

      {/* Send Window (Quiet Hours) */}
      <div className="space-y-3">
        <Label className="text-sm font-medium flex items-center gap-2">
          <Bell className="h-3.5 w-3.5" />
          Send Window
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Emails will only be sent during this time window</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
        <div className="flex items-center gap-2">
          <Input
            type="time"
            value={settings.sendWindowStart}
            onChange={(e) => handleChange("sendWindowStart", e.target.value)}
            className="w-28"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="time"
            value={settings.sendWindowEnd}
            onChange={(e) => handleChange("sendWindowEnd", e.target.value)}
            className="w-28"
          />
          <Select
            value={settings.sendWindowTimezone}
            onValueChange={(v) => handleChange("sendWindowTimezone", v)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="America/Toronto">Eastern (Toronto)</SelectItem>
              <SelectItem value="America/Vancouver">Pacific (Vancouver)</SelectItem>
              <SelectItem value="America/Edmonton">Mountain (Edmonton)</SelectItem>
              <SelectItem value="America/Winnipeg">Central (Winnipeg)</SelectItem>
              <SelectItem value="America/Halifax">Atlantic (Halifax)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

/**
 * Generate a human-readable schedule description
 */
export function getScheduleDescription(
  templateKey: string,
  settings: AutomationSettingsData
): string {
  const isEventDriven = ["WELCOME_EMAIL", "MAINTENANCE_UPDATE", "NEW_INVOICE"].includes(templateKey);

  if (isEventDriven) {
    return "Triggered by event";
  }

  let timing = "";
  if (settings.timingOffset === 0) {
    timing = "On due date";
  } else {
    timing = `${settings.timingOffset} ${settings.timingUnit} ${settings.timingDirection} due date`;
  }

  let frequency = "";
  if (settings.frequency === "once") {
    frequency = "Once";
  } else if (settings.frequency === "daily") {
    frequency = "Daily";
  } else if (settings.frequency === "weekly") {
    frequency = "Weekly";
  } else if (settings.frequency === "custom" && settings.frequencyInterval) {
    frequency = `Every ${settings.frequencyInterval} days`;
  }

  const maxSend = settings.maxSendCount ? ` (max ${settings.maxSendCount})` : "";

  return `${timing} • ${frequency}${maxSend}`;
}
