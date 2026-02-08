import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg } from "@fullcalendar/core";
import type FullCalendarType from "@fullcalendar/react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CalendarDays,
  MapPin,
  RefreshCw,
  Trash2,
  Home,
  AlertTriangle,
  PartyPopper,
  Info,
  ChevronLeft,
  ChevronRight,
  User,
  Building2,
  ArrowRightLeft,
  Plus,
  Bell,
} from "lucide-react";

// Types
type EventCategory = "logistics" | "milestone" | "compliance" | "holiday" | "move";
type NotificationMethod = "email" | "dashboard" | "both";
type ReminderTrigger = "at_time" | "24_hours" | "3_days";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  category: EventCategory;
  description?: string;
  location?: string;
  unitId?: string;
  unitLabel?: string;
  buildingName?: string;
  tenantName?: string;
  isRecurring?: boolean;
  recurrencePattern?: string;
  isCustom?: boolean;
}

interface UnitOption {
  id: string;
  unitLabel: string;
  buildingName: string;
}

// Category configuration
const CATEGORY_CONFIG: Record<
  EventCategory,
  {
    color: string;
    bgColor: string;
    borderColor: string;
    label: string;
    icon: typeof CalendarDays;
  }
> = {
  logistics: {
    color: "#1e40af",
    bgColor: "#dbeafe",
    borderColor: "#3b82f6",
    label: "Building Logistics",
    icon: Trash2,
  },
  milestone: {
    color: "#166534",
    bgColor: "#dcfce7",
    borderColor: "#22c55e",
    label: "Lease Milestone",
    icon: Home,
  },
  compliance: {
    color: "#9a3412",
    bgColor: "#ffedd5",
    borderColor: "#f97316",
    label: "Action Required",
    icon: AlertTriangle,
  },
  holiday: {
    color: "#991b1b",
    bgColor: "#fee2e2",
    borderColor: "#ef4444",
    label: "Holiday / Closure",
    icon: PartyPopper,
  },
  move: {
    color: "#7c3aed",
    bgColor: "#ede9fe",
    borderColor: "#8b5cf6",
    label: "Move In/Out",
    icon: ArrowRightLeft,
  },
};

// Calculate a wide date range for fetching
function getWideRange() {
  const now = new Date();
  const start = new Date(now.getFullYear() - 1, 0, 1);
  const end = new Date(now.getFullYear() + 1, 11, 31);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export default function AdminCalendar() {
  const queryClient = useQueryClient();
  const calendarRef = useRef<FullCalendarType>(null);
  const [currentTitle, setCurrentTitle] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [buildingFilter, setBuildingFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Insert Event Dialog state
  const [insertDialogOpen, setInsertDialogOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDescription, setNewEventDescription] = useState("");
  const [newEventDate, setNewEventDate] = useState("");
  const [newEventCategory, setNewEventCategory] = useState<EventCategory>("logistics");
  const [newEventScope, setNewEventScope] = useState<"all" | "building" | "unit">("all");
  const [newEventBuilding, setNewEventBuilding] = useState<string>("");
  const [newEventUnit, setNewEventUnit] = useState<string>("");

  // New visibility and notification state
  const [isVisibleToTenant, setIsVisibleToTenant] = useState(false);
  const [notifyAdmins, setNotifyAdmins] = useState(false);
  const [notifyTenants, setNotifyTenants] = useState(false);
  const [notificationMethod, setNotificationMethod] = useState<NotificationMethod>("both");
  const [reminderTrigger, setReminderTrigger] = useState<ReminderTrigger>("at_time");

  // Use a fixed wide date range
  const dateRange = useMemo(() => getWideRange(), []);

  // Fetch buildings for filter
  const { data: buildings = [] } = useQuery({
    queryKey: ["admin-calendar-buildings"],
    queryFn: () => api.get<string[]>("/api/admin/calendar/buildings"),
    staleTime: 30 * 60 * 1000,
  });

  // Fetch units for event form
  const { data: units = [] } = useQuery({
    queryKey: ["admin-calendar-units", newEventBuilding],
    queryFn: () => {
      const params = newEventBuilding ? `?buildingName=${encodeURIComponent(newEventBuilding)}` : "";
      return api.get<UnitOption[]>(`/api/admin/calendar/units${params}`);
    },
    staleTime: 30 * 60 * 1000,
  });

  // Fetch calendar events
  const {
    data: events = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin-calendar-events", buildingFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("start", dateRange.start);
      params.set("end", dateRange.end);
      if (buildingFilter && buildingFilter !== "all") {
        params.set("buildingName", buildingFilter);
      }
      return api.get<CalendarEvent[]>(`/api/admin/calendar?${params.toString()}`);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Create event mutation
  const createEventMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      eventDate: string;
      category: EventCategory;
      buildingName?: string | null;
      unitId?: string | null;
      isVisibleToTenant?: boolean;
      notifyAdmins?: boolean;
      notifyTenants?: boolean;
      notificationMethod?: NotificationMethod;
      reminderTrigger?: ReminderTrigger;
    }) => {
      return api.post<CalendarEvent>("/api/admin/calendar/events", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-calendar-events"] });
      resetInsertForm();
      setInsertDialogOpen(false);
    },
  });

  // Delete event mutation
  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      return api.delete(`/api/admin/calendar/events/${eventId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-calendar-events"] });
      setDialogOpen(false);
      setSelectedEvent(null);
    },
  });

  // Reset insert form
  const resetInsertForm = useCallback(() => {
    setNewEventTitle("");
    setNewEventDescription("");
    setNewEventDate("");
    setNewEventCategory("logistics");
    setNewEventScope("all");
    setNewEventBuilding("");
    setNewEventUnit("");
    setIsVisibleToTenant(false);
    setNotifyAdmins(false);
    setNotifyTenants(false);
    setNotificationMethod("both");
    setReminderTrigger("at_time");
  }, []);

  // Handle insert event submit
  const handleInsertEvent = useCallback(() => {
    if (!newEventTitle.trim() || !newEventDate) return;

    createEventMutation.mutate({
      title: newEventTitle.trim(),
      description: newEventDescription.trim() || undefined,
      eventDate: newEventDate,
      category: newEventCategory,
      buildingName: newEventScope === "building" ? newEventBuilding : null,
      unitId: newEventScope === "unit" ? newEventUnit : null,
      isVisibleToTenant,
      notifyAdmins,
      notifyTenants: isVisibleToTenant ? notifyTenants : false,
      notificationMethod: (notifyAdmins || notifyTenants) ? notificationMethod : undefined,
      reminderTrigger: (notifyAdmins || notifyTenants) ? reminderTrigger : undefined,
    });
  }, [
    newEventTitle,
    newEventDescription,
    newEventDate,
    newEventCategory,
    newEventScope,
    newEventBuilding,
    newEventUnit,
    isVisibleToTenant,
    notifyAdmins,
    notifyTenants,
    notificationMethod,
    reminderTrigger,
    createEventMutation,
  ]);

  // Handle delete custom event
  const handleDeleteEvent = useCallback(() => {
    if (selectedEvent?.isCustom) {
      deleteEventMutation.mutate(selectedEvent.id);
    }
  }, [selectedEvent, deleteEventMutation]);

  // Filter events by category
  const filteredEvents = useMemo(() => {
    if (categoryFilter === "all") return events;
    return events.filter((e) => e.category === categoryFilter);
  }, [events, categoryFilter]);

  // Update title on mount
  useEffect(() => {
    const calendarApi = calendarRef.current?.getApi();
    if (calendarApi) {
      setCurrentTitle(calendarApi.view.title);
    }
  }, [isLoading]);

  // Transform events for FullCalendar
  const calendarEvents = useMemo(() => {
    return filteredEvents.map((event) => {
      const config = CATEGORY_CONFIG[event.category];
      return {
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        backgroundColor: config.bgColor,
        borderColor: config.borderColor,
        textColor: config.color,
        extendedProps: {
          category: event.category,
          description: event.description,
          location: event.location,
          unitId: event.unitId,
          unitLabel: event.unitLabel,
          buildingName: event.buildingName,
          tenantName: event.tenantName,
          isRecurring: event.isRecurring,
          recurrencePattern: event.recurrencePattern,
          isCustom: event.isCustom,
        },
      };
    });
  }, [filteredEvents]);

  // Handle event click
  const handleEventClick = useCallback(
    (arg: EventClickArg) => {
      const clickedEvent = filteredEvents.find((e) => e.id === arg.event.id);
      if (clickedEvent) {
        setSelectedEvent(clickedEvent);
        setDialogOpen(true);
      }
    },
    [filteredEvents]
  );

  // Navigation handlers
  const handlePrev = useCallback(() => {
    const calendarApi = calendarRef.current?.getApi();
    if (calendarApi) {
      calendarApi.prev();
      setCurrentTitle(calendarApi.view.title);
    }
  }, []);

  const handleNext = useCallback(() => {
    const calendarApi = calendarRef.current?.getApi();
    if (calendarApi) {
      calendarApi.next();
      setCurrentTitle(calendarApi.view.title);
    }
  }, []);

  const handleToday = useCallback(() => {
    const calendarApi = calendarRef.current?.getApi();
    if (calendarApi) {
      calendarApi.today();
      setCurrentTitle(calendarApi.view.title);
    }
  }, []);

  // Format date for display
  const formatEventDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-CA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <p className="text-muted-foreground">Failed to load calendar</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-medium tracking-tight">Calendar</h1>
          <p className="text-muted-foreground mt-1">
            Property-wide view of events, leases, and compliance deadlines
          </p>
        </div>
        <Button onClick={() => setInsertDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Insert Event
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Select value={buildingFilter} onValueChange={setBuildingFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Buildings" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Buildings</SelectItem>
              {buildings.map((building) => (
                <SelectItem key={building} value={building}>
                  {building}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 ml-auto">
          {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: config.borderColor }}
              />
              <span className="text-muted-foreground hidden sm:inline">{config.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar Card */}
      <Card className="shadow-sm border-border/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <Skeleton className="h-8 w-40" />
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-9" />
                  <Skeleton className="h-9 w-16" />
                  <Skeleton className="h-9 w-9" />
                </div>
              </div>
              <Skeleton className="h-[600px] w-full" />
            </div>
          ) : (
            <div className="admin-calendar">
              {/* Custom Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                <h2 className="text-lg font-serif font-medium text-foreground">
                  {currentTitle}
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePrev}
                    className="h-9 w-9"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToday}
                    className="h-9 px-4 font-medium"
                  >
                    Today
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleNext}
                    className="h-9 w-9"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Calendar */}
              <div className="px-4 pb-4">
                <FullCalendar
                  ref={calendarRef}
                  plugins={[dayGridPlugin, interactionPlugin]}
                  initialView="dayGridMonth"
                  headerToolbar={false}
                  events={calendarEvents}
                  eventClick={handleEventClick}
                  height={600}
                  fixedWeekCount={true}
                  dayMaxEvents={3}
                  moreLinkClick="popover"
                  eventDisplay="block"
                  showNonCurrentDates={true}
                  eventClassNames="cursor-pointer"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          {selectedEvent && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3">
                  {(() => {
                    const config = CATEGORY_CONFIG[selectedEvent.category];
                    const Icon = config.icon;
                    return (
                      <div
                        className="p-2.5 rounded-xl shrink-0"
                        style={{ backgroundColor: config.bgColor }}
                      >
                        <Icon className="h-5 w-5" style={{ color: config.color }} />
                      </div>
                    );
                  })()}
                  <div className="space-y-1.5 min-w-0">
                    <DialogTitle className="font-serif text-lg leading-tight pr-6">
                      {selectedEvent.title}
                    </DialogTitle>
                    <Badge
                      variant="secondary"
                      className="text-xs font-medium"
                      style={{
                        backgroundColor: CATEGORY_CONFIG[selectedEvent.category].bgColor,
                        color: CATEGORY_CONFIG[selectedEvent.category].color,
                      }}
                    >
                      {CATEGORY_CONFIG[selectedEvent.category].label}
                    </Badge>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                {/* Date */}
                <div className="flex items-start gap-3">
                  <CalendarDays className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">
                      {formatEventDate(selectedEvent.start)}
                    </p>
                    {selectedEvent.isRecurring && selectedEvent.recurrencePattern && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <RefreshCw className="h-3 w-3" />
                        {selectedEvent.recurrencePattern}
                      </p>
                    )}
                  </div>
                </div>

                {/* Tenant */}
                {selectedEvent.tenantName && (
                  <div className="flex items-start gap-3">
                    <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-sm">{selectedEvent.tenantName}</p>
                  </div>
                )}

                {/* Location */}
                {selectedEvent.location && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-sm">{selectedEvent.location}</p>
                  </div>
                )}

                {/* Building */}
                {selectedEvent.buildingName && !selectedEvent.location && (
                  <div className="flex items-start gap-3">
                    <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-sm">{selectedEvent.buildingName}</p>
                  </div>
                )}

                {/* Description */}
                {selectedEvent.description && (
                  <div className="flex items-start gap-3">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {selectedEvent.description}
                    </p>
                  </div>
                )}
              </div>

              {/* Delete button for custom events */}
              {selectedEvent.isCustom && (
                <DialogFooter className="mt-6">
                  <Button
                    variant="destructive"
                    onClick={handleDeleteEvent}
                    disabled={deleteEventMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {deleteEventMutation.isPending ? "Deleting..." : "Delete Event"}
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Insert Event Dialog */}
      <Dialog open={insertDialogOpen} onOpenChange={(open) => {
        setInsertDialogOpen(open);
        if (!open) resetInsertForm();
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">Insert New Event</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="event-title">Event Title *</Label>
              <Input
                id="event-title"
                placeholder="e.g., Building Maintenance"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="event-description">Description</Label>
              <Textarea
                id="event-description"
                placeholder="Optional details about the event..."
                value={newEventDescription}
                onChange={(e) => setNewEventDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="event-date">Date *</Label>
              <Input
                id="event-date"
                type="date"
                value={newEventDate}
                onChange={(e) => setNewEventDate(e.target.value)}
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={newEventCategory} onValueChange={(v) => setNewEventCategory(v as EventCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: config.borderColor }}
                        />
                        {config.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Scope */}
            <div className="space-y-2">
              <Label>Apply To</Label>
              <Select value={newEventScope} onValueChange={(v) => {
                setNewEventScope(v as "all" | "building" | "unit");
                if (v === "all") {
                  setNewEventBuilding("");
                  setNewEventUnit("");
                }
                if (v === "building") {
                  setNewEventUnit("");
                }
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Properties</SelectItem>
                  <SelectItem value="building">Specific Building</SelectItem>
                  <SelectItem value="unit">Specific Unit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Building Selection */}
            {(newEventScope === "building" || newEventScope === "unit") && (
              <div className="space-y-2">
                <Label>Building</Label>
                <Select value={newEventBuilding} onValueChange={(v) => {
                  setNewEventBuilding(v);
                  setNewEventUnit("");
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select building..." />
                  </SelectTrigger>
                  <SelectContent>
                    {buildings.map((building) => (
                      <SelectItem key={building} value={building}>
                        {building}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Unit Selection */}
            {newEventScope === "unit" && newEventBuilding && (
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={newEventUnit} onValueChange={setNewEventUnit}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit..." />
                  </SelectTrigger>
                  <SelectContent>
                    {units
                      .filter((u) => u.buildingName === newEventBuilding)
                      .map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.unitLabel}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Visibility Toggle Section */}
            <div className="space-y-3 pt-4 border-t border-border/50">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="visibility-toggle" className="font-medium">Make Visible to Tenants</Label>
                  <p className="text-xs text-muted-foreground">
                    {isVisibleToTenant ? "Event will appear on tenant calendars" : "Admin-only reminder"}
                  </p>
                </div>
                <Switch
                  id="visibility-toggle"
                  checked={isVisibleToTenant}
                  onCheckedChange={(checked) => {
                    setIsVisibleToTenant(checked);
                    if (!checked) {
                      setNotifyTenants(false);
                    }
                  }}
                  className="data-[state=checked]:bg-primary"
                />
              </div>
            </div>

            {/* Notification Section */}
            <div className="space-y-3 pt-4 border-t border-border/50">
              <Label className="font-serif text-sm font-medium flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                Send Notifications
              </Label>

              <div className="space-y-3 pl-1">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="notify-admins"
                    checked={notifyAdmins}
                    onCheckedChange={(checked) => setNotifyAdmins(checked === true)}
                  />
                  <Label htmlFor="notify-admins" className="text-sm font-normal cursor-pointer">
                    Notify Admin(s)
                  </Label>
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="notify-tenants"
                    checked={notifyTenants}
                    onCheckedChange={(checked) => setNotifyTenants(checked === true)}
                    disabled={!isVisibleToTenant}
                  />
                  <Label
                    htmlFor="notify-tenants"
                    className={`text-sm font-normal cursor-pointer ${!isVisibleToTenant ? "text-muted-foreground/50" : ""}`}
                  >
                    Notify Tenant(s)
                    {!isVisibleToTenant && (
                      <span className="text-xs ml-2">(Enable visibility first)</span>
                    )}
                  </Label>
                </div>
              </div>
            </div>

            {/* Delivery Method and Reminder - shown when any notify checkbox is checked */}
            {(notifyAdmins || notifyTenants) && (
              <div className="space-y-4 pt-4 border-t border-border/50">
                {/* Delivery Method */}
                <div className="space-y-2">
                  <Label>Delivery Method</Label>
                  <Select value={notificationMethod} onValueChange={(v) => setNotificationMethod(v as NotificationMethod)}>
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="dashboard">Dashboard Alert</SelectItem>
                      <SelectItem value="both">Both (Recommended)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Reminder Dropdown */}
                <div className="space-y-2">
                  <Label>Send Reminder</Label>
                  <Select value={reminderTrigger} onValueChange={(v) => setReminderTrigger(v as ReminderTrigger)}>
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="at_time">At time of event</SelectItem>
                      <SelectItem value="24_hours">24 hours before</SelectItem>
                      <SelectItem value="3_days">3 days before</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setInsertDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInsertEvent}
              disabled={!newEventTitle.trim() || !newEventDate || createEventMutation.isPending}
            >
              {createEventMutation.isPending ? "Creating..." : "Create Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom styles for FullCalendar */}
      <style>{`
        .admin-calendar .fc {
          font-family: inherit;
          --fc-border-color: hsl(var(--border) / 0.5);
          --fc-today-bg-color: hsl(var(--accent) / 0.4);
          --fc-neutral-bg-color: transparent;
          --fc-page-bg-color: transparent;
        }

        .admin-calendar .fc-theme-standard td,
        .admin-calendar .fc-theme-standard th {
          border-color: var(--fc-border-color);
        }

        .admin-calendar .fc-theme-standard .fc-scrollgrid {
          border: none;
        }

        .admin-calendar .fc-col-header {
          background: hsl(var(--muted) / 0.3);
        }

        .admin-calendar .fc-col-header-cell {
          padding: 12px 0;
          border-bottom: 1px solid var(--fc-border-color);
        }

        .admin-calendar .fc-col-header-cell-cushion {
          font-weight: 500;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: hsl(var(--muted-foreground));
        }

        .admin-calendar .fc-daygrid-day {
          min-height: 90px;
        }

        .admin-calendar .fc-daygrid-day-frame {
          padding: 4px;
        }

        .admin-calendar .fc-daygrid-day-top {
          justify-content: center;
          padding: 4px 0;
        }

        .admin-calendar .fc-daygrid-day-number {
          font-size: 0.875rem;
          font-weight: 400;
          color: hsl(var(--foreground));
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }

        .admin-calendar .fc-day-today .fc-daygrid-day-number {
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
          font-weight: 600;
        }

        .admin-calendar .fc-day-other .fc-daygrid-day-number {
          color: hsl(var(--muted-foreground) / 0.5);
        }

        .admin-calendar .fc-day-other {
          background: hsl(var(--muted) / 0.15);
        }

        .admin-calendar .fc-event {
          border-radius: 4px;
          font-size: 0.65rem;
          padding: 2px 4px;
          margin: 1px 2px;
          border-width: 0;
          border-left-width: 3px;
          font-weight: 500;
          line-height: 1.3;
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          position: relative;
        }

        .admin-calendar .fc-event:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          z-index: 100;
        }

        .admin-calendar .fc-event-title {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Tooltip showing full title on hover */
        .admin-calendar .fc-event:hover::after {
          content: attr(title);
          position: absolute;
          left: 0;
          top: 100%;
          margin-top: 4px;
          background: hsl(var(--popover));
          color: hsl(var(--popover-foreground));
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 0.7rem;
          font-weight: 500;
          white-space: nowrap;
          max-width: 250px;
          overflow: hidden;
          text-overflow: ellipsis;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          border: 1px solid hsl(var(--border));
          z-index: 1000;
          pointer-events: none;
        }

        .admin-calendar .fc-daygrid-more-link {
          font-size: 0.65rem;
          color: hsl(var(--primary));
          font-weight: 600;
          margin-top: 2px;
        }

        .admin-calendar .fc-daygrid-more-link:hover {
          text-decoration: underline;
        }

        .admin-calendar .fc-popover {
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.12);
          border: 1px solid hsl(var(--border));
          overflow: hidden;
        }

        .admin-calendar .fc-popover-header {
          background: hsl(var(--muted));
          padding: 10px 14px;
          font-weight: 600;
          font-size: 0.8rem;
          border-bottom: 1px solid hsl(var(--border));
        }

        .admin-calendar .fc-popover-body {
          padding: 8px;
          max-height: 250px;
          overflow-y: auto;
        }

        .admin-calendar .fc-daygrid-event-harness {
          margin-bottom: 2px;
        }

        /* Mobile responsiveness */
        @media (max-width: 640px) {
          .admin-calendar .fc-col-header-cell-cushion {
            font-size: 0.65rem;
            letter-spacing: 0;
          }

          .admin-calendar .fc-daygrid-day {
            min-height: 70px;
          }

          .admin-calendar .fc-daygrid-day-number {
            font-size: 0.75rem;
            width: 24px;
            height: 24px;
          }

          .admin-calendar .fc-event {
            font-size: 0.55rem;
            padding: 1px 3px;
          }

          .admin-calendar .fc-daygrid-more-link {
            font-size: 0.55rem;
          }

          /* Hide tooltip on mobile - use click dialog instead */
          .admin-calendar .fc-event:hover::after {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
