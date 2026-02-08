import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Trash2,
  Building2,
  Users,
  Receipt,
  Wrench,
  FileText,
  Shield,
  Mail,
  Settings,
  History,
  Loader2,
  ChevronLeft,
  CheckCircle2,
} from "lucide-react";

interface DataPurgeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurgeComplete: () => void;
}

type PurgeStep = 1 | 2 | 3;

export function DataPurgeModal({ open, onOpenChange, onPurgeComplete }: DataPurgeModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState<PurgeStep>(1);
  const [confirmationText, setConfirmationText] = useState("");

  const CONFIRMATION_PHRASE = "PURGE DATA";

  // Reset state when modal opens/closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setCurrentStep(1);
      setConfirmationText("");
    }
    onOpenChange(newOpen);
  };

  // Purge data mutation
  const purgeDataMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post("/api/admin/data-purge", {
        confirmationText: CONFIRMATION_PHRASE,
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Data Cleared",
        description: "All property data has been permanently removed.",
      });
      queryClient.invalidateQueries();
      handleOpenChange(false);
      onPurgeComplete();
    },
    onError: (error: ApiError) => {
      toast({
        title: "Error",
        description: error.message || "Failed to clear data. Please try again.",
        variant: "destructive",
      });
    },
  });

  const goToNextStep = () => {
    if (currentStep < 3) {
      setCurrentStep((currentStep + 1) as PurgeStep);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as PurgeStep);
    }
  };

  const handlePurge = () => {
    if (confirmationText === CONFIRMATION_PHRASE) {
      purgeDataMutation.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Step 1: Initial Warning */}
        {currentStep === 1 && (
          <>
            <DialogHeader className="text-center pb-2">
              <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <DialogTitle className="text-xl font-semibold text-center">
                Clear All Property Data
              </DialogTitle>
              <DialogDescription className="text-center pt-2 text-base">
                This will permanently remove all{" "}
                <span className="font-medium text-foreground">Buildings</span>,{" "}
                <span className="font-medium text-foreground">Units</span>,{" "}
                <span className="font-medium text-foreground">Tenants</span>,{" "}
                <span className="font-medium text-foreground">Invoices</span>, and{" "}
                <span className="font-medium text-foreground">Documents</span>.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Your Admin login and Email Templates will be preserved. This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                className="flex-1 sm:flex-none"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={goToNextStep}
                className="flex-1 sm:flex-none"
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 2: Consequences List */}
        {currentStep === 2 && (
          <>
            <DialogHeader className="pb-2">
              <DialogTitle className="text-lg font-semibold">
                Review What Will Happen
              </DialogTitle>
              <DialogDescription className="text-sm">
                Please review the changes before proceeding.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {/* What will be deleted */}
              <div>
                <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-3 flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Will be permanently deleted:
                </h4>
                <div className="space-y-2">
                  {[
                    { icon: Building2, label: "All Properties and Units" },
                    { icon: Users, label: "All Tenant accounts and data" },
                    { icon: Receipt, label: "All Invoices and Payments" },
                    { icon: Wrench, label: "All Service Requests" },
                    { icon: FileText, label: "All Documents and Attachments" },
                  ].map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg"
                    >
                      <item.icon className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                      <span className="text-sm text-red-800 dark:text-red-200">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* What will be preserved */}
              <div>
                <h4 className="text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Will be preserved:
                </h4>
                <div className="space-y-2">
                  {[
                    { icon: Shield, label: "Admin accounts" },
                    { icon: Mail, label: "Email Templates" },
                    { icon: Settings, label: "System Settings" },
                    { icon: History, label: "Audit History" },
                  ].map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg"
                    >
                      <item.icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                      <span className="text-sm text-emerald-800 dark:text-emerald-200">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={goToPreviousStep}
                className="flex-1 sm:flex-none"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Go Back
              </Button>
              <Button
                variant="destructive"
                onClick={goToNextStep}
                className="flex-1 sm:flex-none"
              >
                I understand, proceed
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 3: Final Confirmation */}
        {currentStep === 3 && (
          <>
            <DialogHeader className="pb-2">
              <DialogTitle className="text-lg font-semibold">
                Final Confirmation
              </DialogTitle>
              <DialogDescription className="text-sm">
                This action is irreversible. Type the confirmation phrase to proceed.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-sm text-red-800 dark:text-red-200 mb-4">
                  To confirm, type{" "}
                  <span className="font-mono font-bold bg-red-100 dark:bg-red-900/50 px-2 py-0.5 rounded">
                    {CONFIRMATION_PHRASE}
                  </span>{" "}
                  below:
                </p>
                <Input
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  placeholder="Type confirmation phrase here"
                  className={cn(
                    "font-mono",
                    confirmationText === CONFIRMATION_PHRASE &&
                      "border-red-500 focus-visible:ring-red-500"
                  )}
                  disabled={purgeDataMutation.isPending}
                />
              </div>
            </div>
            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={goToPreviousStep}
                disabled={purgeDataMutation.isPending}
                className="flex-1 sm:flex-none"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Go Back
              </Button>
              <Button
                variant="destructive"
                onClick={handlePurge}
                disabled={confirmationText !== CONFIRMATION_PHRASE || purgeDataMutation.isPending}
                className="flex-1 sm:flex-none"
              >
                {purgeDataMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Purging...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Purge All Data
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
