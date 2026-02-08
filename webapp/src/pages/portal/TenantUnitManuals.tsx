import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Package,
  FileText,
  ExternalLink,
  Download,
  Wrench,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { UnitAsset } from "../../../../backend/src/types";

interface UnitAssetsResponse {
  unit: { id: string; unitLabel: string };
  assets: UnitAsset[];
}

function getCategoryLabel(category: string): string {
  switch (category) {
    case "APPLIANCE":
      return "Appliance";
    case "HVAC":
      return "HVAC";
    case "PLUMBING":
      return "Plumbing";
    case "ELECTRICAL":
      return "Electrical";
    case "SMART_HOME":
      return "Smart Home";
    case "OTHER":
      return "Other";
    default:
      return category;
  }
}

function formatServiceInterval(interval: string | null): string {
  if (!interval) return "";
  switch (interval) {
    case "3_MONTHS":
      return "Every 3 months";
    case "6_MONTHS":
      return "Every 6 months";
    case "ANNUALLY":
      return "Annually";
    case "OTHER":
      return "Other";
    default:
      return interval;
  }
}

interface AssetCardProps {
  asset: UnitAsset;
}

function AssetCard({ asset }: AssetCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasManuals = asset.files.length > 0 || asset.links.length > 0;
  const hasDetails = hasManuals || asset.notes;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium">{asset.name}</h4>
              <Badge variant="outline" className="text-xs">
                {getCategoryLabel(asset.category)}
              </Badge>
            </div>

            {(asset.brand || asset.modelNumber) ? (
              <p className="text-sm text-muted-foreground mt-1">
                {asset.brand ? asset.brand : null}
                {asset.brand && asset.modelNumber ? " - " : null}
                {asset.modelNumber ? `Model: ${asset.modelNumber}` : null}
              </p>
            ) : null}

            {asset.location ? (
              <p className="text-sm text-muted-foreground">
                Location: {asset.location}
              </p>
            ) : null}
          </div>
        </div>

        {hasDetails ? (
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full mt-3 text-muted-foreground">
                <ChevronDown className={cn("h-4 w-4 mr-2 transition-transform", isExpanded && "rotate-180")} />
                {isExpanded ? "Hide Details" : "View Manuals & Details"}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-4">
              {/* Manuals/Files Section */}
              {hasManuals ? (
                <div>
                  <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Manuals & Links
                  </h5>
                  <div className="space-y-2">
                    {asset.files.map((file) => (
                      <div key={file.id} className="flex items-center justify-between gap-2 text-sm p-2 bg-muted rounded">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">{file.filename}</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`${import.meta.env.VITE_BACKEND_URL}/api/uploads/unit-assets/${file.storageKey}`, "_blank")}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      </div>
                    ))}
                    {asset.links.map((link) => (
                      <div key={link.id} className="flex items-center justify-between gap-2 text-sm p-2 bg-muted rounded">
                        <div className="flex items-center gap-2 min-w-0">
                          <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">{link.label}</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(link.url, "_blank")}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Open
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Service Info (if relevant to tenant) */}
              {asset.serviceProviderContact ? (
                <div>
                  <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    Service Contact
                  </h5>
                  <p className="text-sm text-muted-foreground">{asset.serviceProviderContact}</p>
                </div>
              ) : null}

              {/* Notes */}
              {asset.notes ? (
                <div>
                  <h5 className="text-sm font-medium mb-2">Notes</h5>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{asset.notes}</p>
                </div>
              ) : null}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function TenantUnitManuals() {
  const { data, isLoading } = useQuery({
    queryKey: ["tenant", "unit-assets"],
    queryFn: () => api.get<UnitAssetsResponse>("/api/tenant/unit-assets"),
  });

  const assets = data?.assets ?? [];

  // Group assets by category
  const assetsByCategory = assets.reduce((acc, asset) => {
    const category = getCategoryLabel(asset.category);
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(asset);
    return acc;
  }, {} as Record<string, UnitAsset[]>);

  const categories = Object.keys(assetsByCategory).sort();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium">Appliances & Manuals</h1>
        <p className="text-muted-foreground mt-1">
          View appliances in your unit and download manuals
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : assets.length > 0 ? (
        <div className="space-y-8">
          {categories.map((category) => (
            <div key={category}>
              <h2 className="text-lg font-medium mb-4">{category}</h2>
              <div className="space-y-4">
                {assetsByCategory[category].map((asset) => (
                  <AssetCard key={asset.id} asset={asset} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <Package className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium">No appliances listed</h3>
            <p className="text-muted-foreground mt-2">
              Your property manager has not added any appliances or manuals for your unit yet.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
