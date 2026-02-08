import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Car,
  Trash2,
  Moon,
  Phone,
  Info,
  AlertCircle,
  Book,
  FileText,
  ExternalLink,
  Download,
  Package,
} from "lucide-react";
import type { UnitAsset } from "../../../../backend/src/types";

interface EmergencyContact {
  name: string;
  phone: string;
  role?: string;
}

interface BuildingInfo {
  id: string | null;
  buildingName: string | null;
  parkingRules: string | null;
  garbageSchedule: string | null;
  quietHours: string | null;
  emergencyContacts: EmergencyContact[] | null;
  customNotes: string | null;
  updatedAt: string | null;
}

interface TenantUnit {
  id: string;
  unitLabel: string;
  buildingName: string;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  description: string | null;
}

export default function TenantMyUnit() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-serif font-medium">My Unit</h1>
        <p className="text-muted-foreground">
          Unit details, appliances, and building information
        </p>
      </div>

      <Tabs defaultValue="unit" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="unit" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Unit Info</span>
            <span className="sm:hidden">Unit</span>
          </TabsTrigger>
          <TabsTrigger value="appliances" className="flex items-center gap-2">
            <Book className="h-4 w-4" />
            <span className="hidden sm:inline">Appliances</span>
            <span className="sm:hidden">Appliances</span>
          </TabsTrigger>
          <TabsTrigger value="building" className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            <span className="hidden sm:inline">Building</span>
            <span className="sm:hidden">Building</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unit">
          <UnitInfoTab />
        </TabsContent>

        <TabsContent value="appliances">
          <AppliancesTab />
        </TabsContent>

        <TabsContent value="building">
          <BuildingInfoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UnitInfoTab() {
  const { data: unit, isLoading, error } = useQuery({
    queryKey: ["tenant-unit"],
    queryFn: () => api.get<TenantUnit>("/api/tenant/unit"),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <Skeleton className="h-6 w-32 mb-4" />
          <Skeleton className="h-4 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </CardContent>
      </Card>
    );
  }

  if (error || !unit) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">Unable to load unit information</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          {unit.buildingName} — Unit {unit.unitLabel}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {unit.bedrooms !== null && (
            <div>
              <p className="text-sm text-muted-foreground">Bedrooms</p>
              <p className="font-medium">{unit.bedrooms}</p>
            </div>
          )}
          {unit.bathrooms !== null && (
            <div>
              <p className="text-sm text-muted-foreground">Bathrooms</p>
              <p className="font-medium">{unit.bathrooms}</p>
            </div>
          )}
          {unit.sqft !== null && (
            <div>
              <p className="text-sm text-muted-foreground">Square Feet</p>
              <p className="font-medium">{unit.sqft.toLocaleString()} sqft</p>
            </div>
          )}
        </div>
        {unit.description && (
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-2">Description</p>
            <p className="text-sm">{unit.description}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface UnitAssetsResponse {
  unit: { id: string; unitLabel: string };
  assets: UnitAsset[];
}

function AppliancesTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["tenant-unit-assets"],
    queryFn: () => api.get<UnitAssetsResponse>("/api/tenant/unit-assets"),
  });

  const assets = data?.assets ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="py-4">
              <Skeleton className="h-5 w-40 mb-2" />
              <Skeleton className="h-4 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">Failed to load appliances</p>
        </CardContent>
      </Card>
    );
  }

  if (assets.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">No appliances or manuals available</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Contact your property manager for more information
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {assets.map((asset) => (
        <AssetCard key={asset.id} asset={asset} />
      ))}
    </div>
  );
}

function AssetCard({ asset }: { asset: UnitAsset }) {
  const hasManuals = asset.files.length > 0 || asset.links.length > 0;

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium">{asset.name}</h3>
              <Badge variant="outline" className="text-xs">
                {getCategoryLabel(asset.category)}
              </Badge>
            </div>

            {(asset.brand || asset.modelNumber) && (
              <p className="text-sm text-muted-foreground mt-1">
                {asset.brand}
                {asset.brand && asset.modelNumber && " - "}
                {asset.modelNumber && `Model: ${asset.modelNumber}`}
              </p>
            )}

            {asset.location && (
              <p className="text-sm text-muted-foreground">
                Location: {asset.location}
              </p>
            )}

            {asset.notes && (
              <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                {asset.notes}
              </p>
            )}
          </div>
        </div>

        {hasManuals && (
          <div className="mt-4 pt-4 border-t space-y-2">
            <p className="text-sm font-medium text-muted-foreground mb-2">Manuals & Links</p>
            {asset.files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between gap-2 p-2 bg-muted/50 rounded-md"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">{file.filename}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    window.open(
                      `${import.meta.env.VITE_BACKEND_URL}/api/uploads/unit-assets/${file.storageKey}`,
                      "_blank"
                    )
                  }
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {asset.links.map((link) => (
              <div
                key={link.id}
                className="flex items-center justify-between gap-2 p-2 bg-muted/50 rounded-md"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">{link.label}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(link.url, "_blank")}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
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

function BuildingInfoTab() {
  const { data: buildingInfo, isLoading, error } = useQuery({
    queryKey: ["tenant-building-info"],
    queryFn: () => api.get<BuildingInfo>("/api/tenant/building-info"),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
          <p className="text-muted-foreground">Failed to load building information</p>
        </CardContent>
      </Card>
    );
  }

  const hasAnyContent =
    buildingInfo?.parkingRules ||
    buildingInfo?.garbageSchedule ||
    buildingInfo?.quietHours ||
    (buildingInfo?.emergencyContacts && buildingInfo.emergencyContacts.length > 0) ||
    buildingInfo?.customNotes;

  if (!hasAnyContent) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Info className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">
            No building information has been added yet.
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Contact your property manager for more details.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Parking Rules */}
      <InfoCard icon={Car} title="Parking Rules" content={buildingInfo?.parkingRules} />

      {/* Garbage & Recycling */}
      <InfoCard
        icon={Trash2}
        title="Garbage & Recycling Schedule"
        content={buildingInfo?.garbageSchedule}
      />

      {/* Quiet Hours */}
      <InfoCard icon={Moon} title="Quiet Hours" content={buildingInfo?.quietHours} />

      {/* Emergency Contacts */}
      {buildingInfo?.emergencyContacts && buildingInfo.emergencyContacts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              Emergency Contacts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {buildingInfo.emergencyContacts.map((contact, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div>
                    <p className="font-medium">{contact.name}</p>
                    {contact.role && (
                      <p className="text-sm text-muted-foreground">{contact.role}</p>
                    )}
                  </div>
                  <a
                    href={`tel:${contact.phone}`}
                    className="text-primary hover:underline font-medium"
                  >
                    {contact.phone}
                  </a>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Additional Information */}
      <InfoCard icon={Info} title="Additional Information" content={buildingInfo?.customNotes} />
    </div>
  );
}

interface InfoCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  content: string | null | undefined;
}

function InfoCard({ icon: Icon, title, content }: InfoCardProps) {
  if (!content) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="prose prose-sm max-w-none text-foreground">
          {content.split("\n").map((line, index) => (
            <p key={index} className="mb-2 last:mb-0">
              {line}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
