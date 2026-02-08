import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface TenantUnitData {
  id: string;
  unitLabel: string;
  buildingName: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  description: string | null;
}

export function useTenantUnit() {
  return useQuery({
    queryKey: ["tenant-unit"],
    queryFn: () => api.get<TenantUnitData>("/api/tenant/unit"),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Format unit context as "Building Name - Unit Label" or just "Unit Label" if no building
 */
export function formatUnitContext(unit: TenantUnitData | undefined | null): string {
  if (!unit) return "";
  if (unit.buildingName) {
    return `${unit.buildingName} - Unit ${unit.unitLabel}`;
  }
  return `Unit ${unit.unitLabel}`;
}
