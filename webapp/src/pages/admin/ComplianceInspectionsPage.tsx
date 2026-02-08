import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Search,
  User,
  Home,
  Calendar,
  ChevronRight,
  Filter,
  Lock,
  AlertCircle,
  ClipboardCheck,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface InspectionComplianceItem {
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  unitId: string;
  buildingName: string;
  unitLabel: string;
  inspectionId: string | null;
  inspectionType: "MOVE_IN" | "MOVE_OUT";
  inspectionStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "WAIVED";
  isFinalized: boolean;
  isLegacyMoveIn: boolean;
  moveOutDate?: string | null;
  lastUpdated: string | null;
  isOverdue?: boolean;
}

interface InspectionComplianceResponse {
  items: InspectionComplianceItem[];
  stats: {
    notStarted: number;
    inProgress: number;
    completed: number;
    finalized: number;
    overdue: number;
    legacy?: number;
  };
}

type FilterStatus = "all" | "not_started" | "in_progress" | "completed" | "finalized" | "legacy";

export default function ComplianceInspectionsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"MOVE_IN" | "MOVE_OUT">("MOVE_IN");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const { data: moveInResponse, isLoading: moveInLoading } = useQuery({
    queryKey: ["admin", "compliance", "inspections", "MOVE_IN"],
    queryFn: () =>
      api.get<InspectionComplianceResponse>("/api/admin/compliance/inspections?type=MOVE_IN"),
  });

  const { data: moveOutResponse, isLoading: moveOutLoading } = useQuery({
    queryKey: ["admin", "compliance", "inspections", "MOVE_OUT"],
    queryFn: () =>
      api.get<InspectionComplianceResponse>("/api/admin/compliance/inspections?type=MOVE_OUT"),
  });

  const moveInItems = moveInResponse?.items;
  const moveOutItems = moveOutResponse?.items;

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (item: InspectionComplianceItem) => {
    // Check for legacy tenant first (only for MOVE_IN inspections)
    if (item.inspectionType === "MOVE_IN" && (item.isLegacyMoveIn || item.inspectionStatus === "WAIVED")) {
      return (
        <Badge className="bg-muted text-muted-foreground hover:bg-muted">
          N/A - Legacy
        </Badge>
      );
    }

    if (item.isFinalized) {
      return (
        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 gap-1">
          <Lock className="h-3 w-3" />
          Finalized
        </Badge>
      );
    }

    if (item.isOverdue) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Overdue
        </Badge>
      );
    }

    switch (item.inspectionStatus) {
      case "COMPLETED":
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            Completed
          </Badge>
        );
      case "IN_PROGRESS":
        return (
          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
            In Progress
          </Badge>
        );
      case "NOT_STARTED":
      default:
        return <Badge variant="secondary">Not Started</Badge>;
    }
  };

  const filterItems = (items: InspectionComplianceItem[] | undefined) => {
    if (!items) return [];

    return items.filter((item) => {
      // Search filter
      const matchesSearch =
        searchQuery === "" ||
        item.tenantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.tenantEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.unitLabel.toLowerCase().includes(searchQuery.toLowerCase());

      // Check if item is legacy (only for MOVE_IN)
      const isLegacy = item.inspectionType === "MOVE_IN" && (item.isLegacyMoveIn || item.inspectionStatus === "WAIVED");

      // Status filter
      let matchesStatus = true;
      switch (filterStatus) {
        case "not_started":
          matchesStatus = item.inspectionStatus === "NOT_STARTED" && !item.isFinalized && !isLegacy;
          break;
        case "in_progress":
          matchesStatus = item.inspectionStatus === "IN_PROGRESS" && !item.isFinalized && !isLegacy;
          break;
        case "completed":
          matchesStatus = item.inspectionStatus === "COMPLETED" && !item.isFinalized && !isLegacy;
          break;
        case "finalized":
          matchesStatus = item.isFinalized && !isLegacy;
          break;
        case "legacy":
          matchesStatus = isLegacy;
          break;
        case "all":
        default:
          matchesStatus = true;
      }

      return matchesSearch && matchesStatus;
    });
  };

  const calculateStats = (items: InspectionComplianceItem[] | undefined, inspectionType: "MOVE_IN" | "MOVE_OUT") => {
    if (!items) {
      return {
        total: 0,
        notStarted: 0,
        inProgress: 0,
        completed: 0,
        finalized: 0,
        overdue: 0,
        legacy: 0,
      };
    }

    // Only count legacy for MOVE_IN inspections
    const isLegacyItem = (i: InspectionComplianceItem) =>
      inspectionType === "MOVE_IN" && (i.isLegacyMoveIn || i.inspectionStatus === "WAIVED");

    return {
      total: items.length,
      notStarted: items.filter((i) => i.inspectionStatus === "NOT_STARTED" && !i.isFinalized && !isLegacyItem(i)).length,
      inProgress: items.filter((i) => i.inspectionStatus === "IN_PROGRESS" && !i.isFinalized && !isLegacyItem(i)).length,
      completed: items.filter((i) => i.inspectionStatus === "COMPLETED" && !i.isFinalized && !isLegacyItem(i)).length,
      finalized: items.filter((i) => i.isFinalized && !isLegacyItem(i)).length,
      overdue: items.filter((i) => i.isOverdue && !i.isFinalized && !isLegacyItem(i)).length,
      legacy: items.filter((i) => isLegacyItem(i)).length,
    };
  };

  const currentItems = activeTab === "MOVE_IN" ? moveInItems : moveOutItems;
  const isLoading = activeTab === "MOVE_IN" ? moveInLoading : moveOutLoading;
  const filteredItems = filterItems(currentItems);
  const stats = calculateStats(currentItems, activeTab);

  const handleRowClick = (item: InspectionComplianceItem) => {
    const path =
      item.inspectionType === "MOVE_IN"
        ? `/admin/tenants/${item.tenantId}/inspection/move-in`
        : `/admin/tenants/${item.tenantId}/inspection/move-out`;
    navigate(path);
  };

  const renderTable = (items: InspectionComplianceItem[], showMoveOutDate: boolean, inspectionType: "MOVE_IN" | "MOVE_OUT") => {
    if (items.length === 0) {
      return (
        <div className="text-center py-12">
          <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">No inspections found</h3>
          <p className="text-muted-foreground mt-2">
            {searchQuery || filterStatus !== "all"
              ? "Try adjusting your search or filter criteria"
              : "No tenants have inspections yet"}
          </p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Building</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Status</TableHead>
              {showMoveOutDate ? <TableHead>Move-Out Date</TableHead> : null}
              <TableHead className="hidden md:table-cell">Last Updated</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const isLegacy = inspectionType === "MOVE_IN" && (item.isLegacyMoveIn || item.inspectionStatus === "WAIVED");
              return (
              <TableRow
                key={`${item.tenantId}-${item.inspectionType}`}
                className={`cursor-pointer hover:bg-muted/50 ${
                  item.isOverdue && !item.isFinalized && !isLegacy ? "bg-red-50" : ""
                } ${isLegacy ? "opacity-60" : ""}`}
                onClick={() => handleRowClick(item)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-muted">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{item.tenantName}</p>
                      <p className="text-sm text-muted-foreground">{item.tenantEmail}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {item.buildingName}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    {item.unitLabel}
                  </div>
                </TableCell>
                <TableCell>{getStatusBadge(item)}</TableCell>
                {showMoveOutDate ? (
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span
                        className={
                          item.isOverdue && !item.isFinalized
                            ? "text-red-600 font-medium"
                            : ""
                        }
                      >
                        {formatDate(item.moveOutDate)}
                      </span>
                      {item.isOverdue && !item.isFinalized ? (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      ) : null}
                    </div>
                  </TableCell>
                ) : null}
                <TableCell className="hidden md:table-cell">
                  <span className="text-sm text-muted-foreground">
                    {formatDate(item.lastUpdated)}
                  </span>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRowClick(item);
                    }}
                  >
                    {item.inspectionId ? "View" : "Start"}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </TableCell>
              </TableRow>
            )})}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif font-medium">Inspections</h1>
        <p className="text-muted-foreground mt-1">
          Manage condition-based move-in and move-out inspections
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as "MOVE_IN" | "MOVE_OUT");
          setFilterStatus("all");
          setSearchQuery("");
        }}
      >
        <TabsList>
          <TabsTrigger value="MOVE_IN">Move-In</TabsTrigger>
          <TabsTrigger value="MOVE_OUT">Move-Out</TabsTrigger>
        </TabsList>

        <TabsContent value="MOVE_IN" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{stats.total}</div>
                <p className="text-sm text-muted-foreground">Total</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-muted-foreground">
                  {stats.notStarted}
                </div>
                <p className="text-sm text-muted-foreground">Not Started</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-yellow-600">{stats.inProgress}</div>
                <p className="text-sm text-muted-foreground">In Progress</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                <p className="text-sm text-muted-foreground">Completed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-blue-600">{stats.finalized}</div>
                <p className="text-sm text-muted-foreground">Finalized</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-muted-foreground">{stats.legacy}</div>
                <p className="text-sm text-muted-foreground">Legacy</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by tenant name, email, or unit..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select
                  value={filterStatus}
                  onValueChange={(value) => setFilterStatus(value as FilterStatus)}
                >
                  <SelectTrigger className="w-full sm:w-48">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="finalized">Finalized</SelectItem>
                    <SelectItem value="legacy">Legacy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle>Move-In Inspections</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                renderTable(filteredItems, false, "MOVE_IN")
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="MOVE_OUT" className="space-y-6">
          {/* Stats Cards with Overdue */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{stats.total}</div>
                <p className="text-sm text-muted-foreground">Total</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-muted-foreground">
                  {stats.notStarted}
                </div>
                <p className="text-sm text-muted-foreground">Not Started</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-yellow-600">{stats.inProgress}</div>
                <p className="text-sm text-muted-foreground">In Progress</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                <p className="text-sm text-muted-foreground">Completed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-blue-600">{stats.finalized}</div>
                <p className="text-sm text-muted-foreground">Finalized</p>
              </CardContent>
            </Card>
            <Card className={stats.overdue > 0 ? "border-red-200 bg-red-50" : ""}>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
                <p className="text-sm text-muted-foreground">Overdue</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by tenant name, email, or unit..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select
                  value={filterStatus}
                  onValueChange={(value) => setFilterStatus(value as FilterStatus)}
                >
                  <SelectTrigger className="w-full sm:w-48">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="finalized">Finalized</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle>Move-Out Inspections</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                renderTable(filteredItems, true, "MOVE_OUT")
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
