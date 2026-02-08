import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  AlertCircle,
  ClipboardList,
  User,
  Home,
  Loader2,
  ChevronDown,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { ChecklistPhotoUpload } from "@/components/admin/ChecklistPhotoUpload";
import type { ChecklistItemPhoto } from "../../../../backend/src/types";

interface ChecklistItem {
  id: string;
  title: string;
  description: string | null;
  isRequired: boolean;
  isCompleted: boolean;
  completedAt: string | null;
  selfCompletable: boolean;
  isDefault: boolean;
  photos?: ChecklistItemPhoto[];
}

interface TenantInfo {
  id: string;
  name: string;
  email: string;
  unit: {
    id: string;
    unitLabel: string;
    building?: {
      id: string;
      name: string;
    };
  } | null;
  moveOutDate: string | null;
}

interface NewItemForm {
  title: string;
  description: string;
  isRequired: boolean;
  selfCompletable: boolean;
}

const defaultNewItemForm: NewItemForm = {
  title: "",
  description: "",
  isRequired: false,
  selfCompletable: false,
};

export default function TenantMoveOutChecklistPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ChecklistItem | null>(null);
  const [newItemForm, setNewItemForm] = useState<NewItemForm>(defaultNewItemForm);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Fetch move-out checklist items (includes tenant info in response)
  const { data: checklistData, isLoading: checklistLoading } = useQuery({
    queryKey: ["admin", "tenant-checklist", tenantId, "MOVE_OUT"],
    queryFn: () =>
      api.get<{
        tenancy: {
          id: string;
          user: { id: string; name: string; email: string };
          unit: {
            id: string;
            unitLabel: string;
            building?: { id: string; name: string };
          } | null;
          moveOutDate: string | null;
        };
        items: ChecklistItem[];
        progress: { completed: number; total: number; percentage: number };
      }>(`/api/admin/checklist/tenant/${tenantId}?type=MOVE_OUT`),
    enabled: !!tenantId,
  });

  // Extract tenant info and items from checklist response
  const tenant: TenantInfo | null = checklistData?.tenancy?.user
    ? {
        id: checklistData.tenancy.user.id,
        name: checklistData.tenancy.user.name,
        email: checklistData.tenancy.user.email,
        unit: checklistData.tenancy.unit,
        moveOutDate: checklistData.tenancy.moveOutDate ?? null,
      }
    : null;
  const items = checklistData?.items;
  const progress = checklistData?.progress;

  // Initialize default move-out checklist
  const initializeMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/admin/checklist/tenant/${tenantId}/initialize`, {
        checklistType: "MOVE_OUT",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "tenant-checklist", tenantId, "MOVE_OUT"],
      });
      toast.success("Move-out checklist initialized");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to initialize checklist");
    },
  });

  // Toggle item completion
  const toggleMutation = useMutation({
    mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
      completed
        ? api.put(`/api/admin/checklist/item/${itemId}/complete`)
        : api.put(`/api/admin/checklist/item/${itemId}/incomplete`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "tenant-checklist", tenantId, "MOVE_OUT"],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update item");
    },
  });

  // Add custom item
  const addMutation = useMutation({
    mutationFn: (data: NewItemForm) =>
      api.post(`/api/admin/checklist/tenant/${tenantId}`, {
        ...data,
        checklistType: "MOVE_OUT",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "tenant-checklist", tenantId, "MOVE_OUT"],
      });
      setIsAddDialogOpen(false);
      setNewItemForm(defaultNewItemForm);
      toast.success("Item added to checklist");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add item");
    },
  });

  // Delete custom item
  const deleteMutation = useMutation({
    mutationFn: (itemId: string) =>
      api.delete(`/api/admin/checklist/item/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "tenant-checklist", tenantId, "MOVE_OUT"],
      });
      setIsDeleteDialogOpen(false);
      setSelectedItem(null);
      toast.success("Item removed from checklist");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete item");
    },
  });

  // Photo upload mutation
  const uploadPhotoMutation = useMutation({
    mutationFn: async ({
      itemId,
      file,
      caption,
    }: {
      itemId: string;
      file: File;
      caption?: string;
    }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (caption) {
        formData.append("caption", caption);
      }
      const response = await api.raw(
        `/api/admin/checklist/item/${itemId}/photo`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error?.message || "Failed to upload photo");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "tenant-checklist", tenantId, "MOVE_OUT"],
      });
      toast.success("Photo uploaded");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to upload photo");
    },
  });

  // Photo delete mutation
  const deletePhotoMutation = useMutation({
    mutationFn: (photoId: string) =>
      api.delete(`/api/admin/checklist/photo/${photoId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "tenant-checklist", tenantId, "MOVE_OUT"],
      });
      toast.success("Photo deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete photo");
    },
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemForm.title.trim()) {
      toast.error("Title is required");
      return;
    }
    addMutation.mutate(newItemForm);
  };

  const openDeleteDialog = (item: ChecklistItem) => {
    setSelectedItem(item);
    setIsDeleteDialogOpen(true);
  };

  const toggleItemExpanded = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const isLoading = checklistLoading;

  // Separate items into completed and to-complete groups
  const toCompleteItems = items?.filter((i) => !i.isCompleted) || [];
  const completedItems = items?.filter((i) => i.isCompleted) || [];
  const hasMoveOutDate = !!tenant?.moveOutDate;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <p className="text-muted-foreground">Tenant not found</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate("/admin/tenants")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Tenants
        </Button>
      </div>
    );
  }

  const completedCount = completedItems.length;
  const totalCount = items?.length || 0;
  const progressPercentage = progress?.percentage ?? (totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0);

  const renderChecklistItem = (item: ChecklistItem) => {
    const isExpanded = expandedItems.has(item.id);
    const photoCount = item.photos?.length || 0;

    return (
      <Collapsible
        key={item.id}
        open={isExpanded}
        onOpenChange={() => toggleItemExpanded(item.id)}
      >
        <div className="border rounded-lg">
          <div className="flex items-start gap-4 p-4">
            <div className="pt-0.5">
              {item.isCompleted ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={
                    item.isCompleted
                      ? "font-medium text-muted-foreground line-through"
                      : "font-medium"
                  }
                >
                  {item.title}
                </span>
                {item.isRequired && (
                  <Badge variant="destructive" className="text-xs">
                    Required
                  </Badge>
                )}
                {item.selfCompletable && (
                  <Badge variant="outline" className="text-xs">
                    Self-completable
                  </Badge>
                )}
                {!item.isDefault && (
                  <Badge variant="secondary" className="text-xs">
                    Custom
                  </Badge>
                )}
                {photoCount > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {photoCount} photo{photoCount !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              {item.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {item.description}
                </p>
              )}
              {item.completedAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  Completed on {formatDate(item.completedAt)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon">
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      isExpanded && "rotate-180"
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
              <div className="flex items-center gap-2">
                <Switch
                  checked={item.isCompleted}
                  onCheckedChange={(checked) =>
                    toggleMutation.mutate({
                      itemId: item.id,
                      completed: checked,
                    })
                  }
                  disabled={toggleMutation.isPending}
                />
                <Label className="text-sm text-muted-foreground hidden sm:inline">
                  {item.isCompleted ? "Done" : "Mark done"}
                </Label>
              </div>
              {!item.isDefault && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => openDeleteDialog(item)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <CollapsibleContent>
            <div className="px-4 pb-4 pt-0 border-t">
              <div className="pt-4">
                <Label className="block mb-2">Photos</Label>
                <ChecklistPhotoUpload
                  photos={item.photos || []}
                  onUpload={async (file, caption) => {
                    await uploadPhotoMutation.mutateAsync({
                      itemId: item.id,
                      file,
                      caption,
                    });
                  }}
                  onDelete={async (photoId) => {
                    await deletePhotoMutation.mutateAsync(photoId);
                  }}
                />
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/admin/tenants/${tenantId}/checklists`)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-serif font-medium">
            Move-Out Checklist for {tenant.name}
          </h1>
          <p className="text-muted-foreground">
            Manage move-out checklist items for this tenant
          </p>
        </div>
      </div>

      {/* Warning if no move-out date */}
      {!hasMoveOutDate && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No Move-Out Date Scheduled</AlertTitle>
          <AlertDescription>
            This tenant does not have a scheduled move-out date. Please set a
            move-out date before initializing the checklist.
          </AlertDescription>
        </Alert>
      )}

      {/* Tenant Info Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{tenant.name}</p>
                <p className="text-sm text-muted-foreground">{tenant.email}</p>
              </div>
            </div>
            {tenant.unit && (
              <div className="flex items-center gap-3 sm:ml-auto">
                <div className="p-2 rounded-full bg-muted">
                  <Home className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">
                    {tenant.unit.building?.name
                      ? `${tenant.unit.building.name} - ${tenant.unit.unitLabel}`
                      : tenant.unit.unitLabel}
                  </p>
                  <p className="text-sm text-muted-foreground">Unit</p>
                </div>
              </div>
            )}
            {tenant.moveOutDate && (
              <div className="flex items-center gap-3 sm:ml-4">
                <div className="p-2 rounded-full bg-orange-100">
                  <Calendar className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="font-medium">{formatDate(tenant.moveOutDate)}</p>
                  <p className="text-sm text-muted-foreground">Move-Out Date</p>
                </div>
              </div>
            )}
          </div>
          {totalCount > 0 && (
            <div className="mt-4 pt-4 border-t space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Progress: {completedCount} of {totalCount} items completed
                </span>
                <span className="font-medium">{progressPercentage}%</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Custom Item
        </Button>
        {(!items || items.length === 0) && (
          <Button
            variant="outline"
            onClick={() => initializeMutation.mutate()}
            disabled={initializeMutation.isPending || !hasMoveOutDate}
          >
            {initializeMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ClipboardList className="h-4 w-4 mr-2" />
            )}
            Initialize Checklist
          </Button>
        )}
      </div>

      {/* Checklist Items */}
      {!items || items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No move-out checklist items for this tenant yet.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {hasMoveOutDate
                ? 'Click "Initialize Checklist" to add standard move-out items, or add custom items manually.'
                : "Set a move-out date for this tenant to initialize the checklist."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* To Complete Section */}
          {toCompleteItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Circle className="h-5 w-5 text-muted-foreground" />
                  To Complete ({toCompleteItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {toCompleteItems.map(renderChecklistItem)}
              </CardContent>
            </Card>
          )}

          {/* Completed Section */}
          {completedItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Completed ({completedItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {completedItems.map(renderChecklistItem)}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Add Item Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Checklist Item</DialogTitle>
            <DialogDescription>
              Add a custom item to this tenant's move-out checklist
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={newItemForm.title}
                  onChange={(e) =>
                    setNewItemForm({ ...newItemForm, title: e.target.value })
                  }
                  placeholder="e.g., Return parking pass"
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newItemForm.description}
                  onChange={(e) =>
                    setNewItemForm({ ...newItemForm, description: e.target.value })
                  }
                  placeholder="Optional details about this task..."
                  rows={3}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isRequired"
                  checked={newItemForm.isRequired}
                  onCheckedChange={(checked) =>
                    setNewItemForm({ ...newItemForm, isRequired: checked === true })
                  }
                />
                <Label htmlFor="isRequired" className="font-normal cursor-pointer">
                  Required item
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="selfCompletable"
                  checked={newItemForm.selfCompletable}
                  onCheckedChange={(checked) =>
                    setNewItemForm({
                      ...newItemForm,
                      selfCompletable: checked === true,
                    })
                  }
                />
                <Label htmlFor="selfCompletable" className="font-normal cursor-pointer">
                  Tenant can mark as complete
                </Label>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsAddDialogOpen(false);
                  setNewItemForm(defaultNewItemForm);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addMutation.isPending}>
                {addMutation.isPending ? "Adding..." : "Add Item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Checklist Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedItem?.title}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                selectedItem && deleteMutation.mutate(selectedItem.id)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
