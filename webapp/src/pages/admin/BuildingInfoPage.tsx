import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  Save,
  Plus,
  Trash2,
  Car,
  Moon,
  Phone,
  Info,
  Building2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Trash2 as GarbageIcon } from "lucide-react";
import type { BuildingInfo, EmergencyContact } from "../../../../backend/src/types";

interface GarbageScheduleEntry {
  type: "garbage" | "recycling" | "compost" | "bulk_pickup";
  days: number[];
  frequency: "weekly" | "biweekly" | "first_third";
}

interface GarbageScheduleStructured {
  entries: GarbageScheduleEntry[];
}

export default function BuildingInfoPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Form state
  const [parkingRules, setParkingRules] = useState("");
  const [garbageSchedule, setGarbageSchedule] = useState("");
  const [quietHours, setQuietHours] = useState("");
  const [customNotes, setCustomNotes] = useState("");
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [garbageEntries, setGarbageEntries] = useState<GarbageScheduleEntry[]>([]);

  // Fetch all building names from units
  const {
    data: buildings,
    isLoading: buildingsLoading,
    error: buildingsError,
  } = useQuery({
    queryKey: ["admin-buildings"],
    queryFn: () => api.get<string[]>("/api/admin/units/buildings"),
  });

  // Fetch all building infos to know which are configured
  const { data: allBuildingInfos } = useQuery({
    queryKey: ["admin-building-infos"],
    queryFn: () => api.get<BuildingInfo[]>("/api/admin/building-info"),
  });

  // Fetch specific building info when selected
  const {
    data: selectedBuildingInfo,
    isLoading: buildingInfoLoading,
    isFetching: buildingInfoFetching,
  } = useQuery({
    queryKey: ["admin-building-info", selectedBuilding],
    queryFn: () => api.get<BuildingInfo>(`/api/admin/building-info/${encodeURIComponent(selectedBuilding!)}`),
    enabled: !!selectedBuilding && isSheetOpen,
  });

  // Check if a building has info configured
  const isBuildingConfigured = (buildingName: string): boolean => {
    if (!allBuildingInfos) return false;
    return allBuildingInfos.some((info) => info.buildingName === buildingName);
  };

  // Initialize form when building info loads
  useEffect(() => {
    if (selectedBuildingInfo && !buildingInfoFetching) {
      setParkingRules(selectedBuildingInfo.parkingRules || "");
      setGarbageSchedule(selectedBuildingInfo.garbageSchedule || "");
      setQuietHours(selectedBuildingInfo.quietHours || "");
      setCustomNotes(selectedBuildingInfo.customNotes || "");
      setEmergencyContacts(selectedBuildingInfo.emergencyContacts || []);
      // Parse structured garbage schedule
      if (selectedBuildingInfo.garbageScheduleStructured) {
        try {
          const parsed = JSON.parse(selectedBuildingInfo.garbageScheduleStructured);
          if (parsed?.entries) {
            setGarbageEntries(parsed.entries);
          } else {
            setGarbageEntries([]);
          }
        } catch {
          setGarbageEntries([]);
        }
      } else {
        setGarbageEntries([]);
      }
    }
  }, [selectedBuildingInfo, buildingInfoFetching]);

  // Reset form when sheet opens for unconfigured building
  useEffect(() => {
    if (isSheetOpen && selectedBuilding && !isBuildingConfigured(selectedBuilding)) {
      setParkingRules("");
      setGarbageSchedule("");
      setQuietHours("");
      setCustomNotes("");
      setEmergencyContacts([]);
      setGarbageEntries([]);
    }
  }, [isSheetOpen, selectedBuilding, allBuildingInfos]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: {
      parkingRules?: string | null;
      garbageSchedule?: string | null;
      garbageScheduleStructured?: string | null;
      quietHours?: string | null;
      emergencyContacts?: EmergencyContact[] | null;
      customNotes?: string | null;
    }) =>
      api.put<BuildingInfo>(
        `/api/admin/building-info/${encodeURIComponent(selectedBuilding!)}`,
        data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-building-info", selectedBuilding] });
      queryClient.invalidateQueries({ queryKey: ["admin-building-infos"] });
      // Also invalidate calendar queries since garbage schedule affects calendar events
      queryClient.invalidateQueries({ queryKey: ["admin-calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["admin-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast({
        title: "Building Info Updated",
        description: `Information for ${selectedBuilding} has been saved successfully.`,
      });
      setIsSheetOpen(false);
    },
    onError: (error: ApiError) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update building information.",
        variant: "destructive",
      });
    },
  });

  // Sync to calendars mutation
  interface CalendarSyncResponse {
    success: boolean;
    eventsGenerated: number;
    eventsDeleted: number;
    buildingName: string;
    unitCount: number;
    tenantsAffected: number;
    syncTimestamp: string;
    syncStatus: "synced" | "partial" | "failed";
  }

  const syncMutation = useMutation({
    mutationFn: () => {
      // Validate building is saved before syncing
      if (!isBuildingConfigured(selectedBuilding!)) {
        return Promise.reject(new Error("Please save the building information before syncing to calendars."));
      }
      return api.post<CalendarSyncResponse>(
        `/api/admin/building-info/${encodeURIComponent(selectedBuilding!)}/sync-calendar`,
        {}
      );
    },
    onSuccess: (data) => {
      // Invalidate all calendar-related queries to refresh the Admin Calendar immediately
      // The AdminCalendar uses "admin-calendar-events" as primary key
      queryClient.invalidateQueries({ queryKey: ["admin-calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["admin-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });

      if (data.syncStatus === "failed") {
        toast({
          title: "Sync Failed",
          description: "Calendar sync failed. Please try again.",
          variant: "destructive",
        });
      } else if (data.syncStatus === "partial") {
        toast({
          title: "Partial Sync",
          description: `Calendar synced: ${data.eventsGenerated} events created, ${data.eventsDeleted} deleted. ${data.tenantsAffected} tenants updated. Some events may not have synced.`,
        });
      } else {
        toast({
          title: "Calendar Synced",
          description: `Calendar synced: ${data.eventsGenerated} events created, ${data.eventsDeleted} deleted. ${data.tenantsAffected} tenants updated.`,
        });
      }
    },
    onError: (error: ApiError | Error) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync garbage schedule to calendars.",
        variant: "destructive",
      });
    },
  });

  const handleBuildingSelect = (buildingName: string) => {
    setSelectedBuilding(buildingName);
    setIsSheetOpen(true);
  };

  const handleSheetOpenChange = (open: boolean) => {
    setIsSheetOpen(open);
    if (!open) {
      setSelectedBuilding(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const structuredData: GarbageScheduleStructured = { entries: garbageEntries };
    updateMutation.mutate({
      parkingRules: parkingRules.trim() || null,
      garbageSchedule: garbageSchedule.trim() || null,
      garbageScheduleStructured: garbageEntries.length > 0 ? JSON.stringify(structuredData) : null,
      quietHours: quietHours.trim() || null,
      customNotes: customNotes.trim() || null,
      emergencyContacts: emergencyContacts.length > 0 ? emergencyContacts : null,
    });
  };

  const addEmergencyContact = () => {
    setEmergencyContacts([...emergencyContacts, { name: "", phone: "", role: "" }]);
  };

  const removeEmergencyContact = (index: number) => {
    setEmergencyContacts(emergencyContacts.filter((_, i) => i !== index));
  };

  const updateEmergencyContact = (
    index: number,
    field: keyof EmergencyContact,
    value: string
  ) => {
    const updated = [...emergencyContacts];
    updated[index] = { ...updated[index], [field]: value };
    setEmergencyContacts(updated);
  };

  if (buildingsLoading) {
    return <BuildingsPageSkeleton />;
  }

  if (buildingsError) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <p className="text-muted-foreground">Failed to load buildings</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium">Building Information</h1>
        <p className="text-sm text-muted-foreground">
          Manage building rules and contact information per building
        </p>
      </div>

      {!buildings || buildings.length === 0 ? (
        <Card className="border border-border/50 shadow-sm">
          <CardContent className="py-12 text-center">
            <div className="mx-auto h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
              <Building2 className="h-6 w-6 text-accent" />
            </div>
            <h3 className="font-semibold text-lg mb-2">No Buildings Found</h3>
            <p className="text-sm text-muted-foreground">
              Add units with building names to manage building information.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {buildings.map((buildingName) => {
            const isConfigured = isBuildingConfigured(buildingName);
            return (
              <Card
                key={buildingName}
                className="shadow-sm border border-border/50 rounded-lg hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-pointer min-h-[120px]"
                onClick={() => handleBuildingSelect(buildingName)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-lg bg-accent/10">
                        <Building2 className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{buildingName}</h3>
                        <p className="text-sm text-muted-foreground">
                          Click to manage building info
                        </p>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {isConfigured ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-200 dark:text-emerald-400 dark:border-emerald-800">
                          <CheckCircle2 className="h-3 w-3" />
                          Configured
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 border border-amber-200 dark:text-amber-400 dark:border-amber-800">
                          <AlertTriangle className="h-3 w-3" />
                          Not Configured
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Building Info Edit Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-accent/10">
                <Building2 className="h-4 w-4 text-accent" />
              </div>
              {selectedBuilding} Information
            </SheetTitle>
            <SheetDescription>
              Configure building rules and contact information for tenants in this building.
            </SheetDescription>
          </SheetHeader>

          {buildingInfoLoading || buildingInfoFetching ? (
            <BuildingInfoFormSkeleton />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Parking Rules */}
              <div className="bg-muted/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Car className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="parkingRules" className="font-medium text-sm">
                    Parking Rules
                  </Label>
                </div>
                <Textarea
                  id="parkingRules"
                  value={parkingRules}
                  onChange={(e) => setParkingRules(e.target.value)}
                  placeholder="Enter parking rules and regulations..."
                  rows={4}
                  className="focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                />
              </div>

              {/* Garbage & Recycling Schedule */}
              <div className="bg-muted/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <GarbageIcon className="h-4 w-4 text-muted-foreground" />
                    <Label className="font-medium text-sm">
                      Garbage & Recycling Schedule
                    </Label>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:text-blue-800"
                    disabled={syncMutation.isPending || garbageEntries.length === 0}
                    onClick={() => syncMutation.mutate()}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                    {syncMutation.isPending ? "Syncing..." : "Sync to Calendars"}
                  </Button>
                </div>

                <div className="space-y-3">
                  {garbageEntries.map((entry, index) => (
                    <div key={index} className="p-3 bg-background/50 border border-border/50 rounded-md space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <select
                            value={entry.type}
                            onChange={(e) => {
                              const updated = [...garbageEntries];
                              updated[index] = { ...entry, type: e.target.value as GarbageScheduleEntry["type"] };
                              setGarbageEntries(updated);
                            }}
                            className="text-xs font-medium bg-transparent border border-border rounded-md px-2 py-1 focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                          >
                            <option value="garbage">Garbage</option>
                            <option value="recycling">Recycling</option>
                            <option value="compost">Compost</option>
                            <option value="bulk_pickup">Bulk Pickup</option>
                          </select>
                          <select
                            value={entry.frequency}
                            onChange={(e) => {
                              const updated = [...garbageEntries];
                              updated[index] = { ...entry, frequency: e.target.value as GarbageScheduleEntry["frequency"] };
                              setGarbageEntries(updated);
                            }}
                            className="text-xs bg-transparent border border-border rounded-md px-2 py-1 focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                          >
                            <option value="weekly">Weekly</option>
                            <option value="biweekly">Bi-Weekly</option>
                            <option value="first_third">1st & 3rd of Month</option>
                          </select>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                          onClick={() => setGarbageEntries(garbageEntries.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* Day of Week Selector */}
                      <div className="flex flex-wrap gap-1.5">
                        {(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const).map((dayLabel, dayIndex) => {
                          const isSelected = entry.days.includes(dayIndex);
                          return (
                            <button
                              key={dayLabel}
                              type="button"
                              onClick={() => {
                                const updated = [...garbageEntries];
                                const newDays = isSelected
                                  ? entry.days.filter((d) => d !== dayIndex)
                                  : [...entry.days, dayIndex].sort();
                                updated[index] = { ...entry, days: newDays };
                                setGarbageEntries(updated);
                              }}
                              className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-all ${
                                isSelected
                                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                  : "bg-background text-muted-foreground border-border hover:border-blue-300 hover:text-blue-600"
                              }`}
                            >
                              {dayLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setGarbageEntries([...garbageEntries, { type: "garbage", days: [], frequency: "weekly" }])}
                    className="w-full border-dashed"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Collection Type
                  </Button>
                </div>

                {/* Legacy free-text field (collapsed) */}
                {garbageSchedule && garbageEntries.length === 0 ? (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <p className="text-[10px] text-muted-foreground mb-1.5">Legacy text schedule (will be replaced when structured entries are added)</p>
                    <p className="text-xs text-foreground/70 bg-background/50 rounded px-2 py-1.5 border border-border/30">{garbageSchedule}</p>
                  </div>
                ) : null}
              </div>

              {/* Quiet Hours */}
              <div className="bg-muted/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Moon className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="quietHours" className="font-medium text-sm">
                    Quiet Hours
                  </Label>
                </div>
                <Textarea
                  id="quietHours"
                  value={quietHours}
                  onChange={(e) => setQuietHours(e.target.value)}
                  placeholder="Enter quiet hours information..."
                  rows={3}
                  className="focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                />
              </div>

              {/* Emergency Contacts */}
              <div className="bg-muted/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <Label className="font-medium text-sm">Emergency Contacts</Label>
                </div>
                <div className="space-y-3">
                  {emergencyContacts.map((contact, index) => (
                    <div
                      key={index}
                      className="p-3 bg-background/50 border border-border/50 rounded-md space-y-3"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Name</Label>
                          <Input
                            value={contact.name}
                            onChange={(e) =>
                              updateEmergencyContact(index, "name", e.target.value)
                            }
                            placeholder="Contact name"
                            className="focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Phone</Label>
                          <Input
                            value={contact.phone}
                            onChange={(e) =>
                              updateEmergencyContact(index, "phone", e.target.value)
                            }
                            placeholder="Phone number"
                            className="focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Role (optional)</Label>
                          <Input
                            value={contact.role || ""}
                            onChange={(e) =>
                              updateEmergencyContact(index, "role", e.target.value)
                            }
                            placeholder="e.g., Building Manager"
                            className="focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                          onClick={() => removeEmergencyContact(index)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addEmergencyContact}
                    className="w-full border-dashed"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Contact
                  </Button>
                </div>
              </div>

              {/* Additional Information */}
              <div className="bg-muted/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="customNotes" className="font-medium text-sm">
                    Additional Information
                  </Label>
                </div>
                <Textarea
                  id="customNotes"
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder="Enter any additional notes..."
                  rows={4}
                  className="focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                />
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-4 border-t">
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="bg-accent hover:bg-accent/90"
                >
                  {updateMutation.isPending ? (
                    "Saving..."
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BuildingsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="shadow-sm border border-border/50 rounded-lg min-h-[120px]">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div>
                    <Skeleton className="h-5 w-28 mb-2" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                </div>
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function BuildingInfoFormSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="bg-muted/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-24 w-full rounded-md" />
        </div>
      ))}
    </div>
  );
}
