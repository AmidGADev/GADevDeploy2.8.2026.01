import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Bell,
} from "lucide-react";

// Types
type EventCategory = "logistics" | "milestone" | "compliance" | "holiday" | "admin_alert";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  category: EventCategory;
  description?: string;
  location?: string;
  isRecurring?: boolean;
  recurrencePattern?: string;
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
    label: "Lease Milestones",
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
  admin_alert: {
    color: "#7c3aed",
    bgColor: "#ede9fe",
    borderColor: "#8b5cf6",
    label: "Admin Alerts",
    icon: Bell,
  },
};

// Calculate a wide date range for fetching (1 year before and after)
function getWideRange() {
  const now = new Date();
  const start = new Date(now.getFullYear() - 1, 0, 1);
  const end = new Date(now.getFullYear() + 1, 11, 31);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export default function TenantCalendar() {
  const calendarRef = useRef<FullCalendarType>(null);
  const [currentTitle, setCurrentTitle] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Use a fixed wide date range to avoid refetching on navigation
  const dateRange = useMemo(() => getWideRange(), []);

  // Fetch calendar events once with wide range
  const {
    data: events = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["tenant-calendar-events"],
    queryFn: () =>
      api.get<CalendarEvent[]>(
        `/api/tenant/calendar?start=${dateRange.start}&end=${dateRange.end}`
      ),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  // Update title on mount
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (api) {
      setCurrentTitle(api.view.title);
    }
  }, [isLoading]);

  // Transform events for FullCalendar - memoized to prevent re-renders
  const calendarEvents = useMemo(() => {
    return events.map((event) => {
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
          isRecurring: event.isRecurring,
          recurrencePattern: event.recurrencePattern,
        },
      };
    });
  }, [events]);

  // Handle event click
  const handleEventClick = useCallback((arg: EventClickArg) => {
    const clickedEvent = events.find((e) => e.id === arg.event.id);
    if (clickedEvent) {
      setSelectedEvent(clickedEvent);
      setDialogOpen(true);
    }
  }, [events]);

  // Navigation handlers - update title after navigation
  const handlePrev = useCallback(() => {
    const api = calendarRef.current?.getApi();
    if (api) {
      api.prev();
      setCurrentTitle(api.view.title);
    }
  }, []);

  const handleNext = useCallback(() => {
    const api = calendarRef.current?.getApi();
    if (api) {
      api.next();
      setCurrentTitle(api.view.title);
    }
  }, []);

  const handleToday = useCallback(() => {
    const api = calendarRef.current?.getApi();
    if (api) {
      api.today();
      setCurrentTitle(api.view.title);
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
      <div>
        <h1 className="text-2xl font-serif font-medium tracking-tight">Calendar</h1>
        <p className="text-muted-foreground mt-1">
          View important dates, building schedules, and upcoming events
        </p>
      </div>

      {/* Legend */}
      <Card className="shadow-sm border-border/50 bg-white">
        <CardContent className="py-4 px-5">
          <h3 className="font-serif font-medium text-sm text-foreground mb-3">Event Types</h3>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {/* Building Logistics - Blue */}
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center justify-center w-5 h-5 rounded" style={{ backgroundColor: CATEGORY_CONFIG.logistics.bgColor }}>
                <Trash2 className="w-3 h-3" style={{ color: CATEGORY_CONFIG.logistics.color }} />
              </div>
              <span className="text-muted-foreground">{CATEGORY_CONFIG.logistics.label}</span>
            </div>
            {/* Lease Milestones - Green */}
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center justify-center w-5 h-5 rounded" style={{ backgroundColor: CATEGORY_CONFIG.milestone.bgColor }}>
                <Home className="w-3 h-3" style={{ color: CATEGORY_CONFIG.milestone.color }} />
              </div>
              <span className="text-muted-foreground">{CATEGORY_CONFIG.milestone.label}</span>
            </div>
            {/* Admin Alerts - Purple */}
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center justify-center w-5 h-5 rounded" style={{ backgroundColor: CATEGORY_CONFIG.admin_alert.bgColor }}>
                <Bell className="w-3 h-3" style={{ color: CATEGORY_CONFIG.admin_alert.color }} />
              </div>
              <span className="text-muted-foreground">{CATEGORY_CONFIG.admin_alert.label}</span>
            </div>
          </div>
        </CardContent>
      </Card>

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
            <div className="tenant-calendar">
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
                  dayMaxEvents={2}
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
                        <Icon
                          className="h-5 w-5"
                          style={{ color: config.color }}
                        />
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
                        borderColor: CATEGORY_CONFIG[selectedEvent.category].borderColor,
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

                {/* Location */}
                {selectedEvent.location && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-sm">{selectedEvent.location}</p>
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
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Custom styles for FullCalendar */}
      <style>{`
        .tenant-calendar .fc {
          font-family: inherit;
          --fc-border-color: hsl(var(--border) / 0.5);
          --fc-today-bg-color: hsl(var(--accent) / 0.4);
          --fc-neutral-bg-color: transparent;
          --fc-page-bg-color: transparent;
        }

        .tenant-calendar .fc-theme-standard td,
        .tenant-calendar .fc-theme-standard th {
          border-color: var(--fc-border-color);
        }

        .tenant-calendar .fc-theme-standard .fc-scrollgrid {
          border: none;
        }

        .tenant-calendar .fc-col-header {
          background: hsl(var(--muted) / 0.3);
        }

        .tenant-calendar .fc-col-header-cell {
          padding: 12px 0;
          border-bottom: 1px solid var(--fc-border-color);
        }

        .tenant-calendar .fc-col-header-cell-cushion {
          font-weight: 500;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: hsl(var(--muted-foreground));
        }

        .tenant-calendar .fc-daygrid-day {
          min-height: 85px;
        }

        .tenant-calendar .fc-daygrid-day-frame {
          padding: 4px;
        }

        .tenant-calendar .fc-daygrid-day-top {
          justify-content: center;
          padding: 4px 0;
        }

        .tenant-calendar .fc-daygrid-day-number {
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

        .tenant-calendar .fc-day-today .fc-daygrid-day-number {
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
          font-weight: 600;
        }

        .tenant-calendar .fc-day-other .fc-daygrid-day-number {
          color: hsl(var(--muted-foreground) / 0.5);
        }

        .tenant-calendar .fc-day-other {
          background: hsl(var(--muted) / 0.15);
        }

        .tenant-calendar .fc-event {
          border-radius: 4px;
          font-size: 0.7rem;
          padding: 2px 6px;
          margin: 1px 2px;
          border-width: 0;
          border-left-width: 3px;
          font-weight: 500;
          line-height: 1.4;
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          position: relative;
        }

        .tenant-calendar .fc-event:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          z-index: 100;
        }

        .tenant-calendar .fc-event-title {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Tooltip showing full title on hover */
        .tenant-calendar .fc-event:hover::after {
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

        .tenant-calendar .fc-daygrid-more-link {
          font-size: 0.7rem;
          color: hsl(var(--primary));
          font-weight: 600;
          margin-top: 2px;
        }

        .tenant-calendar .fc-daygrid-more-link:hover {
          text-decoration: underline;
        }

        .tenant-calendar .fc-popover {
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.12);
          border: 1px solid hsl(var(--border));
          overflow: hidden;
        }

        .tenant-calendar .fc-popover-header {
          background: hsl(var(--muted));
          padding: 10px 14px;
          font-weight: 600;
          font-size: 0.8rem;
          border-bottom: 1px solid hsl(var(--border));
        }

        .tenant-calendar .fc-popover-body {
          padding: 8px;
          max-height: 200px;
          overflow-y: auto;
        }

        .tenant-calendar .fc-daygrid-event-harness {
          margin-bottom: 2px;
        }

        /* Mobile responsiveness */
        @media (max-width: 640px) {
          .tenant-calendar .fc-col-header-cell-cushion {
            font-size: 0.65rem;
            letter-spacing: 0;
          }

          .tenant-calendar .fc-daygrid-day {
            min-height: 70px;
          }

          .tenant-calendar .fc-daygrid-day-number {
            font-size: 0.75rem;
            width: 24px;
            height: 24px;
          }

          .tenant-calendar .fc-event {
            font-size: 0.6rem;
            padding: 1px 4px;
          }

          .tenant-calendar .fc-daygrid-more-link {
            font-size: 0.6rem;
          }

          /* Hide tooltip on mobile - use click dialog instead */
          .tenant-calendar .fc-event:hover::after {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
