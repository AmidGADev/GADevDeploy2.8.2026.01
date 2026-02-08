import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Bell,
  Users,
  Building2,
  Eye,
  Calendar,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Announcement, AudienceType, Unit, User } from "../../../../backend/src/types";

interface AnnouncementWithDetails extends Announcement {
  createdBy?: {
    id: string;
    name: string;
  };
  readCount?: number;
  totalRecipients?: number;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

// Glass-morphism style badge component
function AudienceBadge({ type, units, users }: { type: AudienceType; units?: string | null; users?: string | null }) {
  switch (type) {
    case "ALL":
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-700 border-emerald-200">
          <Users className="h-3 w-3" />
          All Tenants
        </span>
      );
    case "UNIT": {
      const unitCount = units ? JSON.parse(units).length : 0;
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-blue-500/10 text-blue-700 border-blue-200">
          <Building2 className="h-3 w-3" />
          {unitCount} Unit{unitCount !== 1 ? "s" : ""}
        </span>
      );
    }
    case "CUSTOM": {
      const userCount = users ? JSON.parse(users).length : 0;
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-purple-500/10 text-purple-700 border-purple-200">
          <Users className="h-3 w-3" />
          {userCount} Tenant{userCount !== 1 ? "s" : ""}
        </span>
      );
    }
    default:
      return (
        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full border bg-slate-500/10 text-slate-600 border-slate-200">
          {type}
        </span>
      );
  }
}

function EmailedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-slate-500/10 text-slate-600 border-slate-200">
      <Mail className="h-3 w-3" />
      Emailed
    </span>
  );
}

interface CreateFormData {
  title: string;
  bodyRichtext: string;
  audienceType: AudienceType;
  audienceUnits: string[];
  audienceUsers: string[];
  sendEmail: boolean;
}

const defaultFormData: CreateFormData = {
  title: "",
  bodyRichtext: "",
  audienceType: "ALL",
  audienceUnits: [],
  audienceUsers: [],
  sendEmail: false,
};

// Skeleton card for loading state
function AnnouncementCardSkeleton() {
  return (
    <div className="bg-card border border-border/50 rounded-lg p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-8 w-8 rounded" />
      </div>
      <div className="flex gap-2 mb-3">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-4 w-full mb-1" />
      <Skeleton className="h-4 w-2/3 mb-4" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

export default function AnnouncementsPage() {
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<AnnouncementWithDetails | null>(null);
  const [formData, setFormData] = useState<CreateFormData>(defaultFormData);

  // Fetch announcements
  const { data: announcements, isLoading } = useQuery({
    queryKey: ["admin", "announcements"],
    queryFn: () => api.get<AnnouncementWithDetails[]>("/api/admin/announcements"),
  });

  // Fetch units for audience selection
  const { data: units } = useQuery({
    queryKey: ["admin", "units"],
    queryFn: () => api.get<Unit[]>("/api/admin/units"),
  });

  // Fetch tenants for audience selection
  const { data: tenants } = useQuery({
    queryKey: ["admin", "tenants"],
    queryFn: () => api.get<User[]>("/api/admin/tenants"),
  });

  // Create announcement mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateFormData) =>
      api.post("/api/admin/announcements", {
        title: data.title,
        bodyRichtext: data.bodyRichtext,
        audienceType: data.audienceType,
        audienceUnits: data.audienceType === "UNIT" ? data.audienceUnits : undefined,
        audienceUsers: data.audienceType === "CUSTOM" ? data.audienceUsers : undefined,
        sendEmail: data.sendEmail,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "announcements"] });
      setIsCreateDialogOpen(false);
      setFormData(defaultFormData);
      toast.success(
        formData.sendEmail
          ? "Announcement created and emailed to recipients"
          : "Announcement created"
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create announcement");
    },
  });

  // Delete announcement mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/announcements/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "announcements"] });
      setIsDeleteDialogOpen(false);
      setSelectedAnnouncement(null);
      toast.success("Announcement deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete announcement");
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const openCreateDialog = () => {
    setFormData(defaultFormData);
    setIsCreateDialogOpen(true);
  };

  const openDeleteDialog = (announcement: AnnouncementWithDetails) => {
    setSelectedAnnouncement(announcement);
    setIsDeleteDialogOpen(true);
  };

  const toggleUnitSelection = (unitId: string) => {
    setFormData((prev) => ({
      ...prev,
      audienceUnits: prev.audienceUnits.includes(unitId)
        ? prev.audienceUnits.filter((id) => id !== unitId)
        : [...prev.audienceUnits, unitId],
    }));
  };

  const toggleUserSelection = (userId: string) => {
    setFormData((prev) => ({
      ...prev,
      audienceUsers: prev.audienceUsers.includes(userId)
        ? prev.audienceUsers.filter((id) => id !== userId)
        : [...prev.audienceUsers, userId],
    }));
  };

  const occupiedUnits = units?.filter((u) => u.status === "OCCUPIED") || [];
  const activeTenants = tenants?.filter((t) => t.status === "ACTIVE") || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-medium">Announcements</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage announcements for tenants
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Create Announcement
        </Button>
      </div>

      {/* Announcements Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <AnnouncementCardSkeleton key={i} />
          ))}
        </div>
      ) : announcements && announcements.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {announcements.map((announcement) => (
            <div
              key={announcement.id}
              className="bg-card border border-border/50 rounded-lg p-4 shadow-sm hover:shadow-md hover:border-border transition-all duration-200"
            >
              {/* Title and Menu */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-medium text-base line-clamp-1">
                  {announcement.title}
                </h3>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 -mr-2 -mt-1">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => openDeleteDialog(announcement)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Badges Row */}
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <AudienceBadge
                  type={announcement.audienceType}
                  units={announcement.audienceUnits}
                  users={announcement.audienceUsers}
                />
                {announcement.sendEmail ? <EmailedBadge /> : null}
              </div>

              {/* Body Preview */}
              <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                {announcement.bodyRichtext}
              </p>

              {/* Footer: Date/Author and Read Stats */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {formatDate(announcement.createdAt)}
                    {announcement.createdBy ? ` by ${announcement.createdBy.name}` : ""}
                  </span>
                </div>
                {typeof announcement.readCount === "number" &&
                typeof announcement.totalRecipients === "number" ? (
                  <div className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    <span>{announcement.readCount}/{announcement.totalRecipients} read</span>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-16">
          <Bell className="h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">No announcements yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first announcement to notify tenants
          </p>
          <Button className="mt-4" onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Create Announcement
          </Button>
        </div>
      )}

      {/* Create Announcement Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Announcement</DialogTitle>
            <DialogDescription>
              Send a notice to your tenants
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="e.g., Building Maintenance Notice"
                  required
                />
              </div>
              <div>
                <Label htmlFor="body">Message *</Label>
                <Textarea
                  id="body"
                  value={formData.bodyRichtext}
                  onChange={(e) =>
                    setFormData({ ...formData, bodyRichtext: e.target.value })
                  }
                  placeholder="Write your announcement here..."
                  rows={6}
                  required
                />
              </div>
              <div>
                <Label>Audience *</Label>
                <Select
                  value={formData.audienceType}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      audienceType: value as AudienceType,
                      audienceUnits: [],
                      audienceUsers: [],
                    })
                  }
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Tenants</SelectItem>
                    <SelectItem value="UNIT">Selected Units</SelectItem>
                    <SelectItem value="CUSTOM">Selected Tenants</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Unit Selection */}
              {formData.audienceType === "UNIT" ? (
                <div>
                  <Label className="mb-2 block">Select Units</Label>
                  <div className="border rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                    {occupiedUnits.length > 0 ? (
                      occupiedUnits.map((unit) => (
                        <div key={unit.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`unit-${unit.id}`}
                            checked={formData.audienceUnits.includes(unit.id)}
                            onCheckedChange={() => toggleUnitSelection(unit.id)}
                          />
                          <label
                            htmlFor={`unit-${unit.id}`}
                            className="text-sm cursor-pointer"
                          >
                            {unit.buildingName ? `${unit.buildingName} - ${unit.unitLabel}` : unit.unitLabel}
                          </label>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No occupied units
                      </p>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Tenant Selection */}
              {formData.audienceType === "CUSTOM" ? (
                <div>
                  <Label className="mb-2 block">Select Tenants</Label>
                  <div className="border rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                    {activeTenants.length > 0 ? (
                      activeTenants.map((tenant) => (
                        <div key={tenant.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`tenant-${tenant.id}`}
                            checked={formData.audienceUsers.includes(tenant.id)}
                            onCheckedChange={() => toggleUserSelection(tenant.id)}
                          />
                          <label
                            htmlFor={`tenant-${tenant.id}`}
                            className="text-sm cursor-pointer"
                          >
                            {tenant.name}{" "}
                            <span className="text-muted-foreground">
                              ({tenant.email})
                            </span>
                          </label>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No active tenants
                      </p>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                <div>
                  <Label htmlFor="sendEmail" className="cursor-pointer">
                    Also send via email
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Recipients will receive an email notification
                  </p>
                </div>
                <Switch
                  id="sendEmail"
                  checked={formData.sendEmail}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, sendEmail: checked })
                  }
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createMutation.isPending ||
                  (formData.audienceType === "UNIT" &&
                    formData.audienceUnits.length === 0) ||
                  (formData.audienceType === "CUSTOM" &&
                    formData.audienceUsers.length === 0)
                }
              >
                {createMutation.isPending ? "Creating..." : "Create Announcement"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedAnnouncement?.title}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                selectedAnnouncement && deleteMutation.mutate(selectedAnnouncement.id)
              }
              disabled={deleteMutation.isPending}
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
