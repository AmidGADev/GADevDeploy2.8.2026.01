import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  MoreHorizontal,
  Shield,
  CheckCircle,
  XCircle,
  ExternalLink,
  AlertCircle,
  Clock,
  Mail,
  Trash2,
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
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { AdminInsuranceListItem } from "../../../../backend/src/types";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

type InsuranceStatus = "MISSING" | "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
type FilterStatus = InsuranceStatus | "ALL";

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getStatusBadgeClass(status: InsuranceStatus): string {
  switch (status) {
    case "APPROVED":
      return "bg-green-600 hover:bg-green-700";
    case "PENDING":
      return "bg-amber-500 hover:bg-amber-600 text-white";
    case "MISSING":
      return "bg-red-600 hover:bg-red-700";
    case "REJECTED":
      return "bg-red-600 hover:bg-red-700";
    case "EXPIRED":
      return "bg-orange-500 hover:bg-orange-600 text-white";
    default:
      return "";
  }
}

function getStatusIcon(status: InsuranceStatus) {
  switch (status) {
    case "APPROVED":
      return <CheckCircle className="h-3.5 w-3.5 mr-1" />;
    case "PENDING":
      return <Clock className="h-3.5 w-3.5 mr-1" />;
    case "MISSING":
    case "REJECTED":
      return <XCircle className="h-3.5 w-3.5 mr-1" />;
    case "EXPIRED":
      return <AlertCircle className="h-3.5 w-3.5 mr-1" />;
    default:
      return null;
  }
}

const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "MISSING", label: "Missing" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "EXPIRED", label: "Expired" },
];

export default function InsurancePage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterStatus>("ALL");
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<AdminInsuranceListItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Fetch insurance list
  const { data: insuranceList, isLoading } = useQuery({
    queryKey: ["admin", "insurance", filter],
    queryFn: () => {
      const params = filter !== "ALL" ? `?status=${filter}` : "";
      return api.get<AdminInsuranceListItem[]>(`/api/admin/insurance${params}`);
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: (userId: string) => api.put(`/api/admin/insurance/${userId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "insurance"] });
      toast.success("Insurance approved successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to approve insurance");
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      api.put(`/api/admin/insurance/${userId}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "insurance"] });
      setIsRejectDialogOpen(false);
      setSelectedTenant(null);
      setRejectionReason("");
      toast.success("Insurance rejected");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to reject insurance");
    },
  });

  // Send reminder mutation
  const sendReminderMutation = useMutation({
    mutationFn: (userId: string) => api.post(`/api/admin/insurance/${userId}/send-reminder`),
    onSuccess: (_, userId) => {
      const tenant = insuranceList?.find(t => t.userId === userId);
      toast.success(`Reminder sent to ${tenant?.userName || "tenant"}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to send reminder");
    },
  });

  // Clear insurance mutation (for removing rejected/expired status)
  const clearInsuranceMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/api/admin/insurance/${userId}/clear`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "insurance"] });
      toast.success("Insurance status cleared");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to clear insurance");
    },
  });

  const handleApprove = (tenant: AdminInsuranceListItem) => {
    approveMutation.mutate(tenant.userId);
  };

  const openRejectDialog = (tenant: AdminInsuranceListItem) => {
    setSelectedTenant(tenant);
    setRejectionReason("");
    setIsRejectDialogOpen(true);
  };

  const handleRejectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTenant && rejectionReason.trim()) {
      rejectMutation.mutate({
        userId: selectedTenant.userId,
        reason: rejectionReason.trim(),
      });
    }
  };

  const handleSendReminder = (tenant: AdminInsuranceListItem) => {
    sendReminderMutation.mutate(tenant.userId);
  };

  const openDocument = (url: string) => {
    // Document URLs are relative paths like /api/uploads/insurance/...
    // Need to prepend the backend URL
    const fullUrl = url.startsWith("http") ? url : `${BACKEND_URL}${url}`;
    window.open(fullUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-medium">Insurance</h1>
          <p className="text-muted-foreground mt-1">
            Manage tenant insurance documents and approvals
          </p>
        </div>
      </div>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={filter === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tenant Insurance Status</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : insuranceList && insuranceList.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Building</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead className="hidden md:table-cell">Expires</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insuranceList.map((tenant) => (
                    <TableRow key={tenant.userId}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{tenant.userName}</p>
                          <p className="text-sm text-muted-foreground">{tenant.userEmail}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {tenant.buildingName ? (
                          <span>{tenant.buildingName}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {tenant.unitLabel ? (
                          <span>{tenant.unitLabel}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={getStatusBadgeClass(tenant.status as InsuranceStatus)}
                        >
                          {getStatusIcon(tenant.status as InsuranceStatus)}
                          {tenant.status}
                        </Badge>
                        {tenant.rejectionReason && (
                          <p className="text-xs text-muted-foreground mt-1 max-w-[200px] truncate">
                            Reason: {tenant.rejectionReason}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {tenant.provider ? (
                          <span>{tenant.provider}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm">
                          {formatDate(tenant.expiresAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {/* View Document - show for any status with document */}
                            {tenant.documentUrl && (
                              <DropdownMenuItem onClick={() => openDocument(tenant.documentUrl!)}>
                                <ExternalLink className="h-4 w-4 mr-2" />
                                View Document
                              </DropdownMenuItem>
                            )}

                            {/* PENDING status actions */}
                            {tenant.status === "PENDING" && (
                              <>
                                {tenant.documentUrl && <DropdownMenuSeparator />}
                                <DropdownMenuItem
                                  onClick={() => handleApprove(tenant)}
                                  className="text-green-600 focus:text-green-600"
                                  disabled={approveMutation.isPending}
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openRejectDialog(tenant)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Reject
                                </DropdownMenuItem>
                              </>
                            )}

                            {/* MISSING / EXPIRED / REJECTED status actions */}
                            {(tenant.status === "MISSING" || tenant.status === "EXPIRED" || tenant.status === "REJECTED") && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handleSendReminder(tenant)}
                                  disabled={sendReminderMutation.isPending}
                                >
                                  <Mail className="h-4 w-4 mr-2" />
                                  Send Reminder
                                </DropdownMenuItem>
                              </>
                            )}

                            {/* APPROVED status - no actions needed, just view doc */}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No insurance records found</h3>
              <p className="text-muted-foreground mt-2">
                {filter !== "ALL"
                  ? `No tenants with ${filter.toLowerCase()} insurance status`
                  : "Insurance records will appear here once tenants upload their documents"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Insurance</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting {selectedTenant?.userName}'s insurance document.
              The tenant will be notified of this rejection.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRejectSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="reason">Rejection Reason *</Label>
                <Textarea
                  id="reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g., Document is expired, Coverage amount is insufficient, Wrong policy type..."
                  className="mt-2"
                  rows={4}
                  required
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsRejectDialogOpen(false);
                  setSelectedTenant(null);
                  setRejectionReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={!rejectionReason.trim() || rejectMutation.isPending}
              >
                {rejectMutation.isPending ? "Rejecting..." : "Reject Insurance"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
