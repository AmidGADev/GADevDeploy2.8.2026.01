import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ClipboardCheck,
  Search,
  User,
  Home,
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
import type { MoveInComplianceItem } from "../../../../backend/src/types";

type FilterStatus = "all" | "completed" | "pending" | "legacy";

export default function ComplianceMoveInPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const { data: items, isLoading } = useQuery({
    queryKey: ["admin", "compliance", "move-in"],
    queryFn: () => api.get<MoveInComplianceItem[]>("/api/admin/compliance/move-in"),
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (item: MoveInComplianceItem) => {
    // Check for legacy tenant first
    if (item.isLegacyMoveIn || item.checklistStatus === "WAIVED") {
      return (
        <Badge className="bg-muted text-muted-foreground hover:bg-muted">
          N/A - Legacy
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
        return <Badge variant="secondary">Not Started</Badge>;
    }
  };

  const filteredItems = items?.filter((item) => {
    // Search filter
    const matchesSearch =
      searchQuery === "" ||
      item.tenantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tenantEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.unitLabel.toLowerCase().includes(searchQuery.toLowerCase());

    // Status filter
    let matchesStatus = true;
    if (filterStatus === "completed") {
      matchesStatus = item.checklistStatus === "COMPLETED";
    } else if (filterStatus === "pending") {
      matchesStatus =
        (item.checklistStatus === "IN_PROGRESS" ||
        item.checklistStatus === "NOT_STARTED") && !item.isLegacyMoveIn;
    } else if (filterStatus === "legacy") {
      matchesStatus = item.isLegacyMoveIn || item.checklistStatus === "WAIVED";
    }

    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: items?.length || 0,
    completed: items?.filter((i) => i.checklistStatus === "COMPLETED").length || 0,
    inProgress: items?.filter((i) => i.checklistStatus === "IN_PROGRESS" && !i.isLegacyMoveIn).length || 0,
    notStarted: items?.filter((i) => i.checklistStatus === "NOT_STARTED" && !i.isLegacyMoveIn).length || 0,
    legacy: items?.filter((i) => i.isLegacyMoveIn || i.checklistStatus === "WAIVED").length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif font-medium">Move-In Checklists</h1>
        <p className="text-muted-foreground mt-1">
          View and manage move-in checklists for all tenants
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-muted-foreground">
              {stats.legacy}
            </div>
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
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="legacy">Legacy</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Tenants</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredItems && filteredItems.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Last Updated
                    </TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => {
                    const isLegacy = item.isLegacyMoveIn || item.checklistStatus === "WAIVED";
                    return (
                    <TableRow
                      key={item.tenantId}
                      className={`cursor-pointer hover:bg-muted/50 ${isLegacy ? "opacity-60" : ""}`}
                      onClick={() =>
                        navigate(`/admin/tenants/${item.tenantId}/checklist`)
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
                      <TableCell>{getStatusBadge(item)}</TableCell>
                      <TableCell>
                        {isLegacy ? (
                          <span className="text-sm text-muted-foreground">N/A</span>
                        ) : (
                        <div className="flex items-center gap-2">
                          <Progress
                            value={
                              item.progress.total > 0
                                ? (item.progress.completed / item.progress.total) *
                                  100
                                : 0
                            }
                            className="w-20 h-2"
                          />
                          <span className="text-sm text-muted-foreground">
                            {item.progress.completed}/{item.progress.total}
                          </span>
                        </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span className="text-sm">
                            {formatDate(item.lastUpdated)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/admin/tenants/${item.tenantId}/checklist`);
                          }}
                        >
                          View
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )})}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No checklists found</h3>
              <p className="text-muted-foreground mt-2">
                {searchQuery || filterStatus !== "all"
                  ? "Try adjusting your search or filter criteria"
                  : "No tenants have move-in checklists yet"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
