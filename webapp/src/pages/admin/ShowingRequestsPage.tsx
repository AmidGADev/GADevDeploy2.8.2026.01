import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Calendar,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ShowingRequest, ShowingRequestStatus } from "../../../../backend/src/types";

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getStatusBadge(status: ShowingRequestStatus) {
  switch (status) {
    case "NEW":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">New</Badge>;
    case "CONTACTED":
      return (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
          Contacted
        </Badge>
      );
    case "SCHEDULED":
      return (
        <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">
          Scheduled
        </Badge>
      );
    case "COMPLETED":
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          Completed
        </Badge>
      );
    case "CANCELLED":
      return <Badge variant="outline">Cancelled</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

// CSS Grid column definition - shared between header and rows
const GRID_COLS = "grid-cols-[100px_minmax(100px,1fr)_minmax(140px,1.5fr)_100px_90px_70px]";

interface RequestRowProps {
  request: ShowingRequest;
  onUpdateStatus: (id: string, status: ShowingRequestStatus) => void;
  isPending: boolean;
}

function RequestRow({ request, onUpdateStatus, isPending }: RequestRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border-b border-border last:border-b-0">
      <div className={`grid ${GRID_COLS} items-center py-3 px-2 hover:bg-muted/50`}>
        {/* Date */}
        <div className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(request.createdAt)}
        </div>

        {/* Name */}
        <div className="font-medium truncate pr-2" title={request.name}>
          {request.name}
        </div>

        {/* Email */}
        <div className="text-sm truncate pr-2" title={request.email}>
          {request.email}
        </div>

        {/* Phone */}
        <div className="text-sm text-muted-foreground">
          {request.phone || "-"}
        </div>

        {/* Status */}
        <div>
          {getStatusBadge(request.status)}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-0">
          {request.message && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {request.status === "NEW" && (
                <DropdownMenuItem
                  onClick={() => onUpdateStatus(request.id, "CONTACTED")}
                  disabled={isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark Contacted
                </DropdownMenuItem>
              )}
              {request.status === "CONTACTED" && (
                <DropdownMenuItem
                  onClick={() => onUpdateStatus(request.id, "SCHEDULED")}
                  disabled={isPending}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Mark Scheduled
                </DropdownMenuItem>
              )}
              {(request.status === "SCHEDULED" || request.status === "CONTACTED") && (
                <DropdownMenuItem
                  onClick={() => onUpdateStatus(request.id, "COMPLETED")}
                  disabled={isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark Completed
                </DropdownMenuItem>
              )}
              {request.status !== "CANCELLED" && request.status !== "COMPLETED" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onUpdateStatus(request.id, "CANCELLED")}
                    disabled={isPending}
                    className="text-destructive focus:text-destructive"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Expandable message section */}
      {isExpanded && request.message && (
        <div className="px-4 py-3 bg-muted/30 border-t border-border">
          <div className="flex items-start gap-3 max-w-2xl">
            <MessageSquare className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium mb-1">Message from prospect:</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {request.message}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RequestsTable({
  requests,
  onUpdateStatus,
  isPending
}: {
  requests: ShowingRequest[];
  onUpdateStatus: (id: string, status: ShowingRequestStatus) => void;
  isPending: boolean;
}) {
  return (
    <div className="border rounded-md">
      {/* Header */}
      <div className={`grid ${GRID_COLS} items-center py-2 px-2 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground`}>
        <div>Date</div>
        <div>Name</div>
        <div>Email</div>
        <div>Phone</div>
        <div>Status</div>
        <div className="text-right">Actions</div>
      </div>

      {/* Rows */}
      {requests.map((request) => (
        <RequestRow
          key={request.id}
          request={request}
          onUpdateStatus={onUpdateStatus}
          isPending={isPending}
        />
      ))}
    </div>
  );
}

export default function ShowingRequestsPage() {
  const queryClient = useQueryClient();

  // Fetch showing requests
  const { data: requests, isLoading } = useQuery({
    queryKey: ["admin", "showing-requests"],
    queryFn: () => api.get<ShowingRequest[]>("/api/admin/showing-requests"),
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

  const handleUpdateStatus = (id: string, status: ShowingRequestStatus) => {
    updateStatusMutation.mutate({ id, status });
  };

  // Separate new/pending requests from others
  const pendingRequests = requests?.filter(
    (r) => r.status === "NEW" || r.status === "CONTACTED" || r.status === "SCHEDULED"
  );
  const completedRequests = requests?.filter(
    (r) => r.status === "COMPLETED" || r.status === "CANCELLED"
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium">Showing Requests</h1>
        <p className="text-muted-foreground mt-1">
          Manage showing requests from prospective tenants
        </p>
      </div>

      {/* Pending Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Pending Requests
            {pendingRequests && pendingRequests.length > 0 && (
              <Badge variant="secondary">{pendingRequests.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : pendingRequests && pendingRequests.length > 0 ? (
            <RequestsTable
              requests={pendingRequests}
              onUpdateStatus={handleUpdateStatus}
              isPending={updateStatusMutation.isPending}
            />
          ) : (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No pending requests</h3>
              <p className="text-muted-foreground mt-2">
                All showing requests have been handled
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Completed/Cancelled Requests */}
      {completedRequests && completedRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Completed / Cancelled
              <Badge variant="outline">{completedRequests.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RequestsTable
              requests={completedRequests}
              onUpdateStatus={handleUpdateStatus}
              isPending={updateStatusMutation.isPending}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
