import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  FileText,
  Download,
  File,
  FileCheck,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface TenantDocument {
  id: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  description: string | null;
  uploadedByName: string;
  createdAt: string;
}

const DOCUMENT_TYPES: Record<string, { label: string; description: string }> = {
  LEASE: { label: "Lease Agreement", description: "Your rental lease agreement" },
  ADDENDUM: { label: "Lease Addendum", description: "Amendments or additions to your lease" },
  SIGNED_AGREEMENT: { label: "Signed Agreement", description: "Other signed documents" },
  OTHER: { label: "Other Document", description: "Additional documents" },
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getDocumentIcon(type: string) {
  switch (type) {
    case "LEASE":
      return <FileCheck className="h-6 w-6 text-primary" />;
    case "ADDENDUM":
      return <FileText className="h-6 w-6 text-blue-500" />;
    case "SIGNED_AGREEMENT":
      return <FileCheck className="h-6 w-6 text-green-500" />;
    default:
      return <File className="h-6 w-6 text-muted-foreground" />;
  }
}

function getDocumentTypeLabel(type: string) {
  return DOCUMENT_TYPES[type]?.label || type;
}

export default function TenantDocuments() {
  const { data: documents, isLoading } = useQuery({
    queryKey: ["tenant", "documents"],
    queryFn: () => api.get<TenantDocument[]>("/api/tenant/documents"),
  });

  const handleViewDocument = (fileUrl: string) => {
    window.open(`${import.meta.env.VITE_BACKEND_URL}${fileUrl}`, "_blank");
  };

  // Group documents by type
  const groupedDocuments = documents?.reduce((acc, doc) => {
    if (!acc[doc.documentType]) {
      acc[doc.documentType] = [];
    }
    acc[doc.documentType].push(doc);
    return acc;
  }, {} as Record<string, TenantDocument[]>);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium">My Documents</h1>
        <p className="text-muted-foreground mt-1">
          Access your lease agreements and other important documents
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : documents && documents.length > 0 ? (
        <div className="space-y-6">
          {Object.entries(DOCUMENT_TYPES).map(([type, info]) => {
            const typeDocs = groupedDocuments?.[type];
            if (!typeDocs || typeDocs.length === 0) return null;

            return (
              <Card key={type}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {getDocumentIcon(type)}
                    {info.label}
                  </CardTitle>
                  <CardDescription>{info.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {typeDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{doc.fileName}</span>
                          </div>
                          {doc.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {doc.description}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">
                            Added on {formatDate(doc.createdAt)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDocument(doc.fileUrl)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium">No documents yet</h3>
            <p className="text-muted-foreground mt-2 text-center max-w-md">
              Your property manager will upload important documents like your lease agreement here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
