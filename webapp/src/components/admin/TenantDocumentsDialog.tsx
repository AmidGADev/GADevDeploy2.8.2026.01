import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Trash2,
  Download,
  File,
  FileCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TenantDocument {
  id: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  description: string | null;
  uploadedByName: string;
  createdAt: string;
}

interface TenantDocumentsResponse {
  tenant: {
    id: string;
    name: string;
    email: string;
  };
  documents: TenantDocument[];
}

interface TenantDocumentsDialogProps {
  tenantId: string;
  tenantName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DOCUMENT_TYPES = [
  { value: "LEASE", label: "Lease Agreement" },
  { value: "ADDENDUM", label: "Lease Addendum" },
  { value: "SIGNED_AGREEMENT", label: "Signed Agreement" },
  { value: "OTHER", label: "Other Document" },
];

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getDocumentTypeLabel(type: string) {
  return DOCUMENT_TYPES.find((t) => t.value === type)?.label || type;
}

function getDocumentIcon(type: string) {
  switch (type) {
    case "LEASE":
      return <FileCheck className="h-5 w-5 text-primary" />;
    case "ADDENDUM":
      return <FileText className="h-5 w-5 text-blue-500" />;
    case "SIGNED_AGREEMENT":
      return <FileCheck className="h-5 w-5 text-green-500" />;
    default:
      return <File className="h-5 w-5 text-muted-foreground" />;
  }
}

export function TenantDocumentsDialog({
  tenantId,
  tenantName,
  open,
  onOpenChange,
}: TenantDocumentsDialogProps) {
  const queryClient = useQueryClient();
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<TenantDocument | null>(null);
  const [uploadForm, setUploadForm] = useState({
    file: null as File | null,
    documentType: "LEASE",
    description: "",
  });

  // Fetch documents for tenant
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "documents", tenantId],
    queryFn: () => api.get<TenantDocumentsResponse>(`/api/admin/documents/${tenantId}`),
    enabled: open,
  });

  // Upload document mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/admin/documents/${tenantId}/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Upload failed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "documents", tenantId] });
      setIsUploadDialogOpen(false);
      setUploadForm({ file: null, documentType: "LEASE", description: "" });
      toast.success("Document uploaded successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to upload document");
    },
  });

  // Delete document mutation
  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => api.delete(`/api/admin/documents/${documentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "documents", tenantId] });
      setIsDeleteDialogOpen(false);
      setSelectedDocument(null);
      toast.success("Document deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete document");
    },
  });

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.file) {
      toast.error("Please select a file");
      return;
    }

    const formData = new FormData();
    formData.append("file", uploadForm.file);
    formData.append("documentType", uploadForm.documentType);
    if (uploadForm.description) {
      formData.append("description", uploadForm.description);
    }

    uploadMutation.mutate(formData);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setUploadForm({ ...uploadForm, file });
  };

  const openDeleteDialog = (doc: TenantDocument) => {
    setSelectedDocument(doc);
    setIsDeleteDialogOpen(true);
  };

  const handleViewDocument = (fileUrl: string) => {
    window.open(`${import.meta.env.VITE_BACKEND_URL}${fileUrl}`, "_blank");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Documents for {tenantName}</DialogTitle>
            <DialogDescription>
              Manage lease agreements and other documents for this tenant
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : data?.documents && data.documents.length > 0 ? (
              <div className="space-y-3">
                {data.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-shrink-0">
                      {getDocumentIcon(doc.documentType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{doc.fileName}</span>
                        <Badge variant="outline" className="flex-shrink-0">
                          {getDocumentTypeLabel(doc.documentType)}
                        </Badge>
                      </div>
                      {doc.description && (
                        <p className="text-sm text-muted-foreground mt-1 truncate">
                          {doc.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Uploaded by {doc.uploadedByName} on {formatDate(doc.createdAt)}
                      </p>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDocument(doc.fileUrl)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDeleteDialog(doc)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-medium">No documents yet</h3>
                <p className="text-muted-foreground mt-2">
                  Upload lease agreements and other documents for this tenant
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4 border-t pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={() => setIsUploadDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Document Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Upload a document for {tenantName}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUploadSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="documentType">Document Type *</Label>
                <Select
                  value={uploadForm.documentType}
                  onValueChange={(value) =>
                    setUploadForm({ ...uploadForm, documentType: value })
                  }
                >
                  <SelectTrigger id="documentType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="file">File *</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Accepted formats: PDF, JPG, PNG (max 25MB)
                </p>
              </div>
              {uploadForm.file && (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                  <File className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm truncate flex-1">{uploadForm.file.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setUploadForm({ ...uploadForm, file: null })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={uploadForm.description}
                  onChange={(e) =>
                    setUploadForm({ ...uploadForm, description: e.target.value })
                  }
                  placeholder="Add a brief description..."
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsUploadDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!uploadForm.file || uploadMutation.isPending}>
                {uploadMutation.isPending ? "Uploading..." : "Upload"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedDocument?.fileName}"? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedDocument && deleteMutation.mutate(selectedDocument.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
