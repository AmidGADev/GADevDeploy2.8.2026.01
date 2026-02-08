import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle,
  XCircle,
  Clock,
  Copy,
  AlertTriangle,
  CreditCard,
  Building2,
  Mail,
  Zap,
  UserCheck,
  FileText,
  RefreshCw,
  CircleDollarSign,
  Search,
  Pencil,
  X,
  Check,
  Link2,
  Ban,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

// Helper functions
function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeTime(dateString: string) {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

// Types
interface PaymentHistory {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  unitId: string;
  buildingName: string;
  unitLabel: string;
  invoiceId: string;
  periodMonth: string;
  amountCents: number;
  method: string;
  referenceNumber: string | null;
  paidAt: string;
  approvedByAdminId: string | null;
}

interface IntakeLog {
  id: string;
  rawSubject: string | null;
  rawFrom: string | null;
  senderName: string | null;
  amountCents: number | null;
  referenceNumber: string | null;
  parseConfidence: number | null;
  parseError: string | null;
  status: string;
  reconciliationNote: string | null;
  isVerified: boolean;
  receivedAt: string;
  parsedAt: string | null;
  reconciledAt: string | null;
  matchedTenant: { id: string; name: string; email: string } | null;
  matchedInvoice: {
    id: string;
    periodMonth: string;
    amountCents: number;
    status: string;
    buildingName: string;
    unitLabel: string;
  } | null;
}

interface PendingInvoice {
  id: string;
  periodMonth: string;
  amountCents: number;
  status: string;
  tenant: { id: string; name: string; email: string };
  unit: { id: string; unitLabel: string; buildingName: string };
}

interface EtransferSettings {
  etransferEnabled: boolean;
  etransferRecipientEmail: string;
  etransferMemoTemplate: string;
}

// Activity item with resolve button
function ActivityItem({
  log,
  onResolve,
}: {
  log: IntakeLog;
  onResolve: (log: IntakeLog) => void;
}) {
  const needsResolution = log.status === "MANUAL_REVIEW" || log.status === "FAILED" || log.status === "PARSED";
  const isSuccess = log.status === "PAID" || log.status === "MATCHED";

  const getStatusIcon = () => {
    switch (log.status) {
      case "PAID":
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case "MATCHED":
        return <UserCheck className="h-4 w-4 text-blue-500" />;
      case "MANUAL_REVIEW":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "FAILED":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "PARSED":
        return <Clock className="h-4 w-4 text-slate-500" />;
      default:
        return <Mail className="h-4 w-4 text-slate-400" />;
    }
  };

  const getStatusBadge = () => {
    switch (log.status) {
      case "PAID":
        return (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0">
            Reconciled
          </Badge>
        );
      case "MATCHED":
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0">
            Matched
          </Badge>
        );
      case "MANUAL_REVIEW":
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">
            Review Required
          </Badge>
        );
      case "FAILED":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px] px-1.5 py-0">
            Failed
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-[10px] px-1.5 py-0">
            {log.status}
          </Badge>
        );
    }
  };

  return (
    <div
      className={cn(
        "p-3 rounded-lg border transition-all duration-200",
        needsResolution
          ? "bg-amber-50/50 border-amber-200/60 hover:border-amber-300"
          : isSuccess
          ? "bg-emerald-50/30 border-emerald-100 hover:border-emerald-200"
          : "bg-muted/30 border-border hover:border-border/80"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
            needsResolution
              ? "bg-amber-100"
              : isSuccess
              ? "bg-emerald-100"
              : "bg-slate-100"
          )}
        >
          {getStatusIcon()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {getStatusBadge()}
            <span className="text-[10px] text-muted-foreground">
              {formatRelativeTime(log.receivedAt)}
            </span>
          </div>

          <p className="text-sm font-medium text-foreground truncate">
            {log.senderName || "Unknown sender"}
          </p>

          {log.amountCents ? (
            <p className="text-sm font-mono text-muted-foreground">
              {formatCurrency(log.amountCents)}
            </p>
          ) : null}

          {log.parseError ? (
            <p className="text-xs text-red-600 mt-1 truncate">{log.parseError}</p>
          ) : null}

          {log.matchedTenant && log.matchedInvoice ? (
            <p className="text-xs text-emerald-600 mt-1">
              {log.matchedTenant.name} - {log.matchedInvoice.buildingName} {log.matchedInvoice.unitLabel}
            </p>
          ) : null}
        </div>

        {needsResolution ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs bg-white hover:bg-amber-50 border-amber-200 text-amber-700 hover:text-amber-800"
            onClick={() => onResolve(log)}
          >
            Resolve
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// Payment method badge
function PaymentMethodBadge({ method }: { method: string }) {
  if (method === "stripe" || method === "card") {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-6 h-6 rounded bg-violet-100 flex items-center justify-center">
          <CreditCard className="h-3.5 w-3.5 text-violet-600" />
        </div>
        <span className="text-sm text-muted-foreground">Card</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-6 h-6 rounded bg-emerald-100 flex items-center justify-center">
        <CircleDollarSign className="h-3.5 w-3.5 text-emerald-600" />
      </div>
      <span className="text-sm text-muted-foreground">Interac</span>
    </div>
  );
}

// Status badge
function PaymentStatusBadge({ method, hasAdmin }: { method: string; hasAdmin: boolean }) {
  if (method === "etransfer" || method === "etransfer_manual") {
    if (hasAdmin) {
      return (
        <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-xs font-medium">
          <UserCheck className="h-3 w-3 mr-1" />
          Manual
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-medium">
        <CheckCircle className="h-3 w-3 mr-1" />
        Auto-Matched
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 text-xs font-medium">
      <CheckCircle className="h-3 w-3 mr-1" />
      Success
    </Badge>
  );
}

// Resolution Modal
function ResolutionDialog({
  open,
  onOpenChange,
  log,
  onMatch,
  onDismiss,
  isMatching,
  isDismissing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: IntakeLog | null;
  onMatch: (tenantId: string, invoiceId: string) => void;
  onDismiss: () => void;
  isMatching: boolean;
  isDismissing: boolean;
}) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");

  // Fetch pending invoices for matching
  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ["pending-invoices-for-resolution"],
    queryFn: () =>
      api.get<PendingInvoice[]>("/api/admin/invoices?status=PENDING") as Promise<PendingInvoice[]>,
    enabled: open,
  });

  // Also fetch overdue invoices
  const { data: overdueData } = useQuery({
    queryKey: ["overdue-invoices-for-resolution"],
    queryFn: () =>
      api.get<PendingInvoice[]>("/api/admin/invoices?status=OVERDUE") as Promise<PendingInvoice[]>,
    enabled: open,
  });

  const allInvoices = [...(invoicesData || []), ...(overdueData || [])];

  const handleMatch = () => {
    if (!selectedInvoiceId || !log) return;
    const invoice = allInvoices.find((inv) => inv.id === selectedInvoiceId);
    if (invoice) {
      onMatch(invoice.tenant.id, invoice.id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Resolve Payment
          </DialogTitle>
          <DialogDescription>
            Manually match this e-Transfer to an invoice or dismiss it.
          </DialogDescription>
        </DialogHeader>

        {log ? (
          <div className="space-y-4">
            {/* Payment Details */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sender</span>
                <span className="font-medium">{log.senderName || "Unknown"}</span>
              </div>
              {log.amountCents ? (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-mono font-semibold text-emerald-600">
                    {formatCurrency(log.amountCents)}
                  </span>
                </div>
              ) : null}
              {log.referenceNumber ? (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="font-mono text-xs">{log.referenceNumber}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Received</span>
                <span>{formatDate(log.receivedAt)} at {formatTime(log.receivedAt)}</span>
              </div>
              {log.parseError ? (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-red-600">{log.parseError}</p>
                </div>
              ) : null}
            </div>

            {/* Link to Invoice */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Link to Invoice
              </label>
              {invoicesLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : allInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending invoices available</p>
              ) : (
                <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an invoice to match" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {allInvoices.map((invoice) => (
                      <SelectItem key={invoice.id} value={invoice.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {invoice.tenant.name} - {invoice.unit.buildingName} {invoice.unit.unitLabel}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {invoice.periodMonth} - {formatCurrency(invoice.amountCents)} ({invoice.status})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onDismiss}
            disabled={isDismissing || isMatching}
            className="text-muted-foreground hover:text-red-600 hover:border-red-200"
          >
            <Ban className="h-4 w-4 mr-2" />
            {isDismissing ? "Dismissing..." : "Dismiss as Non-Rent"}
          </Button>
          <Button
            onClick={handleMatch}
            disabled={!selectedInvoiceId || isMatching || isDismissing}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            {isMatching ? "Matching..." : "Match to Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EtransferPaymentsPage() {
  const queryClient = useQueryClient();

  // Filters
  const [methodFilter, setMethodFilter] = useState("all");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Email editing state
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [editedEmail, setEditedEmail] = useState("");

  // Resolution dialog state
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<IntakeLog | null>(null);

  // Fetch e-Transfer settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["etransfer-settings"],
    queryFn: () => api.get<EtransferSettings>("/api/admin/etransfer/settings"),
  });

  // Fetch payment history
  const { data: paymentHistoryData, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ["etransfer-payment-history", buildingFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (buildingFilter !== "all") params.append("building", buildingFilter);
      return api.get<{ payments: PaymentHistory[]; buildings: string[]; total: number }>(
        `/api/admin/etransfer/payment-history?${params.toString()}`
      );
    },
  });

  // Fetch intake logs for the activity sidebar
  const { data: intakeLogsData, refetch: refetchLogs } = useQuery({
    queryKey: ["etransfer-intake-logs"],
    queryFn: () =>
      api.get<{ logs: IntakeLog[]; total: number }>(
        "/api/admin/etransfer/intake-logs?limit=30"
      ),
  });

  const paymentHistory = paymentHistoryData?.payments || [];
  const buildings = paymentHistoryData?.buildings || [];
  // Filter out dismissed items from the live activity feed
  const intakeLogs = (intakeLogsData?.logs || []).filter(
    (log) => log.status !== "DISMISSED"
  );
  const rentEmail = settings?.etransferRecipientEmail || "rent@gadevelopments.ca";

  // Count items needing attention (exclude FAILED since those are system errors, not actionable)
  const needsAttentionCount = intakeLogs.filter(
    (log) => log.status === "MANUAL_REVIEW" || log.status === "PARSED"
  ).length;

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: (newEmail: string) =>
      api.put<EtransferSettings>("/api/admin/etransfer/settings", {
        etransferRecipientEmail: newEmail,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etransfer-settings"] });
      setIsEditingEmail(false);
      toast.success("Rent email updated and synced with Tenant Portal");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update email");
    },
  });

  // Match mutation
  const matchMutation = useMutation({
    mutationFn: ({ logId, tenantId, invoiceId }: { logId: string; tenantId: string; invoiceId: string }) =>
      api.post(`/api/admin/etransfer/intake-logs/${logId}/match`, { tenantId, invoiceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etransfer-intake-logs"] });
      queryClient.invalidateQueries({ queryKey: ["etransfer-payment-history"] });
      queryClient.invalidateQueries({ queryKey: ["pending-invoices-for-resolution"] });
      queryClient.invalidateQueries({ queryKey: ["overdue-invoices-for-resolution"] });
      setResolutionOpen(false);
      setSelectedLog(null);
      toast.success("Payment matched and invoice marked as paid");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to match payment");
    },
  });

  // Dismiss mutation
  const dismissMutation = useMutation({
    mutationFn: (logId: string) =>
      api.put(`/api/admin/etransfer/intake-logs/${logId}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etransfer-intake-logs"] });
      setResolutionOpen(false);
      setSelectedLog(null);
      toast.success("Payment dismissed");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to dismiss payment");
    },
  });

  // Filter payments
  const filteredPayments = paymentHistory.filter((payment) => {
    // Method filter
    if (methodFilter !== "all") {
      if (methodFilter === "etransfer" && payment.method !== "etransfer" && payment.method !== "etransfer_manual") return false;
      if (methodFilter === "card" && payment.method !== "stripe") return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        payment.tenantName.toLowerCase().includes(query) ||
        payment.unitLabel.toLowerCase().includes(query) ||
        payment.buildingName.toLowerCase().includes(query)
      );
    }

    return true;
  });

  // Copy email function
  const copyEmail = () => {
    navigator.clipboard.writeText(rentEmail);
    toast.success("Email copied to clipboard");
  };

  // Start editing email
  const handleStartEdit = () => {
    setEditedEmail(rentEmail);
    setIsEditingEmail(true);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setIsEditingEmail(false);
    setEditedEmail("");
  };

  // Save email
  const handleSaveEmail = () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editedEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }
    updateSettingsMutation.mutate(editedEmail);
  };

  const handleRefresh = () => {
    refetchHistory();
    refetchLogs();
    toast.success("Data refreshed");
  };

  const handleResolve = (log: IntakeLog) => {
    setSelectedLog(log);
    setResolutionOpen(true);
  };

  const handleMatch = (tenantId: string, invoiceId: string) => {
    if (!selectedLog) return;
    matchMutation.mutate({ logId: selectedLog.id, tenantId, invoiceId });
  };

  const handleDismiss = () => {
    if (!selectedLog) return;
    dismissMutation.mutate(selectedLog.id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">e-Transfer Payments</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Automated payment reconciliation for Interac e-Transfers
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* System Status Card */}
      <Card className="border-2 shadow-sm">
        <CardContent className="py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-inner">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Payment Reception Endpoint
                </p>
                {isEditingEmail ? (
                  <div className="flex items-center gap-2 mt-1.5">
                    <Input
                      type="email"
                      value={editedEmail}
                      onChange={(e) => setEditedEmail(e.target.value)}
                      className="h-9 w-[300px] text-sm font-mono"
                      placeholder="rent@example.com"
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                      onClick={handleSaveEmail}
                      disabled={updateSettingsMutation.isPending}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={handleCancelEdit}
                      disabled={updateSettingsMutation.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    {settingsLoading ? (
                      <Skeleton className="h-7 w-56" />
                    ) : (
                      <code className="text-lg font-semibold font-mono">{rentEmail}</code>
                    )}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-muted"
                            onClick={copyEmail}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy email</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-muted"
                            onClick={handleStartEdit}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Edit email address</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Changes payment instructions for all tenants
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right mr-2">
                <p className="text-xs text-muted-foreground">Last sync</p>
                <p className="text-sm font-medium">{formatRelativeTime(new Date().toISOString())}</p>
              </div>
              <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 hover:bg-emerald-500/10 px-3 py-1.5 text-sm font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />
                System Active
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Payment History - Takes up 2 columns */}
        <div className="lg:col-span-2">
          <Card className="h-full shadow-sm">
            <CardHeader className="pb-4 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Payment History</CardTitle>
                <div className="flex items-center gap-2">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search tenant..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-8 w-[160px] text-sm"
                    />
                  </div>

                  {/* Method filter */}
                  <Select value={methodFilter} onValueChange={setMethodFilter}>
                    <SelectTrigger className="h-8 w-[120px] text-xs">
                      <SelectValue placeholder="All Methods" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Methods</SelectItem>
                      <SelectItem value="etransfer">Interac</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Building filter */}
                  <Select value={buildingFilter} onValueChange={setBuildingFilter}>
                    <SelectTrigger className="h-8 w-[140px] text-xs">
                      <Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                      <SelectValue placeholder="All Buildings" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Buildings</SelectItem>
                      {buildings.map((b) => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {historyLoading ? (
                <div className="p-6 space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : filteredPayments.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p className="text-sm font-medium">No payments found</p>
                  {searchQuery ? (
                    <p className="text-xs mt-1">Try adjusting your search</p>
                  ) : null}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide h-11">Date</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide h-11">Tenant</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide h-11">Unit</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide h-11">Method</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right h-11">Amount</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide h-11">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPayments.map((payment) => (
                        <TableRow
                          key={payment.id}
                          className="group hover:bg-muted/50 transition-colors border-b border-border/50"
                        >
                          <TableCell className="py-4">
                            <div>
                              <p className="text-sm font-medium">{formatDate(payment.paidAt)}</p>
                              <p className="text-xs text-muted-foreground">{formatTime(payment.paidAt)}</p>
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            <p className="text-sm font-medium">{payment.tenantName}</p>
                          </TableCell>
                          <TableCell className="py-4">
                            <div>
                              <p className="text-sm font-medium">{payment.unitLabel}</p>
                              <p className="text-xs text-muted-foreground">{payment.buildingName}</p>
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            <PaymentMethodBadge method={payment.method} />
                          </TableCell>
                          <TableCell className="py-4 text-right">
                            <span className="font-mono text-sm font-bold text-emerald-600">
                              {formatCurrency(payment.amountCents)}
                            </span>
                          </TableCell>
                          <TableCell className="py-4">
                            <PaymentStatusBadge
                              method={payment.method}
                              hasAdmin={!!payment.approvedByAdminId}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Live Activity Sidebar */}
        <div className="lg:col-span-1">
          <Card className="h-full shadow-sm">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Live Activity
                </CardTitle>
                <div className="flex items-center gap-2">
                  {needsAttentionCount > 0 ? (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5">
                      {needsAttentionCount} needs attention
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                    Live
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {intakeLogs.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground px-4">
                  <Zap className="h-10 w-10 mx-auto mb-4 opacity-30" />
                  <p className="text-sm font-medium">No activity yet</p>
                  <p className="text-xs mt-1">
                    Incoming e-Transfers will appear here
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[540px]">
                  <div className="p-3 space-y-2">
                    {intakeLogs.map((log) => (
                      <ActivityItem
                        key={log.id}
                        log={log}
                        onResolve={handleResolve}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Resolution Dialog */}
      <ResolutionDialog
        open={resolutionOpen}
        onOpenChange={setResolutionOpen}
        log={selectedLog}
        onMatch={handleMatch}
        onDismiss={handleDismiss}
        isMatching={matchMutation.isPending}
        isDismissing={dismissMutation.isPending}
      />
    </div>
  );
}
