import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ServiceRequestPriority } from "../../../../backend/src/types";

// ============================================
// Types
// ============================================

interface UnitOption {
  id: string;
  unitLabel: string;
  propertyName: string;
  buildingName?: string;
}

interface TenantOption {
  id: string;
  name: string;
  email: string;
  units: UnitOption[];
}

interface ServiceRequestOptions {
  tenants: TenantOption[];
  units: UnitOption[];
}

interface TenancyWithDetails {
  id: string;
  userId: string;
  unitId: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  user: {
    id: string;
    name: string;
    email: string;
  };
  unit: {
    id: string;
    unitLabel: string;
    buildingName: string;
  };
}

interface Property {
  id: string;
  name: string;
  address: string;
}

type ActiveTab = "maintenance" | "move-out" | "showing";

interface UnifiedCreateRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: ActiveTab;
}

// ============================================
// Main Component
// ============================================

export function UnifiedCreateRequestDialog({
  open,
  onOpenChange,
  activeTab,
}: UnifiedCreateRequestDialogProps) {
  const queryClient = useQueryClient();

  // ============================================
  // Maintenance Form State
  // ============================================
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<ServiceRequestPriority>("NORMAL");
  const [unitId, setUnitId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [unitSearch, setUnitSearch] = useState("");

  // ============================================
  // Move-Out Form State
  // ============================================
  const [selectedTenancyId, setSelectedTenancyId] = useState("");
  const [moveOutDate, setMoveOutDate] = useState("");
  const [moveOutNotes, setMoveOutNotes] = useState("");
  const [tenancySearch, setTenancySearch] = useState("");

  // ============================================
  // Showing Form State
  // ============================================
  const [prospectName, setProspectName] = useState("");
  const [prospectEmail, setProspectEmail] = useState("");
  const [prospectPhone, setProspectPhone] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredUnit, setPreferredUnit] = useState("");
  const [showingMessage, setShowingMessage] = useState("");

  // ============================================
  // Queries
  // ============================================

  // Fetch service request options (tenants and units) for maintenance form
  const { data: options } = useQuery({
    queryKey: ["admin", "service-request-options"],
    queryFn: () => api.get<ServiceRequestOptions>("/api/admin/service-requests/options"),
    enabled: open && activeTab === "maintenance",
  });

  // Fetch active tenancies for move-out form
  const { data: tenancies } = useQuery({
    queryKey: ["admin", "tenancies", "active"],
    queryFn: () => api.get<TenancyWithDetails[]>("/api/admin/tenancies?active=true"),
    enabled: open && activeTab === "move-out",
  });

  // Fetch properties for showing form
  const { data: properties } = useQuery({
    queryKey: ["admin", "properties"],
    queryFn: () => api.get<Property[]>("/api/admin/properties"),
    enabled: open && activeTab === "showing",
  });

  // ============================================
  // Mutations
  // ============================================

  // Create service request mutation
  const createMaintenanceMutation = useMutation({
    mutationFn: (data: {
      title: string;
      description: string;
      priority: ServiceRequestPriority;
      unitId: string;
      tenantId?: string;
    }) => api.post("/api/admin/service-requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "service-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      toast.success("Maintenance request created");
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create request");
    },
  });

  // Create move-out request mutation
  const createMoveOutMutation = useMutation({
    mutationFn: (data: {
      tenancyId: string;
      requestedDate: string;
      adminMessage?: string;
    }) => api.post("/api/admin/move-out-requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "move-out-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      toast.success("Move-out request created");
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create move-out request");
    },
  });

  // Create showing request mutation
  const createShowingMutation = useMutation({
    mutationFn: (data: {
      propertyId: string;
      name: string;
      email: string;
      phone?: string;
      message?: string;
      preferredDate?: string;
      preferredUnit?: string;
    }) => api.post("/api/admin/showing-requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "showing-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      toast.success("Showing request created");
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create showing request");
    },
  });

  // ============================================
  // Handlers
  // ============================================

  const resetForm = () => {
    // Maintenance
    setTitle("");
    setDescription("");
    setPriority("NORMAL");
    setUnitId("");
    setTenantId("");
    setUnitSearch("");
    // Move-Out
    setSelectedTenancyId("");
    setMoveOutDate("");
    setMoveOutNotes("");
    setTenancySearch("");
    // Showing
    setProspectName("");
    setProspectEmail("");
    setProspectPhone("");
    setPreferredDate("");
    setPreferredUnit("");
    setShowingMessage("");
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  // Reset form when tab changes or dialog opens
  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open, activeTab]);

  const handleSubmitMaintenance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !unitId) {
      toast.error("Please fill in all required fields");
      return;
    }
    createMaintenanceMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      priority,
      unitId,
      tenantId: tenantId || undefined,
    });
  };

  const handleSubmitMoveOut = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenancyId || !moveOutDate) {
      toast.error("Please select a tenant and move-out date");
      return;
    }
    createMoveOutMutation.mutate({
      tenancyId: selectedTenancyId,
      requestedDate: moveOutDate,
      adminMessage: moveOutNotes.trim() || undefined,
    });
  };

  const handleSubmitShowing = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prospectName.trim() || !prospectEmail.trim()) {
      toast.error("Please fill in name and email");
      return;
    }
    // Use the first property if available
    const propertyId = properties?.[0]?.id;
    if (!propertyId) {
      toast.error("No property available");
      return;
    }
    createShowingMutation.mutate({
      propertyId,
      name: prospectName.trim(),
      email: prospectEmail.trim(),
      phone: prospectPhone.trim() || undefined,
      message: showingMessage.trim() || undefined,
      preferredDate: preferredDate || undefined,
      preferredUnit: preferredUnit.trim() || undefined,
    });
  };

  // ============================================
  // Computed Values
  // ============================================

  // Filter units based on search for maintenance form
  const filteredUnits = options?.units?.filter((unit) =>
    unit.unitLabel.toLowerCase().includes(unitSearch.toLowerCase()) ||
    (unit.buildingName?.toLowerCase() || "").includes(unitSearch.toLowerCase())
  );

  // Get tenants for selected unit
  const availableTenants = options?.tenants?.filter((tenant) =>
    tenant.units.some((u) => u.id === unitId)
  ) || [];

  // Filter tenancies based on search for move-out form
  const filteredTenancies = tenancies?.filter((tenancy) =>
    tenancy.user.name.toLowerCase().includes(tenancySearch.toLowerCase()) ||
    tenancy.user.email.toLowerCase().includes(tenancySearch.toLowerCase()) ||
    tenancy.unit.unitLabel.toLowerCase().includes(tenancySearch.toLowerCase())
  );

  // ============================================
  // Dialog Title and Description
  // ============================================

  const getDialogTitle = () => {
    switch (activeTab) {
      case "maintenance":
        return "Create Maintenance Request";
      case "move-out":
        return "Create Move-Out Request";
      case "showing":
        return "Create Showing Request";
    }
  };

  const getDialogDescription = () => {
    switch (activeTab) {
      case "maintenance":
        return "Create a new maintenance request on behalf of a tenant.";
      case "move-out":
        return "Schedule a move-out for an existing tenant.";
      case "showing":
        return "Record a showing request from a prospective tenant.";
    }
  };

  const isPending = createMaintenanceMutation.isPending ||
    createMoveOutMutation.isPending ||
    createShowingMutation.isPending;

  // ============================================
  // Render
  // ============================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="font-serif">{getDialogTitle()}</DialogTitle>
          <DialogDescription>{getDialogDescription()}</DialogDescription>
        </DialogHeader>

        {/* Maintenance Form */}
        {activeTab === "maintenance" && (
          <form onSubmit={handleSubmitMaintenance} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="Brief description of the issue"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                placeholder="Detailed description of the problem..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as ServiceRequestPriority)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">Unit *</Label>
              <Select value={unitId} onValueChange={(v) => { setUnitId(v); setTenantId(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1">
                    <Input
                      placeholder="Search units..."
                      value={unitSearch}
                      onChange={(e) => setUnitSearch(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  {filteredUnits?.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.buildingName ? `${unit.buildingName} - ${unit.unitLabel}` : unit.unitLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {unitId && availableTenants.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="tenant">Tenant (optional)</Label>
                <Select value={tenantId} onValueChange={setTenantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tenant (or leave as Admin)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Created by Admin</SelectItem>
                    {availableTenants.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Leave empty to create the request as Admin
                </p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating..." : "Create Request"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* Move-Out Form */}
        {activeTab === "move-out" && (
          <form onSubmit={handleSubmitMoveOut} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tenancy">Tenant *</Label>
              <Select value={selectedTenancyId} onValueChange={setSelectedTenancyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select tenant" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1">
                    <Input
                      placeholder="Search tenants..."
                      value={tenancySearch}
                      onChange={(e) => setTenancySearch(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  {filteredTenancies?.map((tenancy) => (
                    <SelectItem key={tenancy.id} value={tenancy.id}>
                      {tenancy.user.name} - {tenancy.unit.buildingName ? `${tenancy.unit.buildingName} ` : ""}{tenancy.unit.unitLabel}
                    </SelectItem>
                  ))}
                  {filteredTenancies?.length === 0 && (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      No active tenants found
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="moveOutDate">Requested Move-Out Date *</Label>
              <Input
                id="moveOutDate"
                type="date"
                value={moveOutDate}
                onChange={(e) => setMoveOutDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="moveOutNotes">Notes (optional)</Label>
              <Textarea
                id="moveOutNotes"
                placeholder="Add any notes about this move-out..."
                value={moveOutNotes}
                onChange={(e) => setMoveOutNotes(e.target.value)}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating..." : "Create Request"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* Showing Form */}
        {activeTab === "showing" && (
          <form onSubmit={handleSubmitShowing} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prospectName">Prospective Tenant Name *</Label>
              <Input
                id="prospectName"
                placeholder="Full name"
                value={prospectName}
                onChange={(e) => setProspectName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prospectEmail">Email *</Label>
              <Input
                id="prospectEmail"
                type="email"
                placeholder="email@example.com"
                value={prospectEmail}
                onChange={(e) => setProspectEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prospectPhone">Phone (optional)</Label>
              <Input
                id="prospectPhone"
                type="tel"
                placeholder="Phone number"
                value={prospectPhone}
                onChange={(e) => setProspectPhone(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="preferredDate">Preferred Date/Time (optional)</Label>
              <Input
                id="preferredDate"
                type="datetime-local"
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="preferredUnit">Preferred Unit (optional)</Label>
              <Input
                id="preferredUnit"
                placeholder="e.g., 2BR, Unit 101"
                value={preferredUnit}
                onChange={(e) => setPreferredUnit(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="showingMessage">Notes (optional)</Label>
              <Textarea
                id="showingMessage"
                placeholder="Add any notes about this showing request..."
                value={showingMessage}
                onChange={(e) => setShowingMessage(e.target.value)}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating..." : "Create Request"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
