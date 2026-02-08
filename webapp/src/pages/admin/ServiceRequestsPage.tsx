import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import type {
  ServiceRequest,
  ServiceRequestStatus,
  ServiceRequestPriority,
  ServiceRequestComment,
} from "../../../../backend/src/types";

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
    buildingName?: string | null;
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
    buildingName?: string | null;
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

function getPriorityBadge(priority: ServiceRequestPriority) {
  switch (priority) {
    case "URGENT":
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Urgent
        </Badge>
      );
    case "HIGH":
      return (
        <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">
          High
        </Badge>
      );
    case "NORMAL":
      return <Badge variant="secondary">Normal</Badge>;
    case "LOW":
      return <Badge variant="outline">Low</Badge>;
    default:
      return <Badge variant="secondary">{priority}</Badge>;
  }
}

function getStatusBadge(status: ServiceRequestStatus) {
  switch (status) {
    case "OPEN":
      return (
        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
          <Clock className="h-3 w-3 mr-1" />
          Open
        </Badge>
      );
    case "IN_PROGRESS":
      return (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
          <Wrench className="h-3 w-3 mr-1" />
          In Progress
        </Badge>
      );
    case "RESOLVED":
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          <CheckCircle className="h-3 w-3 mr-1" />
          Resolved
        </Badge>
      );
    case "CLOSED":
      return (
        <Badge variant="outline">
          <XCircle className="h-3 w-3 mr-1" />
          Closed
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function ServiceRequestsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [selectedRequest, setSelectedRequest] =
    useState<ServiceRequestWithDetails | null>(null);
  const [selectedMoveOutRequest, setSelectedMoveOutRequest] =
    useState<MoveOutRequestWithDetails | null>(null);
  const [newComment, setNewComment] = useState("");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isMoveOutSheetOpen, setIsMoveOutSheetOpen] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");

  // Fetch service requests
  const { data: requests, isLoading } = useQuery({
    queryKey: ["admin", "service-requests"],
    queryFn: () =>
      api.get<ServiceRequestWithDetails[]>("/api/admin/service-requests"),
  });

  // Fetch move-out requests
  const { data: moveOutRequests, isLoading: isLoadingMoveOut } = useQuery({
    queryKey: ["admin", "move-out-requests"],
    queryFn: () =>
      api.get<MoveOutRequestWithDetails[]>("/api/admin/move-out-requests"),
  });

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

  // Filter requests
  const filteredRequests = requests?.filter((request) => {
    if (statusFilter !== "all" && request.status !== statusFilter) return false;
    if (priorityFilter !== "all" && request.priority !== priorityFilter)
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

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRequest && newComment.trim()) {
      addCommentMutation.mutate({ id: selectedRequest.id, body: newComment });
    }
  };

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

  // Get move-out status badge
  const getMoveOutStatusBadge = (status: string) => {
    switch (status) {
      case "ACKNOWLEDGED":
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            <CheckCircle className="h-3 w-3 mr-1" />
            Acknowledged
          </Badge>
        );
      case "DECLINED":
        return (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
            <XCircle className="h-3 w-3 mr-1" />
            Declined
          </Badge>
        );
      default:
        return (
          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  // Filter pending move-out requests
  const pendingMoveOutRequests = moveOutRequests?.filter(
    (r) => r.status === "PENDING"
  );
  const processedMoveOutRequests = moveOutRequests?.filter(
    (r) => r.status !== "PENDING"
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium">Requests</h1>
        <p className="text-muted-foreground mt-1">
          Manage service and move-out requests from tenants
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            <div className="flex flex-wrap gap-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
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
                <SelectTrigger className="w-[150px]">
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Requests</CardTitle>
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
          ) : filteredRequests && filteredRequests.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Building - Unit</TableHead>
                    <TableHead className="hidden md:table-cell">Tenant</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => (
                    <TableRow
                      key={request.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openRequestDetails(request)}
                    >
                      <TableCell className="text-muted-foreground">
                        {formatDate(request.createdAt)}
                      </TableCell>
                      <TableCell>
                        {request.unit?.buildingName
                          ? `${request.unit.buildingName} - ${request.unit.unitLabel}`
                          : request.unit?.unitLabel || "-"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {request.tenant?.name || "-"}
                      </TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {request.title}
                      </TableCell>
                      <TableCell>{getPriorityBadge(request.priority)}</TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Wrench className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No service requests</h3>
              <p className="text-muted-foreground mt-2">
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
                    <p className="text-sm text-muted-foreground">Building - Unit</p>
                    <p className="font-medium">
                      {(() => {
                        const unit = (requestDetails || selectedRequest)?.unit;
                        if (!unit) return "-";
                        return unit.buildingName
                          ? `${unit.buildingName} - ${unit.unitLabel}`
                          : unit.unitLabel;
                      })()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tenant</p>
                    <p className="font-medium">
                      {(requestDetails || selectedRequest)?.tenant?.name || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Priority</p>
                    <div className="mt-1">
                      {getPriorityBadge(
                        (requestDetails || selectedRequest)?.priority || "NORMAL"
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Description</p>
                  <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-lg">
                    {(requestDetails || selectedRequest)?.description}
                  </p>
                </div>

                {/* Photos/Attachments */}
                {(requestDetails?.attachments?.length ?? 0) > 0 ? (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" />
                      Photos ({requestDetails?.attachments?.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {requestDetails?.attachments?.map((attachment) => (
                        <a
                          key={attachment.id}
                          href={`${import.meta.env.VITE_BACKEND_URL}${attachment.fileUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-20 h-20 rounded-lg overflow-hidden border hover:border-primary transition-colors"
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
                  <p className="text-sm text-muted-foreground mb-2">Update Status</p>
                  <Select
                    value={(requestDetails || selectedRequest)?.status}
                    onValueChange={(value) =>
                      handleStatusChange(value as ServiceRequestStatus)
                    }
                    disabled={updateStatusMutation.isPending}
                  >
                    <SelectTrigger>
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
                <h4 className="font-medium mb-4">Comments</h4>

                {/* Comments List */}
                <ScrollArea className="h-[200px] mb-4">
                  {(requestDetails?.comments?.length ?? 0) > 0 ? (
                    <div className="space-y-4 pr-4">
                      {requestDetails?.comments?.map((comment) => (
                        <div key={comment.id} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">
                              {comment.user?.name || "Unknown"}
                            </p>
                            <Badge variant="outline" className="text-xs">
                              {comment.user?.role === "ADMIN" ? "Admin" : "Tenant"}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(comment.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {comment.body}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No comments yet
                    </p>
                  )}
                </ScrollArea>

                {/* Add Comment Form */}
                <form onSubmit={handleAddComment} className="space-y-3">
                  <Textarea
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={3}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!newComment.trim() || addCommentMutation.isPending}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {addCommentMutation.isPending ? "Sending..." : "Add Comment"}
                  </Button>
                </form>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Move-Out Requests Section */}
      <Separator className="my-8" />

      <div>
        <div className="flex items-center gap-2 mb-4">
          <DoorOpen className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-serif font-medium">Move-Out Requests</h2>
        </div>

        {isLoadingMoveOut ? (
          <div className="space-y-4">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : moveOutRequests && moveOutRequests.length > 0 ? (
          <div className="space-y-6">
            {/* Pending Requests */}
            {pendingMoveOutRequests && pendingMoveOutRequests.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Pending Requests ({pendingMoveOutRequests.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date Submitted</TableHead>
                          <TableHead>Building - Unit</TableHead>
                          <TableHead>Tenant</TableHead>
                          <TableHead>Requested Move-Out</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingMoveOutRequests.map((request) => (
                          <TableRow
                            key={request.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => openMoveOutRequestDetails(request)}
                          >
                            <TableCell className="text-muted-foreground">
                              {formatDate(request.createdAt)}
                            </TableCell>
                            <TableCell>
                              {request.unit.buildingName
                                ? `${request.unit.buildingName} - ${request.unit.unitLabel}`
                                : request.unit.unitLabel}
                            </TableCell>
                            <TableCell>{request.tenant.name}</TableCell>
                            <TableCell className="font-medium">
                              {formatDate(request.requestedDate)}
                            </TableCell>
                            <TableCell>{getMoveOutStatusBadge(request.status)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Processed Requests */}
            {processedMoveOutRequests && processedMoveOutRequests.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Processed Requests ({processedMoveOutRequests.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date Submitted</TableHead>
                          <TableHead>Building - Unit</TableHead>
                          <TableHead>Tenant</TableHead>
                          <TableHead>Requested Move-Out</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Responded By</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {processedMoveOutRequests.map((request) => (
                          <TableRow
                            key={request.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => openMoveOutRequestDetails(request)}
                          >
                            <TableCell className="text-muted-foreground">
                              {formatDate(request.createdAt)}
                            </TableCell>
                            <TableCell>
                              {request.unit.buildingName
                                ? `${request.unit.buildingName} - ${request.unit.unitLabel}`
                                : request.unit.unitLabel}
                            </TableCell>
                            <TableCell>{request.tenant.name}</TableCell>
                            <TableCell>
                              {formatDate(request.requestedDate)}
                            </TableCell>
                            <TableCell>{getMoveOutStatusBadge(request.status)}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {request.respondedBy?.name || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <DoorOpen className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No move-out requests</h3>
              <p className="text-muted-foreground mt-2">
                Tenants can submit move-out requests through the portal
              </p>
            </CardContent>
          </Card>
        )}
      </div>

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
                    <p className="text-sm text-muted-foreground">Building - Unit</p>
                    <p className="font-medium">
                      {selectedMoveOutRequest.unit.buildingName
                        ? `${selectedMoveOutRequest.unit.buildingName} - ${selectedMoveOutRequest.unit.unitLabel}`
                        : selectedMoveOutRequest.unit.unitLabel}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tenant</p>
                    <p className="font-medium">{selectedMoveOutRequest.tenant.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{selectedMoveOutRequest.tenant.email}</p>
                  </div>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Requested Move-Out Date</p>
                  </div>
                  <p className="text-lg font-semibold">
                    {formatDate(selectedMoveOutRequest.requestedDate)}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Status</p>
                  {getMoveOutStatusBadge(selectedMoveOutRequest.status)}
                </div>

                {selectedMoveOutRequest.adminMessage && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Admin Message</p>
                    <p className="text-sm bg-muted p-3 rounded-lg">
                      {selectedMoveOutRequest.adminMessage}
                    </p>
                  </div>
                )}

                {selectedMoveOutRequest.respondedBy && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Responded By</p>
                    <p className="text-sm">
                      {selectedMoveOutRequest.respondedBy.name} on{" "}
                      {selectedMoveOutRequest.respondedAt
                        ? formatDateTime(selectedMoveOutRequest.respondedAt)
                        : "-"}
                    </p>
                  </div>
                )}
              </div>

              {/* Actions for pending requests */}
              {selectedMoveOutRequest.status === "PENDING" && (
                <>
                  <Separator />

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="adminMessage">
                        Message to Tenant (optional)
                      </Label>
                      <Textarea
                        id="adminMessage"
                        placeholder="Add a message for the tenant..."
                        value={adminMessage}
                        onChange={(e) => setAdminMessage(e.target.value)}
                        rows={3}
                        className="mt-2"
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
