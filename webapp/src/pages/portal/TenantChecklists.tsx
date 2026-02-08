import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2,
  ClipboardList,
  Circle,
  Calendar,
  PackageOpen,
  PackageCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTenantUnit, formatUnitContext } from "@/hooks/use-tenant-unit";

// Checklist types (same for both move-in and move-out)
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

export default function TenantChecklists() {
  const queryClient = useQueryClient();

  // Fetch unit info for header
  const { data: unitData } = useTenantUnit();
  const unitContext = formatUnitContext(unitData);

  // Fetch tenancy info to get move-out date
  const { data: tenancyData } = useQuery({
    queryKey: ["tenant-unit"],
    queryFn: () => api.get<TenancyInfo>("/api/tenant/unit"),
  });

  // Fetch move-in checklist
  const { data: moveInData, isLoading: moveInLoading } = useQuery({
    queryKey: ["tenant-checklist", "MOVE_IN"],
    queryFn: () => api.get<ChecklistResponse>("/api/tenant/checklist?type=MOVE_IN"),
  });

  // Fetch move-out checklist
  const { data: moveOutData, isLoading: moveOutLoading } = useQuery({
    queryKey: ["tenant-checklist", "MOVE_OUT"],
    queryFn: () => api.get<ChecklistResponse>("/api/tenant/checklist?type=MOVE_OUT"),
  });

  const completeMoveInMutation = useMutation({
    mutationFn: (itemId: string) =>
      api.put(`/api/tenant/checklist/${itemId}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-checklist", "MOVE_IN"] });
      toast.success("Item marked as complete");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update item");
    },
  });

  const completeMoveOutMutation = useMutation({
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
      month: "short",
      day: "numeric",
    });
  };

  const formatLongDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const isLoading = moveInLoading || moveOutLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-10 w-64" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const moveInItems = moveInData?.items || [];
  const moveInProgress = moveInData?.progress || { completed: 0, total: 0, percentage: 0 };
  const hasMoveIn = moveInItems.length > 0;

  const moveOutItems = moveOutData?.items || [];
  const moveOutProgress = moveOutData?.progress || { completed: 0, total: 0, percentage: 0 };
  const moveOutDate = tenancyData?.moveOutDate;
  const hasMoveOut = moveOutItems.length > 0 || !!moveOutDate;

  // Determine default tab
  const defaultTab = hasMoveOut ? "move-out" : "move-in";

  // If neither checklist exists
  if (!hasMoveIn && !hasMoveOut) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-serif font-medium">Checklists</h1>
          <p className="text-muted-foreground">
            {unitContext ? `${unitContext} - ` : ""}Track your move-in and move-out tasks
          </p>
        </div>

        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-medium text-lg">No Checklists Available</h3>
            <p className="text-muted-foreground mt-2">
              Your property manager will add checklist items when needed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const completedMoveInItems = moveInItems.filter((item) => item.isCompleted);
  const incompleteMoveInItems = moveInItems.filter((item) => !item.isCompleted);

  const completedMoveOutItems = moveOutItems.filter((item) => item.isCompleted);
  const incompleteMoveOutItems = moveOutItems.filter((item) => !item.isCompleted);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium">Checklists</h1>
        <p className="text-muted-foreground">
          Track your move-in and move-out tasks
        </p>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="move-in" className="gap-2" disabled={!hasMoveIn}>
            <PackageOpen className="h-4 w-4" />
            Move-In
            {hasMoveIn && moveInProgress.percentage < 100 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {moveInProgress.percentage}%
              </Badge>
            )}
            {hasMoveIn && moveInProgress.percentage === 100 && (
              <CheckCircle2 className="h-4 w-4 text-green-600 ml-1" />
            )}
          </TabsTrigger>
          <TabsTrigger value="move-out" className="gap-2" disabled={!hasMoveOut}>
            <PackageCheck className="h-4 w-4" />
            Move-Out
            {moveOutItems.length > 0 && moveOutProgress.percentage === 100 && (
              <CheckCircle2 className="h-4 w-4 text-green-600 ml-1" />
            )}
            {moveOutItems.length > 0 && moveOutProgress.percentage < 100 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {moveOutProgress.percentage}%
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Move-In Tab */}
        <TabsContent value="move-in" className="space-y-6">
          {!hasMoveIn ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  No move-in checklist items have been assigned yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Progress */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Overall Progress</span>
                    <span className="text-sm text-muted-foreground">
                      {completedMoveInItems.length} of {moveInItems.length} completed
                    </span>
                  </div>
                  <Progress value={moveInProgress.percentage} className="h-3" />
                  <p className="text-sm text-muted-foreground mt-2">
                    {moveInProgress.percentage === 100
                      ? "All tasks completed!"
                      : `${moveInProgress.percentage}% complete`}
                  </p>
                </CardContent>
              </Card>

              {/* Incomplete Items */}
              {incompleteMoveInItems.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-medium">To Do</h2>
                  {incompleteMoveInItems.map((item) => (
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
                                disabled={completeMoveInMutation.isPending}
                                onCheckedChange={() => completeMoveInMutation.mutate(item.id)}
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
                  ))}
                </div>
              )}

              {/* Completed Items */}
              {completedMoveInItems.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-medium text-muted-foreground">Completed</h2>
                  {completedMoveInItems.map((item) => (
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
                            </div>
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
            </>
          )}
        </TabsContent>

        {/* Move-Out Tab */}
        <TabsContent value="move-out" className="space-y-6">
          {/* Move-Out Date */}
          {moveOutDate && (
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-amber-100">
                    <Calendar className="h-6 w-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Move-Out Date</p>
                    <p className="text-xl font-semibold">{formatLongDate(moveOutDate)}</p>
                  </div>
                  <div className="ml-auto">
                    {moveOutProgress.percentage === 100 ? (
                      <Badge className="bg-green-100 text-green-700">All Tasks Complete</Badge>
                    ) : (
                      <Badge variant="secondary">In Progress</Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {moveOutItems.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  No move-out checklist items have been assigned yet.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Your property manager will add items when they're ready.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Progress */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Overall Progress</span>
                    <span className="text-sm text-muted-foreground">
                      {completedMoveOutItems.length} of {moveOutItems.length} completed
                    </span>
                  </div>
                  <Progress value={moveOutProgress.percentage} className="h-3" />
                  <p className="text-sm text-muted-foreground mt-2">
                    {moveOutProgress.percentage === 100
                      ? "All tasks completed!"
                      : `${moveOutProgress.percentage}% complete`}
                  </p>
                </CardContent>
              </Card>

              {/* Incomplete Items */}
              {incompleteMoveOutItems.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-medium">To Do</h2>
                  {incompleteMoveOutItems.map((item) => (
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
                                disabled={completeMoveOutMutation.isPending}
                                onCheckedChange={() => completeMoveOutMutation.mutate(item.id)}
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
                  ))}
                </div>
              )}

              {/* Completed Items */}
              {completedMoveOutItems.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-medium text-muted-foreground">Completed</h2>
                  {completedMoveOutItems.map((item) => (
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
                            </div>
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
            </>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
