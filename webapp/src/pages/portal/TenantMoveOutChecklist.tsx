import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle2, ClipboardList, Circle, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTenantUnit, formatUnitContext } from "@/hooks/use-tenant-unit";

interface ChecklistItem {
  id: string;
  itemType: string;
  title: string;
  description: string | null;
  isRequired: boolean;
  isCompleted: boolean;
  completedAt: string | null;
  sortOrder: number;
  selfCompletable: boolean;
}

interface ChecklistResponse {
  checklistType: string;
  items: ChecklistItem[];
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
}

interface TenancyInfo {
  moveOutDate: string | null;
}

export default function TenantMoveOutChecklist() {
  const queryClient = useQueryClient();

  // Fetch unit info for header
  const { data: unitData } = useTenantUnit();
  const unitContext = formatUnitContext(unitData);

  // Fetch tenancy info to get move-out date
  const { data: tenancyData } = useQuery({
    queryKey: ["tenant-unit"],
    queryFn: () => api.get<TenancyInfo>("/api/tenant/unit"),
  });

  // Fetch move-out checklist
  const { data, isLoading, error } = useQuery({
    queryKey: ["tenant-checklist", "MOVE_OUT"],
    queryFn: () => api.get<ChecklistResponse>("/api/tenant/checklist?type=MOVE_OUT"),
  });

  const completeMutation = useMutation({
    mutationFn: (itemId: string) =>
      api.put(`/api/tenant/checklist/${itemId}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-checklist", "MOVE_OUT"] });
      toast.success("Item marked as complete");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update item");
    },
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-6 w-full" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <p className="text-muted-foreground">Failed to load move-out checklist</p>
      </div>
    );
  }

  const allItems = data?.items || [];
  const progress = data?.progress || { completed: 0, total: 0, percentage: 0 };
  const completedItems = allItems.filter((item) => item.isCompleted);
  const incompleteItems = allItems.filter((item) => !item.isCompleted);
  const moveOutDate = tenancyData?.moveOutDate;

  // If no items and no move-out date, show "no move-out scheduled"
  if (allItems.length === 0 && !moveOutDate) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-serif font-medium">Move-Out Checklist</h1>
          <p className="text-muted-foreground">
            {unitContext ? `${unitContext} - ` : ""}Track your move-out tasks
          </p>
        </div>

        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No move-out has been scheduled yet.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Contact your property manager if you're planning to move out.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If move-out date but no items yet
  if (allItems.length === 0 && moveOutDate) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-serif font-medium">Move-Out Checklist</h1>
          <p className="text-muted-foreground">
            {unitContext ? `${unitContext} - ` : ""}Track your move-out tasks
          </p>
        </div>

        {/* Move-Out Date Card */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-amber-100">
                <Calendar className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Move-Out Date</p>
                <p className="text-xl font-semibold">{formatDate(moveOutDate)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No checklist items have been assigned yet.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Your property manager will add items when they're ready.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium">Move-Out Checklist</h1>
        <p className="text-muted-foreground">
          {unitContext ? `${unitContext} - ` : ""}Track your move-out tasks
        </p>
      </div>

      {/* Move-Out Date Card */}
      {moveOutDate && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-amber-100">
                <Calendar className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Move-Out Date</p>
                <p className="text-xl font-semibold">{formatDate(moveOutDate)}</p>
              </div>
              <div className="ml-auto">
                {progress.percentage === 100 ? (
                  <Badge className="bg-green-100 text-green-700">All Tasks Complete</Badge>
                ) : (
                  <Badge variant="secondary">In Progress</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall Progress</span>
            <span className="text-sm text-muted-foreground">
              {completedItems.length} of {allItems.length} completed
            </span>
          </div>
          <Progress value={progress.percentage} className="h-3" />
          <p className="text-sm text-muted-foreground mt-2">
            {progress.percentage === 100
              ? "All tasks completed!"
              : `${progress.percentage}% complete`}
          </p>
        </CardContent>
      </Card>

      {/* Incomplete Items */}
      {incompleteItems.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">To Do</h2>
          {incompleteItems.map((item) => {
            return (
              <Card
                key={item.id}
                className={cn(
                  "transition-all",
                  item.selfCompletable && "hover:border-primary/50 cursor-pointer"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="pt-0.5">
                      {item.selfCompletable ? (
                        <Checkbox
                          checked={item.isCompleted}
                          disabled={completeMutation.isPending}
                          onCheckedChange={() => completeMutation.mutate(item.id)}
                        />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{item.title}</span>
                        {item.isRequired && (
                          <Badge variant="destructive" className="text-xs">
                            Required
                          </Badge>
                        )}
                        {!item.selfCompletable && (
                          <Badge variant="outline" className="text-xs">
                            Admin will mark complete
                          </Badge>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Completed Items */}
      {completedItems.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-muted-foreground">
            Completed
          </h2>
          {completedItems.map((item) => (
            <Card key={item.id} className="bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="pt-0.5">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-muted-foreground line-through">
                        {item.title}
                      </span>
                      {item.isRequired && (
                        <Badge
                          variant="outline"
                          className="text-xs text-muted-foreground"
                        >
                          Required
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Info */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="py-4">
          <p className="text-sm text-blue-800">
            Complete all required tasks before your move-out date. Some items can be marked complete by you,
            while others will be verified by your property manager.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
