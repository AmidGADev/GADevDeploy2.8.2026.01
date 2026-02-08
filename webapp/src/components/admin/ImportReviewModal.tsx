import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import {
  Check,
  AlertTriangle,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ImportChangePreview,
  EntityChangePreview,
  ImportCreateRecord,
  ImportUpdateRecord,
} from "@/../../backend/src/types";

// ============================================
// Types
// ============================================

type EntityType =
  | "units"
  | "tenants"
  | "tenancies"
  | "invoices"
  | "checklistItems"
  | "inspections"
  | "buildingInfos";

type ApprovalState = {
  [K in EntityType]: {
    creates: Set<number>;
    updates: Set<string>;
  };
};

export type ApprovedChanges = {
  [K in EntityType]: {
    creates: number[];
    updates: string[];
  };
};

interface ImportReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changePreview: ImportChangePreview;
  onConfirm: (approvedChanges: ApprovedChanges) => void;
  isCommitting: boolean;
}

// Sensitive fields that should show a warning icon
const SENSITIVE_FIELDS = [
  "email",
  "amountCents",
  "status",
  "password",
  "rentAmountCents",
  "isActive",
  "dueDate",
];

// Human-readable entity names
const ENTITY_LABELS: Record<EntityType, string> = {
  units: "Units",
  tenants: "Tenants",
  tenancies: "Tenancies",
  invoices: "Invoices",
  checklistItems: "Checklist Items",
  inspections: "Inspections",
  buildingInfos: "Building Information",
};

// ============================================
// Helper Components
// ============================================

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "(empty)";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    // Check if it might be a cents value
    if (String(value).length > 2) {
      return value.toLocaleString();
    }
    return String(value);
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function getRecordIdentifier(data: Record<string, unknown>): string {
  // Try common identifier patterns
  if (data.unitLabel && data.buildingName) {
    return `${data.buildingName} - ${data.unitLabel}`;
  }
  if (data.name && data.email) {
    return `${data.name} (${data.email})`;
  }
  if (data.name) {
    return String(data.name);
  }
  if (data.email) {
    return String(data.email);
  }
  if (data.title) {
    return String(data.title);
  }
  if (data.buildingName) {
    return String(data.buildingName);
  }
  if (data.periodMonth) {
    return `Invoice ${data.periodMonth}`;
  }
  if (data.id) {
    return `ID: ${String(data.id).substring(0, 8)}...`;
  }
  return "Unknown Record";
}

interface CreateRecordRowProps {
  record: ImportCreateRecord;
  index: number;
  isApproved: boolean;
  onToggle: () => void;
}

function CreateRecordRow({
  record,
  index,
  isApproved,
  onToggle,
}: CreateRecordRowProps) {
  const identifier = getRecordIdentifier(record.data);
  const keyFields = Object.entries(record.data).slice(0, 4);

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-colors",
        isApproved
          ? "bg-green-50 border-green-200"
          : "bg-muted/30 border-muted"
      )}
    >
      <Checkbox checked={isApproved} onCheckedChange={onToggle} className="mt-1" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge className="bg-green-100 text-green-700 border-green-300">
            <Plus className="h-3 w-3 mr-1" />
            NEW
          </Badge>
          <span className="font-medium text-sm truncate">{identifier}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {keyFields.map(([key, value]) => (
            <div key={key} className="truncate">
              <span className="font-medium">{key}:</span>{" "}
              {formatFieldValue(value)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface UpdateRecordRowProps {
  record: ImportUpdateRecord;
  isApproved: boolean;
  onToggle: () => void;
}

function UpdateRecordRow({ record, isApproved, onToggle }: UpdateRecordRowProps) {
  const hasSensitiveChanges = record.changedFields.some((field) =>
    SENSITIVE_FIELDS.includes(field)
  );

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-colors",
        isApproved
          ? "bg-orange-50 border-orange-200"
          : "bg-muted/30 border-muted"
      )}
    >
      <Checkbox checked={isApproved} onCheckedChange={onToggle} className="mt-1" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <Badge className="bg-orange-100 text-orange-700 border-orange-300">
            <RefreshCw className="h-3 w-3 mr-1" />
            UPDATE
          </Badge>
          <span className="font-medium text-sm truncate">{record.identifier}</span>
          {hasSensitiveChanges ? (
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
          ) : null}
        </div>
        <div className="space-y-2">
          {record.changedFields.map((field) => {
            const isSensitive = SENSITIVE_FIELDS.includes(field);
            return (
              <div
                key={field}
                className={cn(
                  "grid grid-cols-[100px_1fr_1fr] gap-2 text-xs p-2 rounded",
                  isSensitive ? "bg-amber-50" : "bg-muted/50"
                )}
              >
                <div className="flex items-center gap-1">
                  {isSensitive ? (
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                  ) : null}
                  <span className="font-medium truncate">{field}</span>
                </div>
                <div className="text-red-600 truncate">
                  <span className="text-muted-foreground">Before: </span>
                  {formatFieldValue(record.before[field])}
                </div>
                <div className="text-green-600 truncate">
                  <span className="text-muted-foreground">After: </span>
                  {formatFieldValue(record.after[field])}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface EntitySectionProps {
  entityType: EntityType;
  preview: EntityChangePreview;
  approvalState: { creates: Set<number>; updates: Set<string> };
  onToggleCreate: (index: number) => void;
  onToggleUpdate: (id: string) => void;
  onApproveAllCreates: () => void;
}

function EntitySection({
  entityType,
  preview,
  approvalState,
  onToggleCreate,
  onToggleUpdate,
  onApproveAllCreates,
}: EntitySectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  const createCount = preview.creates.length;
  const updateCount = preview.updates.length;
  const totalChanges = createCount + updateCount;

  const approvedCreates = approvalState.creates.size;
  const approvedUpdates = approvalState.updates.size;
  const totalApproved = approvedCreates + approvedUpdates;

  if (totalChanges === 0 && preview.unchangedCount === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors">
          <div className="flex items-center gap-3">
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="font-semibold">{ENTITY_LABELS[entityType]}</span>
          </div>
          <div className="flex items-center gap-2">
            {createCount > 0 ? (
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                {approvedCreates}/{createCount} new
              </Badge>
            ) : null}
            {updateCount > 0 ? (
              <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                {approvedUpdates}/{updateCount} updates
              </Badge>
            ) : null}
            {preview.unchangedCount > 0 ? (
              <Badge variant="outline" className="text-muted-foreground">
                {preview.unchangedCount} unchanged
              </Badge>
            ) : null}
            {totalChanges > 0 ? (
              <span className="text-sm text-muted-foreground">
                ({totalApproved}/{totalChanges} approved)
              </span>
            ) : null}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-3 space-y-4">
          {/* New Records Section */}
          {createCount > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Plus className="h-4 w-4 text-green-600" />
                  New Records ({createCount})
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onApproveAllCreates}
                  className="text-xs"
                >
                  <Check className="h-3 w-3 mr-1" />
                  Approve All New
                </Button>
              </div>
              <div className="space-y-2">
                {preview.creates.map((record, index) => (
                  <CreateRecordRow
                    key={index}
                    record={record}
                    index={index}
                    isApproved={approvalState.creates.has(index)}
                    onToggle={() => onToggleCreate(index)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* Updates Section */}
          {updateCount > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-orange-600" />
                  Updates ({updateCount})
                </h4>
                <span className="text-xs text-muted-foreground">
                  (Each update must be individually approved)
                </span>
              </div>
              <div className="space-y-2">
                {preview.updates.map((record) => (
                  <UpdateRecordRow
                    key={record.id}
                    record={record}
                    isApproved={approvalState.updates.has(record.id)}
                    onToggle={() => onToggleUpdate(record.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* Unchanged count info */}
          {totalChanges === 0 && preview.unchangedCount > 0 ? (
            <p className="text-sm text-muted-foreground p-3 text-center">
              {preview.unchangedCount} records unchanged
            </p>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================
// Main Component
// ============================================

export function ImportReviewModal({
  open,
  onOpenChange,
  changePreview,
  onConfirm,
  isCommitting,
}: ImportReviewModalProps) {
  // Initialize approval state - all changes start as not approved
  const [approvalState, setApprovalState] = useState<ApprovalState>(() => ({
    units: { creates: new Set(), updates: new Set() },
    tenants: { creates: new Set(), updates: new Set() },
    tenancies: { creates: new Set(), updates: new Set() },
    invoices: { creates: new Set(), updates: new Set() },
    checklistItems: { creates: new Set(), updates: new Set() },
    inspections: { creates: new Set(), updates: new Set() },
    buildingInfos: { creates: new Set(), updates: new Set() },
  }));

  // Calculate totals
  const totals = useMemo(() => {
    const entityTypes: EntityType[] = [
      "units",
      "tenants",
      "tenancies",
      "invoices",
      "checklistItems",
      "inspections",
      "buildingInfos",
    ];

    let totalCreates = 0;
    let totalUpdates = 0;
    let approvedCreates = 0;
    let approvedUpdates = 0;

    for (const entityType of entityTypes) {
      const preview = changePreview[entityType];
      totalCreates += preview.creates.length;
      totalUpdates += preview.updates.length;
      approvedCreates += approvalState[entityType].creates.size;
      approvedUpdates += approvalState[entityType].updates.size;
    }

    const totalChanges = totalCreates + totalUpdates;
    const totalApproved = approvedCreates + approvedUpdates;
    const allUpdatesReviewed = entityTypes.every(
      (et) =>
        changePreview[et].updates.length === 0 ||
        approvalState[et].updates.size === changePreview[et].updates.length
    );

    return {
      totalChanges,
      totalApproved,
      totalCreates,
      totalUpdates,
      approvedCreates,
      approvedUpdates,
      allUpdatesReviewed,
      progressPercent: totalChanges > 0 ? (totalApproved / totalChanges) * 100 : 100,
    };
  }, [changePreview, approvalState]);

  // Toggle handlers
  const toggleCreate = (entityType: EntityType, index: number) => {
    setApprovalState((prev) => {
      const newState = { ...prev };
      const newCreates = new Set(prev[entityType].creates);
      if (newCreates.has(index)) {
        newCreates.delete(index);
      } else {
        newCreates.add(index);
      }
      newState[entityType] = { ...prev[entityType], creates: newCreates };
      return newState;
    });
  };

  const toggleUpdate = (entityType: EntityType, id: string) => {
    setApprovalState((prev) => {
      const newState = { ...prev };
      const newUpdates = new Set(prev[entityType].updates);
      if (newUpdates.has(id)) {
        newUpdates.delete(id);
      } else {
        newUpdates.add(id);
      }
      newState[entityType] = { ...prev[entityType], updates: newUpdates };
      return newState;
    });
  };

  const approveAllCreates = (entityType: EntityType) => {
    setApprovalState((prev) => {
      const newState = { ...prev };
      const newCreates = new Set<number>();
      for (let i = 0; i < changePreview[entityType].creates.length; i++) {
        newCreates.add(i);
      }
      newState[entityType] = { ...prev[entityType], creates: newCreates };
      return newState;
    });
  };

  // Handle confirm
  const handleConfirm = () => {
    const approvedChanges: ApprovedChanges = {
      units: {
        creates: Array.from(approvalState.units.creates),
        updates: Array.from(approvalState.units.updates),
      },
      tenants: {
        creates: Array.from(approvalState.tenants.creates),
        updates: Array.from(approvalState.tenants.updates),
      },
      tenancies: {
        creates: Array.from(approvalState.tenancies.creates),
        updates: Array.from(approvalState.tenancies.updates),
      },
      invoices: {
        creates: Array.from(approvalState.invoices.creates),
        updates: Array.from(approvalState.invoices.updates),
      },
      checklistItems: {
        creates: Array.from(approvalState.checklistItems.creates),
        updates: Array.from(approvalState.checklistItems.updates),
      },
      inspections: {
        creates: Array.from(approvalState.inspections.creates),
        updates: Array.from(approvalState.inspections.updates),
      },
      buildingInfos: {
        creates: Array.from(approvalState.buildingInfos.creates),
        updates: Array.from(approvalState.buildingInfos.updates),
      },
    };
    onConfirm(approvedChanges);
  };

  // Handle cancel/close - complete state wipe
  const handleCancel = () => {
    setApprovalState({
      units: { creates: new Set(), updates: new Set() },
      tenants: { creates: new Set(), updates: new Set() },
      tenancies: { creates: new Set(), updates: new Set() },
      invoices: { creates: new Set(), updates: new Set() },
      checklistItems: { creates: new Set(), updates: new Set() },
      inspections: { creates: new Set(), updates: new Set() },
      buildingInfos: { creates: new Set(), updates: new Set() },
    });
    onOpenChange(false);
  };

  // Handle when modal is closed via X button or clicking outside
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      handleCancel();
    } else {
      onOpenChange(isOpen);
    }
  };

  // Enable commit as soon as at least one change is approved
  const canCommit = totals.totalApproved > 0 && !isCommitting;

  const entityTypes: EntityType[] = [
    "units",
    "tenants",
    "tenancies",
    "invoices",
    "checklistItems",
    "inspections",
    "buildingInfos",
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Review Data Import
          </DialogTitle>
          <DialogDescription>
            Review and approve the changes below before committing to the
            database. Updates require individual approval.
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="space-y-2 py-2 border-b">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {totals.totalApproved} of {totals.totalChanges} changes approved
            </span>
            <span
              className={cn(
                "font-medium",
                totals.totalApproved > 0
                  ? "text-green-600"
                  : "text-muted-foreground"
              )}
            >
              {totals.totalApproved > 0 ? (
                <span className="flex items-center gap-1">
                  <Check className="h-4 w-4" />
                  Ready to commit {totals.totalApproved} changes
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  Select changes to approve
                </span>
              )}
            </span>
          </div>
          <Progress value={totals.progressPercent} className="h-2" />
        </div>

        {/* Entity sections */}
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 py-4">
            {entityTypes.map((entityType) => (
              <EntitySection
                key={entityType}
                entityType={entityType}
                preview={changePreview[entityType]}
                approvalState={approvalState[entityType]}
                onToggleCreate={(index) => toggleCreate(entityType, index)}
                onToggleUpdate={(id) => toggleUpdate(entityType, id)}
                onApproveAllCreates={() => approveAllCreates(entityType)}
              />
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t pt-4">
          <div className="flex items-center justify-between w-full">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isCommitting}
              className="text-muted-foreground"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel & Discard
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!canCommit}
              className={cn(
                canCommit
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {isCommitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Committing...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Commit Import ({totals.totalApproved} changes)
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
