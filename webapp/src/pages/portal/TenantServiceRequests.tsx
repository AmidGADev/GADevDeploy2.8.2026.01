import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertCircle,
  Plus,
  Wrench,
  MessageCircle,
  User,
  ChevronRight,
  Send,
  ArrowLeft,
  ImagePlus,
  X,
  Image as ImageIcon,
  Paperclip,
  DoorOpen,
  Calendar,
  CheckCircle,
  Clock,
  XCircle,
  Info,
} from "lucide-react";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  StatusTimeline,
  type StatusTimelineProps,
} from "@/components/portal/StatusTimeline";
import { Separator } from "@/components/ui/separator";

interface ServiceRequest {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
  attachmentCount?: number;
  createdBy: {
    id: string;
    name: string;
  };
  isOwnRequest: boolean;
}

interface Attachment {
  id: string;
  fileUrl: string;
  fileName: string | null;
  createdAt: string;
}

interface ServiceRequestDetail extends ServiceRequest {
  comments: Array<{
    id: string;
    body: string;
    createdAt: string;
    user: {
      id: string;
      name: string;
      role: string;
    };
  }>;
  attachments: Attachment[];
}

interface ServiceRequestsData {
  requests: ServiceRequest[];
  hasRoommates: boolean;
}

interface MoveOutRequest {
  id: string;
  tenancyId: string;
  requestedDate: string;
  status: "PENDING" | "ACKNOWLEDGED" | "DECLINED";
  adminMessage: string | null;
  respondedAt: string | null;
  respondedById: string | null;
  respondedBy?: {
    id: string;
    name: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface TenantUnit {
  id: string;
  unitLabel: string;
  buildingName: string | null;
}

// Minimum days notice required for move-out
const MIN_NOTICE_DAYS = 60;

export default function TenantServiceRequests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isMoveOutDialogOpen, setIsMoveOutDialogOpen] = useState(false);
  const [moveOutDate, setMoveOutDate] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newRequest, setNewRequest] = useState({
    title: "",
    description: "",
    priority: "NORMAL",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["tenant-service-requests"],
    queryFn: () => api.get<ServiceRequestsData>("/api/tenant/service-requests"),
  });

  // Fetch unit information for context
  const { data: unit } = useQuery({
    queryKey: ["tenant-unit"],
    queryFn: () => api.get<TenantUnit>("/api/tenant/unit"),
  });

  // Fetch move-out request
  const { data: moveOutRequest, isLoading: moveOutLoading } = useQuery({
    queryKey: ["tenant-move-out-request"],
    queryFn: () => api.get<MoveOutRequest | null>("/api/tenant/move-out-request"),
  });

  // Fetch selected request details
  const { data: requestDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["tenant-service-request", selectedRequestId],
    queryFn: () =>
      api.get<ServiceRequestDetail>(`/api/tenant/service-requests/${selectedRequestId}`),
    enabled: !!selectedRequestId,
  });

  // Create move-out request mutation
  const createMoveOutMutation = useMutation({
    mutationFn: (data: { requestedDate: string }) =>
      api.post<MoveOutRequest>("/api/tenant/move-out-request", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-move-out-request"] });
      setIsMoveOutDialogOpen(false);
      setMoveOutDate("");
      toast({
        title: "Move-Out Request Submitted",
        description: "Your move-out request has been submitted and is pending admin review.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit move-out request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newRequest) => {
      // First create the service request
      const response = await api.post<{ id: string }>("/api/tenant/service-requests", data);
      return response;
    },
    onSuccess: async (response) => {
      // If there are files selected, upload them
      if (selectedFiles.length > 0 && response?.id) {
        setIsUploading(true);
        try {
          const formData = new FormData();
          selectedFiles.forEach((file) => {
            formData.append("files", file);
          });

          await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/tenant/service-requests/${response.id}/attachments`, {
            method: "POST",
            body: formData,
            credentials: "include",
          });
        } catch (error) {
          console.error("Failed to upload attachments:", error);
          toast({
            title: "Warning",
            description: "Request submitted but some photos failed to upload.",
            variant: "destructive",
          });
        } finally {
          setIsUploading(false);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["tenant-service-requests"] });
      setIsDialogOpen(false);
      setNewRequest({ title: "", description: "", priority: "NORMAL" });
      setSelectedFiles([]);
      toast({
        title: "Request Submitted",
        description: "Your service request has been submitted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const commentMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      api.post(`/api/tenant/service-requests/${id}/comment`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tenant-service-request", selectedRequestId],
      });
      queryClient.invalidateQueries({ queryKey: ["tenant-service-requests"] });
      setNewComment("");
      toast({
        title: "Comment Added",
        description: "Your comment has been added.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add comment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(newRequest);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not an image file.`,
          variant: "destructive",
        });
        return false;
      }
      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds 10MB limit.`,
          variant: "destructive",
        });
        return false;
      }
      return true;
    });

    // Limit to 5 files total
    const newFiles = [...selectedFiles, ...validFiles].slice(0, 5);
    setSelectedFiles(newFiles);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequestId || !newComment.trim()) return;
    commentMutation.mutate({ id: selectedRequestId, body: newComment.trim() });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "RESOLVED":
      case "CLOSED":
        return "bg-green-100 text-green-700";
      case "IN_PROGRESS":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-yellow-100 text-yellow-700";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "URGENT":
        return "bg-red-100 text-red-700";
      case "HIGH":
        return "bg-orange-100 text-orange-700";
      case "LOW":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-blue-100 text-blue-700";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-CA", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Calculate minimum move-out date (60 days from today)
  const getMinMoveOutDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + MIN_NOTICE_DAYS);
    return date.toISOString().split("T")[0];
  };

  // Handle move-out request submission
  const handleMoveOutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveOutDate) return;
    createMoveOutMutation.mutate({ requestedDate: moveOutDate });
  };

  // Get move-out status badge
  const getMoveOutStatusBadge = (status: string) => {
    switch (status) {
      case "ACKNOWLEDGED":
        return (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
            <CheckCircle className="h-3 w-3 mr-1" />
            Acknowledged
          </Badge>
        );
      case "DECLINED":
        return (
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
            <XCircle className="h-3 w-3 mr-1" />
            Declined
          </Badge>
        );
      default:
        return (
          <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <p className="text-muted-foreground">Failed to load service requests</p>
      </div>
    );
  }

  // Handle both old format (array) and new format (object with requests and hasRoommates)
  const requests = Array.isArray(data) ? data : data?.requests || [];
  const hasRoommates = Array.isArray(data) ? false : data?.hasRoommates || false;

  // Format unit display with building name
  const unitDisplay = unit?.buildingName ? `${unit.buildingName} - ${unit.unitLabel}` : unit?.unitLabel;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-medium">Service Requests</h1>
          <p className="text-muted-foreground">
            {hasRoommates
              ? `Submit and track maintenance requests for ${unitDisplay || "your unit"}`
              : `Submit and track maintenance requests${unitDisplay ? ` for ${unitDisplay}` : ""}`}
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent hover:bg-accent/90">
              <Plus className="h-4 w-4 mr-2" />
              New Request
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Submit Service Request</DialogTitle>
              {unitDisplay ? (
                <DialogDescription>
                  Submitting request for {unitDisplay}
                </DialogDescription>
              ) : null}
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={newRequest.title}
                  onChange={(e) =>
                    setNewRequest({ ...newRequest, title: e.target.value })
                  }
                  placeholder="Brief description of the issue"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newRequest.description}
                  onChange={(e) =>
                    setNewRequest({ ...newRequest, description: e.target.value })
                  }
                  placeholder="Provide details about the issue..."
                  rows={4}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={newRequest.priority}
                  onValueChange={(value) =>
                    setNewRequest({ ...newRequest, priority: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Photo Upload Section */}
              <div className="space-y-2">
                <Label>Photos (optional)</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Add up to 5 photos to help describe the issue
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {/* Selected Files Preview */}
                {selectedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {selectedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="relative group w-20 h-20 rounded-lg overflow-hidden border bg-muted"
                      >
                        <img
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {selectedFiles.length < 5 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="h-4 w-4 mr-2" />
                    Add Photos
                  </Button>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    setSelectedFiles([]);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || isUploading}>
                  {createMutation.isPending || isUploading ? "Submitting..." : "Submit"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!requests || requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Wrench className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No service requests found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Click "New Request" to submit a maintenance request
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <Card
              key={request.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSelectedRequestId(request.id)}
            >
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h3 className="font-medium">{request.title}</h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                          request.status
                        )}`}
                      >
                        {request.status.replace("_", " ")}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(
                          request.priority
                        )}`}
                      >
                        {request.priority}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {request.description}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span>Submitted {formatDate(request.createdAt)}</span>
                      {hasRoommates ? (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {request.isOwnRequest ? "You" : request.createdBy.name}
                        </span>
                      ) : null}
                      {request.attachmentCount && request.attachmentCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Paperclip className="h-3 w-3" />
                          {request.attachmentCount} photo{request.attachmentCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {request.commentCount > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" />
                          {request.commentCount} comments
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasRoommates && request.isOwnRequest ? (
                      <Badge variant="outline" className="text-xs">
                        Your request
                      </Badge>
                    ) : null}
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Request Detail Sheet */}
      <Sheet
        open={!!selectedRequestId}
        onOpenChange={(open) => !open && setSelectedRequestId(null)}
      >
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSelectedRequestId(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              Request Details
            </SheetTitle>
          </SheetHeader>

          {detailLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : requestDetail ? (
            <div className="space-y-6">
              {/* Title and badges */}
              <div>
                <h3 className="font-semibold text-lg mb-2">{requestDetail.title}</h3>
                <div className="flex gap-2 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                      requestDetail.status
                    )}`}
                  >
                    {requestDetail.status.replace("_", " ")}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(
                      requestDetail.priority
                    )}`}
                  >
                    {requestDetail.priority}
                  </span>
                </div>
              </div>

              {/* Status Timeline */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Status Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <StatusTimeline
                    status={requestDetail.status as StatusTimelineProps["status"]}
                    createdAt={requestDetail.createdAt}
                    updatedAt={requestDetail.updatedAt}
                  />
                </CardContent>
              </Card>

              {/* Description */}
              <div>
                <h4 className="text-sm font-medium mb-2">Description</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {requestDetail.description}
                </p>
              </div>

              {/* Photos/Attachments */}
              {requestDetail.attachments && requestDetail.attachments.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Photos ({requestDetail.attachments.length})
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {requestDetail.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={`${import.meta.env.VITE_BACKEND_URL}${attachment.fileUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative aspect-square rounded-lg overflow-hidden border bg-muted hover:opacity-90 transition-opacity"
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
              )}

              {/* Comments Section */}
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Comments ({requestDetail.comments?.length || 0})
                </h4>

                {requestDetail.comments && requestDetail.comments.length > 0 ? (
                  <div className="space-y-3 mb-4">
                    {requestDetail.comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="bg-muted/50 rounded-lg p-3"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">
                            {comment.user.name}
                          </span>
                          {comment.user.role === "ADMIN" && (
                            <Badge variant="secondary" className="text-xs">
                              Staff
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto">
                            {formatDateTime(comment.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm">{comment.body}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mb-4">
                    No comments yet
                  </p>
                )}

                {/* Add Comment Form */}
                {requestDetail.status !== "CLOSED" && (
                  <form onSubmit={handleAddComment} className="flex gap-2">
                    <Input
                      placeholder="Add a comment..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={
                        !newComment.trim() || commentMutation.isPending
                      }
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">Request not found</p>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Move-Out Request Section */}
      <Separator className="my-8" />

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <DoorOpen className="h-5 w-5" />
          <h2 className="text-lg font-medium">Move-Out Request</h2>
        </div>

        {moveOutLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : moveOutRequest ? (
          <Card className="border-dashed">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h3 className="font-medium">Move-Out Request</h3>
                    {getMoveOutStatusBadge(moveOutRequest.status)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      Requested date: {formatDate(moveOutRequest.requestedDate)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Submitted on {formatDate(moveOutRequest.createdAt)}
                  </p>
                  {moveOutRequest.adminMessage && (
                    <div className="mt-3 p-3 bg-muted rounded-lg">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Admin Response:
                      </p>
                      <p className="text-sm">{moveOutRequest.adminMessage}</p>
                      {moveOutRequest.respondedBy && (
                        <p className="text-xs text-muted-foreground mt-1">
                          — {moveOutRequest.respondedBy.name}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Planning to move out? Submit a move-out request to notify your landlord.
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Requires at least 60 days advance notice.
                  </p>
                </div>
                <Dialog open={isMoveOutDialogOpen} onOpenChange={setIsMoveOutDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="shrink-0">
                      <DoorOpen className="h-4 w-4 mr-2" />
                      Request to Move-Out
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Request to Move-Out</DialogTitle>
                      <DialogDescription>
                        Submit your intended move-out date. You must provide at least 60 days notice before moving out.
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleMoveOutSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="moveOutDate">Move-Out Date</Label>
                        <Input
                          id="moveOutDate"
                          type="date"
                          value={moveOutDate}
                          onChange={(e) => setMoveOutDate(e.target.value)}
                          min={getMinMoveOutDate()}
                          required
                        />
                        <p className="text-xs text-muted-foreground">
                          Earliest available date: {formatDate(getMinMoveOutDate())}
                        </p>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setIsMoveOutDialogOpen(false);
                            setMoveOutDate("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createMoveOutMutation.isPending}>
                          {createMoveOutMutation.isPending ? "Submitting..." : "Submit Request"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
