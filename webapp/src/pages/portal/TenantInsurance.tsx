import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  Upload,
  Eye,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { InsuranceFileUpload } from "@/components/insurance/InsuranceFileUpload";

type InsuranceStatus = "MISSING" | "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

interface InsuranceStatusData {
  status: InsuranceStatus;
  provider: string | null;
  expiresAt: string | null;
  verifiedAt: string | null;
  documentUrl: string | null;
  rejectionReason: string | null;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

export default function TenantInsurance() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [provider, setProvider] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["tenant-insurance-status"],
    queryFn: () => api.get<InsuranceStatusData>("/api/tenant/insurance/status"),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file selected");

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("provider", provider);
      formData.append("expiresAt", expiresAt);

      const response = await fetch(`${BACKEND_URL}/api/tenant/insurance/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Upload failed");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-insurance-status"] });
      setShowUploadForm(false);
      setProvider("");
      setExpiresAt("");
      setSelectedFile(null);
      toast({
        title: "Insurance Uploaded",
        description: "Your insurance document has been submitted for review.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload insurance. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast({
        title: "No File Selected",
        description: "Please select a file to upload.",
        variant: "destructive",
      });
      return;
    }
    uploadMutation.mutate();
  };

  const handleCancelUpload = () => {
    setShowUploadForm(false);
    setProvider("");
    setExpiresAt("");
    setSelectedFile(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const isExpiringSoon = (expiresAt: string | null): boolean => {
    if (!expiresAt) return false;
    const expiryDate = new Date(expiresAt);
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return expiryDate <= thirtyDaysFromNow && expiryDate > now;
  };

  const getDaysUntilExpiry = (expiresAt: string): number => {
    const expiryDate = new Date(expiresAt);
    const now = new Date();
    const diffTime = expiryDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getStatusBadge = (status: InsuranceStatus) => {
    switch (status) {
      case "APPROVED":
        return (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-sm px-3 py-1">
            <CheckCircle className="h-4 w-4 mr-1.5" />
            Compliant
          </Badge>
        );
      case "PENDING":
        return (
          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-sm px-3 py-1">
            <Clock className="h-4 w-4 mr-1.5" />
            Pending Review
          </Badge>
        );
      case "REJECTED":
        return (
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-sm px-3 py-1">
            <XCircle className="h-4 w-4 mr-1.5" />
            Rejected
          </Badge>
        );
      case "EXPIRED":
        return (
          <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-sm px-3 py-1">
            <AlertTriangle className="h-4 w-4 mr-1.5" />
            Expired
          </Badge>
        );
      case "MISSING":
      default:
        return (
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-sm px-3 py-1">
            <AlertCircle className="h-4 w-4 mr-1.5" />
            Action Required
          </Badge>
        );
    }
  };

  const getStatusMessage = (status: InsuranceStatus) => {
    switch (status) {
      case "APPROVED":
        return "Your renters insurance is verified and compliant.";
      case "PENDING":
        return "Your insurance document is under review by our team.";
      case "REJECTED":
        return "Your insurance document was not accepted. Please review the reason below and submit again.";
      case "EXPIRED":
        return "Your insurance policy has expired. Please upload a current policy.";
      case "MISSING":
      default:
        return "Renters insurance is required. Please submit proof of insurance.";
    }
  };

  const canPreviewDocument = (url: string | null): boolean => {
    if (!url) return false;
    const ext = url.toLowerCase();
    return ext.endsWith(".jpg") || ext.endsWith(".jpeg") || ext.endsWith(".png");
  };

  const handleViewDocument = (url: string) => {
    window.open(`${BACKEND_URL}${url}`, "_blank");
  };

  if (isLoading) {
    return <InsuranceSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <p className="text-muted-foreground">Failed to load insurance status</p>
      </div>
    );
  }

  const needsAction = data.status === "MISSING" || data.status === "REJECTED" || data.status === "EXPIRED";
  const showExpiryWarning = data.status === "APPROVED" && isExpiringSoon(data.expiresAt);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif font-medium">Renters Insurance</h1>
        <p className="text-muted-foreground">
          Manage your insurance compliance status
        </p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Insurance Status
            </div>
            {getStatusBadge(data.status)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">{getStatusMessage(data.status)}</p>

          {/* Approved Status - Show details */}
          {data.status === "APPROVED" && (
            <>
              {/* Expiry Warning */}
              {showExpiryWarning && data.expiresAt && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 text-amber-700">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="font-medium">Expiring Soon</span>
                  </div>
                  <p className="text-sm text-amber-600 mt-2">
                    Your insurance policy expires in {getDaysUntilExpiry(data.expiresAt)} days ({formatDate(data.expiresAt)}).
                    Please upload your renewed policy before it expires to maintain compliance.
                  </p>
                </div>
              )}

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Insurance Verified</span>
                </div>
                <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Provider</dt>
                    <dd className="font-medium">{data.provider || "N/A"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Expires</dt>
                    <dd className="font-medium">
                      {data.expiresAt ? formatDate(data.expiresAt) : "N/A"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Verified On</dt>
                    <dd className="font-medium">
                      {data.verifiedAt ? formatDate(data.verifiedAt) : "N/A"}
                    </dd>
                  </div>
                </dl>
                {data.documentUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewDocument(data.documentUrl!)}
                    className="mt-2"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Document
                  </Button>
                )}
              </div>

              {/* Option to update insurance */}
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-3">
                  Changed insurance providers? You can upload a new policy document at any time.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setShowUploadForm(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload New Insurance Document
                </Button>
              </div>
            </>
          )}

          {/* Pending Status */}
          {data.status === "PENDING" && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-amber-700">
                <Clock className="h-5 w-5" />
                <span className="font-medium">Under Review</span>
              </div>
              <p className="text-sm text-amber-600 mt-2">
                Your insurance document is being reviewed. This typically takes 1-2 business days.
              </p>
              {data.provider && (
                <p className="text-sm mt-2">
                  <span className="text-muted-foreground">Provider:</span>{" "}
                  <span className="font-medium">{data.provider}</span>
                </p>
              )}
              {data.documentUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewDocument(data.documentUrl!)}
                  className="mt-3"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Submitted Document
                </Button>
              )}

              {/* Option to upload different document */}
              <div className="mt-4 pt-4 border-t border-amber-200">
                <p className="text-sm text-amber-600 mb-3">
                  Need to upload a different document? You can submit a new one to replace the pending submission.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUploadForm(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Different Document
                </Button>
              </div>
            </div>
          )}

          {/* Rejected Status */}
          {data.status === "REJECTED" && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-700">
                <XCircle className="h-5 w-5" />
                <span className="font-medium">Insurance Rejected</span>
              </div>
              {data.rejectionReason && (
                <div className="mt-3 p-3 bg-red-100 rounded-md">
                  <p className="text-sm font-medium text-red-800">Reason for Rejection:</p>
                  <p className="text-sm text-red-700 mt-1">{data.rejectionReason}</p>
                </div>
              )}
              <p className="text-sm text-red-600 mt-3">
                Please address the issue above and upload a new document.
              </p>
            </div>
          )}

          {/* Expired Status */}
          {data.status === "EXPIRED" && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-orange-700">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-medium">Policy Expired</span>
              </div>
              <p className="text-sm text-orange-600 mt-2">
                Your insurance policy expired on{" "}
                {data.expiresAt ? formatDate(data.expiresAt) : "an unknown date"}.
                Please upload your renewed policy.
              </p>
            </div>
          )}

          {/* Missing Status */}
          {data.status === "MISSING" && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-700">
                <AlertCircle className="h-5 w-5" />
                <span className="font-medium">No Insurance on File</span>
              </div>
              <p className="text-sm text-red-600 mt-2">
                You must submit proof of renters insurance to remain compliant with your lease agreement.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Form Section - Show when action is needed OR when user clicks to upload new document */}
      {(needsAction || showUploadForm) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {data.status === "APPROVED" || data.status === "PENDING"
                ? "Update Insurance"
                : "Submit Insurance"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Manual Upload Form */}
            {!showUploadForm ? (
              <Button
                variant="outline"
                onClick={() => setShowUploadForm(true)}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Insurance Document
              </Button>
            ) : (
              <form onSubmit={handleUploadSubmit} className="space-y-4">
                {(data.status === "APPROVED" || data.status === "PENDING") && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-blue-700">
                      Uploading a new document will replace your current insurance on file and require re-verification.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="provider">Insurance Provider</Label>
                  <Input
                    id="provider"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    placeholder="e.g., State Farm, Allstate, Lemonade"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expiresAt">Policy Expiration Date</Label>
                  <Input
                    id="expiresAt"
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Insurance Document</Label>
                  <InsuranceFileUpload
                    onFileSelect={setSelectedFile}
                    selectedFile={selectedFile}
                    disabled={uploadMutation.isPending}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelUpload}
                    disabled={uploadMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={uploadMutation.isPending || !selectedFile}
                  >
                    {uploadMutation.isPending ? "Uploading..." : "Submit Insurance"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Insurance Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <span>Minimum liability coverage of $1,000,000</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <span>Comprehensive Tenant Insurance including Additional Living Expenses</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <span>Policy must be active; proof required at move-in and upon annual renewal</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <span>Property address must match the specific unit number on the lease</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <span>Landlord must be listed as an Additional Interest (to receive notice of cancellation)</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <span>All adult residents listed on the lease must be named on the policy</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function InsuranceSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-6 w-24" />
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full mb-4" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
