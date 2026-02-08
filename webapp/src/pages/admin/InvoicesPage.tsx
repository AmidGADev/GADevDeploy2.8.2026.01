import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Bell,
  FileText,
  Filter,
  Download,
  Search,
  ChevronDown,
  ChevronRight,
  Building2,
  Home,
  LayoutList,
  Layers,
  Receipt,
  ChevronsUpDown,
  Check,
  Calendar,
  DollarSign,
  CreditCard,
  CircleDollarSign,
  Zap,
  UserCheck,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { Invoice, InvoiceStatus } from "../../../../backend/src/types";

type ChargeCategory = "LATE_FEE" | "REPAIR" | "UTILITY_SURCHARGE" | "OTHER";
type InvoiceType = "RENT" | "CUSTOM";

interface InvoiceWithDetails extends Invoice {
  unit?: {
    id: string;
    unitLabel: string;
    buildingName?: string | null;
    status?: string;
  };
  tenant?: {
    id: string;
    name: string;
    email: string;
  };
  invoiceType: InvoiceType;
  chargeCategory: ChargeCategory | null;
  description: string | null;
  payments?: {
    id: string;
    amountCents: number;
    paidAt: string;
    method: string;
    approvedByAdminId: string | null;
  }[];
}

interface OccupiedUnit {
  id: string;
  unitLabel: string;
  buildingName: string | null;
}

interface TenancyWithDetails {
  id: string;
  userId: string;
  unitId: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  user: {
    id: string;
    name: string;
    email: string;
  };
  unit: {
    id: string;
    unitLabel: string;
    buildingName: string | null;
  };
}

const CHARGE_CATEGORY_LABELS: Record<ChargeCategory, string> = {
  LATE_FEE: "Late Fee",
  REPAIR: "Repair",
  UTILITY_SURCHARGE: "Utility Surcharge",
  OTHER: "Other",
};

interface UnitGroup {
  key: string;
  buildingName: string;
  unitLabel: string;
  unitStatus: string;
  invoices: InvoiceWithDetails[];
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatMonth(periodMonth: string) {
  const [year, month] = periodMonth.split("-");
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
  });
}

function getStatusBadge(status: InvoiceStatus) {
  switch (status) {
    case "PAID":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>;
    case "OPEN":
      return <Badge variant="secondary">Open</Badge>;
    case "OVERDUE":
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Overdue</Badge>;
    case "VOID":
      return <Badge variant="outline">Void</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

// Payment method badge component
function PaymentMethodBadge({ payment }: { payment: { method: string; approvedByAdminId: string | null } }) {
  if (payment.method === "stripe" || payment.method === "card") {
    return (
      <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 text-xs gap-1">
        <CreditCard className="h-3 w-3" />
        Card
      </Badge>
    );
  }

  if (payment.method === "etransfer") {
    if (payment.approvedByAdminId) {
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs gap-1">
          <UserCheck className="h-3 w-3" />
          Manual
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs gap-1">
        <Zap className="h-3 w-3" />
        e-Transfer
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs gap-1">
      <CircleDollarSign className="h-3 w-3" />
      {payment.method}
    </Badge>
  );
}

// Check if an invoice is overdue (due date passed and not paid)
function isInvoiceOverdue(invoice: InvoiceWithDetails): boolean {
  if (invoice.status === "PAID" || invoice.status === "VOID") return false;
  const dueDate = new Date(invoice.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDate < today;
}

// Get list of months for filter (past 12 months + next 3 months)
function getMonthOptions() {
  const options: { value: string; label: string }[] = [];
  const now = new Date();

  // Past 12 months
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("en-CA", { year: "numeric", month: "long" });
    options.push({ value, label });
  }

  // Next 3 months
  for (let i = 1; i <= 3; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("en-CA", { year: "numeric", month: "long" });
    options.push({ value, label });
  }

  return options;
}

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [buildingFilter, setBuildingFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [groupByUnit, setGroupByUnit] = useState<boolean>(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [actionDialog, setActionDialog] = useState<{
    type: "paid" | "void" | "reminder";
    invoice: InvoiceWithDetails;
  } | null>(null);
  const [generateMonth, setGenerateMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // Custom invoice dialog state
  const [isCustomInvoiceDialogOpen, setIsCustomInvoiceDialogOpen] = useState(false);
  const [customInvoiceForm, setCustomInvoiceForm] = useState({
    tenancyId: "",
    chargeCategory: "" as ChargeCategory | "",
    description: "",
    amountDollars: "",
    dueDate: "",
  });
  const [tenantSelectorOpen, setTenantSelectorOpen] = useState(false);

  // Fetch invoices
  const { data: invoices, isLoading } = useQuery({
    queryKey: ["admin", "invoices"],
    queryFn: () => api.get<InvoiceWithDetails[]>("/api/admin/invoices"),
  });

  // Fetch buildings for filter
  const { data: buildings } = useQuery({
    queryKey: ["admin", "invoices", "buildings"],
    queryFn: () => api.get<string[]>("/api/admin/invoices/buildings"),
  });

  // Fetch occupied units for custom invoice creation
  const { data: occupiedUnits } = useQuery({
    queryKey: ["admin", "units", "occupied"],
    queryFn: () => api.get<OccupiedUnit[]>("/api/admin/units?status=OCCUPIED"),
    enabled: isCustomInvoiceDialogOpen,
  });

  // Fetch active tenancies for custom invoice creation (tenant-centric)
  const { data: activeTenancies } = useQuery({
    queryKey: ["admin", "tenancies", "active"],
    queryFn: () => api.get<TenancyWithDetails[]>("/api/admin/tenancies?active=true"),
    enabled: isCustomInvoiceDialogOpen,
  });

  // Generate invoices mutation
  const generateMutation = useMutation({
    mutationFn: (month: string) =>
      api.post<{ count: number }>("/api/admin/invoices/generate", { periodMonth: month }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "invoices"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      setIsGenerateDialogOpen(false);
      toast.success(`Generated ${data?.count || 0} invoice(s) for ${formatMonth(generateMonth)}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to generate invoices");
    },
  });

  // Create custom invoice mutation
  const createCustomInvoiceMutation = useMutation({
    mutationFn: (data: {
      unitId: string;
      periodMonth: string;
      dueDate: string;
      amountCents: number;
      invoiceType: "CUSTOM";
      chargeCategory: string;
      description: string;
    }) => api.post<InvoiceWithDetails>("/api/admin/invoices", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "invoices"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      setIsCustomInvoiceDialogOpen(false);
      setCustomInvoiceForm({
        tenancyId: "",
        chargeCategory: "",
        description: "",
        amountDollars: "",
        dueDate: "",
      });
      toast.success("Custom invoice created successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create custom invoice");
    },
  });

  // Mark paid mutation
  const markPaidMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/admin/invoices/${id}/paid`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "invoices"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      setActionDialog(null);
      toast.success("Invoice marked as paid");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update invoice");
    },
  });

  // Void invoice mutation
  const voidMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/admin/invoices/${id}/void`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "invoices"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      setActionDialog(null);
      toast.success("Invoice voided");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to void invoice");
    },
  });

  // Send reminder mutation
  const sendReminderMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/invoices/${id}/reminder`),
    onSuccess: () => {
      setActionDialog(null);
      toast.success("Reminder sent to tenant");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to send reminder");
    },
  });

  // Filter and compute invoices
  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];

    return invoices.filter((invoice) => {
      // Tab filter
      switch (activeTab) {
        case "overdue":
          if (!isInvoiceOverdue(invoice)) return false;
          break;
        case "open":
          if (invoice.status !== "OPEN" && !isInvoiceOverdue(invoice)) return false;
          break;
        case "paid":
          if (invoice.status !== "PAID") return false;
          break;
      }

      // Building filter
      if (buildingFilter !== "all" && invoice.unit?.buildingName !== buildingFilter) return false;

      // Month filter
      if (monthFilter !== "all" && invoice.periodMonth !== monthFilter) return false;

      // Search filter (searches tenant name, email, unit label, building name)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTenant =
          invoice.tenant?.name.toLowerCase().includes(query) ||
          invoice.tenant?.email.toLowerCase().includes(query);
        const matchesUnit =
          invoice.unit?.unitLabel.toLowerCase().includes(query) ||
          invoice.unit?.buildingName?.toLowerCase().includes(query);
        if (!matchesTenant && !matchesUnit) return false;
      }

      return true;
    });
  }, [invoices, activeTab, buildingFilter, monthFilter, searchQuery]);

  // Calculate monthly summary for filtered invoices
  const monthlySummary = useMemo(() => {
    const totalBilled = filteredInvoices.reduce((sum, inv) => sum + inv.amountCents, 0);
    const totalCollected = filteredInvoices
      .filter((inv) => inv.status === "PAID")
      .reduce((sum, inv) => sum + inv.amountCents, 0);
    return { totalBilled, totalCollected };
  }, [filteredInvoices]);

  // Group invoices by unit
  const groupedInvoices = useMemo(() => {
    if (!groupByUnit) return null;

    const groups: Map<string, UnitGroup> = new Map();

    for (const invoice of filteredInvoices) {
      const buildingName = invoice.unit?.buildingName || "Unknown Building";
      const unitLabel = invoice.unit?.unitLabel || "Unknown Unit";
      const key = `${buildingName}-${unitLabel}`;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          buildingName,
          unitLabel,
          unitStatus: invoice.unit?.status || "UNKNOWN",
          invoices: [],
        });
      }
      groups.get(key)!.invoices.push(invoice);
    }

    // Sort groups by building name then unit label
    return Array.from(groups.values()).sort((a, b) => {
      const buildingCompare = a.buildingName.localeCompare(b.buildingName);
      if (buildingCompare !== 0) return buildingCompare;
      return a.unitLabel.localeCompare(b.unitLabel);
    });
  }, [filteredInvoices, groupByUnit]);

  // Calculate tab counts
  const tabCounts = useMemo(() => {
    if (!invoices) return { all: 0, overdue: 0, open: 0, paid: 0 };

    let overdue = 0;
    let open = 0;
    let paid = 0;

    for (const invoice of invoices) {
      if (invoice.status === "PAID") {
        paid++;
      } else if (isInvoiceOverdue(invoice)) {
        overdue++;
      } else if (invoice.status === "OPEN") {
        open++;
      }
    }

    return { all: invoices.length, overdue, open, paid };
  }, [invoices]);

  const toggleGroupExpanded = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const expandAllGroups = () => {
    if (groupedInvoices) {
      setExpandedGroups(new Set(groupedInvoices.map((g) => g.key)));
    }
  };

  const collapseAllGroups = () => {
    setExpandedGroups(new Set());
  };

  const monthOptions = getMonthOptions();

  // Helper to render invoice type info
  const renderInvoiceTypeInfo = (invoice: InvoiceWithDetails) => {
    if (invoice.invoiceType === "CUSTOM") {
      const categoryLabel = invoice.chargeCategory
        ? CHARGE_CATEGORY_LABELS[invoice.chargeCategory]
        : "Custom";
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
              {categoryLabel}
            </Badge>
          </div>
          {invoice.description ? (
            <span className="text-xs text-muted-foreground line-clamp-1">{invoice.description}</span>
          ) : null}
        </div>
      );
    }
    return <span>{formatMonth(invoice.periodMonth)}</span>;
  };

  const renderInvoiceRow = (invoice: InvoiceWithDetails, showUnit = true) => (
    <TableRow key={invoice.id}>
      <TableCell className="font-medium">
        {renderInvoiceTypeInfo(invoice)}
      </TableCell>
      {showUnit && (
        <TableCell>
          <div className="flex items-center gap-2">
            <span>
              {invoice.unit?.buildingName
                ? `${invoice.unit.buildingName} - ${invoice.unit.unitLabel}`
                : invoice.unit?.unitLabel || "-"}
            </span>
            {invoice.unit?.status === "VACANT" && (
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                Vacant
              </Badge>
            )}
          </div>
        </TableCell>
      )}
      <TableCell className="hidden md:table-cell">
        {invoice.tenant ? (
          <div>
            <p className="font-medium">{invoice.tenant.name}</p>
            <p className="text-sm text-muted-foreground">{invoice.tenant.email}</p>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="font-medium">{formatCurrency(invoice.amountCents)}</TableCell>
      <TableCell>
        {isInvoiceOverdue(invoice) && invoice.status !== "PAID" && invoice.status !== "VOID"
          ? <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Overdue</Badge>
          : getStatusBadge(invoice.status)}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {invoice.status === "PAID" && invoice.payments && invoice.payments.length > 0 ? (
          <PaymentMethodBadge payment={invoice.payments[0]} />
        ) : (
          <span className="text-muted-foreground text-xs">-</span>
        )}
      </TableCell>
      <TableCell className="hidden lg:table-cell">{formatDate(invoice.dueDate)}</TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {invoice.status === "OPEN" || isInvoiceOverdue(invoice) ? (
              <>
                <DropdownMenuItem onClick={() => setActionDialog({ type: "paid", invoice })}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark as Paid
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActionDialog({ type: "reminder", invoice })}>
                  <Bell className="h-4 w-4 mr-2" />
                  Send Reminder
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            {invoice.status !== "VOID" && invoice.status !== "PAID" ? (
              <DropdownMenuItem
                onClick={() => setActionDialog({ type: "void", invoice })}
                className="text-destructive focus:text-destructive"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Void Invoice
              </DropdownMenuItem>
            ) : null}
            {invoice.status === "PAID" || invoice.status === "VOID" ? (
              <DropdownMenuItem disabled>
                <Download className="h-4 w-4 mr-2" />
                No actions available
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-medium">Invoices</h1>
          <p className="text-muted-foreground mt-1">Manage rent invoices and payments</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsCustomInvoiceDialogOpen(true)}>
            <Receipt className="h-4 w-4 mr-2" />
            Generate Custom Invoice
          </Button>
          <Button onClick={() => setIsGenerateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Generate Monthly Rent Invoices
          </Button>
        </div>
      </div>

      {/* Status Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="all" className="gap-2">
            All Invoices
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {tabCounts.all}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="overdue" className="gap-2">
            Overdue
            {tabCounts.overdue > 0 && (
              <Badge className="ml-1 h-5 px-1.5 text-xs bg-red-100 text-red-800">
                {tabCounts.overdue}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="open" className="gap-2">
            Open/Pending
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {tabCounts.open}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="paid" className="gap-2">
            Paid
            <Badge className="ml-1 h-5 px-1.5 text-xs bg-green-100 text-green-800">
              {tabCounts.paid}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by tenant name, email, unit, or building..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters:</span>
              </div>
              <div className="flex flex-wrap gap-4">
                {/* Building Filter */}
                <Select value={buildingFilter} onValueChange={setBuildingFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Building" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Buildings</SelectItem>
                    {buildings?.map((building) => (
                      <SelectItem key={building} value={building}>
                        {building}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Month/Year Filter */}
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Months</SelectItem>
                    {monthOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Group by Unit Toggle */}
              <div className="flex items-center gap-2 ml-auto">
                <Switch
                  id="group-by-unit"
                  checked={groupByUnit}
                  onCheckedChange={setGroupByUnit}
                />
                <Label htmlFor="group-by-unit" className="text-sm cursor-pointer flex items-center gap-1.5">
                  {groupByUnit ? <Layers className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}
                  Group by Unit
                </Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Summary */}
      <Card className="bg-slate-50/50">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              <span className="font-serif font-medium">
                {monthFilter !== "all" ? formatMonth(monthFilter) : "All Time"} Summary
              </span>
            </div>
            <div className="flex gap-8">
              <div className="text-center sm:text-right">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Billed</p>
                <p className="text-xl font-semibold font-serif">{formatCurrency(monthlySummary.totalBilled)}</p>
              </div>
              <div className="text-center sm:text-right">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Collected</p>
                <p className="text-xl font-semibold font-serif text-green-700">{formatCurrency(monthlySummary.totalCollected)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {activeTab === "all"
              ? "All Invoices"
              : activeTab === "overdue"
              ? "Overdue Invoices"
              : activeTab === "open"
              ? "Open/Pending Invoices"
              : "Paid Invoices"}
          </CardTitle>
          {groupByUnit && groupedInvoices && groupedInvoices.length > 0 && (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={expandAllGroups}>
                Expand All
              </Button>
              <Button variant="ghost" size="sm" onClick={collapseAllGroups}>
                Collapse All
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : groupByUnit && groupedInvoices ? (
            // Grouped View
            groupedInvoices.length > 0 ? (
              <div className="space-y-4">
                {groupedInvoices.map((group) => (
                  <Collapsible
                    key={group.key}
                    open={expandedGroups.has(group.key)}
                    onOpenChange={() => toggleGroupExpanded(group.key)}
                  >
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/70 transition-colors">
                        <div className="flex items-center gap-3">
                          {expandedGroups.has(group.key) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <Home className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {group.buildingName} - {group.unitLabel}
                          </span>
                          {group.unitStatus === "VACANT" && (
                            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                              Vacant
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant="secondary">{group.invoices.length} invoice(s)</Badge>
                          <span className="text-sm text-muted-foreground">
                            {formatCurrency(
                              group.invoices.reduce((sum, inv) => sum + inv.amountCents, 0)
                            )}{" "}
                            total
                          </span>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Period</TableHead>
                              <TableHead className="hidden md:table-cell">Tenant</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="hidden sm:table-cell">Method</TableHead>
                              <TableHead className="hidden lg:table-cell">Due Date</TableHead>
                              <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.invoices.map((invoice) => (
                              <TableRow key={invoice.id}>
                                <TableCell className="font-medium">
                                  {renderInvoiceTypeInfo(invoice)}
                                </TableCell>
                                <TableCell className="hidden md:table-cell">
                                  {invoice.tenant ? (
                                    <div>
                                      <p className="font-medium">{invoice.tenant.name}</p>
                                      <p className="text-sm text-muted-foreground">
                                        {invoice.tenant.email}
                                      </p>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="font-medium">
                                  {formatCurrency(invoice.amountCents)}
                                </TableCell>
                                <TableCell>
                                  {isInvoiceOverdue(invoice) &&
                                  invoice.status !== "PAID" &&
                                  invoice.status !== "VOID" ? (
                                    <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                                      Overdue
                                    </Badge>
                                  ) : (
                                    getStatusBadge(invoice.status)
                                  )}
                                </TableCell>
                                <TableCell className="hidden sm:table-cell">
                                  {invoice.status === "PAID" && invoice.payments && invoice.payments.length > 0 ? (
                                    <PaymentMethodBadge payment={invoice.payments[0]} />
                                  ) : (
                                    <span className="text-muted-foreground text-xs">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="hidden lg:table-cell">
                                  {formatDate(invoice.dueDate)}
                                </TableCell>
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {invoice.status === "OPEN" || isInvoiceOverdue(invoice) ? (
                                        <>
                                          <DropdownMenuItem
                                            onClick={() =>
                                              setActionDialog({ type: "paid", invoice })
                                            }
                                          >
                                            <CheckCircle className="h-4 w-4 mr-2" />
                                            Mark as Paid
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() =>
                                              setActionDialog({ type: "reminder", invoice })
                                            }
                                          >
                                            <Bell className="h-4 w-4 mr-2" />
                                            Send Reminder
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                        </>
                                      ) : null}
                                      {invoice.status !== "VOID" && invoice.status !== "PAID" ? (
                                        <DropdownMenuItem
                                          onClick={() =>
                                            setActionDialog({ type: "void", invoice })
                                          }
                                          className="text-destructive focus:text-destructive"
                                        >
                                          <XCircle className="h-4 w-4 mr-2" />
                                          Void Invoice
                                        </DropdownMenuItem>
                                      ) : null}
                                      {invoice.status === "PAID" || invoice.status === "VOID" ? (
                                        <DropdownMenuItem disabled>
                                          <Download className="h-4 w-4 mr-2" />
                                          No actions available
                                        </DropdownMenuItem>
                                      ) : null}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-medium">No invoices found</h3>
                <p className="text-muted-foreground mt-2">
                  {searchQuery || buildingFilter !== "all" || monthFilter !== "all"
                    ? "Try adjusting your filters"
                    : "Generate invoices for your tenants"}
                </p>
              </div>
            )
          ) : // Flat View
          filteredInvoices.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="hidden md:table-cell">Tenant</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Method</TableHead>
                    <TableHead className="hidden lg:table-cell">Due Date</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>{filteredInvoices.map((invoice) => renderInvoiceRow(invoice))}</TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No invoices found</h3>
              <p className="text-muted-foreground mt-2">
                {searchQuery || buildingFilter !== "all" || monthFilter !== "all" || activeTab !== "all"
                  ? "Try adjusting your filters"
                  : "Generate invoices for your tenants"}
              </p>
              {!searchQuery && buildingFilter === "all" && monthFilter === "all" && activeTab === "all" ? (
                <Button className="mt-4" onClick={() => setIsGenerateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Generate Monthly Rent Invoices
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Invoices Dialog */}
      <AlertDialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate Monthly Rent Invoices</AlertDialogTitle>
            <AlertDialogDescription>
              This will create rent invoices for all active tenants based on their lease agreements for the selected month. Invoices that already exist will not be duplicated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">Select Month</label>
            <Select value={generateMonth} onValueChange={setGenerateMonth}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => generateMutation.mutate(generateMonth)}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? "Generating..." : "Generate Rent Invoices"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Action Confirmation Dialogs */}
      <AlertDialog
        open={actionDialog?.type === "paid"}
        onOpenChange={(open) => !open && setActionDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Invoice as Paid</AlertDialogTitle>
            <AlertDialogDescription>
              Mark the {formatMonth(actionDialog?.invoice.periodMonth || "")} invoice for{" "}
              {actionDialog?.invoice.unit?.buildingName
                ? `${actionDialog.invoice.unit.buildingName} - ${actionDialog.invoice.unit.unitLabel}`
                : actionDialog?.invoice.unit?.unitLabel}{" "}
              as paid?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => actionDialog && markPaidMutation.mutate(actionDialog.invoice.id)}
              disabled={markPaidMutation.isPending}
            >
              {markPaidMutation.isPending ? "Updating..." : "Mark as Paid"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={actionDialog?.type === "void"}
        onOpenChange={(open) => !open && setActionDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to void this invoice? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => actionDialog && voidMutation.mutate(actionDialog.invoice.id)}
              disabled={voidMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {voidMutation.isPending ? "Voiding..." : "Void Invoice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={actionDialog?.type === "reminder"}
        onOpenChange={(open) => !open && setActionDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Payment Reminder</AlertDialogTitle>
            <AlertDialogDescription>
              Send a payment reminder email to {actionDialog?.invoice.tenant?.name} for the{" "}
              {formatMonth(actionDialog?.invoice.periodMonth || "")} invoice?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => actionDialog && sendReminderMutation.mutate(actionDialog.invoice.id)}
              disabled={sendReminderMutation.isPending}
            >
              {sendReminderMutation.isPending ? "Sending..." : "Send Reminder"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Custom Invoice Dialog */}
      <Dialog open={isCustomInvoiceDialogOpen} onOpenChange={(open) => {
        setIsCustomInvoiceDialogOpen(open);
        if (!open) {
          setCustomInvoiceForm({
            tenancyId: "",
            chargeCategory: "",
            description: "",
            amountDollars: "",
            dueDate: "",
          });
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="font-serif">Create Custom Invoice</DialogTitle>
            <DialogDescription>
              Generate a custom invoice for a tenant. This will create an invoice for charges other than regular rent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Tenant Selection - Searchable Combobox */}
            <div className="space-y-2">
              <Label htmlFor="tenant">Tenant</Label>
              <Popover open={tenantSelectorOpen} onOpenChange={setTenantSelectorOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={tenantSelectorOpen}
                    className="w-full justify-between font-normal"
                  >
                    {customInvoiceForm.tenancyId
                      ? activeTenancies?.find((t) => t.id === customInvoiceForm.tenancyId)?.user.name || "Select tenant..."
                      : "Select tenant..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder="Search tenants..." />
                    <CommandList>
                      <CommandEmpty>No tenants found.</CommandEmpty>
                      <CommandGroup>
                        {activeTenancies?.map((tenancy) => (
                          <CommandItem
                            key={tenancy.id}
                            value={`${tenancy.user.name} ${tenancy.user.email} ${tenancy.unit.buildingName || ""} ${tenancy.unit.unitLabel}`}
                            onSelect={() => {
                              setCustomInvoiceForm((prev) => ({ ...prev, tenancyId: tenancy.id }));
                              setTenantSelectorOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                customInvoiceForm.tenancyId === tenancy.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span className="font-medium">{tenancy.user.name}</span>
                              <span className="text-xs text-muted-foreground">{tenancy.user.email}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Selected Tenant Unit Confirmation */}
            {customInvoiceForm.tenancyId && activeTenancies?.find((t) => t.id === customInvoiceForm.tenancyId) && (
              <div className="rounded-md bg-muted/50 border px-3 py-2">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Selected: </span>
                  {activeTenancies.find((t) => t.id === customInvoiceForm.tenancyId)?.user.name} | {" "}
                  {activeTenancies.find((t) => t.id === customInvoiceForm.tenancyId)?.unit.buildingName || "Building"} - {activeTenancies.find((t) => t.id === customInvoiceForm.tenancyId)?.unit.unitLabel}
                </p>
              </div>
            )}

            {/* Charge Category */}
            <div className="space-y-2">
              <Label htmlFor="chargeCategory">Charge Category</Label>
              <Select
                value={customInvoiceForm.chargeCategory}
                onValueChange={(value) =>
                  setCustomInvoiceForm((prev) => ({ ...prev, chargeCategory: value as ChargeCategory }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LATE_FEE">Late Fee</SelectItem>
                  <SelectItem value="REPAIR">Repair</SelectItem>
                  <SelectItem value="UTILITY_SURCHARGE">Utility Surcharge</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="e.g., Broken window repair"
                value={customInvoiceForm.description}
                onChange={(e) => setCustomInvoiceForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (CAD)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={customInvoiceForm.amountDollars}
                  onChange={(e) => setCustomInvoiceForm((prev) => ({ ...prev, amountDollars: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="dueDate"
                  type="date"
                  value={customInvoiceForm.dueDate}
                  onChange={(e) => setCustomInvoiceForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Period Month - Auto-set from filter */}
            <div className="space-y-2">
              <Label htmlFor="periodMonth">Period Month</Label>
              <Input
                id="periodMonth"
                value={monthFilter !== "all" ? formatMonth(monthFilter) : formatMonth(generateMonth)}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Based on your selected month filter
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCustomInvoiceDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const selectedTenancy = activeTenancies?.find((t) => t.id === customInvoiceForm.tenancyId);
                if (!customInvoiceForm.tenancyId || !selectedTenancy || !customInvoiceForm.chargeCategory || !customInvoiceForm.amountDollars || !customInvoiceForm.dueDate) {
                  toast.error("Please fill in all required fields");
                  return;
                }
                const amountCents = Math.round(parseFloat(customInvoiceForm.amountDollars) * 100);
                if (isNaN(amountCents) || amountCents <= 0) {
                  toast.error("Please enter a valid amount");
                  return;
                }
                createCustomInvoiceMutation.mutate({
                  unitId: selectedTenancy.unitId,
                  periodMonth: monthFilter !== "all" ? monthFilter : generateMonth,
                  dueDate: new Date(customInvoiceForm.dueDate).toISOString(),
                  amountCents,
                  invoiceType: "CUSTOM",
                  chargeCategory: customInvoiceForm.chargeCategory,
                  description: customInvoiceForm.description,
                });
              }}
              disabled={createCustomInvoiceMutation.isPending}
            >
              {createCustomInvoiceMutation.isPending ? "Creating..." : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
