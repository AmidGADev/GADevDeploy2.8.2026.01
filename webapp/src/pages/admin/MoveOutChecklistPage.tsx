import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowLeft,
  User,
  Home,
  AlertCircle,
  Loader2,
  Lock,
  Unlock,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Key,
  Calendar,
  Image,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChecklistPhotoUpload } from "@/components/admin/ChecklistPhotoUpload";
import type {
  MoveOutChecklist,
  MoveOutChecklistItem,
  MoveOutChecklistStatus,
  MoveOutChecklistCondition,
  MoveOutChecklistCategory,
} from "../../../../backend/src/types";

const CATEGORY_LABELS: Record<MoveOutChecklistCategory, string> = {
  KEYS_ACCESS: "Keys & Access",
  WALLS_PAINT: "Walls & Paint",
  FLOORS: "Floors",
  APPLIANCES: "Appliances",
  BATHROOM: "Bathroom",
  KITCHEN: "Kitchen",
  DOORS_WINDOWS: "Doors & Windows",
};

const CATEGORY_ORDER: MoveOutChecklistCategory[] = [
  "KEYS_ACCESS",
  "WALLS_PAINT",
  "FLOORS",
  "APPLIANCES",
  "BATHROOM",
  "KITCHEN",
  "DOORS_WINDOWS",
];

const CONDITION_OPTIONS: { value: MoveOutChecklistCondition; label: string }[] = [
  { value: "EXCELLENT", label: "Excellent" },
  { value: "GOOD", label: "Good" },
  { value: "FAIR", label: "Fair" },
  { value: "POOR", label: "Poor" },
  { value: "DAMAGED", label: "Damaged" },
];

const STATUS_LABELS: Record<MoveOutChecklistStatus, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
};

interface TenantInfo {
  id: string;
  name: string;
  email: string;
  unit: {
    id: string;
    unitLabel: string;
  } | null;
}

interface MoveOutChecklistResponse {
  checklist: MoveOutChecklist;
  moveOutDate: string | null;
  tenancy: {
    id: string;
    user: { id: string; name: string; email: string };
    unit: { id: string; unitLabel: string } | null;
  };
}

export default function MoveOutChecklistPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);
  const [isReopenDialogOpen, setIsReopenDialogOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(CATEGORY_ORDER)
  );

  // Fetch checklist data
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "move-out-checklist", tenantId],
    queryFn: () =>
      api.get<MoveOutChecklistResponse>(
        `/api/admin/move-out-checklist/tenant/${tenantId}`
      ),
    enabled: !!tenantId,
  });

  const checklist = data?.checklist;
  const moveOutDate = data?.moveOutDate;
  const tenant: TenantInfo | null = data?.tenancy?.user
    ? {
        id: data.tenancy.user.id,
        name: data.tenancy.user.name,
        email: data.tenancy.user.email,
        unit: data.tenancy.unit,
      }
    : null;

  // Update checklist mutation
  const updateChecklistMutation = useMutation({
    mutationFn: (updates: {
      status?: MoveOutChecklistStatus;
      notes?: string | null;
      damageNotes?: string | null;
      damageFound?: boolean;
      keysReturned?: boolean;
    }) =>
      api.put(`/api/admin/move-out-checklist/${checklist?.id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "move-out-checklist", tenantId],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update checklist");
    },
  });

  // Update item mutation
  const updateItemMutation = useMutation({
    mutationFn: ({
      itemId,
      updates,
    }: {
      itemId: string;
      updates: { condition?: MoveOutChecklistCondition | null; notes?: string | null };
    }) => api.put(`/api/admin/move-out-checklist/item/${itemId}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "move-out-checklist", tenantId],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update item");
    },
  });

  // Finalize mutation
  const finalizeMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/admin/move-out-checklist/${checklist?.id}/finalize`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "move-out-checklist", tenantId],
      });
      setIsFinalizeDialogOpen(false);
      toast.success("Checklist finalized successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to finalize checklist");
    },
  });

  // Reopen mutation
  const reopenMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/admin/move-out-checklist/${checklist?.id}/reopen`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "move-out-checklist", tenantId],
      });
      setIsReopenDialogOpen(false);
      toast.success("Checklist reopened");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to reopen checklist");
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
        `/api/admin/move-out-checklist/item/${itemId}/photo`,
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
        queryKey: ["admin", "move-out-checklist", tenantId],
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
      api.delete(`/api/admin/move-out-checklist/photo/${photoId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "move-out-checklist", tenantId],
      });
      toast.success("Photo deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete photo");
    },
  });

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleConditionChange = (
    item: MoveOutChecklistItem,
    condition: MoveOutChecklistCondition | null
  ) => {
    updateItemMutation.mutate({
      itemId: item.id,
      updates: { condition },
    });
  };

  const handleItemNotesChange = (item: MoveOutChecklistItem, notes: string) => {
    updateItemMutation.mutate({
      itemId: item.id,
      updates: { notes: notes || null },
    });
  };

  const getStatusBadgeVariant = (status: MoveOutChecklistStatus) => {
    switch (status) {
      case "NOT_STARTED":
        return "secondary";
      case "IN_PROGRESS":
        return "default";
      case "COMPLETED":
        return "default";
      default:
        return "secondary";
    }
  };

  const getStatusBadgeClass = (status: MoveOutChecklistStatus) => {
    if (status === "COMPLETED") {
      return "bg-green-100 text-green-800 hover:bg-green-100";
    }
    if (status === "IN_PROGRESS") {
      return "bg-yellow-100 text-yellow-800 hover:bg-yellow-100";
    }
    return "";
  };

  const getConditionBadgeClass = (condition: MoveOutChecklistCondition | null) => {
    if (!condition) return "";
    switch (condition) {
      case "EXCELLENT":
        return "bg-green-100 text-green-800";
      case "GOOD":
        return "bg-blue-100 text-blue-800";
      case "FAIR":
        return "bg-yellow-100 text-yellow-800";
      case "POOR":
        return "bg-orange-100 text-orange-800";
      case "DAMAGED":
        return "bg-red-100 text-red-800";
      default:
        return "";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <p className="text-muted-foreground">
          {error ? "Failed to load checklist" : "Tenant not found"}
        </p>
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

  const isFinalized = checklist?.isFinalized ?? false;
  const itemsByCategory = CATEGORY_ORDER.reduce((acc, category) => {
    acc[category] = checklist?.items.filter((i) => i.category === category) || [];
    return acc;
  }, {} as Record<MoveOutChecklistCategory, MoveOutChecklistItem[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/admin/tenants")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-serif font-medium">Move-Out Checklist</h1>
          <p className="text-muted-foreground">
            Document the condition of the unit before tenant moves out
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isFinalized ? (
            <Button
              variant="outline"
              onClick={() => setIsReopenDialogOpen(true)}
              disabled={reopenMutation.isPending}
            >
              {reopenMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Unlock className="h-4 w-4 mr-2" />
              )}
              Reopen
            </Button>
          ) : (
            <Button
              onClick={() => setIsFinalizeDialogOpen(true)}
              disabled={finalizeMutation.isPending}
            >
              {finalizeMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Lock className="h-4 w-4 mr-2" />
              )}
              Finalize
            </Button>
          )}
        </div>
      </div>

      {/* Finalized Banner */}
      {isFinalized && checklist?.finalizedAt && checklist?.finalizedBy && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
          <Lock className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-green-800">Inspection Finalized</p>
            <p className="text-sm text-green-700">
              Finalized on {formatDate(checklist.finalizedAt)} by {checklist.finalizedBy.name}
            </p>
          </div>
        </div>
      )}

      {/* Tenant Info Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
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
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-muted">
                  <Home className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">{tenant.unit.unitLabel}</p>
                  <p className="text-sm text-muted-foreground">Unit</p>
                </div>
              </div>
            )}
            {moveOutDate && (
              <div className="flex items-center gap-3 lg:ml-auto">
                <div className="p-2 rounded-full bg-amber-100">
                  <Calendar className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium text-amber-700">
                    {new Date(moveOutDate).toLocaleDateString("en-CA", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                  <p className="text-sm text-muted-foreground">Move-Out Date</p>
                </div>
              </div>
            )}
          </div>
          {checklist && (
            <div className="mt-4 pt-4 border-t flex flex-wrap items-center gap-3">
              <Badge
                variant={getStatusBadgeVariant(checklist.status)}
                className={getStatusBadgeClass(checklist.status)}
              >
                {STATUS_LABELS[checklist.status]}
              </Badge>
              {isFinalized && (
                <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-200">
                  <Lock className="h-3 w-3" />
                  Finalized
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Keys & Damage Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Keys & Damage Assessment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Keys/Fobs Returned</Label>
              <p className="text-sm text-muted-foreground">
                Have all keys and access fobs been returned?
              </p>
            </div>
            <Switch
              checked={checklist?.keysReturned ?? false}
              onCheckedChange={(checked) =>
                updateChecklistMutation.mutate({ keysReturned: checked })
              }
              disabled={isFinalized}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Damage Beyond Normal Wear</Label>
              <p className="text-sm text-muted-foreground">
                Was damage found beyond normal wear and tear?
              </p>
            </div>
            <Switch
              checked={checklist?.damageFound ?? false}
              onCheckedChange={(checked) =>
                updateChecklistMutation.mutate({ damageFound: checked })
              }
              disabled={isFinalized}
            />
          </div>

          {checklist?.damageFound && (
            <div>
              <Label htmlFor="damage-notes">Damage Notes</Label>
              <Textarea
                id="damage-notes"
                value={checklist.damageNotes || ""}
                onChange={(e) =>
                  updateChecklistMutation.mutate({
                    damageNotes: e.target.value || null,
                  })
                }
                placeholder="Describe the damage found..."
                rows={3}
                disabled={isFinalized}
                className="mt-2"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Checklist Items by Category */}
      {CATEGORY_ORDER.map((category) => {
        const items = itemsByCategory[category];
        if (items.length === 0) return null;

        const isExpanded = expandedCategories.has(category);
        const hasConditions = items.some((i) => i.condition !== null);

        return (
          <Card key={category}>
            <Collapsible open={isExpanded} onOpenChange={() => toggleCategory(category)}>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <ClipboardList className="h-5 w-5" />
                      {CATEGORY_LABELS[category]}
                    </span>
                    <div className="flex items-center gap-2">
                      {hasConditions && (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                      <ChevronDown
                        className={cn(
                          "h-5 w-5 transition-transform",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </div>
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-6 pt-0">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 border rounded-lg space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex-1">
                          <Label className="text-base">Condition</Label>
                          <Select
                            value={item.condition || ""}
                            onValueChange={(value) =>
                              handleConditionChange(
                                item,
                                value as MoveOutChecklistCondition
                              )
                            }
                            disabled={isFinalized}
                          >
                            <SelectTrigger className="w-full sm:w-48 mt-2">
                              <SelectValue placeholder="Select condition..." />
                            </SelectTrigger>
                            <SelectContent>
                              {CONDITION_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {item.condition && (
                          <Badge
                            variant="outline"
                            className={getConditionBadgeClass(item.condition)}
                          >
                            {item.condition}
                          </Badge>
                        )}
                      </div>

                      <div>
                        <Label htmlFor={`notes-${item.id}`}>Notes</Label>
                        <Textarea
                          id={`notes-${item.id}`}
                          value={item.notes || ""}
                          onChange={(e) =>
                            handleItemNotesChange(item, e.target.value)
                          }
                          placeholder="Add notes about this area..."
                          rows={2}
                          disabled={isFinalized}
                          className="mt-2"
                        />
                      </div>

                      <div>
                        <Label className="block mb-2">Photos</Label>
                        <ChecklistPhotoUpload
                          photos={item.photos}
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
                          disabled={isFinalized}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}

      {/* Final Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Final Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={checklist?.notes || ""}
            onChange={(e) =>
              updateChecklistMutation.mutate({
                notes: e.target.value || null,
              })
            }
            placeholder="Add any final notes about the move-out inspection..."
            rows={4}
            disabled={isFinalized}
          />
        </CardContent>
      </Card>

      {/* Photo Summary */}
      {(() => {
        const allPhotos = checklist?.items.flatMap((item) =>
          item.photos.map((photo) => ({
            ...photo,
            category: CATEGORY_LABELS[item.category],
          }))
        ) || [];

        if (allPhotos.length === 0) return null;

        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                Photo Summary ({allPhotos.length} photos)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {allPhotos.map((photo) => (
                  <div key={photo.id} className="space-y-1">
                    <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                      <img
                        src={`${import.meta.env.VITE_BACKEND_URL}/api/files/${photo.storageKey}`}
                        alt={photo.caption || photo.filename}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {photo.category}
                    </p>
                    {photo.caption ? (
                      <p className="text-xs truncate">{photo.caption}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Finalize Confirmation Dialog */}
      <AlertDialog
        open={isFinalizeDialogOpen}
        onOpenChange={setIsFinalizeDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize Move-Out Inspection</AlertDialogTitle>
            <AlertDialogDescription>
              Finalizing will lock this inspection. This record may be used for
              security deposit decisions.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Warnings */}
          <div className="space-y-3">
            {(() => {
              const totalPhotos = checklist?.items.reduce(
                (sum, item) => sum + item.photos.length,
                0
              ) || 0;
              const hasNoPhotos = totalPhotos === 0;
              const hasDamageWithoutNotes =
                checklist?.damageFound && !checklist?.damageNotes;
              const hasDamageWithoutPhotos =
                checklist?.damageFound && totalPhotos === 0;

              const warnings: string[] = [];
              if (hasNoPhotos) {
                warnings.push("No photos have been uploaded for this inspection.");
              }
              if (hasDamageWithoutNotes) {
                warnings.push("Damage is marked but no damage notes have been added.");
              }
              if (hasDamageWithoutPhotos) {
                warnings.push("Damage is marked but no photos have been uploaded to document it.");
              }

              if (warnings.length === 0) return null;

              return (
                <div className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    {warnings.map((warning, idx) => (
                      <p key={idx} className="text-sm text-amber-800">
                        {warning}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => finalizeMutation.mutate()}
              disabled={finalizeMutation.isPending}
            >
              {finalizeMutation.isPending ? "Finalizing..." : "Finalize Inspection"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reopen Confirmation Dialog */}
      <AlertDialog open={isReopenDialogOpen} onOpenChange={setIsReopenDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reopen Checklist</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reopen this checklist? This will allow
              edits to be made again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => reopenMutation.mutate()}
              disabled={reopenMutation.isPending}
            >
              {reopenMutation.isPending ? "Reopening..." : "Reopen Checklist"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
