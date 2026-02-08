import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Filter,
  Wrench,
  Send,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Image as ImageIcon,
  DoorOpen,
  Calendar,
  MessageSquare,
  Plus,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  Eye,
  ClipboardCheck,
  FileCheck,
  User,
  Phone,
  Mail,
  MapPin,
} from "lucide-react";
import { UnifiedCreateRequestDialog } from "@/components/admin/UnifiedCreateRequestDialog";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type {
  ServiceRequest,
  ServiceRequestStatus,
  ServiceRequestPriority,
  ServiceRequestComment,
  ShowingRequest,
  ShowingRequestStatus,
} from "../../../../backend/src/types";

// ============================================
// Shared Types and Utilities
// ============================================

interface Attachment {
  id: string;
  fileUrl: string;
  fileName: string | null;
  createdAt: string;
}

interface ServiceRequestWithDetails extends ServiceRequest {
  unit?: {
    id: string;
    unitLabel: string;
    buildingName?: string;
  };
  tenant?: {
    id: string;
    name: string;
    email: string;
  };
  comments?: CommentWithUser[];
  attachments?: Attachment[];
  attachmentCount?: number;
}

interface CommentWithUser extends ServiceRequestComment {
  user?: {
    id: string;
    name: string;
    role: string;
  };
}

interface MoveOutRequestWithDetails {
  id: string;
  tenancyId: string;
  requestedDate: string;
  status: "PENDING" | "ACKNOWLEDGED" | "DECLINED";
  adminMessage: string | null;
  respondedAt: string | null;
  respondedById: string | null;
  createdAt: string;
  updatedAt: string;
  tenant: {
    id: string;
    name: string;
    email: string;
  };
  unit: {
    id: string;
    unitLabel: string;
    buildingName?: string;
  };
  respondedBy: {
    id: string;
    name: string;
  } | null;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Glass-morphism style badges
function getPriorityBadge(priority: ServiceRequestPriority) {
  switch (priority) {
    case "URGENT":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-red-500/20 text-red-700 dark:text-red-400 backdrop-blur-sm border border-red-500/30">
          <AlertTriangle className="h-3 w-3" />
          Urgent
        </span>
      );
    case "HIGH":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-md bg-orange-500/20 text-orange-700 dark:text-orange-400 backdrop-blur-sm border border-orange-500/30">
          High
        </span>
      );
    case "NORMAL":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-md bg-slate-500/15 text-slate-600 dark:text-slate-300 backdrop-blur-sm border border-slate-500/20">
          Normal
        </span>
      );
    case "LOW":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-md bg-slate-400/10 text-slate-500 dark:text-slate-400 backdrop-blur-sm border border-slate-400/20">
          Low
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-md bg-slate-500/15 text-slate-600 dark:text-slate-300 backdrop-blur-sm border border-slate-500/20">
          {priority}
        </span>
      );
  }
}

function getStatusBadge(status: ServiceRequestStatus) {
  switch (status) {
    case "OPEN":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-blue-500/20 text-blue-700 dark:text-blue-400 backdrop-blur-sm border border-blue-500/30">
          <Clock className="h-3 w-3" />
          Open
        </span>
      );
    case "IN_PROGRESS":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-400 backdrop-blur-sm border border-amber-500/30">
          <Wrench className="h-3 w-3" />
          In Progress
        </span>
      );
    case "RESOLVED":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 backdrop-blur-sm border border-emerald-500/30">
          <CheckCircle className="h-3 w-3" />
          Resolved
        </span>
      );
    case "CLOSED":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-slate-500/15 text-slate-500 dark:text-slate-400 backdrop-blur-sm border border-slate-400/20">
          <XCircle className="h-3 w-3" />
          Closed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-md bg-slate-500/15 text-slate-600 dark:text-slate-300 backdrop-blur-sm border border-slate-500/20">
          {status}
        </span>
      );
  }
}

function getShowingStatusBadge(status: ShowingRequestStatus) {
  switch (status) {
    case "NEW":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-md bg-blue-500/20 text-blue-700 dark:text-blue-400 backdrop-blur-sm border border-blue-500/30">
          New
        </span>
      );
    case "CONTACTED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-400 backdrop-blur-sm border border-amber-500/30">
          Contacted
        </span>
      );
    case "SCHEDULED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-md bg-purple-500/20 text-purple-700 dark:text-purple-400 backdrop-blur-sm border border-purple-500/30">
          Scheduled
        </span>
      );
    case "COMPLETED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-md bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 backdrop-blur-sm border border-emerald-500/30">
          Completed
        </span>
      );
    case "CANCELLED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-md bg-slate-500/15 text-slate-500 dark:text-slate-400 backdrop-blur-sm border border-slate-400/20">
          Cancelled
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-md bg-slate-500/15 text-slate-600 dark:text-slate-300 backdrop-blur-sm border border-slate-500/20">
          {status}
        </span>
      );
  }
}

function getMoveOutStatusBadge(status: string) {
  switch (status) {
    case "ACKNOWLEDGED":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 backdrop-blur-sm border border-emerald-500/30">
          <CheckCircle className="h-3 w-3" />
          Acknowledged
        </span>
      );
    case "DECLINED":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-red-500/20 text-red-700 dark:text-red-400 backdrop-blur-sm border border-red-500/30">
          <XCircle className="h-3 w-3" />
          Declined
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-400 backdrop-blur-sm border border-amber-500/30">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      );
  }
}

// ============================================
// Maintenance Requests Tab Content
// ============================================

function MaintenanceRequestsTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [buildingFilter, setBuildingFilter] = useState<string>("all");
  const [selectedRequest, setSelectedRequest] =
    useState<ServiceRequestWithDetails | null>(null);
  const [newComment, setNewComment] = useState("");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  // Fetch service requests
  const { data: requests, isLoading } = useQuery({
    queryKey: ["admin", "service-requests"],
    queryFn: () =>
      api.get<ServiceRequestWithDetails[]>("/api/admin/service-requests"),
  });

  // Get unique building names for filter
  const buildingNames = Array.from(
    new Set(
      requests
        ?.map((r) => r.unit?.buildingName)
        .filter((name): name is string => !!name)
    )
  ).sort();

  // Fetch single request details
  const { data: requestDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ["admin", "service-requests", selectedRequest?.id],
    queryFn: () =>
      api.get<ServiceRequestWithDetails>(
        `/api/admin/service-requests/${selectedRequest?.id}`
      ),
    enabled: !!selectedRequest?.id,
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ServiceRequestStatus }) =>
      api.put(`/api/admin/service-requests/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "service-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      toast.success("Status updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update status");
    },
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      api.post(`/api/admin/service-requests/${id}/comment`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "service-requests", selectedRequest?.id],
      });
      setNewComment("");
      toast.success("Comment added");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add comment");
    },
  });

  // Filter requests
  const filteredRequests = requests?.filter((request) => {
    if (statusFilter !== "all" && request.status !== statusFilter) return false;
    if (priorityFilter !== "all" && request.priority !== priorityFilter)
      return false;
    if (buildingFilter !== "all" && request.unit?.buildingName !== buildingFilter)
      return false;
    return true;
  });

  const openRequestDetails = (request: ServiceRequestWithDetails) => {
    setSelectedRequest(request);
    setIsSheetOpen(true);
  };

  const handleStatusChange = (status: ServiceRequestStatus) => {
    if (selectedRequest) {
      updateStatusMutation.mutate({ id: selectedRequest.id, status });
    }
  };

  const handleQuickStatusChange = (id: string, status: ServiceRequestStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    updateStatusMutation.mutate({ id, status });
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRequest && newComment.trim()) {
      addCommentMutation.mutate({ id: selectedRequest.id, body: newComment });
    }
  };

  // Get priority accent color for left border
  const getPriorityAccent = (priority: ServiceRequestPriority) => {
    switch (priority) {
      case "URGENT":
        return "border-l-4 border-l-red-500";
      case "HIGH":
        return "border-l-4 border-l-orange-500";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Compact Filters */}
      <Card className="border-border/50">
        <CardContent className="py-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Filters</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="RESOLVED">Resolved</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
              {buildingNames.length > 0 && (
                <Select value={buildingFilter} onValueChange={setBuildingFilter}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue placeholder="Building" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Buildings</SelectItem>
                    {buildingNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requests Table */}
      <Card className="border-border/50">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium">All Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filteredRequests && filteredRequests.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground h-8 w-10"></TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground h-8">Date</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground h-8">Location</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground h-8 hidden md:table-cell">Tenant</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground h-8">Title</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground h-8">Priority</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground h-8">Status</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground h-8 w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => (
                    <TableRow
                      key={request.id}
                      className={cn(
                        "cursor-pointer transition-colors",
                        getPriorityAccent(request.priority),
                        hoveredRow === request.id && "bg-muted/50"
                      )}
                      onClick={() => openRequestDetails(request)}
                      onMouseEnter={() => setHoveredRow(request.id)}
                      onMouseLeave={() => setHoveredRow(null)}
                    >
                      {/* Thumbnail */}
                      <TableCell className="py-1.5 px-2">
                        {(request.attachmentCount ?? 0) > 0 || (request.attachments?.length ?? 0) > 0 ? (
                          <div className="w-8 h-8 rounded overflow-hidden bg-muted flex items-center justify-center">
                            {request.attachments?.[0] ? (
                              <img
                                src={`${import.meta.env.VITE_BACKEND_URL}${request.attachments[0].fileUrl}`}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </div>
                        ) : (
                          <div className="w-8 h-8" />
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 text-xs text-muted-foreground">
                        {formatDate(request.createdAt)}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <div className="text-xs">
                          <span className="font-medium">{request.unit?.buildingName || "-"}</span>
                          <span className="text-muted-foreground"> / {request.unit?.unitLabel || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 hidden md:table-cell text-xs">
                        {request.tenant?.name || "-"}
                      </TableCell>
                      <TableCell className="py-1.5 text-xs font-medium max-w-[180px] truncate">
                        {request.title}
                      </TableCell>
                      <TableCell className="py-1.5">{getPriorityBadge(request.priority)}</TableCell>
                      <TableCell className="py-1.5">{getStatusBadge(request.status)}</TableCell>
                      <TableCell className="py-1.5">
                        {/* Quick Actions on Hover */}
                        <div className={cn(
                          "flex items-center gap-1 transition-opacity",
                          hoveredRow === request.id ? "opacity-100" : "opacity-0"
                        )}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRequestDetails(request);
                            }}
                            title="View Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {request.status !== "RESOLVED" && request.status !== "CLOSED" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              onClick={(e) => handleQuickStatusChange(request.id, "RESOLVED", e)}
                              title="Mark Resolved"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-10">
              <Wrench className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <h3 className="mt-3 text-sm font-medium">No service requests</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {statusFilter !== "all" || priorityFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Tenants can submit maintenance requests through the portal"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request Details Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{selectedRequest?.title}</SheetTitle>
            <SheetDescription>
              Submitted on {selectedRequest ? formatDateTime(selectedRequest.createdAt) : ""}
            </SheetDescription>
          </SheetHeader>

          {isLoadingDetails ? (
            <div className="space-y-4 mt-6">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : requestDetails || selectedRequest ? (
            <div className="mt-6 space-y-6">
              {/* Request Info */}
              <div className="space-y-4">
                <div className="flex flex-wrap gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Building</p>
                    <p className="text-sm font-medium">
                      {(requestDetails || selectedRequest)?.unit?.buildingName || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Unit</p>
                    <p className="text-sm font-medium">
                      {(requestDetails || selectedRequest)?.unit?.unitLabel || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tenant</p>
                    <p className="text-sm font-medium">
                      {(requestDetails || selectedRequest)?.tenant?.name || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Priority</p>
                    <div className="mt-1">
                      {getPriorityBadge(
                        (requestDetails || selectedRequest)?.priority || "NORMAL"
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Description</p>
                  <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                    {(requestDetails || selectedRequest)?.description}
                  </p>
                </div>

                {/* Photos/Attachments */}
                {(requestDetails?.attachments?.length ?? 0) > 0 ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                      <ImageIcon className="h-3.5 w-3.5" />
                      Photos ({requestDetails?.attachments?.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {requestDetails?.attachments?.map((attachment) => (
                        <a
                          key={attachment.id}
                          href={`${import.meta.env.VITE_BACKEND_URL}${attachment.fileUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-16 h-16 rounded-lg overflow-hidden border hover:border-primary transition-colors"
                        >
                          <img
                            src={`${import.meta.env.VITE_BACKEND_URL}${attachment.fileUrl}`}
                            alt={attachment.fileName || "Attachment"}
                            className="w-full h-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Status Update */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Update Status</p>
                  <Select
                    value={(requestDetails || selectedRequest)?.status}
                    onValueChange={(value) =>
                      handleStatusChange(value as ServiceRequestStatus)
                    }
                    disabled={updateStatusMutation.isPending}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN">Open</SelectItem>
                      <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                      <SelectItem value="RESOLVED">Resolved</SelectItem>
                      <SelectItem value="CLOSED">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Comments Section */}
              <div>
                <h4 className="text-sm font-medium mb-3">Comments</h4>

                {/* Comments List */}
                <ScrollArea className="h-[180px] mb-4">
                  {(requestDetails?.comments?.length ?? 0) > 0 ? (
                    <div className="space-y-3 pr-4">
                      {requestDetails?.comments?.map((comment) => (
                        <div key={comment.id} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium">
                              {comment.user?.name || "Unknown"}
                            </p>
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded",
                              comment.user?.role === "ADMIN"
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            )}>
                              {comment.user?.role === "ADMIN" ? "Admin" : "Tenant"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDateTime(comment.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {comment.body}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      No comments yet
                    </p>
                  )}
                </ScrollArea>

                {/* Add Comment Form */}
                <form onSubmit={handleAddComment} className="space-y-2">
                  <Textarea
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!newComment.trim() || addCommentMutation.isPending}
                  >
                    <Send className="h-3.5 w-3.5 mr-2" />
                    {addCommentMutation.isPending ? "Sending..." : "Add Comment"}
                  </Button>
                </form>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ============================================
// Move-Out Requests Tab Content - Timeline View
// ============================================

function MoveOutRequestsTab() {
  const queryClient = useQueryClient();
  const [selectedMoveOutRequest, setSelectedMoveOutRequest] =
    useState<MoveOutRequestWithDetails | null>(null);
  const [isMoveOutSheetOpen, setIsMoveOutSheetOpen] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");

  // Fetch move-out requests
  const { data: moveOutRequests, isLoading: isLoadingMoveOut } = useQuery({
    queryKey: ["admin", "move-out-requests"],
    queryFn: () =>
      api.get<MoveOutRequestWithDetails[]>("/api/admin/move-out-requests"),
  });

  // Respond to move-out request mutation
  const respondMoveOutMutation = useMutation({
    mutationFn: ({
      id,
      status,
      adminMessage,
    }: {
      id: string;
      status: "ACKNOWLEDGED" | "DECLINED";
      adminMessage?: string;
    }) => api.put(`/api/admin/move-out-requests/${id}`, { status, adminMessage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "move-out-requests"] });
      setIsMoveOutSheetOpen(false);
      setSelectedMoveOutRequest(null);
      setAdminMessage("");
      toast.success("Move-out request updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update move-out request");
    },
  });

  const openMoveOutRequestDetails = (request: MoveOutRequestWithDetails) => {
    setSelectedMoveOutRequest(request);
    setAdminMessage("");
    setIsMoveOutSheetOpen(true);
  };

  const handleMoveOutResponse = (status: "ACKNOWLEDGED" | "DECLINED") => {
    if (selectedMoveOutRequest) {
      respondMoveOutMutation.mutate({
        id: selectedMoveOutRequest.id,
        status,
        adminMessage: adminMessage.trim() || undefined,
      });
    }
  };

  // Sort by requested move-out date
  const sortedRequests = useMemo(() => {
    if (!moveOutRequests) return { pending: [], processed: [] };

    const pending = moveOutRequests
      .filter((r) => r.status === "PENDING")
      .sort((a, b) => new Date(a.requestedDate).getTime() - new Date(b.requestedDate).getTime());

    const processed = moveOutRequests
      .filter((r) => r.status !== "PENDING")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return { pending, processed };
  }, [moveOutRequests]);

  // Timeline card component
  const TimelineCard = ({ request, isPending }: { request: MoveOutRequestWithDetails; isPending: boolean }) => {
    const moveOutDate = new Date(request.requestedDate);
    const dayOfWeek = moveOutDate.toLocaleDateString("en-CA", { weekday: "short" });
    const day = moveOutDate.getDate();
    const month = moveOutDate.toLocaleDateString("en-CA", { month: "short" });

    return (
      <div
        className={cn(
          "flex gap-4 p-3 rounded-lg border border-border/50 cursor-pointer hover:bg-muted/30 transition-colors",
          isPending && "hover:border-primary/30"
        )}
        onClick={() => openMoveOutRequestDetails(request)}
      >
        {/* Calendar Icon */}
        <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 flex flex-col items-center justify-center">
          <span className="text-[10px] font-medium text-primary uppercase">{dayOfWeek}</span>
          <span className="text-lg font-bold text-primary leading-none">{day}</span>
          <span className="text-[10px] text-primary/70 uppercase">{month}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium truncate">{request.tenant.name}</p>
              <p className="text-xs text-muted-foreground">
                {request.unit.buildingName || "N/A"} - {request.unit.unitLabel}
              </p>
            </div>
            {getMoveOutStatusBadge(request.status)}
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>Submitted {formatDate(request.createdAt)}</span>
            {request.respondedBy && (
              <span>• Handled by {request.respondedBy.name}</span>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        {isPending && (
          <div className="flex-shrink-0 flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  setSelectedMoveOutRequest(request);
                  handleMoveOutResponse("ACKNOWLEDGED");
                }}>
                  <CheckCircle className="h-4 w-4 mr-2 text-emerald-600" />
                  Acknowledge
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  openMoveOutRequestDetails(request);
                }}>
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href={`/admin/inspections?unit=${request.unit.id}`} onClick={(e) => e.stopPropagation()}>
                    <FileCheck className="h-4 w-4 mr-2" />
                    Move-Out Inspection
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/admin/checklists?unit=${request.unit.id}`} onClick={(e) => e.stopPropagation()}>
                    <ClipboardCheck className="h-4 w-4 mr-2" />
                    Move-Out Checklist
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {isLoadingMoveOut ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : moveOutRequests && moveOutRequests.length > 0 ? (
        <div className="space-y-6">
          {/* Pending Requests Timeline */}
          {sortedRequests.pending.length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Pending Move-Outs ({sortedRequests.pending.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2">
                {sortedRequests.pending.map((request) => (
                  <TimelineCard key={request.id} request={request} isPending={true} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Processed Requests */}
          {sortedRequests.processed.length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium">
                  Processed Requests ({sortedRequests.processed.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2">
                {sortedRequests.processed.map((request) => (
                  <TimelineCard key={request.id} request={request} isPending={false} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card className="border-border/50">
          <CardContent className="py-10 text-center">
            <DoorOpen className="h-10 w-10 mx-auto text-muted-foreground/50" />
            <h3 className="mt-3 text-sm font-medium">No move-out requests</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Tenants can submit move-out requests through the portal
            </p>
          </CardContent>
        </Card>
      )}

      {/* Move-Out Request Details Sheet */}
      <Sheet open={isMoveOutSheetOpen} onOpenChange={setIsMoveOutSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Move-Out Request</SheetTitle>
            <SheetDescription>
              Submitted on{" "}
              {selectedMoveOutRequest
                ? formatDateTime(selectedMoveOutRequest.createdAt)
                : ""}
            </SheetDescription>
          </SheetHeader>

          {selectedMoveOutRequest && (
            <div className="mt-6 space-y-6">
              {/* Request Info */}
              <div className="space-y-4">
                <div className="flex flex-wrap gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Building</p>
                    <p className="text-sm font-medium">{selectedMoveOutRequest.unit.buildingName || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Unit</p>
                    <p className="text-sm font-medium">{selectedMoveOutRequest.unit.unitLabel}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tenant</p>
                    <p className="text-sm font-medium">{selectedMoveOutRequest.tenant.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium">{selectedMoveOutRequest.tenant.email}</p>
                  </div>
                </div>

                <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <p className="text-xs text-primary font-medium">Requested Move-Out Date</p>
                  </div>
                  <p className="text-xl font-serif font-semibold text-primary">
                    {formatDate(selectedMoveOutRequest.requestedDate)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  {getMoveOutStatusBadge(selectedMoveOutRequest.status)}
                </div>

                {selectedMoveOutRequest.adminMessage && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Admin Message</p>
                    <p className="text-sm bg-muted/50 p-3 rounded-lg">
                      {selectedMoveOutRequest.adminMessage}
                    </p>
                  </div>
                )}

                {selectedMoveOutRequest.respondedBy && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Responded By</p>
                    <p className="text-sm">
                      {selectedMoveOutRequest.respondedBy.name} on{" "}
                      {selectedMoveOutRequest.respondedAt
                        ? formatDateTime(selectedMoveOutRequest.respondedAt)
                        : "-"}
                    </p>
                  </div>
                )}

                {/* Quick Links */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/admin/inspections?unit=${selectedMoveOutRequest.unit.id}`}>
                      <FileCheck className="h-3.5 w-3.5 mr-2" />
                      Move-Out Inspection
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/admin/checklists?unit=${selectedMoveOutRequest.unit.id}`}>
                      <ClipboardCheck className="h-3.5 w-3.5 mr-2" />
                      Move-Out Checklist
                    </a>
                  </Button>
                </div>
              </div>

              {/* Actions for pending requests */}
              {selectedMoveOutRequest.status === "PENDING" && (
                <>
                  <Separator />

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="adminMessage" className="text-xs">
                        Message to Tenant (optional)
                      </Label>
                      <Textarea
                        id="adminMessage"
                        placeholder="Add a message for the tenant..."
                        value={adminMessage}
                        onChange={(e) => setAdminMessage(e.target.value)}
                        rows={2}
                        className="mt-2 text-sm"
                      />
                    </div>

                    <div className="flex gap-3">
                      <Button
                        className="flex-1"
                        onClick={() => handleMoveOutResponse("ACKNOWLEDGED")}
                        disabled={respondMoveOutMutation.isPending}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Acknowledge
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleMoveOutResponse("DECLINED")}
                        disabled={respondMoveOutMutation.isPending}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Decline
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ============================================
// Showing Requests Tab Content - Daily Schedule View
// ============================================

// Extended type for showing requests with property info from API
interface ShowingRequestWithProperty extends ShowingRequest {
  property?: {
    id: string;
    name: string;
    address: string;
  };
  updatedAt?: string;
}

function ShowingRequestsTab() {
  const queryClient = useQueryClient();
  const [expandedMessage, setExpandedMessage] = useState<string | null>(null);

  // Fetch showing requests
  const { data: requests, isLoading } = useQuery({
    queryKey: ["admin", "showing-requests"],
    queryFn: () => api.get<ShowingRequestWithProperty[]>("/api/admin/showing-requests"),
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ShowingRequestStatus }) =>
      api.put(`/api/admin/showing-requests/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "showing-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      toast.success("Status updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update status");
    },
  });

  const handleUpdateStatus = (id: string, status: ShowingRequestStatus, e?: React.MouseEvent) => {
    e?.stopPropagation();
    updateStatusMutation.mutate({ id, status });
  };

  // Group requests by status
  const groupedRequests = useMemo(() => {
    if (!requests) return { scheduled: [] as ShowingRequestWithProperty[], pending: [] as ShowingRequestWithProperty[], completed: [] as ShowingRequestWithProperty[] };

    const scheduled: ShowingRequestWithProperty[] = [];
    const pending: ShowingRequestWithProperty[] = [];
    const completed: ShowingRequestWithProperty[] = [];

    requests.forEach((request) => {
      if (request.status === "SCHEDULED") {
        scheduled.push(request);
      } else if (request.status === "COMPLETED" || request.status === "CANCELLED") {
        completed.push(request);
      } else {
        pending.push(request);
      }
    });

    // Sort scheduled by createdAt (most recent first)
    scheduled.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    // Sort pending by createdAt (oldest first - need attention)
    pending.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    // Sort completed by createdAt (most recent first)
    completed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { scheduled, pending, completed };
  }, [requests]);

  // Prospect card component
  const ProspectCard = ({ request }: { request: ShowingRequestWithProperty }) => (
    <div className="p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-medium truncate">{request.name}</span>
            {getShowingStatusBadge(request.status)}
          </div>
          <div className="space-y-0.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Mail className="h-3 w-3" />
              <span className="truncate">{request.email}</span>
            </div>
            {request.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-3 w-3" />
                <span>{request.phone}</span>
              </div>
            )}
            {request.property && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3" />
                <span>{request.property.address}</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {request.message && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setExpandedMessage(expandedMessage === request.id ? null : request.id)}
            >
              {expandedMessage === request.id ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          )}

          {request.status === "NEW" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
              onClick={(e) => handleUpdateStatus(request.id, "CONTACTED", e)}
              title="Mark Contacted"
            >
              <Phone className="h-3.5 w-3.5" />
            </Button>
          )}
          {request.status === "CONTACTED" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
              onClick={(e) => handleUpdateStatus(request.id, "SCHEDULED", e)}
              title="Mark Scheduled"
            >
              <Calendar className="h-3.5 w-3.5" />
            </Button>
          )}
          {(request.status === "SCHEDULED" || request.status === "CONTACTED") && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
              onClick={(e) => handleUpdateStatus(request.id, "COMPLETED", e)}
              title="Mark Completed"
            >
              <CheckCircle className="h-3.5 w-3.5" />
            </Button>
          )}
          {request.status !== "CANCELLED" && request.status !== "COMPLETED" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={(e) => handleUpdateStatus(request.id, "CANCELLED", e)}
              title="Cancel"
            >
              <XCircle className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Expandable message */}
      {expandedMessage === request.id && request.message && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="flex items-start gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium mb-1">Message from prospect:</p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                {request.message}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : requests && requests.length > 0 ? (
        <div className="space-y-6">
          {/* Scheduled Showings */}
          {groupedRequests.scheduled.length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-purple-500" />
                  Scheduled Showings ({groupedRequests.scheduled.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2">
                {groupedRequests.scheduled.map((request) => (
                  <ProspectCard key={request.id} request={request} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Pending Requests (New/Contacted) */}
          {groupedRequests.pending.length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Pending Follow-up ({groupedRequests.pending.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2">
                {groupedRequests.pending.map((request) => (
                  <ProspectCard key={request.id} request={request} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Completed/Cancelled */}
          {groupedRequests.completed.length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium">
                  Completed / Cancelled ({groupedRequests.completed.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2">
                {groupedRequests.completed.map((request) => (
                  <ProspectCard key={request.id} request={request} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card className="border-border/50">
          <CardContent className="py-10 text-center">
            <Calendar className="h-10 w-10 mx-auto text-muted-foreground/50" />
            <h3 className="mt-3 text-sm font-medium">No showing requests</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Prospects can submit showing requests through the landing page
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================
// Main RequestsPage Component
// ============================================

type ActiveTab = "maintenance" | "move-out" | "showing";

export default function RequestsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("maintenance");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-medium">Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage all maintenance, move-out, and showing requests
          </p>
        </div>
        <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Request
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)} className="w-full">
        <TabsList className="h-9">
          <TabsTrigger value="maintenance" className="text-xs">Maintenance</TabsTrigger>
          <TabsTrigger value="move-out" className="text-xs">Move-Out</TabsTrigger>
          <TabsTrigger value="showing" className="text-xs">Showings</TabsTrigger>
        </TabsList>
        <TabsContent value="maintenance" className="mt-4">
          <MaintenanceRequestsTab />
        </TabsContent>
        <TabsContent value="move-out" className="mt-4">
          <MoveOutRequestsTab />
        </TabsContent>
        <TabsContent value="showing" className="mt-4">
          <ShowingRequestsTab />
        </TabsContent>
      </Tabs>

      {/* Unified Create Request Dialog */}
      <UnifiedCreateRequestDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        activeTab={activeTab}
      />
    </div>
  );
}
