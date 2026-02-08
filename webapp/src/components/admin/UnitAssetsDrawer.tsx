import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  FileText,
  Link as LinkIcon,
  Upload,
  ExternalLink,
  Download,
  X,
  Wrench,
  Package,
  ArrowLeft,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  UnitAsset,
  UnitAssetsSummary,
  CreateUnitAsset,
  CreateUnitAssetLink,
  UnitAssetCategory,
  ServiceInterval,
} from "../../../../backend/src/types";

interface UnitAssetsDrawerProps {
  unitId: string;
  unitLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ViewMode = "list" | "add" | "edit";

const CATEGORIES: { value: UnitAssetCategory; label: string }[] = [
  { value: "APPLIANCE", label: "Appliance" },
  { value: "HVAC", label: "HVAC" },
  { value: "PLUMBING", label: "Plumbing" },
  { value: "ELECTRICAL", label: "Electrical" },
  { value: "SMART_HOME", label: "Smart Home" },
  { value: "OTHER", label: "Other" },
];

const SERVICE_INTERVALS: { value: ServiceInterval; label: string }[] = [
  { value: "3_MONTHS", label: "Every 3 months" },
  { value: "6_MONTHS", label: "Every 6 months" },
  { value: "ANNUALLY", label: "Annually" },
  { value: "OTHER", label: "Other" },
];

interface FormData {
  name: string;
  category: UnitAssetCategory;
  brand: string;
  modelNumber: string;
  serialNumber: string;
  location: string;
  installDate: string;
  warrantyExpirationDate: string;
  lastServiceDate: string;
  serviceInterval: ServiceInterval | null;
  serviceNotes: string;
  serviceProviderContact: string;
  notes: string;
}

const defaultFormData: FormData = {
  name: "",
  category: "APPLIANCE",
  brand: "",
  modelNumber: "",
  serialNumber: "",
  location: "",
  installDate: "",
  warrantyExpirationDate: "",
  lastServiceDate: "",
  serviceInterval: null,
  serviceNotes: "",
  serviceProviderContact: "",
  notes: "",
};

function getWarrantyBadgeColor(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-200";
    case "EXPIRING_SOON":
      return "bg-amber-500/10 text-amber-700 border-amber-200";
    case "EXPIRED":
      return "bg-red-500/10 text-red-700 border-red-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getServiceBadgeColor(status: string): string {
  switch (status) {
    case "OK":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-200";
    case "DUE_SOON":
      return "bg-amber-500/10 text-amber-700 border-amber-200";
    case "OVERDUE":
      return "bg-red-500/10 text-red-700 border-red-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getWarrantyLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "EXPIRING_SOON":
      return "Expiring Soon";
    case "EXPIRED":
      return "Expired";
    default:
      return status;
  }
}

function getServiceLabel(status: string): string {
  switch (status) {
    case "OK":
      return "OK";
    case "DUE_SOON":
      return "Due Soon";
    case "OVERDUE":
      return "Overdue";
    default:
      return status;
  }
}

function getCategoryLabel(category: string): string {
  const found = CATEGORIES.find((c) => c.value === category);
  return found?.label || category;
}

function formatDate(dateString: string | null) {
  if (!dateString) return null;
  return new Date(dateString).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatServiceInterval(interval: string | null): string {
  if (!interval) return "";
  const found = SERVICE_INTERVALS.find((i) => i.value === interval);
  return found?.label || interval;
}

function TruncatedText({ text, maxLength = 20 }: { text: string; maxLength?: number }) {
  if (text.length <= maxLength) {
    return <span>{text}</span>;
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">{text.slice(0, maxLength)}...</span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs break-all">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface AssetCardProps {
  asset: UnitAsset;
  onEdit: () => void;
  onDelete: () => void;
  onUploadFile: () => void;
  onAddLink: () => void;
  onDeleteFile: (fileId: string) => void;
  onDeleteLink: (linkId: string) => void;
}

function AssetCard({
  asset,
  onEdit,
  onDelete,
  onUploadFile,
  onAddLink,
  onDeleteFile,
  onDeleteLink,
}: AssetCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasDetails = asset.files.length > 0 || asset.links.length > 0 || asset.serviceNotes || asset.notes;

  return (
    <div className="border rounded-xl p-4 bg-card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-foreground">{asset.name}</h4>
            <Badge variant="outline" className="text-xs font-normal">
              {getCategoryLabel(asset.category)}
            </Badge>
          </div>

          {(asset.brand || asset.modelNumber || asset.serialNumber) && (
            <div className="text-sm text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
              {asset.brand && <span className="font-medium">{asset.brand}</span>}
              {asset.modelNumber && (
                <span>Model: <TruncatedText text={asset.modelNumber} /></span>
              )}
              {asset.serialNumber && (
                <span>S/N: <TruncatedText text={asset.serialNumber} /></span>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {asset.warrantyStatus !== "UNKNOWN" && (
              <Badge variant="outline" className={cn("text-xs", getWarrantyBadgeColor(asset.warrantyStatus))}>
                Warranty: {getWarrantyLabel(asset.warrantyStatus)}
              </Badge>
            )}
            {asset.serviceStatus !== "UNKNOWN" && (
              <Badge variant="outline" className={cn("text-xs", getServiceBadgeColor(asset.serviceStatus))}>
                Service: {getServiceLabel(asset.serviceStatus)}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {hasDetails ? (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full mt-3 text-muted-foreground hover:text-foreground">
              <ChevronDown className={cn("h-4 w-4 mr-2 transition-transform", isExpanded && "rotate-180")} />
              {isExpanded ? "Hide Details" : "Show Details"}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 space-y-4">
            {/* Manuals/Files Section */}
            {(asset.files.length > 0 || asset.links.length > 0) && (
              <div className="bg-muted/50 rounded-lg p-3">
                <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Manuals & Links
                </h5>
                <div className="space-y-2">
                  {asset.files.map((file) => (
                    <div key={file.id} className="flex items-center justify-between gap-2 text-sm p-2 bg-background rounded-md border">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{file.filename}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => window.open(`${import.meta.env.VITE_BACKEND_URL}/api/uploads/unit-assets/${file.storageKey}`, "_blank")}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => onDeleteFile(file.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {asset.links.map((link) => (
                    <div key={link.id} className="flex items-center justify-between gap-2 text-sm p-2 bg-background rounded-md border">
                      <div className="flex items-center gap-2 min-w-0">
                        <LinkIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{link.label}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => window.open(link.url, "_blank")}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => onDeleteLink(link.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Service Details */}
            {(asset.lastServiceDate || asset.serviceInterval || asset.serviceProviderContact || asset.serviceNotes) && (
              <div className="bg-muted/50 rounded-lg p-3">
                <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-primary" />
                  Service Details
                </h5>
                <div className="text-sm space-y-1.5 text-muted-foreground">
                  {asset.lastServiceDate && <p>Last Service: {formatDate(asset.lastServiceDate)}</p>}
                  {asset.serviceInterval && <p>Service Interval: {formatServiceInterval(asset.serviceInterval)}</p>}
                  {asset.serviceProviderContact && <p>Provider: {asset.serviceProviderContact}</p>}
                  {asset.serviceNotes && <p className="whitespace-pre-wrap mt-2 text-foreground/80">{asset.serviceNotes}</p>}
                </div>
              </div>
            )}

            {/* Notes */}
            {asset.notes && (
              <div className="bg-muted/50 rounded-lg p-3">
                <h5 className="text-sm font-medium mb-2">Notes</h5>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{asset.notes}</p>
              </div>
            )}

            {/* Add File/Link Buttons */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={onUploadFile} className="flex-1">
                <Upload className="h-4 w-4 mr-2" />
                Upload Manual
              </Button>
              <Button variant="outline" size="sm" onClick={onAddLink} className="flex-1">
                <LinkIcon className="h-4 w-4 mr-2" />
                Add Link
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <div className="flex gap-2 pt-3 mt-3 border-t">
          <Button variant="outline" size="sm" onClick={onUploadFile} className="flex-1">
            <Upload className="h-4 w-4 mr-2" />
            Upload Manual
          </Button>
          <Button variant="outline" size="sm" onClick={onAddLink} className="flex-1">
            <LinkIcon className="h-4 w-4 mr-2" />
            Add Link
          </Button>
        </div>
      )}
    </div>
  );
}

// Custom select component using native select to avoid Radix portal issues
function NativeSelect({
  value,
  onValueChange,
  options,
  placeholder,
  id,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  id?: string;
  className?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function UnitAssetsDrawer({ unitId, unitLabel, open, onOpenChange }: UnitAssetsDrawerProps) {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingAsset, setEditingAsset] = useState<UnitAsset | null>(null);
  const [formData, setFormData] = useState<FormData>(defaultFormData);
  const [deletingAsset, setDeletingAsset] = useState<UnitAsset | null>(null);
  const [uploadingAssetId, setUploadingAssetId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [addingLinkAssetId, setAddingLinkAssetId] = useState<string | null>(null);
  const [newLink, setNewLink] = useState({ label: "", url: "" });
  const [deletingFile, setDeletingFile] = useState<{ assetId: string; fileId: string } | null>(null);
  const [deletingLink, setDeletingLink] = useState<{ assetId: string; linkId: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset view when drawer closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setViewMode("list");
      setEditingAsset(null);
      setFormData(defaultFormData);
    }
    onOpenChange(isOpen);
  };

  // Fetch assets
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["admin", "unit-assets", unitId],
    queryFn: () => api.get<UnitAsset[]>(`/api/admin/units/${unitId}/assets`),
    enabled: open,
  });

  // Calculate summary from assets
  const summary: UnitAssetsSummary = {
    totalAssets: assets.length,
    totalManuals: assets.reduce((acc, a) => acc + a.files.length + a.links.length, 0),
    warrantyExpiring: assets.filter(a => a.warrantyStatus === "EXPIRING_SOON").length,
    warrantyExpired: assets.filter(a => a.warrantyStatus === "EXPIRED").length,
    serviceOverdue: assets.filter(a => a.serviceStatus === "OVERDUE").length,
    serviceDueSoon: assets.filter(a => a.serviceStatus === "DUE_SOON").length,
    hasIssues: assets.some(a => a.warrantyStatus === "EXPIRED" || a.serviceStatus === "OVERDUE"),
  };

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateUnitAsset) => api.post<UnitAsset>(`/api/admin/units/${unitId}/assets`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "unit-assets", unitId] });
      setViewMode("list");
      setFormData(defaultFormData);
      toast.success("Asset created successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create asset");
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: CreateUnitAsset) => api.put<UnitAsset>(`/api/admin/units/${unitId}/assets/${editingAsset?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "unit-assets", unitId] });
      setViewMode("list");
      setEditingAsset(null);
      setFormData(defaultFormData);
      toast.success("Asset updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update asset");
    },
  });

  // Delete asset mutation
  const deleteAssetMutation = useMutation({
    mutationFn: (assetId: string) => api.delete(`/api/admin/units/${unitId}/assets/${assetId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "unit-assets", unitId] });
      setDeletingAsset(null);
      toast.success("Asset deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete asset");
    },
  });

  // Upload file mutation
  const uploadFileMutation = useMutation({
    mutationFn: async ({ assetId, file }: { assetId: string; file: File }) => {
      const formDataObj = new FormData();
      formDataObj.append("file", file);
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/admin/units/${unitId}/assets/${assetId}/files`,
        {
          method: "POST",
          body: formDataObj,
          credentials: "include",
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Upload failed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "unit-assets", unitId] });
      setUploadingAssetId(null);
      setUploadFile(null);
      toast.success("File uploaded successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to upload file");
    },
  });

  // Add link mutation
  const addLinkMutation = useMutation({
    mutationFn: ({ assetId, data }: { assetId: string; data: CreateUnitAssetLink }) =>
      api.post(`/api/admin/units/${unitId}/assets/${assetId}/links`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "unit-assets", unitId] });
      setAddingLinkAssetId(null);
      setNewLink({ label: "", url: "" });
      toast.success("Link added successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add link");
    },
  });

  // Delete file mutation
  const deleteFileMutation = useMutation({
    mutationFn: ({ assetId, fileId }: { assetId: string; fileId: string }) =>
      api.delete(`/api/admin/units/${unitId}/assets/${assetId}/files/${fileId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "unit-assets", unitId] });
      setDeletingFile(null);
      toast.success("File deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete file");
    },
  });

  // Delete link mutation
  const deleteLinkMutation = useMutation({
    mutationFn: ({ assetId, linkId }: { assetId: string; linkId: string }) =>
      api.delete(`/api/admin/units/${unitId}/assets/${assetId}/links/${linkId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "unit-assets", unitId] });
      setDeletingLink(null);
      toast.success("Link deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete link");
    },
  });

  const handleAddAsset = () => {
    setEditingAsset(null);
    setFormData(defaultFormData);
    setViewMode("add");
  };

  const handleEditAsset = (asset: UnitAsset) => {
    setEditingAsset(asset);
    setFormData({
      name: asset.name,
      category: asset.category,
      brand: asset.brand || "",
      modelNumber: asset.modelNumber || "",
      serialNumber: asset.serialNumber || "",
      location: asset.location || "",
      installDate: asset.installDate ? asset.installDate.split("T")[0] : "",
      warrantyExpirationDate: asset.warrantyExpirationDate ? asset.warrantyExpirationDate.split("T")[0] : "",
      lastServiceDate: asset.lastServiceDate ? asset.lastServiceDate.split("T")[0] : "",
      serviceInterval: asset.serviceInterval as ServiceInterval | null,
      serviceNotes: asset.serviceNotes || "",
      serviceProviderContact: asset.serviceProviderContact || "",
      notes: asset.notes || "",
    });
    setViewMode("edit");
  };

  const handleBackToList = () => {
    setViewMode("list");
    setEditingAsset(null);
    setFormData(defaultFormData);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: CreateUnitAsset = {
      name: formData.name,
      category: formData.category,
      brand: formData.brand || undefined,
      modelNumber: formData.modelNumber || undefined,
      serialNumber: formData.serialNumber || undefined,
      location: formData.location || undefined,
      installDate: formData.installDate || undefined,
      warrantyExpirationDate: formData.warrantyExpirationDate || undefined,
      lastServiceDate: formData.lastServiceDate || undefined,
      serviceInterval: formData.serviceInterval || undefined,
      serviceNotes: formData.serviceNotes || undefined,
      serviceProviderContact: formData.serviceProviderContact || undefined,
      notes: formData.notes || undefined,
    };

    if (viewMode === "edit") {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleUploadSubmit = () => {
    if (!uploadingAssetId || !uploadFile) return;
    uploadFileMutation.mutate({ assetId: uploadingAssetId, file: uploadFile });
  };

  const handleAddLinkSubmit = () => {
    if (!addingLinkAssetId || !newLink.label || !newLink.url) return;
    addLinkMutation.mutate({ assetId: addingLinkAssetId, data: newLink });
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {viewMode === "list" ? (
            <>
              <SheetHeader className="pb-4 border-b">
                <SheetTitle className="text-xl">Unit Assets</SheetTitle>
                <SheetDescription className="text-base font-medium text-foreground/80">
                  {unitLabel}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-primary">{summary.totalAssets}</div>
                    <div className="text-xs text-muted-foreground">Total Assets</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-primary">{summary.totalManuals}</div>
                    <div className="text-xs text-muted-foreground">Manuals/Links</div>
                  </div>
                </div>

                {/* Alerts */}
                {summary.hasIssues && (
                  <div className="bg-amber-500/10 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      {summary.warrantyExpired > 0 && (
                        <p className="text-amber-800">{summary.warrantyExpired} warranty expired</p>
                      )}
                      {summary.serviceOverdue > 0 && (
                        <p className="text-amber-800">{summary.serviceOverdue} service overdue</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Add Asset Button */}
                <Button onClick={handleAddAsset} className="w-full" size="lg">
                  <Plus className="h-5 w-5 mr-2" />
                  Add Asset
                </Button>

                {/* Asset List */}
                {isLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-32 w-full rounded-xl" />
                    ))}
                  </div>
                ) : assets.length > 0 ? (
                  <div className="space-y-4">
                    {assets.map((asset) => (
                      <AssetCard
                        key={asset.id}
                        asset={asset}
                        onEdit={() => handleEditAsset(asset)}
                        onDelete={() => setDeletingAsset(asset)}
                        onUploadFile={() => setUploadingAssetId(asset.id)}
                        onAddLink={() => setAddingLinkAssetId(asset.id)}
                        onDeleteFile={(fileId) => setDeletingFile({ assetId: asset.id, fileId })}
                        onDeleteLink={(linkId) => setDeletingLink({ assetId: asset.id, linkId })}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-muted/30 rounded-xl border border-dashed">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground/50" />
                    <h3 className="mt-4 text-lg font-semibold">No assets yet</h3>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Add appliances and manuals for tenants to access
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Add/Edit Form View */}
              <SheetHeader className="pb-4 border-b">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" onClick={handleBackToList} className="h-8 w-8 -ml-2">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div>
                    <SheetTitle className="text-xl">
                      {viewMode === "edit" ? "Edit Asset" : "Add New Asset"}
                    </SheetTitle>
                    <SheetDescription>
                      {viewMode === "edit" ? "Update the asset details below" : "Fill in the details for the new asset"}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <form onSubmit={handleFormSubmit} className="mt-6 space-y-6">
                {/* Basic Info */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Basic Information</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label htmlFor="name">Asset Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Refrigerator, Furnace, Thermostat"
                        required
                        className="mt-1.5"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="category">Category *</Label>
                        <NativeSelect
                          id="category"
                          value={formData.category}
                          onValueChange={(value) => setFormData({ ...formData, category: value as UnitAssetCategory })}
                          options={CATEGORIES}
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="location">Location</Label>
                        <Input
                          id="location"
                          value={formData.location}
                          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                          placeholder="e.g., Kitchen, Basement"
                          className="mt-1.5"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Product Details */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Product Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="brand">Brand</Label>
                      <Input
                        id="brand"
                        value={formData.brand}
                        onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                        placeholder="e.g., Samsung, Carrier"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="modelNumber">Model Number</Label>
                      <Input
                        id="modelNumber"
                        value={formData.modelNumber}
                        onChange={(e) => setFormData({ ...formData, modelNumber: e.target.value })}
                        placeholder="Model #"
                        className="mt-1.5"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="serialNumber">Serial Number</Label>
                      <Input
                        id="serialNumber"
                        value={formData.serialNumber}
                        onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                        placeholder="Serial #"
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                </div>

                {/* Dates */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Important Dates
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="installDate">Install Date</Label>
                      <Input
                        id="installDate"
                        type="date"
                        value={formData.installDate}
                        onChange={(e) => setFormData({ ...formData, installDate: e.target.value })}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="warrantyExpirationDate">Warranty Expiration</Label>
                      <Input
                        id="warrantyExpirationDate"
                        type="date"
                        value={formData.warrantyExpirationDate}
                        onChange={(e) => setFormData({ ...formData, warrantyExpirationDate: e.target.value })}
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                </div>

                {/* Service Info */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    Service Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="lastServiceDate">Last Service Date</Label>
                      <Input
                        id="lastServiceDate"
                        type="date"
                        value={formData.lastServiceDate}
                        onChange={(e) => setFormData({ ...formData, lastServiceDate: e.target.value })}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="serviceInterval">Service Interval</Label>
                      <NativeSelect
                        id="serviceInterval"
                        value={formData.serviceInterval || ""}
                        onValueChange={(value) => setFormData({ ...formData, serviceInterval: value ? value as ServiceInterval : null })}
                        options={SERVICE_INTERVALS}
                        placeholder="No scheduled service"
                        className="mt-1.5"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="serviceProviderContact">Service Provider/Contact</Label>
                      <Input
                        id="serviceProviderContact"
                        value={formData.serviceProviderContact}
                        onChange={(e) => setFormData({ ...formData, serviceProviderContact: e.target.value })}
                        placeholder="Provider name, phone, or email"
                        className="mt-1.5"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="serviceNotes">Service Notes</Label>
                      <Textarea
                        id="serviceNotes"
                        value={formData.serviceNotes}
                        onChange={(e) => setFormData({ ...formData, serviceNotes: e.target.value })}
                        placeholder="Service history, maintenance notes..."
                        rows={2}
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                </div>

                {/* General Notes */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Additional Notes</h3>
                  <div>
                    <Label htmlFor="notes">Notes for Tenants</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Additional notes, instructions, tips for tenants..."
                      rows={3}
                      className="mt-1.5"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={handleBackToList} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isPending || !formData.name} className="flex-1">
                    {isPending ? (viewMode === "edit" ? "Saving..." : "Creating...") : (viewMode === "edit" ? "Save Changes" : "Create Asset")}
                  </Button>
                </div>
              </form>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Asset Confirmation */}
      <AlertDialog open={!!deletingAsset} onOpenChange={() => setDeletingAsset(null)}>
        <AlertDialogContent className="z-[200]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Asset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingAsset?.name}"? This will also delete all
              associated files and links. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingAsset && deleteAssetMutation.mutate(deletingAsset.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAssetMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upload File Dialog */}
      <AlertDialog open={!!uploadingAssetId} onOpenChange={() => { setUploadingAssetId(null); setUploadFile(null); }}>
        <AlertDialogContent className="z-[200]">
          <AlertDialogHeader>
            <AlertDialogTitle>Upload Document</AlertDialogTitle>
            <AlertDialogDescription>
              Upload a manual, warranty document, or other PDF/image file
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                uploadFile ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              {uploadFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">{uploadFile.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => { e.stopPropagation(); setUploadFile(null); }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Click to select a file
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, JPG, PNG (max 25MB)
                  </p>
                </>
              )}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUploadFile(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUploadSubmit} disabled={!uploadFile || uploadFileMutation.isPending}>
              {uploadFileMutation.isPending ? "Uploading..." : "Upload"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Link Dialog */}
      <AlertDialog open={!!addingLinkAssetId} onOpenChange={() => { setAddingLinkAssetId(null); setNewLink({ label: "", url: "" }); }}>
        <AlertDialogContent className="z-[200]">
          <AlertDialogHeader>
            <AlertDialogTitle>Add External Link</AlertDialogTitle>
            <AlertDialogDescription>
              Add a link to an online manual, product page, or resource
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="linkLabel">Link Label *</Label>
              <Input
                id="linkLabel"
                value={newLink.label}
                onChange={(e) => setNewLink({ ...newLink, label: e.target.value })}
                placeholder="e.g., Product Manual, Support Page"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="linkUrl">URL *</Label>
              <Input
                id="linkUrl"
                type="url"
                value={newLink.url}
                onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                placeholder="https://..."
                className="mt-1.5"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setNewLink({ label: "", url: "" })}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAddLinkSubmit}
              disabled={!newLink.label || !newLink.url || addLinkMutation.isPending}
            >
              {addLinkMutation.isPending ? "Adding..." : "Add Link"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete File Confirmation */}
      <AlertDialog open={!!deletingFile} onOpenChange={() => setDeletingFile(null)}>
        <AlertDialogContent className="z-[200]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this file? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingFile && deleteFileMutation.mutate(deletingFile)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFileMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Link Confirmation */}
      <AlertDialog open={!!deletingLink} onOpenChange={() => setDeletingLink(null)}>
        <AlertDialogContent className="z-[200]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Link</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this link? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingLink && deleteLinkMutation.mutate(deletingLink)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLinkMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
