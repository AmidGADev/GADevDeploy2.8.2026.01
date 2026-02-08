import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, MoreHorizontal, Pencil, UserPlus, Trash2, Building2, Users, Eye, Package, Check, ChevronsUpDown, FileText, Search, DollarSign, Home, TrendingUp } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Unit, CreateUnit, UpdateUnit, RoleInUnit } from "../../../../backend/src/types";
import { UnitAssetsDrawer } from "@/components/admin/UnitAssetsDrawer";
import { RentRollModal } from "@/components/admin/RentRollModal";

interface TenantInfo {
  id: string;
  name: string;
  email: string;
  roleInUnit: RoleInUnit;
}

interface UnitWithTenants extends Unit {
  tenants?: TenantInfo[];
}

function formatCurrency(cents: number | null) {
  if (cents === null) return "Not set";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

/**
 * Format a day number as an ordinal (1st, 2nd, 3rd, etc.)
 */
function formatOrdinal(day: number): string {
  const suffix = ["th", "st", "nd", "rd"];
  const v = day % 100;
  return day + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
}

// Generate array of days 1-31
const RENT_DUE_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

interface UnitFormData {
  buildingName: string;
  unitLabel: string;
  rentAmountDollars: string;
  rentDueDay: string;
  bedrooms: string;
  bathrooms: string;
  sqft: string;
  description: string;
}

const defaultFormData: UnitFormData = {
  buildingName: "",
  unitLabel: "",
  rentAmountDollars: "",
  rentDueDay: "1",
  bedrooms: "",
  bathrooms: "",
  sqft: "",
  description: "",
};

export default function UnitsPage() {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isTenantsSheetOpen, setIsTenantsSheetOpen] = useState(false);
  const [isAssetsDrawerOpen, setIsAssetsDrawerOpen] = useState(false);
  const [isRentRollModalOpen, setIsRentRollModalOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<UnitWithTenants | null>(null);
  const [formData, setFormData] = useState<UnitFormData>(defaultFormData);
  const [buildingPopoverOpen, setBuildingPopoverOpen] = useState(false);
  const [buildingSearch, setBuildingSearch] = useState("");

  // Filtering state
  const [selectedBuildingFilter, setSelectedBuildingFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch units
  const { data: units, isLoading } = useQuery({
    queryKey: ["admin", "units"],
    queryFn: () => api.get<UnitWithTenants[]>("/api/admin/units"),
  });

  // Fetch building names for dropdown
  const { data: buildingNames } = useQuery({
    queryKey: ["admin", "buildings"],
    queryFn: () => api.get<string[]>("/api/admin/units/buildings"),
  });

  // Filter and sort units
  const filteredAndSortedUnits = useMemo(() => {
    if (!units) return undefined;

    let filtered = [...units];

    // Apply building filter
    if (selectedBuildingFilter !== "all") {
      filtered = filtered.filter(unit => unit.buildingName === selectedBuildingFilter);
    }

    // Apply search filter (search by unit label or tenant name/email)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(unit => {
        const unitMatch = unit.unitLabel.toLowerCase().includes(query) ||
                         unit.buildingName.toLowerCase().includes(query);
        const tenantMatch = unit.tenants?.some(t =>
          t.name.toLowerCase().includes(query) ||
          t.email.toLowerCase().includes(query)
        );
        return unitMatch || tenantMatch;
      });
    }

    // Default sort by building name (ascending), then by unit label
    filtered.sort((a, b) => {
      const buildingCompare = a.buildingName.localeCompare(b.buildingName);
      if (buildingCompare !== 0) return buildingCompare;
      return a.unitLabel.localeCompare(b.unitLabel, undefined, { numeric: true });
    });

    return filtered;
  }, [units, selectedBuildingFilter, searchQuery]);

  // Calculate stats for filtered units
  const stats = useMemo(() => {
    const unitsToCount = filteredAndSortedUnits || [];
    const totalUnits = unitsToCount.length;
    const occupiedUnits = unitsToCount.filter(u => u.status === "OCCUPIED").length;
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
    const monthlyRevenue = unitsToCount.reduce((sum, unit) => {
      return sum + (unit.rentAmountCents || 0);
    }, 0);

    return { totalUnits, occupiedUnits, occupancyRate, monthlyRevenue };
  }, [filteredAndSortedUnits]);

  // Create unit mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateUnit) => api.post<Unit>("/api/admin/units", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "units"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      setIsAddDialogOpen(false);
      setFormData(defaultFormData);
      toast.success("Unit created successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create unit");
    },
  });

  // Update unit mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUnit }) =>
      api.put<Unit>(`/api/admin/units/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "units"] });
      setIsEditDialogOpen(false);
      setSelectedUnit(null);
      setFormData(defaultFormData);
      toast.success("Unit updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update unit");
    },
  });

  // Delete unit mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/units/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "units"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      setIsDeleteDialogOpen(false);
      setSelectedUnit(null);
      toast.success("Unit deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete unit");
    },
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Get property ID (we'll assume there's only one property for now)
    const propertyId = units?.[0]?.propertyId || "default";

    createMutation.mutate({
      propertyId,
      buildingName: formData.buildingName,
      unitLabel: formData.unitLabel,
      rentAmountCents: formData.rentAmountDollars ? Math.round(parseFloat(formData.rentAmountDollars) * 100) : undefined,
      rentDueDay: parseInt(formData.rentDueDay) || 1,
      bedrooms: formData.bedrooms ? parseInt(formData.bedrooms) : undefined,
      bathrooms: formData.bathrooms ? parseFloat(formData.bathrooms) : undefined,
      sqft: formData.sqft ? parseInt(formData.sqft) : undefined,
      description: formData.description || undefined,
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnit) return;

    updateMutation.mutate({
      id: selectedUnit.id,
      data: {
        buildingName: formData.buildingName,
        unitLabel: formData.unitLabel,
        rentAmountCents: formData.rentAmountDollars ? Math.round(parseFloat(formData.rentAmountDollars) * 100) : undefined,
        rentDueDay: parseInt(formData.rentDueDay) || 1,
        bedrooms: formData.bedrooms ? parseInt(formData.bedrooms) : undefined,
        bathrooms: formData.bathrooms ? parseFloat(formData.bathrooms) : undefined,
        sqft: formData.sqft ? parseInt(formData.sqft) : undefined,
        description: formData.description || undefined,
      },
    });
  };

  const openEditDialog = (unit: UnitWithTenants) => {
    setSelectedUnit(unit);
    setFormData({
      buildingName: unit.buildingName,
      unitLabel: unit.unitLabel,
      rentAmountDollars: unit.rentAmountCents ? (unit.rentAmountCents / 100).toString() : "",
      rentDueDay: unit.rentDueDay.toString(),
      bedrooms: unit.bedrooms?.toString() || "",
      bathrooms: unit.bathrooms?.toString() || "",
      sqft: unit.sqft?.toString() || "",
      description: unit.description || "",
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (unit: UnitWithTenants) => {
    setSelectedUnit(unit);
    setIsDeleteDialogOpen(true);
  };

  const openTenantsSheet = (unit: UnitWithTenants) => {
    setSelectedUnit(unit);
    setIsTenantsSheetOpen(true);
  };

  const openAssetsDrawer = (unit: UnitWithTenants) => {
    setSelectedUnit(unit);
    setIsAssetsDrawerOpen(true);
  };

  // Helper functions for tenant info
  const getPrimaryTenant = (unit: UnitWithTenants | null | undefined) => {
    return unit?.tenants?.find(t => t.roleInUnit === "PRIMARY") ?? null;
  };

  const getOccupants = (unit: UnitWithTenants | null | undefined) => {
    return unit?.tenants?.filter(t => t.roleInUnit === "OCCUPANT") ?? [];
  };

  const hasPrimaryTenant = (unit: UnitWithTenants | null | undefined) => {
    return getPrimaryTenant(unit) !== null;
  };

  const hasTenants = (unit: UnitWithTenants | null | undefined) => {
    return (unit?.tenants?.length ?? 0) > 0;
  };

  const navigateToInvite = (unitId: string, roleInUnit: RoleInUnit) => {
    window.location.href = `/admin/tenants?inviteUnit=${unitId}&role=${roleInUnit}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-medium">Units Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage property units and tenant assignments
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsRentRollModalOpen(true)}>
            <FileText className="h-4 w-4 mr-2" />
            Generate Rent Roll
          </Button>
          <Button size="sm" onClick={() => {
            setFormData(defaultFormData);
            setIsAddDialogOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Unit
          </Button>
        </div>
      </div>

      {/* Dynamic Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex items-center gap-4 px-5 py-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 border border-slate-200/60 dark:border-slate-700/50 rounded-xl">
          <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-slate-600/10 dark:bg-slate-400/10">
            <Home className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Units</p>
            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{stats.totalUnits}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 px-5 py-4 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 border border-emerald-200/60 dark:border-emerald-700/30 rounded-xl">
          <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-emerald-600/10 dark:bg-emerald-400/10">
            <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Occupancy Rate</p>
            <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-300">{stats.occupancyRate}%</p>
          </div>
        </div>

        <div className="flex items-center gap-4 px-5 py-4 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border border-blue-200/60 dark:border-blue-700/30 rounded-xl">
          <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-blue-600/10 dark:bg-blue-400/10">
            <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">Monthly Revenue</p>
            <p className="text-2xl font-semibold text-blue-700 dark:text-blue-300">{formatCurrency(stats.monthlyRevenue)}</p>
          </div>
        </div>
      </div>

      <Card className="rounded-lg border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="text-base font-medium">All Units</CardTitle>

            {/* Filtering Controls */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Building Filter */}
              <Select
                value={selectedBuildingFilter}
                onValueChange={setSelectedBuildingFilter}
              >
                <SelectTrigger className="w-full sm:w-[180px] h-9">
                  <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Filter by Building" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Buildings</SelectItem>
                  {buildingNames?.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search units or tenants..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 w-full sm:w-[220px]"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-9">Building</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-9">Unit</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-9">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-9">Tenants</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-9 text-right">Rent</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-9 text-right">Due Day</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-9 hidden md:table-cell">Details</TableHead>
                    <TableHead className="w-[40px] h-9"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...Array(6)].map((_, i) => (
                    <TableRow key={i} className="border-border/50">
                      <TableCell className="py-2.5"><Skeleton className="h-3 w-20" /></TableCell>
                      <TableCell className="py-2.5"><Skeleton className="h-3 w-12" /></TableCell>
                      <TableCell className="py-2.5"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      <TableCell className="py-2.5">
                        <div className="space-y-1">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5"><Skeleton className="h-3 w-16" /></TableCell>
                      <TableCell className="py-2.5"><Skeleton className="h-3 w-6" /></TableCell>
                      <TableCell className="py-2.5 hidden md:table-cell"><Skeleton className="h-3 w-28" /></TableCell>
                      <TableCell className="py-2.5"><Skeleton className="h-6 w-6 rounded" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : filteredAndSortedUnits && filteredAndSortedUnits.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-9">Building</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-9">Unit</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-9">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-9">Tenants</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-9 text-right">Rent</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-9 text-right">Due Day</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-9 hidden md:table-cell">Details</TableHead>
                    <TableHead className="w-[40px] h-9"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedUnits.map((unit, index) => {
                    const primaryTenant = getPrimaryTenant(unit);
                    const occupants = getOccupants(unit);
                    const occupantCount = occupants.length;

                    return (
                      <TableRow
                        key={unit.id}
                        className={cn(
                          "border-border/50",
                          index % 2 === 1 && "bg-muted/30"
                        )}
                      >
                        <TableCell className="py-2.5 text-sm font-medium">{unit.buildingName}</TableCell>
                        <TableCell className="py-2.5 text-sm font-medium">{unit.unitLabel}</TableCell>
                        <TableCell className="py-2.5">
                          {unit.status === "OCCUPIED" ? (
                            <span className="inline-flex items-center text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-300/50 dark:border-emerald-500/30">
                              Occupied
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-xs px-2.5 py-1 rounded-full font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-300/50 dark:border-amber-500/30">
                              Vacant
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5">
                          {primaryTenant ? (
                            <div className="flex items-center gap-2">
                              <div>
                                <p className="text-sm font-medium">{primaryTenant.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {primaryTenant.email}
                                </p>
                              </div>
                              {occupantCount > 0 ? (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                  +{occupantCount}
                                </span>
                              ) : null}
                            </div>
                          ) : hasTenants(unit) ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground italic">No primary</span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {unit.tenants?.length}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-sm font-mono text-right">{formatCurrency(unit.rentAmountCents)}</TableCell>
                        <TableCell className="py-2.5 text-sm text-right">{formatOrdinal(unit.rentDueDay)}</TableCell>
                        <TableCell className="py-2.5 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1.5">
                            {unit.bedrooms ? (
                              <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">
                                {unit.bedrooms} bed
                              </span>
                            ) : null}
                            {unit.bathrooms ? (
                              <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">
                                {unit.bathrooms} bath
                              </span>
                            ) : null}
                            {unit.sqft ? (
                              <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">
                                {unit.sqft} sqft
                              </span>
                            ) : null}
                            {!unit.bedrooms && !unit.bathrooms && !unit.sqft ? (
                              <span className="text-xs text-muted-foreground">-</span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditDialog(unit)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit Unit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openAssetsDrawer(unit)}>
                                <Package className="h-4 w-4 mr-2" />
                                Manage Unit Assets
                              </DropdownMenuItem>
                              {hasTenants(unit) ? (
                                <DropdownMenuItem onClick={() => openTenantsSheet(unit)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Tenants
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuSeparator />
                              {!hasPrimaryTenant(unit) ? (
                                <DropdownMenuItem onClick={() => navigateToInvite(unit.id, "PRIMARY")}>
                                  <UserPlus className="h-4 w-4 mr-2" />
                                  Invite Primary Tenant
                                </DropdownMenuItem>
                              ) : null}
                              {unit.status === "OCCUPIED" ? (
                                <DropdownMenuItem onClick={() => navigateToInvite(unit.id, "OCCUPANT")}>
                                  <Users className="h-4 w-4 mr-2" />
                                  Invite Occupant
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => openDeleteDialog(unit)}
                                className="text-destructive focus:text-destructive"
                                disabled={hasTenants(unit)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Unit
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (searchQuery || selectedBuildingFilter !== "all") ? (
            <div className="text-center py-10">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <h3 className="mt-3 text-base font-medium">No units match your filters</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your search or filter criteria
              </p>
            </div>
          ) : (
            <div className="border-2 border-dashed rounded-xl p-8 text-center bg-muted/10">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center mb-4 shadow-inner">
                <Building2 className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-base font-medium text-foreground mb-1">No Units Yet</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                Add your first property unit to get started managing your rentals
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Unit
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Unit Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Unit</DialogTitle>
            <DialogDescription>
              Create a new unit in your property
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="buildingName">Building *</Label>
                <Popover open={buildingPopoverOpen} onOpenChange={setBuildingPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={buildingPopoverOpen}
                      className="w-full justify-between"
                    >
                      {formData.buildingName || "Select or create building..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput
                        placeholder="Search or create building..."
                        value={buildingSearch}
                        onValueChange={setBuildingSearch}
                      />
                      <CommandList>
                        <CommandEmpty>
                          <Button
                            variant="ghost"
                            className="w-full justify-start"
                            onClick={() => {
                              setFormData({ ...formData, buildingName: buildingSearch });
                              setBuildingPopoverOpen(false);
                            }}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Create "{buildingSearch}"
                          </Button>
                        </CommandEmpty>
                        <CommandGroup>
                          {buildingNames?.map((name) => (
                            <CommandItem
                              key={name}
                              value={name}
                              onSelect={() => {
                                setFormData({ ...formData, buildingName: name });
                                setBuildingPopoverOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  formData.buildingName === name ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label htmlFor="unitLabel">Unit Number *</Label>
                <Input
                  id="unitLabel"
                  value={formData.unitLabel}
                  onChange={(e) =>
                    setFormData({ ...formData, unitLabel: e.target.value })
                  }
                  placeholder="e.g., A1, B2, Upper"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="rentAmount">Rent ($/month)</Label>
                  <Input
                    id="rentAmount"
                    type="number"
                    step="0.01"
                    value={formData.rentAmountDollars}
                    onChange={(e) =>
                      setFormData({ ...formData, rentAmountDollars: e.target.value })
                    }
                    placeholder="2000"
                  />
                </div>
                <div>
                  <Label htmlFor="rentDueDay">Rent Due Day</Label>
                  <Select
                    value={formData.rentDueDay}
                    onValueChange={(value) =>
                      setFormData({ ...formData, rentDueDay: value })
                    }
                  >
                    <SelectTrigger id="rentDueDay">
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {RENT_DUE_DAYS.map((day) => (
                        <SelectItem key={day} value={day.toString()}>
                          {formatOrdinal(day)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="bedrooms">Beds</Label>
                  <Input
                    id="bedrooms"
                    type="number"
                    value={formData.bedrooms}
                    onChange={(e) =>
                      setFormData({ ...formData, bedrooms: e.target.value })
                    }
                    placeholder="2"
                  />
                </div>
                <div>
                  <Label htmlFor="bathrooms">Baths</Label>
                  <Input
                    id="bathrooms"
                    type="number"
                    step="0.5"
                    value={formData.bathrooms}
                    onChange={(e) =>
                      setFormData({ ...formData, bathrooms: e.target.value })
                    }
                    placeholder="1"
                  />
                </div>
                <div>
                  <Label htmlFor="sqft">Sq Ft</Label>
                  <Input
                    id="sqft"
                    type="number"
                    value={formData.sqft}
                    onChange={(e) =>
                      setFormData({ ...formData, sqft: e.target.value })
                    }
                    placeholder="650"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Optional description..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Unit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Unit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Unit</DialogTitle>
            <DialogDescription>
              Update unit details
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="editBuildingName">Building *</Label>
                <Popover open={buildingPopoverOpen} onOpenChange={setBuildingPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={buildingPopoverOpen}
                      className="w-full justify-between"
                    >
                      {formData.buildingName || "Select or create building..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput
                        placeholder="Search or create building..."
                        value={buildingSearch}
                        onValueChange={setBuildingSearch}
                      />
                      <CommandList>
                        <CommandEmpty>
                          <Button
                            variant="ghost"
                            className="w-full justify-start"
                            onClick={() => {
                              setFormData({ ...formData, buildingName: buildingSearch });
                              setBuildingPopoverOpen(false);
                            }}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Create "{buildingSearch}"
                          </Button>
                        </CommandEmpty>
                        <CommandGroup>
                          {buildingNames?.map((name) => (
                            <CommandItem
                              key={name}
                              value={name}
                              onSelect={() => {
                                setFormData({ ...formData, buildingName: name });
                                setBuildingPopoverOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  formData.buildingName === name ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label htmlFor="editUnitLabel">Unit Number *</Label>
                <Input
                  id="editUnitLabel"
                  value={formData.unitLabel}
                  onChange={(e) =>
                    setFormData({ ...formData, unitLabel: e.target.value })
                  }
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editRentAmount">Rent ($/month)</Label>
                  <Input
                    id="editRentAmount"
                    type="number"
                    step="0.01"
                    value={formData.rentAmountDollars}
                    onChange={(e) =>
                      setFormData({ ...formData, rentAmountDollars: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="editRentDueDay">Rent Due Day</Label>
                  <Select
                    value={formData.rentDueDay}
                    onValueChange={(value) =>
                      setFormData({ ...formData, rentDueDay: value })
                    }
                  >
                    <SelectTrigger id="editRentDueDay">
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {RENT_DUE_DAYS.map((day) => (
                        <SelectItem key={day} value={day.toString()}>
                          {formatOrdinal(day)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="editBedrooms">Beds</Label>
                  <Input
                    id="editBedrooms"
                    type="number"
                    value={formData.bedrooms}
                    onChange={(e) =>
                      setFormData({ ...formData, bedrooms: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="editBathrooms">Baths</Label>
                  <Input
                    id="editBathrooms"
                    type="number"
                    step="0.5"
                    value={formData.bathrooms}
                    onChange={(e) =>
                      setFormData({ ...formData, bathrooms: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="editSqft">Sq Ft</Label>
                  <Input
                    id="editSqft"
                    type="number"
                    value={formData.sqft}
                    onChange={(e) =>
                      setFormData({ ...formData, sqft: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="editDescription">Description</Label>
                <Textarea
                  id="editDescription"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Unit</AlertDialogTitle>
            <AlertDialogDescription>
              {hasTenants(selectedUnit) ? (
                <>
                  Cannot delete "{selectedUnit?.unitLabel}" because it has active tenants.
                  Please move out all tenants before deleting this unit.
                </>
              ) : (
                <>
                  Are you sure you want to delete "{selectedUnit?.unitLabel}"? This action
                  cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {!hasTenants(selectedUnit) ? (
              <AlertDialogAction
                onClick={() => selectedUnit && deleteMutation.mutate(selectedUnit.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Tenants Sheet */}
      <Sheet open={isTenantsSheetOpen} onOpenChange={setIsTenantsSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Tenants in {selectedUnit?.unitLabel}</SheetTitle>
            <SheetDescription>
              View all tenants assigned to this unit
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {selectedUnit?.tenants?.map((tenant) => (
              <div
                key={tenant.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{tenant.name}</p>
                    <Badge
                      variant={tenant.roleInUnit === "PRIMARY" ? "default" : "secondary"}
                    >
                      {tenant.roleInUnit === "PRIMARY" ? "Primary" : "Occupant"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{tenant.email}</p>
                </div>
              </div>
            ))}
            {!selectedUnit?.tenants || selectedUnit.tenants.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No tenants assigned to this unit
              </div>
            ) : null}
            <div className="pt-4 border-t space-y-2">
              {!hasPrimaryTenant(selectedUnit) ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setIsTenantsSheetOpen(false);
                    navigateToInvite(selectedUnit!.id, "PRIMARY");
                  }}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite Primary Tenant
                </Button>
              ) : null}
              {selectedUnit?.status === "OCCUPIED" ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setIsTenantsSheetOpen(false);
                    navigateToInvite(selectedUnit!.id, "OCCUPANT");
                  }}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Invite Occupant
                </Button>
              ) : null}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Unit Assets Drawer */}
      <UnitAssetsDrawer
        unitId={selectedUnit?.id ?? ""}
        unitLabel={selectedUnit?.unitLabel ?? ""}
        open={isAssetsDrawerOpen && !!selectedUnit}
        onOpenChange={(open) => {
          setIsAssetsDrawerOpen(open);
          if (!open) {
            // Delay clearing selectedUnit to prevent flicker
            setTimeout(() => setSelectedUnit(null), 150);
          }
        }}
      />

      {/* Rent Roll Modal */}
      <RentRollModal
        open={isRentRollModalOpen}
        onOpenChange={setIsRentRollModalOpen}
        buildingNames={buildingNames || []}
      />
    </div>
  );
}
