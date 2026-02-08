import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ClipboardCheck,
  Search,
  User,
  Home,
  Building,
  Calendar,
  ChevronRight,
  Filter,
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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ChecklistComplianceItem {
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  unitId: string;
  buildingName: string;
  unitLabel: string;
  checklistType: "MOVE_IN" | "MOVE_OUT";
  progress: { completed: number; total: number };
  lastUpdated: string | null;
  moveOutDate?: string | null;
}

interface ChecklistComplianceResponse {
  items: ChecklistComplianceItem[];
  stats: {
    moveIn: { notStarted: number; inProgress: number; completed: number };
    moveOut: { notStarted: number; inProgress: number; completed: number; overdue: number };
  };
}

type FilterStatus = "all" | "not_started" | "in_progress" | "completed";

function getStatusFromProgress(progress: { completed: number; total: number }): string {
  if (progress.total === 0) return "NOT_STARTED";
  if (progress.completed === 0) return "NOT_STARTED";
  if (progress.completed === progress.total) return "COMPLETED";
  return "IN_PROGRESS";
}

function getStatusBadge(status: string) {
  switch (status) {
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
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface StatsCardsProps {
  items: ChecklistComplianceItem[] | undefined;
}

function StatsCards({ items }: StatsCardsProps) {
  const stats = {
    total: items?.length || 0,
    completed: items?.filter((i) => getStatusFromProgress(i.progress) === "COMPLETED").length || 0,
    inProgress: items?.filter((i) => getStatusFromProgress(i.progress) === "IN_PROGRESS").length || 0,
    notStarted: items?.filter((i) => getStatusFromProgress(i.progress) === "NOT_STARTED").length || 0,
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-4">
          <div className="text-2xl font-bold">{stats.total}</div>
          <p className="text-sm text-muted-foreground">Total Tenants</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="text-2xl font-bold text-green-600">
            {stats.completed}
          </div>
          <p className="text-sm text-muted-foreground">Completed</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="text-2xl font-bold text-yellow-600">
            {stats.inProgress}
          </div>
          <p className="text-sm text-muted-foreground">In Progress</p>
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
    </div>
  );
}

interface ChecklistTableProps {
  items: ChecklistComplianceItem[] | undefined;
  isLoading: boolean;
  searchQuery: string;
  filterStatus: FilterStatus;
  checklistType: "MOVE_IN" | "MOVE_OUT";
  onNavigate: (tenantId: string, type: "MOVE_IN" | "MOVE_OUT") => void;
}

function ChecklistTable({
  items,
  isLoading,
  searchQuery,
  filterStatus,
  checklistType,
  onNavigate,
}: ChecklistTableProps) {
  const filteredItems = items?.filter((item) => {
    // Search filter
    const matchesSearch =
      searchQuery === "" ||
      item.tenantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tenantEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.unitLabel.toLowerCase().includes(searchQuery.toLowerCase());

    // Status filter
    const status = getStatusFromProgress(item.progress);
    let matchesStatus = true;
    if (filterStatus === "completed") {
      matchesStatus = status === "COMPLETED";
    } else if (filterStatus === "in_progress") {
      matchesStatus = status === "IN_PROGRESS";
    } else if (filterStatus === "not_started") {
      matchesStatus = status === "NOT_STARTED";
    }

    return matchesSearch && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!filteredItems || filteredItems.length === 0) {
    return (
      <div className="text-center py-12">
        <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-medium">No checklists found</h3>
        <p className="text-muted-foreground mt-2">
          {searchQuery || filterStatus !== "all"
            ? "Try adjusting your search or filter criteria"
            : checklistType === "MOVE_OUT"
            ? "No tenants have scheduled move-out dates"
            : "No tenants have checklists yet"}
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
            <TableHead>Progress</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Last Updated</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredItems.map((item) => {
            const status = getStatusFromProgress(item.progress);
            const progressPercent =
              item.progress.total > 0
                ? (item.progress.completed / item.progress.total) * 100
                : 0;

            return (
              <TableRow
                key={`${item.tenantId}-${item.checklistType}`}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onNavigate(item.tenantId, item.checklistType)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-muted">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{item.tenantName}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.tenantEmail}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    {item.buildingName}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    {item.unitLabel}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={progressPercent} className="w-20 h-2" />
                    <span className="text-sm text-muted-foreground">
                      {item.progress.completed}/{item.progress.total}
                    </span>
                  </div>
                </TableCell>
                <TableCell>{getStatusBadge(status)}</TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm">{formatDate(item.lastUpdated)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate(item.tenantId, item.checklistType);
                    }}
                  >
                    View
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function ComplianceChecklistsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"move-in" | "move-out">("move-in");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const { data: response, isLoading } = useQuery({
    queryKey: ["admin", "compliance", "checklists", "all"],
    queryFn: () =>
      api.get<ChecklistComplianceResponse>("/api/admin/compliance/checklists?type=all"),
  });

  const allItems = response?.items;
  const moveInItems = allItems?.filter((item) => item.checklistType === "MOVE_IN");
  const moveOutItems = allItems?.filter(
    (item) => item.checklistType === "MOVE_OUT" && item.moveOutDate !== null
  );

  const handleNavigate = (tenantId: string, type: "MOVE_IN" | "MOVE_OUT") => {
    if (type === "MOVE_IN") {
      navigate(`/admin/tenants/${tenantId}/checklist`);
    } else {
      navigate(`/admin/tenants/${tenantId}/checklist/move-out`);
    }
  };

  const currentItems = activeTab === "move-in" ? moveInItems : moveOutItems;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif font-medium">Checklists</h1>
        <p className="text-muted-foreground mt-1">
          Manage task-based move-in and move-out checklists
        </p>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "move-in" | "move-out")}
      >
        <TabsList>
          <TabsTrigger value="move-in">Move-In</TabsTrigger>
          <TabsTrigger value="move-out">Move-Out</TabsTrigger>
        </TabsList>

        <TabsContent value="move-in" className="space-y-6">
          {/* Stats Cards */}
          <StatsCards items={moveInItems} />

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
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle>Move-In Checklists</CardTitle>
            </CardHeader>
            <CardContent>
              <ChecklistTable
                items={moveInItems}
                isLoading={isLoading}
                searchQuery={searchQuery}
                filterStatus={filterStatus}
                checklistType="MOVE_IN"
                onNavigate={handleNavigate}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="move-out" className="space-y-6">
          {/* Stats Cards */}
          <StatsCards items={moveOutItems} />

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
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle>Move-Out Checklists</CardTitle>
            </CardHeader>
            <CardContent>
              <ChecklistTable
                items={moveOutItems}
                isLoading={isLoading}
                searchQuery={searchQuery}
                filterStatus={filterStatus}
                checklistType="MOVE_OUT"
                onNavigate={handleNavigate}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
