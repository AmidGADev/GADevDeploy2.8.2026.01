import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Image as ImageIcon,
  Calendar,
  PackageOpen,
  PackageCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenantUnit, formatUnitContext } from "@/hooks/use-tenant-unit";

// Types
interface InspectionPhoto {
  id: string;
  url: string;
  caption?: string | null;
}

interface InspectionItem {
  id: string;
  category: string;
  condition: string | null;
  notes: string | null;
  photos: InspectionPhoto[];
}

interface Inspection {
  id: string;
  tenancyId: string;
  inspectionType: "MOVE_IN" | "MOVE_OUT";
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  isFinalized: boolean;
  finalizedAt: string | null;
  notes: string | null;
  damageNotes: string | null;
  damageFound: boolean;
  keysReturned: boolean;
  items: InspectionItem[];
}

interface InspectionsResponse {
  moveIn: Inspection | null;
  moveOut: Inspection | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  KEYS_ACCESS: "Keys & Access",
  WALLS_PAINT: "Walls & Paint",
  FLOORS: "Floors",
  KITCHEN: "Kitchen",
  BATHROOM: "Bathroom",
  APPLIANCES: "Appliances",
  DOORS_WINDOWS: "Doors & Windows",
};

const CONDITION_STYLES: Record<string, { label: string; className: string }> = {
  EXCELLENT: { label: "Excellent", className: "bg-green-100 text-green-700" },
  GOOD: { label: "Good", className: "bg-green-100 text-green-700" },
  FAIR: { label: "Fair", className: "bg-yellow-100 text-yellow-700" },
  POOR: { label: "Poor", className: "bg-red-100 text-red-700" },
  DAMAGED: { label: "Damaged", className: "bg-red-100 text-red-700" },
};

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "not yet started",
  IN_PROGRESS: "in progress",
  COMPLETED: "completed",
};

function InspectionTab({
  inspection,
  isLoading,
  type,
}: {
  inspection: Inspection | null | undefined;
  isLoading: boolean;
  type: "move-in" | "move-out";
}) {
  const typeLabel = type === "move-in" ? "move-in" : "move-out";

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  // No inspection exists
  if (!inspection) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-lg">No Inspection Scheduled</h3>
          <p className="text-muted-foreground mt-2">
            No {typeLabel} inspection has been scheduled yet. Contact your property manager for more information.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Inspection exists but not finalized
  if (!inspection.isFinalized) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Clock className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-lg">Inspection In Progress</h3>
          <p className="text-muted-foreground mt-2">
            Your {typeLabel} inspection is {STATUS_LABELS[inspection.status] || inspection.status.toLowerCase()}.
            You'll be able to view the full report once it's finalized.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Inspection is finalized - show full report
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-green-100">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-lg">Inspection Report</h3>
                <Badge className="bg-green-100 text-green-700">Finalized</Badge>
              </div>
              {inspection.finalizedAt && (
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                  <Calendar className="h-3 w-3" />
                  Finalized on {formatDate(inspection.finalizedAt)}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inspection Items */}
      <Card>
        <CardHeader>
          <CardTitle>Inspection Areas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {inspection.items.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-lg border bg-card"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h4 className="font-medium">
                    {CATEGORY_LABELS[item.category] || item.category}
                  </h4>
                  {item.condition && CONDITION_STYLES[item.condition] ? (
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium shrink-0",
                        CONDITION_STYLES[item.condition].className
                      )}
                    >
                      {CONDITION_STYLES[item.condition].label}
                    </span>
                  ) : item.condition ? (
                    <Badge variant="secondary">{item.condition}</Badge>
                  ) : null}
                </div>
                {item.notes && (
                  <p className="text-sm text-muted-foreground mb-3">{item.notes}</p>
                )}
                {item.photos && item.photos.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <ImageIcon className="h-3 w-3" />
                      {item.photos.length} photo{item.photos.length > 1 ? "s" : ""}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {item.photos.map((photo) => (
                        <a
                          key={photo.id}
                          href={photo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-20 h-20 rounded-md overflow-hidden border hover:opacity-80 transition-opacity"
                        >
                          <img
                            src={photo.url}
                            alt={photo.caption || "Inspection photo"}
                            className="w-full h-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Overall Notes */}
      {inspection.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{inspection.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Damage Information */}
      {inspection.damageFound && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-red-800">Damage Reported</h4>
                {inspection.damageNotes ? (
                  <p className="text-sm text-red-700 mt-1">{inspection.damageNotes}</p>
                ) : (
                  <p className="text-sm text-red-700 mt-1">
                    Some damage was found during the inspection. Please contact your property manager for details.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function TenantInspections() {
  // Fetch unit info for header
  const { data: unitData } = useTenantUnit();
  const unitContext = formatUnitContext(unitData);

  // Fetch both inspections in a single call (optimized)
  const {
    data: inspectionsData,
    isLoading,
  } = useQuery({
    queryKey: ["tenant-inspections"],
    queryFn: () => api.get<InspectionsResponse>("/api/tenant/inspections"),
  });

  const moveInInspection = inspectionsData?.moveIn ?? null;
  const moveOutInspection = inspectionsData?.moveOut ?? null;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-10 w-64" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // Determine default tab based on which inspection exists
  const hasMoveIn = !!moveInInspection;
  const hasMoveOut = !!moveOutInspection;
  const defaultTab = hasMoveOut ? "move-out" : "move-in";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium">Inspections</h1>
        <p className="text-muted-foreground">
          {unitContext ? `${unitContext} - ` : ""}View condition reports for your unit
        </p>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="move-in" className="gap-2">
            <PackageOpen className="h-4 w-4" />
            Move-In
            {hasMoveIn && moveInInspection?.isFinalized && (
              <CheckCircle2 className="h-4 w-4 text-green-600 ml-1" />
            )}
          </TabsTrigger>
          <TabsTrigger value="move-out" className="gap-2">
            <PackageCheck className="h-4 w-4" />
            Move-Out
            {hasMoveOut && moveOutInspection?.isFinalized && (
              <CheckCircle2 className="h-4 w-4 text-green-600 ml-1" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="move-in">
          <InspectionTab
            inspection={moveInInspection}
            isLoading={false}
            type="move-in"
          />
        </TabsContent>

        <TabsContent value="move-out">
          <InspectionTab
            inspection={moveOutInspection}
            isLoading={false}
            type="move-out"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
