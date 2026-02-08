import { useState, useRef, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  User,
  Lock,
  Save,
  Eye,
  EyeOff,
  Bell,
  Download,
  Upload,
  Shield,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  Info,
  Mail,
  Wrench,
  ClipboardCheck,
  VolumeX,
  Clock,
  DollarSign,
  Settings2,
  HardDrive,
  History,
  XCircle,
  ChevronDown,
  ChevronUp,
  Filter,
} from "lucide-react";
import type {
  NotificationRecipient,
  CreateNotificationRecipient,
  DataExportResult,
  ImportValidationResult,
  ImportResult,
  NotificationEventType,
  SystemBackup,
} from "../../../../backend/src/types";
import { ImportReviewModal, ApprovedChanges } from "@/components/admin/ImportReviewModal";
import { EmailTemplateManager } from "@/components/admin/EmailTemplateManager";
import { DataPurgeModal } from "@/components/admin/DataPurgeModal";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

interface TenantNotificationSettings {
  id: string;
  newInvoice: boolean;
  paymentReceived: boolean;
  overdueAlert: boolean;
  maintenanceAcknowledged: boolean;
  maintenanceStatusUpdate: boolean;
  maintenanceResolved: boolean;
  moveInChecklistReminder: boolean;
  inspectionScheduled: boolean;
  globalMute: boolean;
  overdueReminderHours: number;
  bundleWindowMinutes: number;
  updatedAt: string;
}

interface NotificationLog {
  id: string;
  eventType: string;
  recipientEmail: string;
  recipientName: string | null;
  status: "SENT" | "FAILED";
  errorMessage: string | null;
  createdAt: string;
  buildingName: string | null;
  unitLabel: string | null;
}

interface NotificationLogsResponse {
  logs: NotificationLog[];
  total: number;
  limit: number;
  offset: number;
}

// Reusable Collapsible Section Component
interface CollapsibleSectionProps {
  title: string;
  icon: ReactNode;
  badge?: ReactNode;
  headerAction?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

function CollapsibleSection({
  title,
  icon,
  badge,
  headerAction,
  defaultOpen = false,
  children,
  className,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

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

// Compact toggle for notification settings
function CompactToggle({
  label,
  tooltip,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  tooltip: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-foreground/80">{label}</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-3 w-3 text-muted-foreground/60" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="scale-75"
      />
    </div>
  );
}

const EVENT_TYPE_LABELS: Record<NotificationEventType, string> = {
  MAINTENANCE_REQUEST: "New Maintenance Request",
  INVOICE_OVERDUE: "Invoice Overdue",
  NEW_TENANT: "New Tenant Added",
  MOVE_OUT_REQUEST: "Move-Out Request",
  INSURANCE_EXPIRING: "Insurance Expiring",
  PAYMENT_RECEIVED: "Payment Received",
};

// Short labels for table display
const EVENT_TYPE_SHORT_LABELS: Record<NotificationEventType, string> = {
  MAINTENANCE_REQUEST: "Maintenance",
  INVOICE_OVERDUE: "Overdue",
  NEW_TENANT: "Tenant",
  MOVE_OUT_REQUEST: "Move-Out",
  INSURANCE_EXPIRING: "Insurance",
  PAYMENT_RECEIVED: "Payment",
};

const ALL_EVENT_TYPES: NotificationEventType[] = [
  "MAINTENANCE_REQUEST",
  "INVOICE_OVERDUE",
  "NEW_TENANT",
  "MOVE_OUT_REQUEST",
  "INSURANCE_EXPIRING",
  "PAYMENT_RECEIVED",
];

export default function AdminSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    name: "",
    phone: "",
  });
  const [profileInitialized, setProfileInitialized] = useState(false);

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Notification recipient dialog state
  const [recipientDialogOpen, setRecipientDialogOpen] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<NotificationRecipient | null>(null);
  const [recipientForm, setRecipientForm] = useState<{
    email: string;
    name: string;
    eventTypes: NotificationEventType[];
    buildingName: string | null;
    isActive: boolean;
  }>({
    email: "",
    name: "",
    eventTypes: [],
    buildingName: null,
    isActive: true,
  });
  const [deleteRecipientDialog, setDeleteRecipientDialog] = useState<NotificationRecipient | null>(null);

  // Import/Export state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data purge modal state
  const [purgeModalOpen, setPurgeModalOpen] = useState(false);
  const navigate = useNavigate();

  // Notification Log state
  const [notificationLogFilter, setNotificationLogFilter] = useState<string>("all");
  const [notificationLogOffset, setNotificationLogOffset] = useState(0);
  const notificationLogLimit = 10;

  // Backup history visibility state
  const [showFullBackupHistory, setShowFullBackupHistory] = useState(false);

  // Fetch user profile
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["admin-profile"],
    queryFn: () => api.get<UserProfile>("/api/me"),
  });

  // Fetch notification recipients
  const { data: recipients = [], isLoading: recipientsLoading } = useQuery({
    queryKey: ["notification-recipients"],
    queryFn: () => api.get<NotificationRecipient[]>("/api/admin/settings/notifications"),
  });

  // Fetch buildings for filter dropdown
  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-list"],
    queryFn: () => api.get<string[]>("/api/admin/units/buildings"),
  });

  // Fetch tenant notification settings
  const { data: tenantNotifSettings, isLoading: tenantNotifLoading } = useQuery({
    queryKey: ["admin", "notification-settings", "tenant-preferences"],
    queryFn: () => api.get<TenantNotificationSettings>("/api/admin/notification-settings/tenant-preferences"),
  });

  // Fetch notification logs (always fetch for badge count)
  const { data: notificationLogsData, isLoading: notificationLogsLoading } = useQuery({
    queryKey: ["notification-logs", notificationLogFilter, notificationLogOffset, notificationLogLimit],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("limit", String(notificationLogLimit));
      params.set("offset", String(notificationLogOffset));
      if (notificationLogFilter !== "all") {
        params.set("eventType", notificationLogFilter);
      }
      return api.get<NotificationLogsResponse>(`/api/admin/settings/notification-logs?${params.toString()}`);
    },
  });

  // Fetch recent backups
  const { data: recentBackups, isLoading: backupsLoading } = useQuery({
    queryKey: ["admin", "backups"],
    queryFn: () => api.get<SystemBackup[]>("/api/admin/settings/backups"),
  });

  // Initialize profile form when data loads
  if (profile && !profileInitialized) {
    setProfileForm({
      name: profile.name || "",
      phone: profile.phone || "",
    });
    setProfileInitialized(true);
  }

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: (data: { name?: string; phone?: string }) =>
      api.patch<UserProfile>("/api/me", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profile"] });
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.post("/api/me/change-password", data),
    onSuccess: () => {
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordErrors([]);
      setIsChangingPassword(false);
      toast({
        title: "Password Changed",
        description: "Your password has been changed successfully.",
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Error",
        description: error.message || "Failed to change password. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create notification recipient mutation
  const createRecipientMutation = useMutation({
    mutationFn: (data: CreateNotificationRecipient) =>
      api.post<NotificationRecipient>("/api/admin/settings/notifications", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-recipients"] });
      setRecipientDialogOpen(false);
      resetRecipientForm();
      toast({
        title: "Recipient Added",
        description: "Notification recipient has been added successfully.",
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add recipient. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update notification recipient mutation
  const updateRecipientMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateNotificationRecipient> }) =>
      api.put<NotificationRecipient>(`/api/admin/settings/notifications/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-recipients"] });
      setRecipientDialogOpen(false);
      setEditingRecipient(null);
      resetRecipientForm();
      toast({
        title: "Recipient Updated",
        description: "Notification recipient has been updated successfully.",
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update recipient. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete notification recipient mutation
  const deleteRecipientMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/admin/settings/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-recipients"] });
      setDeleteRecipientDialog(null);
      toast({
        title: "Recipient Deleted",
        description: "Notification recipient has been removed.",
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete recipient. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update tenant notification settings mutation
  const updateTenantNotifMutation = useMutation({
    mutationFn: (data: Partial<TenantNotificationSettings>) =>
      api.put<TenantNotificationSettings>("/api/admin/notification-settings/tenant-preferences", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "notification-settings", "tenant-preferences"] });
      toast({
        title: "Settings Updated",
        description: "Tenant notification preferences have been saved.",
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update settings",
        variant: "destructive",
      });
    },
  });

  // Generate export mutation
  const generateExportMutation = useMutation({
    mutationFn: () => api.post<DataExportResult>("/api/admin/settings/exports"),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["data-exports"] });
      const blob = new Blob([data.content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Export Generated",
        description: "Your backup file has been downloaded.",
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate export. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Validate import mutation
  const validateImportMutation = useMutation({
    mutationFn: async (file: File) => {
      const content = await file.text();
      return api.post<ImportValidationResult>("/api/admin/settings/imports/validate", { content });
    },
    onSuccess: (data) => {
      setValidationResult(data);
      if (data.valid && data.changePreview) {
        // Open the review modal for granular approval
        setShowReviewModal(true);
        toast({
          title: "Validation Successful",
          description: "Review the changes below before committing to the database.",
        });
      } else if (data.valid) {
        toast({
          title: "Validation Successful",
          description: "The import file is valid. You can proceed with the import.",
        });
      } else {
        toast({
          title: "Validation Failed",
          description: "The import file has errors. Please review and fix them.",
          variant: "destructive",
        });
      }
    },
    onError: (error: ApiError) => {
      toast({
        title: "Error",
        description: error.message || "Failed to validate import file. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Confirm import mutation
  const confirmImportMutation = useMutation({
    mutationFn: async (approvedChanges: ApprovedChanges) => {
      if (!validationResult?.confirmationToken || !importFile) {
        throw new Error("No valid import to confirm");
      }
      const content = await importFile.text();
      return api.post<ImportResult>("/api/admin/settings/imports/confirm", {
        content,
        confirmationToken: validationResult.confirmationToken,
        approvedChanges,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries();
      setShowReviewModal(false);
      setValidationResult(null);
      setImportFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // Build detailed success message with summary including skipped counts
      let description = data.message;
      if (data.summary) {
        const parts: string[] = [];
        const { summary } = data;

        const formatEntry = (entry: { created: number; updated: number; skipped?: number }) => {
          const total = entry.created + entry.updated;
          const skipped = entry.skipped ?? 0;
          if (total === 0 && skipped === 0) return null;
          let str = `${total} (${entry.created} new, ${entry.updated} updated)`;
          if (skipped > 0) {
            str += ` [${skipped} skipped]`;
          }
          return str;
        };

        const unitsStr = formatEntry(summary.units);
        if (unitsStr) parts.push(`Units: ${unitsStr}`);

        const tenantsStr = formatEntry(summary.tenants);
        if (tenantsStr) parts.push(`Tenants: ${tenantsStr}`);

        const invoicesStr = formatEntry(summary.invoices);
        if (invoicesStr) parts.push(`Invoices: ${invoicesStr}`);

        const tenanciesStr = formatEntry(summary.tenancies);
        if (tenanciesStr) parts.push(`Tenancies: ${tenanciesStr}`);

        const checklistStr = formatEntry(summary.checklistItems);
        if (checklistStr) parts.push(`Checklist Items: ${checklistStr}`);

        const inspectionsStr = formatEntry(summary.inspections);
        if (inspectionsStr) parts.push(`Inspections: ${inspectionsStr}`);

        const buildingInfosStr = formatEntry(summary.buildingInfos);
        if (buildingInfosStr) parts.push(`Building Infos: ${buildingInfosStr}`);

        if (parts.length > 0) {
          description = parts.join("; ");
        }
      }

      toast({
        title: "Import Successful",
        description,
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import data. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Trigger manual backup mutation
  const triggerBackupMutation = useMutation({
    mutationFn: () => api.post<{ backup: SystemBackup }>("/api/admin/settings/backups/trigger", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "backups"] });
      toast({ title: "Backup Started", description: "Manual backup has been initiated." });
    },
    onError: (error: ApiError) => {
      toast({ title: "Backup Failed", description: error.message || "Failed to start backup.", variant: "destructive" });
    },
  });

  // Download backup handler
  const handleDownloadBackup = async (backupId: string) => {
    try {
      const response = await api.get<{ content: string; filename: string }>(
        `/api/admin/settings/backups/${backupId}/download`
      );

      const blob = new Blob([response.content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = response.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      queryClient.invalidateQueries({ queryKey: ["admin", "backups"] });
    } catch (error) {
      toast({ title: "Download Failed", description: "Could not download backup", variant: "destructive" });
    }
  };

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updates: { name?: string; phone?: string } = {};

    if (profileForm.name.trim() && profileForm.name !== profile?.name) {
      updates.name = profileForm.name.trim();
    }
    if (profileForm.phone !== (profile?.phone || "")) {
      updates.phone = profileForm.phone.trim() || undefined;
    }

    if (Object.keys(updates).length === 0) {
      toast({
        title: "No Changes",
        description: "No changes were made to your profile.",
      });
      return;
    }

    updateProfileMutation.mutate(updates);
  };

  const validatePassword = (): boolean => {
    const errors: string[] = [];

    if (!passwordForm.currentPassword) {
      errors.push("Current password is required");
    }
    if (!passwordForm.newPassword) {
      errors.push("New password is required");
    } else if (passwordForm.newPassword.length < 8) {
      errors.push("New password must be at least 8 characters");
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      errors.push("New passwords do not match");
    }
    if (passwordForm.currentPassword === passwordForm.newPassword && passwordForm.newPassword) {
      errors.push("New password must be different from current password");
    }

    setPasswordErrors(errors);
    return errors.length === 0;
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validatePassword()) {
      return;
    }

    changePasswordMutation.mutate({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
  };

  const resetRecipientForm = () => {
    setRecipientForm({
      email: "",
      name: "",
      eventTypes: [],
      buildingName: null,
      isActive: true,
    });
  };

  const openAddRecipientDialog = () => {
    setEditingRecipient(null);
    resetRecipientForm();
    setRecipientDialogOpen(true);
  };

  const openEditRecipientDialog = (recipient: NotificationRecipient) => {
    setEditingRecipient(recipient);
    setRecipientForm({
      email: recipient.email,
      name: recipient.name || "",
      eventTypes: recipient.eventTypes,
      buildingName: recipient.buildingName,
      isActive: recipient.isActive,
    });
    setRecipientDialogOpen(true);
  };

  const handleRecipientSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!recipientForm.email || recipientForm.eventTypes.length === 0) {
      toast({
        title: "Validation Error",
        description: "Email and at least one event type are required.",
        variant: "destructive",
      });
      return;
    }

    const data: CreateNotificationRecipient = {
      email: recipientForm.email,
      name: recipientForm.name || undefined,
      eventTypes: recipientForm.eventTypes,
      buildingName: recipientForm.buildingName,
      isActive: recipientForm.isActive,
    };

    if (editingRecipient) {
      updateRecipientMutation.mutate({ id: editingRecipient.id, data });
    } else {
      createRecipientMutation.mutate(data);
    }
  };

  const toggleEventType = (eventType: NotificationEventType) => {
    setRecipientForm((prev) => ({
      ...prev,
      eventTypes: prev.eventTypes.includes(eventType)
        ? prev.eventTypes.filter((t) => t !== eventType)
        : [...prev.eventTypes, eventType],
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setValidationResult(null);
    }
  };

  const handleValidateImport = () => {
    if (importFile) {
      validateImportMutation.mutate(importFile);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatEventType = (eventType: string): string => {
    const labels: Record<string, string> = {
      NEW_TENANT: "New Tenant",
      MAINTENANCE_REQUEST: "Maintenance",
      MOVE_OUT_REQUEST: "Move-Out",
      INVOICE_OVERDUE: "Overdue Invoice",
      INSURANCE_EXPIRING: "Insurance Expiring",
      PAYMENT_RECEIVED: "Payment",
    };
    return labels[eventType] || eventType.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  };

  // Calculate active recipients count
  const activeRecipientsCount = recipients.filter((r) => r.isActive).length;

  // Get last backup date for badge
  const lastBackup = recentBackups?.find((b) => b.status === "COMPLETED");
  const lastBackupDateStr = lastBackup
    ? format(new Date(lastBackup.createdAt), "MMM dd, yyyy")
    : null;

  // Determine which backups to show
  const displayedBackups = showFullBackupHistory
    ? recentBackups
    : recentBackups?.slice(0, 3);

  if (isLoading) {
    return <SettingsSkeleton />;
  }

  if (error || !profile) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <p className="text-muted-foreground">Failed to load settings</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-accent/10">
          <Settings2 className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-serif font-medium">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your account, security, and system preferences
          </p>
        </div>
      </div>

      {/* Section 1: Profile & Identity - Static Card */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Column A: Profile Information - Compact */}
        <Card className="border border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Profile Information</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <form onSubmit={handleProfileSubmit} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs text-muted-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile.email}
                  disabled
                  className="h-8 text-sm bg-muted/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="name" className="text-xs text-muted-foreground">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    value={profileForm.name}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Your name"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="phone" className="text-xs text-muted-foreground">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    placeholder="(123) 456-7890"
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <Button
                type="submit"
                size="sm"
                disabled={updateProfileMutation.isPending}
                className="h-8 text-xs"
              >
                {updateProfileMutation.isPending ? (
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-3 w-3 mr-1.5" />
                )}
                Save Profile
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Column B: Security & Password - Professional Card */}
        <Card className="border border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10">
                <Lock className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-sm font-medium">Security & Password</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {!isChangingPassword ? (
              <div className="space-y-3">
                {/* Security Status */}
                <div className="flex items-center justify-between py-2.5 px-3 bg-green-50/80 dark:bg-green-950/30 rounded-lg border border-green-200/60 dark:border-green-800/40">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1 rounded-full bg-green-100 dark:bg-green-900/50">
                      <Shield className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-green-800 dark:text-green-200">Password Protected</span>
                      <p className="text-[10px] text-green-600/80 dark:text-green-400/70">Your account is secure</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-green-100/80 text-green-700 border-green-300 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700">
                    Secure
                  </Badge>
                </div>

                {/* Change Password Button - Prominent */}
                <Button
                  variant="outline"
                  onClick={() => setIsChangingPassword(true)}
                  className="w-full h-9 text-sm font-medium border-dashed border-2 hover:border-solid hover:border-primary hover:bg-primary/5 transition-all duration-200"
                >
                  <Lock className="h-3.5 w-3.5 mr-2" />
                  Change Password
                </Button>
              </div>
            ) : (
              <form onSubmit={handlePasswordSubmit} className="space-y-3">
                {passwordErrors.length > 0 && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-md p-2">
                    <ul className="text-xs text-destructive space-y-0.5">
                      {passwordErrors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-1">
                  <Label htmlFor="currentPassword" className="text-xs text-muted-foreground">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? "text" : "password"}
                      value={passwordForm.currentPassword}
                      onChange={(e) =>
                        setPasswordForm((prev) => ({
                          ...prev,
                          currentPassword: e.target.value,
                        }))
                      }
                      placeholder="Enter current password"
                      className="h-8 text-sm pr-8"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-8 w-8"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <Eye className="h-3 w-3 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="newPassword" className="text-xs text-muted-foreground">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      value={passwordForm.newPassword}
                      onChange={(e) =>
                        setPasswordForm((prev) => ({
                          ...prev,
                          newPassword: e.target.value,
                        }))
                      }
                      placeholder="Minimum 8 characters"
                      className="h-8 text-sm pr-8"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-8 w-8"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <Eye className="h-3 w-3 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Confirm password appears only when new password has content */}
                {passwordForm.newPassword && (
                  <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    <Label htmlFor="confirmPassword" className="text-xs text-muted-foreground">Confirm New Password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={passwordForm.confirmPassword}
                        onChange={(e) =>
                          setPasswordForm((prev) => ({
                            ...prev,
                            confirmPassword: e.target.value,
                          }))
                        }
                        placeholder="Confirm new password"
                        className="h-8 text-sm pr-8"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-8 w-8"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-3 w-3 text-muted-foreground" />
                        ) : (
                          <Eye className="h-3 w-3 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsChangingPassword(false);
                      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
                      setPasswordErrors([]);
                    }}
                    className="h-8 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={changePasswordMutation.isPending}
                    className="h-8 text-xs"
                  >
                    {changePasswordMutation.isPending ? (
                      <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                    ) : (
                      <Lock className="h-3 w-3 mr-1.5" />
                    )}
                    Update Password
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section 2: Communication - Email Templates (Collapsible) */}
      <CollapsibleSection
        title="Email Communication Templates"
        icon={<Mail className="h-4 w-4" />}
        badge={
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
            6 Templates
          </Badge>
        }
        defaultOpen={false}
      >
        <EmailTemplateManager />
      </CollapsibleSection>

      {/* Section 3: Notification Center & History (Merged) */}
      <CollapsibleSection
        title="Notification Center & History"
        icon={<Bell className="h-4 w-4" />}
        badge={
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
            {activeRecipientsCount} Active {activeRecipientsCount === 1 ? "Recipient" : "Recipients"}
          </Badge>
        }
        headerAction={
          <Button size="sm" onClick={openAddRecipientDialog} className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" />
            Add Recipient
          </Button>
        }
        defaultOpen={false}
      >
        <div className="space-y-6">
          {/* Admin Recipients Table - Compact */}
          {recipientsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : recipients.length === 0 ? (
            <div className="text-center py-6 bg-muted/20 rounded-lg border border-dashed">
              <Mail className="mx-auto h-6 w-6 mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No notification recipients configured</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-medium">Recipient</TableHead>
                    <TableHead className="text-xs font-medium">Events</TableHead>
                    <TableHead className="text-xs font-medium">Filter</TableHead>
                    <TableHead className="text-xs font-medium w-16">Status</TableHead>
                    <TableHead className="text-xs font-medium w-20 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipients.map((recipient) => (
                    <TableRow key={recipient.id} className="text-sm">
                      <TableCell className="py-2">
                        <div>
                          <p className="font-medium text-xs">{recipient.email}</p>
                          {recipient.name && <p className="text-xs text-muted-foreground">{recipient.name}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex flex-wrap gap-0.5">
                          {ALL_EVENT_TYPES.map((type) => (
                            <Badge
                              key={type}
                              variant={recipient.eventTypes.includes(type) ? "secondary" : "outline"}
                              className={`text-[9px] px-1 py-0 ${
                                recipient.eventTypes.includes(type)
                                  ? ""
                                  : "opacity-30"
                              }`}
                            >
                              {EVENT_TYPE_SHORT_LABELS[type]}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground">
                        {recipient.buildingName || "All"}
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge
                          variant={recipient.isActive ? "default" : "secondary"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {recipient.isActive ? "Active" : "Off"}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => openEditRecipientDialog(recipient)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setDeleteRecipientDialog(recipient)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Tenant Communication Preferences - Horizontal Matrix with Global Rules Sidebar */}
          <div className="border-t pt-5">
            <div className="flex items-center gap-2 mb-4">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Tenant Communication Preferences</h3>
            </div>

            {tenantNotifLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : tenantNotifSettings ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Financial */}
                  <div className={`bg-green-50/50 border border-green-100 rounded-lg p-3 flex flex-col transition-opacity duration-300${tenantNotifSettings.globalMute ? " opacity-40 pointer-events-none" : ""}`}>
                    <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-green-100">
                      <DollarSign className="h-3.5 w-3.5 text-green-600" />
                      <h4 className="text-xs font-semibold text-green-800">Financial</h4>
                    </div>
                    <div className="space-y-1 flex-1">
                      <CompactToggle
                        label="New Invoice"
                        tooltip="Notify tenants when a new invoice is generated"
                        checked={tenantNotifSettings.newInvoice}
                        onChange={(checked) => updateTenantNotifMutation.mutate({ newInvoice: checked })}
                        disabled={updateTenantNotifMutation.isPending || tenantNotifSettings.globalMute}
                      />
                      <CompactToggle
                        label="Payment Received"
                        tooltip="Confirm when a payment has been successfully processed"
                        checked={tenantNotifSettings.paymentReceived}
                        onChange={(checked) => updateTenantNotifMutation.mutate({ paymentReceived: checked })}
                        disabled={updateTenantNotifMutation.isPending || tenantNotifSettings.globalMute}
                      />
                      <CompactToggle
                        label="Overdue Alert"
                        tooltip="Remind tenants about unpaid invoices past their due date"
                        checked={tenantNotifSettings.overdueAlert}
                        onChange={(checked) => updateTenantNotifMutation.mutate({ overdueAlert: checked })}
                        disabled={updateTenantNotifMutation.isPending || tenantNotifSettings.globalMute}
                      />
                    </div>
                  </div>

                  {/* Operations */}
                  <div className={`bg-blue-50/50 border border-blue-100 rounded-lg p-3 flex flex-col transition-opacity duration-300${tenantNotifSettings.globalMute ? " opacity-40 pointer-events-none" : ""}`}>
                    <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-blue-100">
                      <Wrench className="h-3.5 w-3.5 text-blue-600" />
                      <h4 className="text-xs font-semibold text-blue-800">Operations</h4>
                    </div>
                    <div className="space-y-1 flex-1">
                      <CompactToggle
                        label="Request Acknowledged"
                        tooltip="Confirm when a maintenance request has been received"
                        checked={tenantNotifSettings.maintenanceAcknowledged}
                        onChange={(checked) => updateTenantNotifMutation.mutate({ maintenanceAcknowledged: checked })}
                        disabled={updateTenantNotifMutation.isPending || tenantNotifSettings.globalMute}
                      />
                      <CompactToggle
                        label="Status Update"
                        tooltip="Notify tenants when their request status changes"
                        checked={tenantNotifSettings.maintenanceStatusUpdate}
                        onChange={(checked) => updateTenantNotifMutation.mutate({ maintenanceStatusUpdate: checked })}
                        disabled={updateTenantNotifMutation.isPending || tenantNotifSettings.globalMute}
                      />
                      <CompactToggle
                        label="Request Resolved"
                        tooltip="Confirm when a maintenance request has been completed"
                        checked={tenantNotifSettings.maintenanceResolved}
                        onChange={(checked) => updateTenantNotifMutation.mutate({ maintenanceResolved: checked })}
                        disabled={updateTenantNotifMutation.isPending || tenantNotifSettings.globalMute}
                      />
                    </div>
                  </div>

                  {/* Compliance */}
                  <div className={`bg-purple-50/50 border border-purple-100 rounded-lg p-3 flex flex-col transition-opacity duration-300${tenantNotifSettings.globalMute ? " opacity-40 pointer-events-none" : ""}`}>
                    <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-purple-100">
                      <ClipboardCheck className="h-3.5 w-3.5 text-purple-600" />
                      <h4 className="text-xs font-semibold text-purple-800">Compliance</h4>
                    </div>
                    <div className="space-y-1 flex-1 flex flex-col">
                      <CompactToggle
                        label="Checklist Reminder"
                        tooltip="Remind tenants about incomplete move-in checklist items"
                        checked={tenantNotifSettings.moveInChecklistReminder}
                        onChange={(checked) => updateTenantNotifMutation.mutate({ moveInChecklistReminder: checked })}
                        disabled={updateTenantNotifMutation.isPending || tenantNotifSettings.globalMute}
                      />
                      <CompactToggle
                        label="Inspection Scheduled"
                        tooltip="Notify tenants when an inspection has been scheduled"
                        checked={tenantNotifSettings.inspectionScheduled}
                        onChange={(checked) => updateTenantNotifMutation.mutate({ inspectionScheduled: checked })}
                        disabled={updateTenantNotifMutation.isPending || tenantNotifSettings.globalMute}
                      />
                      <div className="pt-2 mt-auto border-t border-purple-100">
                        <p className="text-[10px] text-purple-600 flex items-center gap-1">
                          <Shield className="h-2.5 w-2.5" />
                          Legal notifications always enabled
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Delivery Guardrails Sidebar */}
                  <div className="bg-slate-50/80 border rounded-lg p-4 space-y-4 flex flex-col">
                    <div className="flex items-center gap-2 pb-2 border-b">
                      <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <h4 className="text-xs font-semibold">Delivery Guardrails</h4>
                    </div>

                    {/* Global Mute Toggle */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <VolumeX className={`h-3.5 w-3.5 ${tenantNotifSettings.globalMute ? "text-amber-600" : "text-muted-foreground"}`} />
                          <Label className="text-xs font-medium">Global Mute</Label>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="h-3 w-3 text-muted-foreground/60" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-xs">Silences all non-critical tenant emails. Legal and compliance notices remain active.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <Switch
                          checked={tenantNotifSettings.globalMute}
                          onCheckedChange={(checked) => updateTenantNotifMutation.mutate({ globalMute: checked })}
                          disabled={updateTenantNotifMutation.isPending}
                          className="scale-75"
                        />
                      </div>
                      {tenantNotifSettings.globalMute ? (
                        <div className="bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                          <p className="text-[10px] text-amber-700">Non-critical notifications paused</p>
                        </div>
                      ) : null}
                    </div>

                    {/* Frequency Settings */}
                    <div className="space-y-3 pt-2">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <Label className="text-[10px] text-muted-foreground">Overdue Interval</Label>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="h-3 w-3 text-muted-foreground/60" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-xs">The frequency at which automated late-rent reminders are sent.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <Select
                          value={String(tenantNotifSettings.overdueReminderHours)}
                          onValueChange={(val) => updateTenantNotifMutation.mutate({ overdueReminderHours: parseInt(val) })}
                          disabled={updateTenantNotifMutation.isPending}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="24">24 hours</SelectItem>
                            <SelectItem value="48">48 hours</SelectItem>
                            <SelectItem value="72">72 hours</SelectItem>
                            <SelectItem value="168">1 week</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <Label className="text-[10px] text-muted-foreground">Bundle Window</Label>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="h-3 w-3 text-muted-foreground/60" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-xs">Groups multiple updates made within this timeframe into a single email to prevent tenant spam.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <Select
                          value={String(tenantNotifSettings.bundleWindowMinutes)}
                          onValueChange={(val) => updateTenantNotifMutation.mutate({ bundleWindowMinutes: parseInt(val) })}
                          disabled={updateTenantNotifMutation.isPending}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="15">15 min</SelectItem>
                            <SelectItem value="30">30 min</SelectItem>
                            <SelectItem value="60">60 min</SelectItem>
                            <SelectItem value="120">2 hours</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
              </div>
            ) : null}
          </div>

          {/* Notification History (formerly Section 4) */}
          <div className="border-t pt-5">
            <div className="flex items-center gap-2 mb-4">
              <History className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Delivery History</h3>
            </div>

            <div className="space-y-3">
              {/* Filter Row */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Filter className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Filter:</span>
                </div>
                <Select
                  value={notificationLogFilter}
                  onValueChange={(value) => {
                    setNotificationLogFilter(value);
                    setNotificationLogOffset(0);
                  }}
                >
                  <SelectTrigger className="h-7 w-[180px] text-xs">
                    <SelectValue placeholder="All Event Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Event Types</SelectItem>
                    <SelectItem value="NEW_TENANT">New Tenant</SelectItem>
                    <SelectItem value="MAINTENANCE_REQUEST">Maintenance Request</SelectItem>
                    <SelectItem value="MOVE_OUT_REQUEST">Move-Out Request</SelectItem>
                    <SelectItem value="INVOICE_OVERDUE">Invoice Overdue</SelectItem>
                    <SelectItem value="INSURANCE_EXPIRING">Insurance Expiring</SelectItem>
                    <SelectItem value="PAYMENT_RECEIVED">Payment Received</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Log Table */}
              {notificationLogsLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : !notificationLogsData || notificationLogsData.logs.length === 0 ? (
                <div className="text-center py-8 bg-muted/20 rounded-lg border border-dashed">
                  <History className="mx-auto h-6 w-6 mb-2 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No notifications sent yet</p>
                </div>
              ) : (
                <>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-xs font-medium w-[140px]">Date/Time</TableHead>
                          <TableHead className="text-xs font-medium">Event Type</TableHead>
                          <TableHead className="text-xs font-medium">Recipient</TableHead>
                          <TableHead className="text-xs font-medium">Location</TableHead>
                          <TableHead className="text-xs font-medium w-[80px] text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {notificationLogsData.logs.map((log) => (
                          <TableRow key={log.id} className="text-sm">
                            <TableCell className="py-2 text-xs text-muted-foreground">
                              {formatDate(log.createdAt)}
                            </TableCell>
                            <TableCell className="py-2">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                                {formatEventType(log.eventType)}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2">
                              <div>
                                <p className="text-xs font-medium truncate max-w-[180px]">{log.recipientEmail}</p>
                                {log.recipientName ? (
                                  <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">{log.recipientName}</p>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="py-2 text-xs text-muted-foreground">
                              {log.buildingName || log.unitLabel ? (
                                <span className="truncate max-w-[120px] block">
                                  {[log.buildingName, log.unitLabel].filter(Boolean).join(" - ")}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/50">-</span>
                              )}
                            </TableCell>
                            <TableCell className="py-2 text-center">
                              {log.status === "SENT" ? (
                                <Badge className="bg-green-50 text-green-700 border-green-200 text-[10px] px-1.5 py-0">
                                  <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                                  Sent
                                </Badge>
                              ) : (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                        <XCircle className="h-2.5 w-2.5 mr-0.5" />
                                        Failed
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      <p className="text-xs">{log.errorMessage || "Unknown error"}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {notificationLogsData.total > notificationLogLimit && (
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-xs text-muted-foreground">
                        Showing {notificationLogOffset + 1}-{Math.min(notificationLogOffset + notificationLogLimit, notificationLogsData.total)} of {notificationLogsData.total}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setNotificationLogOffset(Math.max(0, notificationLogOffset - notificationLogLimit))}
                          disabled={notificationLogOffset === 0}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setNotificationLogOffset(notificationLogOffset + notificationLogLimit)}
                          disabled={notificationLogOffset + notificationLogLimit >= notificationLogsData.total}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 4: Data Management & Backups (Collapsible) */}
      <CollapsibleSection
        title="Data Management & Backups"
        icon={<Database className="h-4 w-4" />}
        badge={
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
            {lastBackupDateStr ? `Last Backup: ${lastBackupDateStr}` : "No backups"}
          </Badge>
        }
        headerAction={
          <Button
            onClick={() => triggerBackupMutation.mutate()}
            disabled={triggerBackupMutation.isPending || generateExportMutation.isPending}
            size="sm"
            className="h-7 text-xs"
          >
            {triggerBackupMutation.isPending ? (
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            ) : (
              <HardDrive className="h-3 w-3 mr-1.5" />
            )}
            Run System Backup
          </Button>
        }
        defaultOpen={false}
      >
        <div className="space-y-6">
          {/* Unified Action Header - Horizontal Layout */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 p-4 bg-gradient-to-r from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 rounded-xl border">
            {/* Left: Quick Export */}
            <div className="flex items-center gap-3">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-10 px-4"
                      onClick={() => generateExportMutation.mutate()}
                      disabled={generateExportMutation.isPending}
                    >
                      {generateExportMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Quick Export
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Download current data as JSON</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px h-10 bg-border/60" />
            <div className="sm:hidden h-px w-full bg-border/60" />

            {/* Right: Import Drop Zone - Compact */}
            <div className="flex-1 flex items-center gap-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add("border-primary", "bg-primary/5");
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("border-primary", "bg-primary/5");
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("border-primary", "bg-primary/5");
                  const file = e.dataTransfer.files?.[0];
                  if (file && file.name.endsWith(".json")) {
                    setImportFile(file);
                    setValidationResult(null);
                  }
                }}
                className="flex-1 border-2 border-dashed border-border/60 rounded-lg px-4 py-2.5 cursor-pointer transition-all hover:border-primary hover:bg-primary/5 flex items-center gap-3 bg-white/50 dark:bg-slate-900/50"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  className="sr-only"
                />
                <div className="p-2 rounded-lg bg-muted/80">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  {importFile ? (
                    <div>
                      <p className="text-sm font-medium truncate">{importFile.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(importFile.size)}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium">Import Data</p>
                      <p className="text-xs text-muted-foreground">Drop .json or click to browse</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Import Actions */}
              {importFile && !validationResult && (
                <Button
                  onClick={handleValidateImport}
                  disabled={validateImportMutation.isPending}
                  variant="outline"
                  className="h-10"
                >
                  {validateImportMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Shield className="h-4 w-4 mr-2" />
                  )}
                  Validate
                </Button>
              )}

              {validationResult && (
                <div className="flex items-center gap-2">
                  {validationResult.valid ? (
                    <Button
                      onClick={() => setShowReviewModal(true)}
                      className="h-10 bg-emerald-600 hover:bg-emerald-700"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Review & Import
                    </Button>
                  ) : (
                    <Badge variant="outline" className="h-10 px-4 bg-red-50 text-red-700 border-red-200 text-sm flex items-center">
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Invalid File
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Validation Errors - Compact */}
          {validationResult && !validationResult.valid && validationResult.errors && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-700">Validation Errors</p>
                  <ul className="text-xs text-red-600 mt-1 space-y-0.5">
                    {validationResult.errors.slice(0, 3).map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                    {validationResult.errors.length > 3 && (
                      <li className="text-red-500 font-medium">+{validationResult.errors.length - 3} more errors</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Backup History Table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                System Activity & Backup History
              </h4>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {recentBackups?.length || 0} records
                </span>
                {recentBackups && recentBackups.length > 3 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setShowFullBackupHistory(!showFullBackupHistory)}
                  >
                    {showFullBackupHistory ? (
                      <>
                        <ChevronUp className="h-3 w-3 mr-1" />
                        Show Less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3 mr-1" />
                        View Detailed History
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {backupsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : displayedBackups && displayedBackups.length > 0 ? (
              <div className="border rounded-xl overflow-hidden shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="text-xs font-semibold w-[100px]">Type</TableHead>
                      <TableHead className="text-xs font-semibold">Timestamp</TableHead>
                      <TableHead className="text-xs font-semibold w-[120px]">Status</TableHead>
                      <TableHead className="text-xs font-semibold w-[80px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedBackups.map((backup, idx) => (
                      <TableRow
                        key={backup.id}
                        className={cn(
                          "transition-colors",
                          idx % 2 === 0 ? "bg-white dark:bg-slate-950" : "bg-muted/20"
                        )}
                      >
                        <TableCell className="py-3">
                          <div className="flex items-center gap-2">
                            {backup.triggerType === "AUTOMATIC" ? (
                              <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30">
                                <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                              </div>
                            ) : (
                              <div className="p-1.5 rounded-md bg-slate-100 dark:bg-slate-800">
                                <HardDrive className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                              </div>
                            )}
                            <span className="text-xs font-medium">
                              {backup.triggerType === "AUTOMATIC" ? "Auto" : "Manual"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-sm text-foreground/80">
                            {format(new Date(backup.createdAt), "MMM dd, yyyy")}
                            <span className="text-muted-foreground mx-1.5">-</span>
                            {format(new Date(backup.createdAt), "h:mm a")}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge
                            className={cn(
                              "text-xs font-medium px-2.5 py-0.5 rounded-full",
                              backup.status === "COMPLETED" && "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
                              backup.status === "FAILED" && "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
                              backup.status === "IN_PROGRESS" && "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
                              backup.status === "PENDING" && "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800"
                            )}
                          >
                            {backup.status === "COMPLETED" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                            {backup.status === "FAILED" && <XCircle className="h-3 w-3 mr-1" />}
                            {backup.status === "IN_PROGRESS" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                            {backup.status === "PENDING" && <Clock className="h-3 w-3 mr-1" />}
                            {backup.status === "COMPLETED" ? "Completed" : backup.status === "FAILED" ? "Failed" : backup.status === "IN_PROGRESS" ? "Running" : "Pending"}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          {backup.status === "COMPLETED" ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-muted"
                                    onClick={() => handleDownloadBackup(backup.id)}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Download Backup</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : backup.status === "FAILED" && backup.errorMessage ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-500 hover:bg-red-50"
                                  >
                                    <AlertTriangle className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p className="text-xs">{backup.errorMessage}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              /* Professional Empty State */
              <div className="border-2 border-dashed rounded-xl p-8 text-center bg-muted/10">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center mb-4 shadow-inner">
                  <Database className="h-8 w-8 text-slate-400" />
                </div>
                <h3 className="text-base font-medium text-foreground mb-1">No Backups Yet</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                  Create your first system backup to protect your data and enable easy restoration.
                </p>
                <Button
                  onClick={() => triggerBackupMutation.mutate()}
                  disabled={triggerBackupMutation.isPending}
                  className="shadow-sm"
                >
                  {triggerBackupMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <HardDrive className="h-4 w-4 mr-2" />
                  )}
                  Create Your First Backup
                </Button>
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 6: Danger Zone - Static Card */}
      <Card className="border-red-200 bg-red-50/30 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-destructive text-sm font-medium">Danger Zone</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Irreversible actions that affect all property data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-lg border border-red-200 bg-white dark:bg-slate-950">
            <div>
              <h4 className="font-medium text-sm">Clear All Property Data</h4>
              <p className="text-xs text-muted-foreground">
                Remove all buildings, units, tenants, invoices, and documents
              </p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setPurgeModalOpen(true)}>
              Clear All Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Purge Modal */}
      <DataPurgeModal
        open={purgeModalOpen}
        onOpenChange={setPurgeModalOpen}
        onPurgeComplete={() => navigate("/admin")}
      />

      {/* Add/Edit Recipient Dialog */}
      <Dialog open={recipientDialogOpen} onOpenChange={setRecipientDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">
              {editingRecipient ? "Edit Recipient" : "Add Recipient"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure notification settings for this recipient
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecipientSubmit} className="space-y-4">
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="recipient-email" className="text-xs">Email *</Label>
                <Input
                  id="recipient-email"
                  type="email"
                  value={recipientForm.email}
                  onChange={(e) =>
                    setRecipientForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="email@example.com"
                  required
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="recipient-name" className="text-xs">Name</Label>
                <Input
                  id="recipient-name"
                  type="text"
                  value={recipientForm.name}
                  onChange={(e) =>
                    setRecipientForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Optional name"
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Event Types *</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_EVENT_TYPES.map((eventType) => (
                  <div key={eventType} className="flex items-center space-x-2">
                    <Checkbox
                      id={`event-${eventType}`}
                      checked={recipientForm.eventTypes.includes(eventType)}
                      onCheckedChange={() => toggleEventType(eventType)}
                      className="h-3.5 w-3.5"
                    />
                    <label
                      htmlFor={`event-${eventType}`}
                      className="text-xs leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {EVENT_TYPE_LABELS[eventType]}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="building-filter" className="text-xs">Building Filter</Label>
                <Select
                  value={recipientForm.buildingName || "all"}
                  onValueChange={(value) =>
                    setRecipientForm((prev) => ({
                      ...prev,
                      buildingName: value === "all" ? null : value,
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All Buildings" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Buildings</SelectItem>
                    {buildings.map((building) => (
                      <SelectItem key={building} value={building}>
                        {building}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end pb-1">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="recipient-active"
                    checked={recipientForm.isActive}
                    onCheckedChange={(checked) =>
                      setRecipientForm((prev) => ({ ...prev, isActive: checked }))
                    }
                    className="scale-90"
                  />
                  <Label htmlFor="recipient-active" className="text-xs">Active</Label>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRecipientDialogOpen(false)}
                className="h-8"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  createRecipientMutation.isPending || updateRecipientMutation.isPending
                }
                className="h-8"
              >
                {createRecipientMutation.isPending || updateRecipientMutation.isPending
                  ? "Saving..."
                  : editingRecipient
                  ? "Update"
                  : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Recipient Confirmation */}
      <AlertDialog
        open={!!deleteRecipientDialog}
        onOpenChange={(open) => !open && setDeleteRecipientDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recipient</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this notification recipient? They will no
              longer receive system alerts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteRecipientDialog && deleteRecipientMutation.mutate(deleteRecipientDialog.id)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteRecipientMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Review Modal */}
      {validationResult?.changePreview && (
        <ImportReviewModal
          open={showReviewModal}
          onOpenChange={setShowReviewModal}
          changePreview={validationResult.changePreview}
          onConfirm={(approvedChanges) => confirmImportMutation.mutate(approvedChanges)}
          isCommitting={confirmImportMutation.isPending}
        />
      )}
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div>
          <Skeleton className="h-7 w-32 mb-1" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="border border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
            <Skeleton className="h-8 w-24" />
          </CardContent>
        </Card>

        <Card className="border border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>

      {/* Collapsible section skeletons */}
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="border border-border/50 shadow-sm">
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-4 w-4" />
            </div>
          </CardHeader>
        </Card>
      ))}

      <Card className="border-red-200 bg-red-50/30">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
