import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarIcon, AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ScheduleMoveOut } from "../../../../backend/src/types";

interface CalendarSyncInfo {
  success: boolean;
  action: "created" | "updated" | "deleted" | "none";
  eventId: string | null;
  error?: string;
}

interface MoveOutResponse {
  calendarSync?: CalendarSyncInfo;
}

interface ScheduleMoveOutDialogProps {
  tenantId: string;
  tenantName: string;
  currentMoveOutDate?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ScheduleMoveOutDialog({
  tenantId,
  tenantName,
  currentMoveOutDate,
  open,
  onOpenChange,
  onSuccess,
}: ScheduleMoveOutDialogProps) {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    currentMoveOutDate ? new Date(currentMoveOutDate) : undefined
  );
  const [showClearWarning, setShowClearWarning] = useState(false);

  const scheduleMutation = useMutation({
    mutationFn: (data: ScheduleMoveOut) =>
      api.put<MoveOutResponse>(`/api/admin/tenants/${tenantId}/schedule-move-out`, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "compliance", "move-out"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "move-out-checklist", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["admin-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      onSuccess();
      onOpenChange(false);

      // Build toast message with calendar sync info
      const dateMessage = selectedDate
        ? `Move-out scheduled for ${format(selectedDate, "MMMM d, yyyy")}`
        : "Move-out date cleared";

      if (response?.calendarSync) {
        const { action, success, error } = response.calendarSync;
        if (!success && error) {
          toast.success(dateMessage);
          toast.error(`Calendar sync failed: ${error}`);
        } else if (action === "created") {
          toast.success(`${dateMessage}. Calendar event created.`);
        } else if (action === "updated") {
          toast.success(`${dateMessage}. Calendar event updated.`);
        } else if (action === "deleted") {
          toast.success(`${dateMessage}. Calendar event removed.`);
        } else {
          toast.success(dateMessage);
        }
      } else {
        toast.success(dateMessage);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to schedule move-out");
    },
  });

  const handleSave = () => {
    scheduleMutation.mutate({
      moveOutDate: selectedDate ? selectedDate.toISOString().split("T")[0] : null,
    });
  };

  const handleClear = () => {
    if (currentMoveOutDate) {
      setShowClearWarning(true);
    } else {
      setSelectedDate(undefined);
    }
  };

  const confirmClear = () => {
    setSelectedDate(undefined);
    setShowClearWarning(false);
    scheduleMutation.mutate({ moveOutDate: null });
  };

  // Reset state when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setSelectedDate(currentMoveOutDate ? new Date(currentMoveOutDate) : undefined);
      setShowClearWarning(false);
    }
    onOpenChange(newOpen);
  };

  return (
    <>
      <Dialog open={open && !showClearWarning} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {currentMoveOutDate ? "Update Move-Out Date" : "Schedule Move-Out"}
            </DialogTitle>
            <DialogDescription>
              {currentMoveOutDate
                ? `Update or clear the move-out date for ${tenantName}.`
                : `Set a move-out date for ${tenantName}. A move-out checklist will be automatically created.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {currentMoveOutDate && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Current move-out date</p>
                <p className="font-medium">
                  {format(new Date(currentMoveOutDate), "MMMM d, yyyy")}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {currentMoveOutDate ? "New Move-Out Date" : "Move-Out Date"}
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : "Select a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    initialFocus
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {!currentMoveOutDate && (
              <p className="text-sm text-muted-foreground">
                Setting a move-out date will create a move-out inspection checklist and
                add this tenant to the Move-Out Inspections compliance view.
              </p>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {currentMoveOutDate && (
              <Button
                type="button"
                variant="outline"
                onClick={handleClear}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Date
              </Button>
            )}
            <div className="flex-1" />
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={scheduleMutation.isPending || !selectedDate}
            >
              {scheduleMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Warning Dialog */}
      <Dialog open={showClearWarning} onOpenChange={setShowClearWarning}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Clear Move-Out Date</DialogTitle>
            <DialogDescription>
              Are you sure you want to clear the move-out date for {tenantName}?
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              The move-out checklist will remain but this tenant will no longer
              appear in the Move-Out Inspections compliance view.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowClearWarning(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmClear}
              disabled={scheduleMutation.isPending}
            >
              {scheduleMutation.isPending ? "Clearing..." : "Clear Date"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
