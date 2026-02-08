import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  UserX,
  UserCheck,
  Users,
  Mail,
  Phone,
  Calendar,
  CalendarClock,
  Home,
  ArrowUpCircle,
  AlertTriangle,
  Trash2,
  FileText,
  ClipboardCheck,
  ClipboardList,
  Search,
  Pencil,
  LogIn,
  LogOut,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { User, Unit, InviteTenant, RoleInUnit } from "../../../../backend/src/types";
import { TenantDocumentsDialog } from "@/components/admin/TenantDocumentsDialog";
import { ScheduleMoveOutDialog } from "@/components/admin/ScheduleMoveOutDialog";

interface CurrentUnit {
  id: string;
  unitLabel: string;
  buildingName: string;
  tenancyId: string;
  startDate: string;
  roleInUnit: RoleInUnit;
  moveOutDate?: string | null;
}

interface TenantWithDetails extends User {
  phone?: string | null;
  currentUnit?: CurrentUnit | null;
  hasActiveTenancy?: boolean;
  roleInUnit?: RoleInUnit | null;
  lastPaymentDate?: string | null;
}

interface UnitOption extends Unit {
  tenants?: Array<{
    id: string;
    roleInUnit: RoleInUnit;
  }>;
}

interface TenantNotificationHistory {
  id: string;
  notificationType: string;
  subject: string;
  referenceType: string | null;
  referenceId: string | null;
  status: "SENT" | "OPENED" | "FAILED" | "BUNDLED";
  errorMessage: string | null;
  openedAt: string | null;
  sentAt: string;
}

interface NotificationHistoryResponse {
  notifications: TenantNotificationHistory[];
  total: number;
  limit: number;
  offset: number;
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  NEW_INVOICE: "New Invoice",
  PAYMENT_RECEIVED: "Payment Received",
  OVERDUE_ALERT: "Overdue Alert",
  MAINTENANCE_ACKNOWLEDGED: "Request Acknowledged",
  MAINTENANCE_STATUS_UPDATE: "Status Update",
  MAINTENANCE_RESOLVED: "Request Resolved",
  MOVE_IN_CHECKLIST_REMINDER: "Checklist Reminder",
  INSPECTION_SCHEDULED: "Inspection Scheduled",
  ANNOUNCEMENT: "Announcement",
  BUNDLED_UPDATE: "Update Summary",
};

function formatNotificationType(type: string): string {
  return NOTIFICATION_TYPE_LABELS[type] || type;
}

function NotificationStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "SENT":
      return (
        <Badge variant="secondary" className="text-xs">
          <Clock className="h-3 w-3 mr-1" />
          Sent
        </Badge>
      );
    case "OPENED":
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Opened
        </Badge>
      );
    case "FAILED":
      return (
        <Badge variant="destructive" className="text-xs">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    case "BUNDLED":
      return (
        <Badge variant="outline" className="text-xs">
          Bundled
        </Badge>
      );
    default:
      return <Badge variant="secondary" className="text-xs">{status}</Badge>;
  }
}

interface InviteFormData {
  name: string;
  email: string;
  unitId: string;
  startDate: string;
  password: string;
  roleInUnit: RoleInUnit;
}

const defaultInviteForm: InviteFormData = {
  name: "",
  email: "",
  unitId: "",
  startDate: new Date().toISOString().split("T")[0],
  password: "",
  roleInUnit: "PRIMARY",
};

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export default function TenantsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [isReactivateDialogOpen, setIsReactivateDialogOpen] = useState(false);
  const [isPromoteDialogOpen, setIsPromoteDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDocumentsDialogOpen, setIsDocumentsDialogOpen] = useState(false);
  const [isScheduleMoveOutDialogOpen, setIsScheduleMoveOutDialogOpen] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<TenantWithDetails | null>(null);
  const [inviteForm, setInviteForm] = useState<InviteFormData>(defaultInviteForm);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "" });
  const [isNotificationsSheetOpen, setIsNotificationsSheetOpen] = useState(false);
  const [notificationsTenant, setNotificationsTenant] = useState<TenantWithDetails | null>(null);

  // Handle URL params for pre-filling invite form
  useEffect(() => {
    const inviteUnitId = searchParams.get("inviteUnit");
    const role = searchParams.get("role") as RoleInUnit | null;

    if (inviteUnitId) {
      setInviteForm({
        ...defaultInviteForm,
        unitId: inviteUnitId,
        roleInUnit: role || "PRIMARY",
        password: generatePassword(),
      });
      setIsInviteDialogOpen(true);
      // Clear the URL params
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  // Fetch tenants
  const { data: tenants, isLoading } = useQuery({
    queryKey: ["admin", "tenants", "details"],
    queryFn: () => api.get<TenantWithDetails[]>("/api/admin/tenants"),
  });

  // Fetch units for invite
  const { data: units } = useQuery({
    queryKey: ["admin", "units"],
    queryFn: () => api.get<UnitOption[]>("/api/admin/units"),
  });

  // Fetch tenant notification history when sheet is open
  const { data: notificationHistory, isLoading: notificationsLoading } = useQuery({
    queryKey: ["admin", "notification-history", notificationsTenant?.id],
    queryFn: () => api.get<NotificationHistoryResponse>(
      `/api/admin/notification-settings/tenant-history/${notificationsTenant?.id}?limit=20`
    ),
    enabled: !!notificationsTenant?.id && isNotificationsSheetOpen,
  });

  // Check if unit has a primary tenant
  const unitHasPrimary = (unitId: string) => {
    const unit = units?.find(u => u.id === unitId);
    return unit?.tenants?.some(t => t.roleInUnit === "PRIMARY") || false;
  };

  // Available units: vacant units OR occupied units (for adding occupants)
  const availableUnits = units?.filter((u) => {
    // For PRIMARY role, only show vacant units or occupied units without a primary
    if (inviteForm.roleInUnit === "PRIMARY") {
      return u.status === "VACANT" || !unitHasPrimary(u.id);
    }
    // For OCCUPANT role, show occupied units
    return u.status === "OCCUPIED";
  }) || [];

  // Invite tenant mutation
  const inviteMutation = useMutation({
    mutationFn: (data: InviteTenant) => api.post<{
      tenant: { id: string; name: string; email: string; status: string; createdAt: string };
      tenancy: { id: string; unitId: string; startDate: string; isActive: boolean; roleInUnit: string };
      restored: boolean;
      notificationsSent: number;
      notificationRecipients: number;
    }>("/api/admin/tenants/invite", data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "units"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      setIsInviteDialogOpen(false);
      setInviteForm(defaultInviteForm);
      const notificationMsg = response.notificationRecipients > 0
        ? ` Notification sent to ${response.notificationsSent} recipient${response.notificationsSent !== 1 ? 's' : ''}.`
        : '';
      toast.success(`Tenant invited successfully. They can now log in with the provided credentials.${notificationMsg}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to invite tenant");
    },
  });

  // Deactivate tenant mutation
  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/admin/tenants/${id}/deactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      setIsDeactivateDialogOpen(false);
      setSelectedTenant(null);
      toast.success("Tenant deactivated. They can no longer log in.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to deactivate tenant");
    },
  });

  // Reactivate tenant mutation
  const reactivateMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/admin/tenants/${id}/reactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      setIsReactivateDialogOpen(false);
      setSelectedTenant(null);
      toast.success("Tenant reactivated. They can now log in again.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to reactivate tenant");
    },
  });

  // Promote to primary mutation
  const promoteMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/admin/tenants/${id}/promote`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "units"] });
      setIsPromoteDialogOpen(false);
      setSelectedTenant(null);
      toast.success("Tenant promoted to primary successfully.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to promote tenant");
    },
  });

  // Delete tenant mutation (permanent delete with email confirmation)
  const deleteMutation = useMutation({
    mutationFn: ({ id, confirmEmail }: { id: string; confirmEmail: string }) =>
      api.delete<{
        success: boolean;
        message: string;
        deletedUser: { id: string; name: string; email: string };
        cleanup: {
          sessions: number;
          files: number;
          cascadeDeletedPayments: number;
          endedTenancies: Array<{ unitId: string; unitLabel: string }>;
        };
      }>(`/api/admin/tenants/${id}/permanent`, { confirmEmail }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "units"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      setIsDeleteDialogOpen(false);
      setSelectedTenant(null);
      setDeleteConfirmEmail("");

      // Show detailed success message
      const unitInfo = data.cleanup.endedTenancies.length > 0
        ? ` Units ${data.cleanup.endedTenancies.map(t => t.unitLabel).join(", ")} set to Vacant.`
        : "";
      toast.success(`Tenant and all associated records permanently removed.${unitInfo}`);
    },
    onError: (error: Error) => {
      const msg = error.message || "Failed to delete tenant";
      if (msg.includes("linked records") || msg.includes("constraint")) {
        toast.error("Deletion blocked: This tenant has linked records that could not be removed. Try voiding all invoices and resolving service requests first.");
      } else if (msg.includes("Email confirmation")) {
        toast.error("Email confirmation does not match. Please try again.");
      } else {
        toast.error(msg);
      }
    },
  });

  // Edit tenant mutation
  const editMutation = useMutation({
    mutationFn: (data: { id: string; name: string; email: string; phone: string }) =>
      api.put(`/api/admin/tenants/${data.id}`, {
        name: data.name,
        email: data.email,
        phone: data.phone || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      setIsEditDialogOpen(false);
      setSelectedTenant(null);
      setEditForm({ name: "", email: "", phone: "" });
      toast.success("Tenant information updated successfully.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update tenant");
    },
  });

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    inviteMutation.mutate({
      name: inviteForm.name,
      email: inviteForm.email,
      unitId: inviteForm.unitId,
      startDate: inviteForm.startDate,
      password: inviteForm.password,
      roleInUnit: inviteForm.roleInUnit,
      leaseStartDate: inviteForm.startDate, // Backend uses this to determine legacy status
    });
  };

  const openInviteDialog = () => {
    setInviteForm({
      ...defaultInviteForm,
      password: generatePassword(),
    });
    setIsInviteDialogOpen(true);
  };

  const openDeactivateDialog = (tenant: TenantWithDetails) => {
    setSelectedTenant(tenant);
    setIsDeactivateDialogOpen(true);
  };

  const openReactivateDialog = (tenant: TenantWithDetails) => {
    setSelectedTenant(tenant);
    setIsReactivateDialogOpen(true);
  };

  const openPromoteDialog = (tenant: TenantWithDetails) => {
    setSelectedTenant(tenant);
    setIsPromoteDialogOpen(true);
  };

  const openDeleteDialog = (tenant: TenantWithDetails) => {
    setSelectedTenant(tenant);
    setDeleteConfirmEmail("");
    setIsDeleteDialogOpen(true);
  };

  const openDocumentsDialog = (tenant: TenantWithDetails) => {
    setSelectedTenant(tenant);
    setIsDocumentsDialogOpen(true);
  };

  const openEditDialog = (tenant: TenantWithDetails) => {
    setSelectedTenant(tenant);
    setEditForm({
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTenant) {
      editMutation.mutate({
        id: selectedTenant.id,
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
      });
    }
  };

  const openScheduleMoveOutDialog = (tenant: TenantWithDetails) => {
    setSelectedTenant(tenant);
    setIsScheduleMoveOutDialogOpen(true);
  };

  const openNotificationsSheet = (tenant: TenantWithDetails) => {
    setNotificationsTenant(tenant);
    setIsNotificationsSheetOpen(true);
  };

  // Check if tenant can be promoted (is an occupant and unit has no primary)
  const canPromote = (tenant: TenantWithDetails) => {
    if (tenant.roleInUnit !== "OCCUPANT" || !tenant.currentUnit) return false;
    return !unitHasPrimary(tenant.currentUnit.id);
  };

  // When role changes, reset unit selection if incompatible
  const handleRoleChange = (role: RoleInUnit) => {
    const currentUnit = units?.find(u => u.id === inviteForm.unitId);
    let newUnitId = inviteForm.unitId;

    if (role === "PRIMARY" && currentUnit) {
      // If switching to PRIMARY and unit already has one, clear selection
      if (unitHasPrimary(currentUnit.id)) {
        newUnitId = "";
      }
    } else if (role === "OCCUPANT" && currentUnit) {
      // If switching to OCCUPANT and unit is vacant, clear selection
      if (currentUnit.status === "VACANT") {
        newUnitId = "";
      }
    }

    setInviteForm({ ...inviteForm, roleInUnit: role, unitId: newUnitId });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-medium">Tenants</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage tenants and invite new ones
          </p>
        </div>
        <Button onClick={openInviteDialog} size="sm">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Invite Tenant
        </Button>
      </div>

      <Card className="rounded-lg border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Tenants</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-6 pb-6">
              <div className="border border-border/50 rounded-lg overflow-hidden">
                <div className="bg-muted/30 px-4 py-2.5 border-b border-border/50">
                  <div className="grid grid-cols-7 gap-4">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16 hidden md:block" />
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-3 w-16 hidden lg:block" />
                  </div>
                </div>
                {[...Array(6)].map((_, i) => (
                  <div key={i} className={`px-4 py-2 border-b border-border/50 last:border-b-0 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                    <div className="grid grid-cols-7 gap-4 items-center">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-3 w-20 hidden md:block" />
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-12" />
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-20 hidden lg:block" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : tenants && tenants.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-2.5">Name</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-2.5">Contact</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-2.5 hidden md:table-cell">Phone</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-2.5">Building</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-2.5">Unit</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-2.5">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-2.5 hidden lg:table-cell">Lease Start</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-2.5 hidden xl:table-cell">Last Payment</TableHead>
                    <TableHead className="w-[40px] py-2.5"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((tenant) => (
                    <TableRow key={tenant.id} className="even:bg-muted/30 border-border/50">
                      <TableCell className="py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-sm">{tenant.name}</span>
                          {tenant.roleInUnit ? (
                            <span className={`inline-flex w-fit items-center text-xs px-2 py-0.5 rounded-full border ${
                              tenant.roleInUnit === "PRIMARY"
                                ? "bg-blue-500/10 text-blue-700 border-blue-200"
                                : "bg-slate-500/10 text-slate-600 border-slate-200"
                            }`}>
                              {tenant.roleInUnit === "PRIMARY" ? "Primary" : "Occupant"}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{tenant.email}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell py-2">
                        {tenant.phone ? (
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{tenant.phone}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        {tenant.currentUnit?.buildingName ? (
                          <span className="text-xs text-muted-foreground">{tenant.currentUnit.buildingName}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        {tenant.currentUnit ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Home className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{tenant.currentUnit.unitLabel}</span>
                            </div>
                            {tenant.currentUnit.moveOutDate ? (
                              <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 border border-amber-200">
                                <CalendarClock className="h-3 w-3 mr-1" />
                                {formatDate(tenant.currentUnit.moveOutDate)}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border ${
                          tenant.status === "ACTIVE"
                            ? "bg-emerald-500/10 text-emerald-700 border-emerald-200"
                            : "bg-red-500/10 text-red-700 border-red-200"
                        }`}>
                          {tenant.status === "ACTIVE" ? "Active" : "Deactivated"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell py-2">
                        {tenant.currentUnit ? (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {formatDate(tenant.currentUnit.startDate)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell py-2">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(tenant.lastPaymentDate)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            {/* Primary Actions */}
                            <DropdownMenuItem onClick={() => openEditDialog(tenant)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit Tenant
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openDocumentsDialog(tenant)}>
                              <FileText className="h-4 w-4 mr-2" />
                              Manage Documents
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openNotificationsSheet(tenant)}>
                              <Mail className="h-4 w-4 mr-2" />
                              View Notifications
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            {/* Move-In Sub-menu */}
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <LogIn className="h-4 w-4 mr-2" />
                                Move-In
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent className="w-44">
                                <DropdownMenuItem onClick={() => navigate(`/admin/tenants/${tenant.id}/checklist`)}>
                                  <ClipboardCheck className="h-4 w-4 mr-2" />
                                  Checklist
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/admin/tenants/${tenant.id}/inspection/move-in`)}>
                                  <Search className="h-4 w-4 mr-2" />
                                  Inspection
                                </DropdownMenuItem>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>

                            {/* Move-Out Sub-menu */}
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <LogOut className="h-4 w-4 mr-2" />
                                Move-Out
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent className="w-44">
                                <DropdownMenuItem onClick={() => navigate(`/admin/tenants/${tenant.id}/checklist/move-out`)}>
                                  <ClipboardList className="h-4 w-4 mr-2" />
                                  Checklist
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/admin/tenants/${tenant.id}/inspection/move-out`)}>
                                  <Search className="h-4 w-4 mr-2" />
                                  Inspection
                                </DropdownMenuItem>
                                {tenant.hasActiveTenancy && !tenant.currentUnit?.moveOutDate && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => openScheduleMoveOutDialog(tenant)}>
                                      <CalendarClock className="h-4 w-4 mr-2" />
                                      Schedule Move-Out
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>

                            {/* Conditional: Promote to Primary */}
                            {canPromote(tenant) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openPromoteDialog(tenant)}>
                                  <ArrowUpCircle className="h-4 w-4 mr-2" />
                                  Promote to Primary
                                </DropdownMenuItem>
                              </>
                            )}

                            <DropdownMenuSeparator />

                            {/* Destructive Actions */}
                            {tenant.status === "ACTIVE" ? (
                              <DropdownMenuItem
                                onClick={() => openDeactivateDialog(tenant)}
                                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                              >
                                <UserX className="h-4 w-4 mr-2" />
                                Deactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => openReactivateDialog(tenant)}
                                className="text-green-600 focus:text-green-600 focus:bg-green-600/10"
                              >
                                <UserCheck className="h-4 w-4 mr-2" />
                                Reactivate
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => openDeleteDialog(tenant)}
                              className="text-destructive focus:text-destructive focus:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="border-2 border-dashed rounded-xl p-8 text-center bg-muted/10 m-6">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center mb-4 shadow-inner">
                <Users className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-base font-medium text-foreground mb-1">No Tenants Yet</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                Invite your first tenant to get started managing your properties
              </p>
              <Button onClick={openInviteDialog}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Invite Your First Tenant
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Tenant Dialog */}
      <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite New Tenant</DialogTitle>
            <DialogDescription>
              Create an account for a new tenant and assign them to a unit
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInviteSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={inviteForm.name}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, name: e.target.value })
                  }
                  placeholder="John Smith"
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, email: e.target.value })
                  }
                  placeholder="john@example.com"
                  required
                />
              </div>
              <div>
                <Label>Tenant Role *</Label>
                <RadioGroup
                  value={inviteForm.roleInUnit}
                  onValueChange={(value) => handleRoleChange(value as RoleInUnit)}
                  className="mt-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="PRIMARY" id="role-primary" />
                    <Label htmlFor="role-primary" className="font-normal cursor-pointer">
                      Primary Tenant
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="OCCUPANT" id="role-occupant" />
                    <Label htmlFor="role-occupant" className="font-normal cursor-pointer">
                      Additional Occupant (Roommate)
                    </Label>
                  </div>
                </RadioGroup>
                <p className="text-xs text-muted-foreground mt-2">
                  {inviteForm.roleInUnit === "PRIMARY"
                    ? "Primary tenant is responsible for the lease agreement."
                    : "Occupants share the unit with the primary tenant."}
                </p>
              </div>
              <div>
                <Label htmlFor="unitId">Assign to Unit *</Label>
                <Select
                  value={inviteForm.unitId}
                  onValueChange={(value) =>
                    setInviteForm({ ...inviteForm, unitId: value })
                  }
                >
                  <SelectTrigger id="unitId">
                    <SelectValue placeholder="Select a unit..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUnits.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        {inviteForm.roleInUnit === "PRIMARY"
                          ? "No units available for primary tenant"
                          : "No occupied units available"}
                      </div>
                    ) : (
                      availableUnits.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.buildingName ? `${unit.buildingName} - ${unit.unitLabel}` : unit.unitLabel}
                          {inviteForm.roleInUnit === "PRIMARY" && unit.status === "OCCUPIED"
                            ? " (needs primary)"
                            : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="startDate">
                  {inviteForm.roleInUnit === "PRIMARY" ? "Lease Start Date *" : "Move-in Date *"}
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  value={inviteForm.startDate}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, startDate: e.target.value })
                  }
                  required
                />
                {inviteForm.startDate && new Date(inviteForm.startDate) < new Date(new Date().toISOString().split("T")[0]) ? (
                  <p className="text-xs text-muted-foreground mt-1 bg-muted px-2 py-1.5 rounded-md">
                    This tenant will be marked as a Legacy Tenant. Move-in requirements will be waived.
                  </p>
                ) : null}
              </div>
              <div>
                <Label htmlFor="password">Temporary Password *</Label>
                <div className="flex gap-2">
                  <Input
                    id="password"
                    value={inviteForm.password}
                    onChange={(e) =>
                      setInviteForm({ ...inviteForm, password: e.target.value })
                    }
                    placeholder="Enter password..."
                    required
                    minLength={8}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setInviteForm({ ...inviteForm, password: generatePassword() })
                    }
                  >
                    Generate
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Share this password with the tenant. They can change it after logging in.
                </p>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsInviteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={inviteMutation.isPending || availableUnits.length === 0}>
                {inviteMutation.isPending ? "Inviting..." : "Invite Tenant"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation Dialog */}
      <AlertDialog open={isDeactivateDialogOpen} onOpenChange={setIsDeactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Tenant</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Are you sure you want to deactivate <span className="font-semibold">{selectedTenant?.name}</span>?
              </span>
              <span className="block text-muted-foreground">
                This is reversible. The tenant will:
              </span>
              <ul className="list-disc list-inside text-muted-foreground text-sm space-y-1">
                <li>Be logged out immediately</li>
                <li>Not be able to log in until reactivated</li>
                <li>Not receive any emails (reminders, announcements)</li>
                <li>Have their tenancy ended</li>
              </ul>
              <span className="block text-muted-foreground text-sm mt-2">
                Their data will be preserved and you can reactivate them later.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                selectedTenant && deactivateMutation.mutate(selectedTenant.id)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deactivateMutation.isPending ? "Deactivating..." : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reactivate Confirmation Dialog */}
      <AlertDialog open={isReactivateDialogOpen} onOpenChange={setIsReactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivate Tenant</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reactivate {selectedTenant?.name}? They will be
              able to log in to the tenant portal again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                selectedTenant && reactivateMutation.mutate(selectedTenant.id)
              }
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {reactivateMutation.isPending ? "Reactivating..." : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Promote to Primary Confirmation Dialog */}
      <AlertDialog open={isPromoteDialogOpen} onOpenChange={setIsPromoteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promote to Primary Tenant</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to promote {selectedTenant?.name} to primary tenant
              for {selectedTenant?.currentUnit?.unitLabel}? They will become responsible for the
              lease agreement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                selectedTenant && promoteMutation.mutate(selectedTenant.id)
              }
            >
              {promoteMutation.isPending ? "Promoting..." : "Promote to Primary"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => {
        setIsDeleteDialogOpen(open);
        if (!open) {
          setDeleteConfirmEmail("");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete User Permanently</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete{" "}
              <span className="font-semibold">{selectedTenant?.name}</span> and remove all their
              data including documents, photos, and files.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-sm text-destructive">
                <p className="font-medium">Warning: This action is irreversible</p>
                <ul className="mt-2 list-disc list-inside space-y-1 text-destructive/80">
                  <li>All tenancies, documents, and files will be deleted</li>
                  <li>Insurance documents and checklist photos will be removed</li>
                  <li>Payment records will be removed, but invoice history is preserved</li>
                  <li>The user will be logged out immediately</li>
                  <li className="text-muted-foreground">Units will be set to Vacant (not deleted)</li>
                </ul>
              </div>
            </div>
            <div>
              <Label htmlFor="delete-confirm">
                Type the user's email <span className="font-mono font-bold">{selectedTenant?.email}</span> to confirm
              </Label>
              <Input
                id="delete-confirm"
                value={deleteConfirmEmail}
                onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                placeholder="Enter email to confirm"
                className="mt-2"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setDeleteConfirmEmail("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmEmail.toLowerCase() !== selectedTenant?.email.toLowerCase() || deleteMutation.isPending}
              onClick={() => selectedTenant && deleteMutation.mutate({ id: selectedTenant.id, confirmEmail: deleteConfirmEmail })}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete User Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Tenant Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Tenant Information</DialogTitle>
            <DialogDescription>
              Update the tenant's contact information
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Full Name *</Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  placeholder="John Smith"
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-email">Email Address *</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm({ ...editForm, email: e.target.value })
                  }
                  placeholder="john@example.com"
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-phone">Phone Number</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm({ ...editForm, phone: e.target.value })
                  }
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editMutation.isPending}>
                {editMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Tenant Documents Dialog */}
      {selectedTenant && (
        <TenantDocumentsDialog
          tenantId={selectedTenant.id}
          tenantName={selectedTenant.name}
          open={isDocumentsDialogOpen}
          onOpenChange={setIsDocumentsDialogOpen}
        />
      )}

      {/* Schedule Move-Out Dialog */}
      {selectedTenant && (
        <ScheduleMoveOutDialog
          tenantId={selectedTenant.id}
          tenantName={selectedTenant.name}
          currentMoveOutDate={selectedTenant.currentUnit?.moveOutDate}
          open={isScheduleMoveOutDialogOpen}
          onOpenChange={setIsScheduleMoveOutDialogOpen}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
          }}
        />
      )}

      {/* Tenant Notification History Sheet */}
      <Sheet open={isNotificationsSheetOpen} onOpenChange={setIsNotificationsSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-serif">Recent Notifications</SheetTitle>
            <SheetDescription>
              Email notifications sent to {notificationsTenant?.name}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {notificationsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : notificationHistory?.notifications && notificationHistory.notifications.length > 0 ? (
              <div className="space-y-3">
                {notificationHistory.notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="border rounded-lg p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {notification.subject}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatNotificationType(notification.notificationType)}
                        </p>
                      </div>
                      <NotificationStatusBadge status={notification.status} />
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatDateTime(notification.sentAt)}</span>
                      {notification.openedAt ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="h-3 w-3" />
                          Opened {formatDateTime(notification.openedAt)}
                        </span>
                      ) : null}
                    </div>

                    {notification.errorMessage ? (
                      <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                        {notification.errorMessage}
                      </p>
                    ) : null}
                  </div>
                ))}

                {notificationHistory.total > notificationHistory.notifications.length ? (
                  <p className="text-center text-sm text-muted-foreground py-2">
                    Showing {notificationHistory.notifications.length} of {notificationHistory.total} notifications
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Mail className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p>No notifications sent yet</p>
                <p className="text-sm">Automated emails will appear here</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
