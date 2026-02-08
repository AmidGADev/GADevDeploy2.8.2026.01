import { useState, useEffect, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Send,
  Mail,
  Users,
  Building2,
  Clock,
  CheckCircle,
  TestTube,
  AlertCircle,
  Loader2,
  ChevronDown,
  Settings2,
  Save,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  HelpCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Unit, User } from "../../../../backend/src/types";

type RecipientType = "ALL" | "UNITS" | "CUSTOM";

interface EmailFormData {
  subject: string;
  bodyHtml: string;
  recipients: RecipientType;
  unitIds: string[];
  userIds: string[];
}

interface SentEmail {
  id: string;
  subject: string;
  toGroup: string;
  emailType: string;
  source: "Admin" | "System";
  recipientCount: number;
  sentAt: string;
  status: "sent" | "failed";
  errorMessage?: string | null;
}

interface EmailConfig {
  configured: boolean;
  provider: string;
  fromEmail: string;
  warning?: string;
}

interface EmailSettings {
  id: string;
  senderName: string;
  senderEmail: string;
  replyToEmail: string | null;
  verificationStatus: "pending" | "verified" | "failed";
  verifiedDomain: string | null;
  updatedAt: string;
  updatedBy: { id: string; name: string | null; email: string } | null;
}

interface TestEmailResult {
  ok: boolean;
  error?: string;
  sentTo?: string;
  provider?: string;
}

const defaultFormData: EmailFormData = {
  subject: "",
  bodyHtml: "",
  recipients: "ALL",
  unitIds: [],
  userIds: [],
};

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Collapsible Section Component (inline for consistency with AdminSettings)
interface CollapsibleSectionProps {
  title: string;
  icon: ReactNode;
  badge?: ReactNode;
  headerAction?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  compact?: boolean;
}

function CollapsibleSection({
  title,
  icon,
  badge,
  headerAction,
  defaultOpen = false,
  children,
  className,
  compact = false,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (compact) {
    return (
      <div className={cn("border-t border-border/50 pt-4 mt-4", className)}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between hover:bg-muted/30 -mx-2 px-2 py-2 rounded-lg transition-colors group"
        >
          <div className="flex items-center gap-2">
            <div className="text-muted-foreground">{icon}</div>
            <span className="text-sm font-medium">{title}</span>
            {badge}
          </div>
          <div className="flex items-center gap-2">
            {headerAction && (
              <div onClick={(e) => e.stopPropagation()}>{headerAction}</div>
            )}
            <motion.div
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </motion.div>
          </div>
        </button>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              <div className="pt-4">{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <Card className={cn("border border-border/50 shadow-sm", className)}>
      <CardHeader className="pb-0">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between hover:bg-muted/30 -mx-2 px-2 py-2 rounded-lg transition-colors group"
        >
          <div className="flex items-center gap-2">
            <div className="text-muted-foreground">{icon}</div>
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            {badge}
          </div>
          <div className="flex items-center gap-2">
            {headerAction && (
              <div onClick={(e) => e.stopPropagation()}>{headerAction}</div>
            )}
            <motion.div
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </motion.div>
          </div>
        </button>
      </CardHeader>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <CardContent className="pt-4">{children}</CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

export default function EmailPage() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<EmailFormData>(defaultFormData);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testResult, setTestResult] = useState<TestEmailResult | null>(null);

  // Sender form state
  const [senderForm, setSenderForm] = useState({
    senderName: "",
    senderEmail: "",
    replyToEmail: "",
  });
  const [senderFormDirty, setSenderFormDirty] = useState(false);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);

  // Fetch email settings
  const { data: emailSettings, isLoading: emailSettingsLoading, refetch: refetchEmailSettings } = useQuery({
    queryKey: ["admin", "email-settings"],
    queryFn: () => api.get<EmailSettings>("/api/admin/email-settings"),
  });

  // Refresh verification status handler
  const handleRefreshStatus = async () => {
    setIsRefreshingStatus(true);
    try {
      await refetchEmailSettings();
      toast.success("Verification status refreshed");
    } catch {
      toast.error("Failed to refresh status");
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  // Initialize sender form when settings load
  useEffect(() => {
    if (emailSettings && !senderFormDirty) {
      setSenderForm({
        senderName: emailSettings.senderName,
        senderEmail: emailSettings.senderEmail,
        replyToEmail: emailSettings.replyToEmail || "",
      });
    }
  }, [emailSettings, senderFormDirty]);

  // Update email settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: (data: { senderName?: string; senderEmail?: string; replyToEmail?: string | null }) =>
      api.put<EmailSettings>("/api/admin/email-settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "email-settings"] });
      setSenderFormDirty(false);
      toast.success("Sender settings updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update settings");
    },
  });

  // Fetch email config status
  const { data: emailConfig } = useQuery({
    queryKey: ["admin", "email", "config"],
    queryFn: () => api.get<EmailConfig>("/api/admin/email/config"),
  });

  // Fetch units for recipient selection
  const { data: units } = useQuery({
    queryKey: ["admin", "units"],
    queryFn: () => api.get<Unit[]>("/api/admin/units"),
  });

  // Fetch tenants for recipient selection
  const { data: tenants } = useQuery({
    queryKey: ["admin", "tenants"],
    queryFn: () => api.get<User[]>("/api/admin/tenants"),
  });

  // Fetch sent emails history
  const { data: sentEmails, isLoading: isLoadingHistory } = useQuery({
    queryKey: ["admin", "emails", "history"],
    queryFn: () => api.get<SentEmail[]>("/api/admin/email/history"),
  });

  // Send test email mutation
  const testMutation = useMutation({
    mutationFn: async (to: string) => {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/admin/email/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to }),
      });
      return response.json() as Promise<TestEmailResult>;
    },
    onSuccess: (data) => {
      setTestResult(data);
      if (data.ok) {
        toast.success(`Test email sent to ${data.sentTo}`);
      } else {
        toast.error(data.error || "Failed to send test email");
      }
    },
    onError: (error: Error) => {
      setTestResult({ ok: false, error: error.message });
      toast.error(error.message || "Failed to send test email");
    },
  });

  // Send email mutation
  const sendMutation = useMutation({
    mutationFn: (data: EmailFormData) =>
      api.post<{ recipientCount: number }>("/api/admin/email/send", {
        subject: data.subject,
        bodyHtml: data.bodyHtml,
        recipients: data.recipients,
        unitIds: data.recipients === "UNITS" ? data.unitIds : undefined,
        userIds: data.recipients === "CUSTOM" ? data.userIds : undefined,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "emails", "history"] });
      setFormData(defaultFormData);
      setIsConfirmDialogOpen(false);
      toast.success(`Email sent to ${data?.recipientCount || 0} recipient(s)`);
    },
    onError: (error: Error) => {
      setIsConfirmDialogOpen(false);
      toast.error(error.message || "Failed to send email");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsConfirmDialogOpen(true);
  };

  const handleSendConfirm = () => {
    sendMutation.mutate(formData);
  };

  const handleSaveSenderSettings = () => {
    updateSettingsMutation.mutate({
      senderName: senderForm.senderName || undefined,
      senderEmail: senderForm.senderEmail || undefined,
      replyToEmail: senderForm.replyToEmail || null,
    });
  };

  const toggleUnitSelection = (unitId: string) => {
    setFormData((prev) => ({
      ...prev,
      unitIds: prev.unitIds.includes(unitId)
        ? prev.unitIds.filter((id) => id !== unitId)
        : [...prev.unitIds, unitId],
    }));
  };

  const toggleUserSelection = (userId: string) => {
    setFormData((prev) => ({
      ...prev,
      userIds: prev.userIds.includes(userId)
        ? prev.userIds.filter((id) => id !== userId)
        : [...prev.userIds, userId],
    }));
  };

  const occupiedUnits = units?.filter((u) => u.status === "OCCUPIED") || [];
  const activeTenants = tenants?.filter((t) => t.status === "ACTIVE") || [];

  // Calculate recipient count for confirmation
  const getRecipientCount = () => {
    switch (formData.recipients) {
      case "ALL":
        return activeTenants.length;
      case "UNITS":
        return formData.unitIds.length;
      case "CUSTOM":
        return formData.userIds.length;
      default:
        return 0;
    }
  };

  const isFormValid = () => {
    if (!formData.subject.trim() || !formData.bodyHtml.trim()) return false;
    if (formData.recipients === "UNITS" && formData.unitIds.length === 0) return false;
    if (formData.recipients === "CUSTOM" && formData.userIds.length === 0) return false;
    return true;
  };

  const isSenderFormDirty = () => {
    if (!emailSettings) return false;
    return (
      senderForm.senderName !== emailSettings.senderName ||
      senderForm.senderEmail !== emailSettings.senderEmail ||
      senderForm.replyToEmail !== (emailSettings.replyToEmail || "")
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-serif font-medium">Send Email</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compose and send emails to your tenants
        </p>
      </div>

      {/* Sender Configuration Card */}
      <Card className="border border-border/50 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Sender Configuration</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {emailSettings ? (
                emailSettings.verificationStatus === "verified" ? (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                ) : emailSettings.verificationStatus === "pending" ? (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Verification Pending
                    </Badge>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={handleRefreshStatus}
                            disabled={isRefreshingStatus}
                          >
                            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshingStatus && "animate-spin")} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Refresh verification status</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Verification Failed
                    </Badge>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={handleRefreshStatus}
                            disabled={isRefreshingStatus}
                          >
                            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshingStatus && "animate-spin")} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Refresh verification status</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {emailSettingsLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : (
            <>
              {/* Domain Verification Warning Banner */}
              {emailSettings?.verificationStatus === "pending" && (
                <Alert className="mb-4 border-amber-300 bg-amber-50/80 dark:bg-amber-950/30">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-800 dark:text-amber-200 font-semibold">
                    Action Required: Domain Verification Needed
                  </AlertTitle>
                  <AlertDescription className="mt-2 space-y-3">
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      To send emails from <span className="font-medium">{senderForm.senderEmail || emailSettings.senderEmail}</span>, the domain must be verified in the Resend Dashboard to prevent your messages from being flagged as spam.
                    </p>
                    <div className="bg-amber-100/80 dark:bg-amber-900/30 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 uppercase tracking-wider">Steps to Verify:</p>
                      <ol className="text-sm text-amber-700 dark:text-amber-300 space-y-1.5 list-decimal list-inside">
                        <li>Log in to your <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-900 dark:hover:text-amber-100 inline-flex items-center gap-0.5">Resend Dashboard <ExternalLink className="h-3 w-3" /></a></li>
                        <li>Navigate to <span className="font-medium">Domains</span> and add your domain</li>
                        <li>Add the required DNS records (SPF, DKIM, DMARC)</li>
                        <li>Wait for verification (usually 10-60 minutes)</li>
                        <li>Click the <span className="font-medium">Refresh</span> button above to check status</li>
                      </ol>
                    </div>
                    <div className="flex items-start gap-2 pt-1">
                      <Info className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        If you do not have access to the Resend Dashboard or the issue persists, please contact IT Support at{" "}
                        <a href="mailto:info@gadevelopments.ca" className="font-medium underline hover:text-amber-800 dark:hover:text-amber-200">
                          info@gadevelopments.ca
                        </a>
                      </p>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="senderName" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Friendly Sender Name
                  </Label>
                  <Input
                    id="senderName"
                    value={senderForm.senderName}
                    onChange={(e) => {
                      setSenderForm({ ...senderForm, senderName: e.target.value });
                      setSenderFormDirty(true);
                    }}
                    placeholder="e.g., 709 Carsons Property Manager"
                    className="border-transparent focus:border-border focus:ring-1 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="senderEmail" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Sender Email Address
                  </Label>
                  <Input
                    id="senderEmail"
                    type="email"
                    value={senderForm.senderEmail}
                    onChange={(e) => {
                      setSenderForm({ ...senderForm, senderEmail: e.target.value });
                      setSenderFormDirty(true);
                    }}
                    placeholder="e.g., manager@gadevelopments.ca"
                    className="border-transparent focus:border-border focus:ring-1 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="replyToEmail" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Reply-To Email <span className="text-muted-foreground/60">(optional)</span>
                    </Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">This address does not require domain verification. It only determines where tenant replies will be sent.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="replyToEmail"
                    type="email"
                    value={senderForm.replyToEmail}
                    onChange={(e) => {
                      setSenderForm({ ...senderForm, replyToEmail: e.target.value });
                      setSenderFormDirty(true);
                    }}
                    placeholder="Optional reply-to address"
                    className="border-transparent focus:border-border focus:ring-1 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="text-xs text-muted-foreground">
                  {emailSettings?.updatedBy && (
                    <span>
                      Last updated by {emailSettings.updatedBy.name || emailSettings.updatedBy.email} on{" "}
                      {formatDate(emailSettings.updatedAt)}
                    </span>
                  )}
                </div>
                <Button
                  onClick={handleSaveSenderSettings}
                  disabled={!isSenderFormDirty() || updateSettingsMutation.isPending}
                  size="sm"
                >
                  {updateSettingsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Settings
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Email Composer */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="font-medium text-base">Compose Email</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Recipients Section */}
              <div className="space-y-3">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Recipients
                </Label>
                <Select
                  value={formData.recipients}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      recipients: value as RecipientType,
                      unitIds: [],
                      userIds: [],
                    })
                  }
                >
                  <SelectTrigger className="border-transparent focus:border-border focus:ring-1 focus:ring-primary/20 transition-all">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        All Tenants ({activeTenants.length})
                      </div>
                    </SelectItem>
                    <SelectItem value="UNITS">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        By Unit
                      </div>
                    </SelectItem>
                    <SelectItem value="CUSTOM">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Select Tenants
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Unit Selection - Compact */}
              {formData.recipients === "UNITS" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Select Units
                    </Label>
                    {formData.unitIds.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {formData.unitIds.length} selected
                      </span>
                    )}
                  </div>
                  <div className="border border-border/50 rounded-lg p-2 max-h-32 overflow-y-auto">
                    {occupiedUnits.length > 0 ? (
                      <div className="grid grid-cols-2 gap-1">
                        {occupiedUnits.map((unit) => (
                          <div
                            key={unit.id}
                            className="flex items-center gap-2 hover:bg-muted/50 rounded p-1.5 transition-colors"
                          >
                            <Checkbox
                              id={`email-unit-${unit.id}`}
                              checked={formData.unitIds.includes(unit.id)}
                              onCheckedChange={() => toggleUnitSelection(unit.id)}
                            />
                            <label
                              htmlFor={`email-unit-${unit.id}`}
                              className="text-sm cursor-pointer truncate"
                            >
                              {unit.buildingName ? `${unit.buildingName} - ${unit.unitLabel}` : unit.unitLabel}
                            </label>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground p-2">
                        No occupied units
                      </p>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Tenant Selection - Compact */}
              {formData.recipients === "CUSTOM" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Select Tenants
                    </Label>
                    {formData.userIds.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {formData.userIds.length} selected
                      </span>
                    )}
                  </div>
                  <div className="border border-border/50 rounded-lg p-2 max-h-32 overflow-y-auto">
                    {activeTenants.length > 0 ? (
                      <div className="space-y-0.5">
                        {activeTenants.map((tenant) => (
                          <div
                            key={tenant.id}
                            className="flex items-center gap-2 hover:bg-muted/50 rounded p-1.5 transition-colors"
                          >
                            <Checkbox
                              id={`email-tenant-${tenant.id}`}
                              checked={formData.userIds.includes(tenant.id)}
                              onCheckedChange={() => toggleUserSelection(tenant.id)}
                            />
                            <label
                              htmlFor={`email-tenant-${tenant.id}`}
                              className="text-sm cursor-pointer truncate flex-1"
                            >
                              {tenant.name}{" "}
                              <span className="text-muted-foreground text-xs">
                                ({tenant.email})
                              </span>
                            </label>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground p-2">
                        No active tenants
                      </p>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Divider */}
              <div className="border-t border-border/50" />

              {/* Subject */}
              <div className="space-y-2">
                <Label htmlFor="subject" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Subject
                </Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) =>
                    setFormData({ ...formData, subject: e.target.value })
                  }
                  placeholder="Enter email subject..."
                  className="text-lg border-transparent focus:border-border focus:ring-1 focus:ring-primary/20 transition-all"
                  required
                />
              </div>

              {/* Message */}
              <div className="space-y-2">
                <Label htmlFor="body" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Message
                </Label>
                <Textarea
                  id="body"
                  value={formData.bodyHtml}
                  onChange={(e) =>
                    setFormData({ ...formData, bodyHtml: e.target.value })
                  }
                  placeholder="Write your email message here..."
                  rows={8}
                  className="text-sm border-transparent focus:border-border focus:ring-1 focus:ring-primary/20 transition-all resize-none"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Plain text only. HTML formatting is not supported.
                </p>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={!isFormValid()}>
                  <Send className="h-4 w-4 mr-2" />
                  Send Email
                </Button>
              </div>

              {/* Advanced / Test Section - Collapsible */}
              <CollapsibleSection
                title="Advanced / Test"
                icon={<TestTube className="h-4 w-4" />}
                compact
              >
                <div className="space-y-4">
                  {/* Email Configuration Status */}
                  <div className="flex items-center gap-3">
                    {emailConfig?.configured ? (
                      <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-emerald-500/10 flex-1">
                        <CheckCircle className="h-4 w-4 text-emerald-700" />
                        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                          <span className="text-sm font-medium text-emerald-700">Email Configured</span>
                          <span className="text-xs text-muted-foreground">
                            {emailConfig.provider} | {emailConfig.fromEmail}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-amber-500/10 flex-1">
                        <AlertCircle className="h-4 w-4 text-amber-700" />
                        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                          <span className="text-sm font-medium text-amber-700">Not Configured</span>
                          <span className="text-xs text-muted-foreground">
                            {emailConfig?.warning || "Set RESEND_API_KEY in environment"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Test Email */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Send Test Email
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="email"
                        placeholder="test@email.com"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        className="flex-1 border-transparent focus:border-border focus:ring-1 focus:ring-primary/20 transition-all"
                      />
                      <Button
                        onClick={() => testMutation.mutate(testEmail)}
                        disabled={!testEmail || testMutation.isPending}
                        variant="outline"
                        size="sm"
                      >
                        {testMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Send className="h-4 w-4 mr-2" />
                        )}
                        Send Test
                      </Button>
                    </div>
                  </div>

                  {/* Test Result */}
                  {testResult && (
                    <div
                      className={cn(
                        "p-3 rounded-lg text-sm",
                        testResult.ok
                          ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                          : "bg-red-50 border border-red-200 text-red-800"
                      )}
                    >
                      <p className="font-medium text-xs uppercase tracking-wider">
                        {testResult.ok ? "Success" : "Failed"}
                      </p>
                      <p className="mt-1 text-xs">
                        {testResult.ok
                          ? `Test email sent to ${testResult.sentTo}`
                          : testResult.error}
                      </p>
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            </form>
          </CardContent>
        </Card>

        {/* Recent Communications */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-medium text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Recent Communications
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoadingHistory ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="border rounded-lg p-3">
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : sentEmails && sentEmails.length > 0 ? (
              <div className="space-y-2">
                {sentEmails.slice(0, 10).map((email) => {
                  // Determine specific failure reason
                  const getFailureReason = () => {
                    if (!email.errorMessage) return "Failed";
                    if (email.errorMessage.toLowerCase().includes("domain") ||
                        email.errorMessage.toLowerCase().includes("verification") ||
                        email.errorMessage.toLowerCase().includes("verified")) {
                      return "Unverified Domain";
                    }
                    if (email.errorMessage.toLowerCase().includes("not configured")) {
                      return "Not Configured";
                    }
                    return "Failed";
                  };

                  return (
                    <div
                      key={email.id}
                      className="border rounded-lg p-3 hover:bg-muted/50 transition-colors cursor-default"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {email.source === "Admin" ? (
                              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] px-1.5 py-0">
                                Admin
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0">
                                System
                              </Badge>
                            )}
                          </div>
                          <p className="font-medium text-sm line-clamp-1">
                            {email.source === "System" && email.emailType
                              ? `System: ${email.emailType}`
                              : email.subject}
                          </p>
                        </div>
                        {email.status === "sent" ? (
                          <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                        ) : (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="destructive" className="text-xs px-1.5 py-0 cursor-help">
                                  {getFailureReason()}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-xs">{email.errorMessage || "Email delivery failed"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5">
                        <span>{email.recipientCount} recipient(s)</span>
                        <span className="text-border">|</span>
                        <span>{formatDateTime(email.sentAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-10">
                <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
                  <Mail className="h-5 w-5 text-muted-foreground/50" />
                </div>
                <p className="text-sm text-muted-foreground mt-3">
                  No recent communications found.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Email</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to send this email to{" "}
              <strong>{getRecipientCount()} recipient(s)</strong>. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">{formData.subject}</p>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                {formData.bodyHtml}
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSendConfirm}
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending ? "Sending..." : "Send Email"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
