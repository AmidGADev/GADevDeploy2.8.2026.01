import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ClipboardList,
  Search,
  User,
  Home,
  Calendar,
  ChevronRight,
  Filter,
  Lock,
  AlertCircle,
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
import type { MoveOutComplianceItem, MoveOutComplianceStats } from "../../../../backend/src/types";

type FilterStatus = "all" | "scheduled" | "in_progress" | "completed" | "finalized" | "overdue";

interface MoveOutComplianceResponse {
  items: MoveOutComplianceItem[];
  stats: MoveOutComplianceStats;
}

export default function ComplianceMoveOutPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "compliance", "move-out"],
    queryFn: () => api.get<MoveOutComplianceResponse>("/api/admin/compliance/move-out"),
  });

  const items = data?.items || [];
  const stats = data?.stats || {
    scheduled: 0,
    inProgress: 0,
    completed: 0,
    finalized: 0,
    overdue: 0,
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (item: MoveOutComplianceItem) => {
    if (item.isFinalized) {
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100 gap-1">
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

    switch (item.checklistStatus) {
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
        return <Badge variant="secondary">Scheduled</Badge>;
    }
  };

  const filteredItems = items.filter((item) => {
    // Search filter
    const matchesSearch =
      searchQuery === "" ||
      item.tenantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tenantEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.unitLabel.toLowerCase().includes(searchQuery.toLowerCase());

    // Status filter
    let matchesStatus = true;
    switch (filterStatus) {
      case "scheduled":
        matchesStatus = item.checklistStatus === "NOT_STARTED" && !item.isFinalized;
        break;
      case "in_progress":
        matchesStatus = item.checklistStatus === "IN_PROGRESS" && !item.isFinalized;
        break;
      case "completed":
        matchesStatus = item.checklistStatus === "COMPLETED" && !item.isFinalized;
        break;
      case "finalized":
        matchesStatus = item.isFinalized;
        break;
      case "overdue":
        matchesStatus = item.isOverdue && !item.isFinalized;
        break;
      case "all":
      default:
        matchesStatus = true;
    }

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif font-medium">Move-Out Inspections</h1>
        <p className="text-muted-foreground mt-1">
          Track and manage move-out inspections for scheduled departures
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats.scheduled}</div>
            <p className="text-sm text-muted-foreground">Scheduled</p>
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
            <div className="text-2xl font-bold text-green-600">
              {stats.completed}
            </div>
            <p className="text-sm text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600">
              {stats.finalized}
            </div>
            <p className="text-sm text-muted-foreground">Finalized</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">
              {stats.overdue}
            </div>
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
                <SelectItem value="all">All Move-Outs</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="finalized">Finalized</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Scheduled Move-Outs</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredItems.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Move-Out Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Last Updated
                    </TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow
                      key={item.tenantId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        navigate(
                          `/admin/tenants/${item.tenantId}/move-out-checklist`
                        )
                      }
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
                          <Home className="h-4 w-4 text-muted-foreground" />
                          {item.unitLabel}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className={item.isOverdue && !item.isFinalized ? "text-red-600 font-medium" : ""}>
                            {formatDate(item.moveOutDate)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(item)}
                      </TableCell>
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
                            navigate(
                              `/admin/tenants/${item.tenantId}/move-out-checklist`
                            );
                          }}
                        >
                          View
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No move-outs scheduled</h3>
              <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                {searchQuery || filterStatus !== "all"
                  ? "Try adjusting your search or filter criteria"
                  : "Schedule a move-out from the Tenants page to start tracking move-out inspections."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
