import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertCircle,
  FileText,
  ExternalLink,
  CheckCircle,
  Banknote,
  Clock,
  XCircle,
  CreditCard,
  Copy,
  Check,
  ChevronDown,
  Radio,
  Sparkles,
  Info,
  Download,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import confetti from "canvas-confetti";

interface PaymentInfo {
  paidBy: { id: string; name: string };
  paidAt: string;
  method?: string;
}

interface Invoice {
  id: string;
  periodMonth: string;
  dueDate: string;
  amountCents: number;
  status: string;
  unit: { unitLabel: string; buildingName?: string };
  payments?: PaymentInfo[];
  paymentMethod?: string | null;
  etransferStatus?: string | null;
  etransferMarkedAt?: string | null;
  etransferRejectReason?: string | null;
}

interface EtransferSettings {
  etransferEnabled: boolean;
  etransferRecipientEmail: string;
  etransferMemoTemplate: string;
}

interface PaymentBreakdown {
  invoiceId: string;
  periodMonth: string;
  rentAmountCents: number;
  processingFeeCents: number;
  totalAmountCents: number;
  feeDescription: string;
}

// Live Payment Tracker Component
function LivePaymentTracker({
  invoice,
  etransferSettings,
  onClose,
  onPaymentConfirmed,
}: {
  invoice: Invoice;
  etransferSettings: EtransferSettings;
  onClose: () => void;
  onPaymentConfirmed: () => void;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [paymentStatus, setPaymentStatus] = useState<"waiting" | "processing" | "confirmed" | "partial">("waiting");
  const queryClient = useQueryClient();

  // Poll for invoice status every 30 seconds while modal is open
  const { data: liveInvoice } = useQuery({
    queryKey: ["invoice-live-status", invoice.id],
    queryFn: () => api.get<Invoice>(`/api/tenant/invoices/${invoice.id}`),
    refetchInterval: 30000, // Poll every 30 seconds
    refetchIntervalInBackground: false,
  });

  // Check if payment was confirmed
  useEffect(() => {
    if (liveInvoice) {
      if (liveInvoice.status === "PAID") {
        setPaymentStatus("confirmed");
        setCurrentStep(3);
        // Trigger celebration
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
        // Invalidate queries to refresh the list
        queryClient.invalidateQueries({ queryKey: ["tenant-invoices"] });
        onPaymentConfirmed();
      } else if (liveInvoice.etransferStatus === "pending") {
        // A partial or pending payment was detected
        setPaymentStatus("processing");
        setCurrentStep(2);
      }
    }
  }, [liveInvoice, queryClient, onPaymentConfirmed]);

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(cents / 100);
  };

  const formatMonthYear = (periodMonth: string) => {
    const [year, month] = periodMonth.split("-");
    const date = new Date(Number(year), Number(month) - 1);
    return date.toLocaleDateString("en-CA", { month: "short", year: "numeric" });
  };

  const getMemoText = () => {
    return etransferSettings.etransferMemoTemplate
      .replace("{UNIT_LABEL}", invoice.unit.unitLabel)
      .replace("{MONTH}", formatMonthYear(invoice.periodMonth));
  };

  const steps = [
    {
      number: 1,
      title: "Send Transfer",
      description: "Send your e-Transfer using the details below",
      active: currentStep === 1,
      completed: currentStep > 1,
    },
    {
      number: 2,
      title: "Processing",
      description: "Our system is listening for your bank's notification",
      active: currentStep === 2,
      completed: currentStep > 2,
    },
    {
      number: 3,
      title: "Confirmed",
      description: "Payment verified! Your ledger has been updated",
      active: currentStep === 3,
      completed: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="relative">
        <div className="flex justify-between items-center">
          {steps.map((step, index) => (
            <div key={step.number} className="flex flex-col items-center flex-1 relative">
              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "absolute top-4 left-[50%] w-full h-0.5 -z-10",
                    step.completed ? "bg-emerald-500" : "bg-border"
                  )}
                />
              )}

              {/* Step Circle */}
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300",
                  step.completed && "bg-emerald-500 text-white",
                  step.active && !step.completed && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                  !step.active && !step.completed && "bg-muted text-muted-foreground"
                )}
              >
                {step.completed ? (
                  <Check className="h-4 w-4" />
                ) : step.active ? (
                  <Radio className="h-4 w-4 animate-pulse" />
                ) : (
                  step.number
                )}
              </div>

              {/* Step Label */}
              <p
                className={cn(
                  "text-xs font-medium mt-2 text-center",
                  step.active || step.completed ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step.title}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Content based on current step */}
      <AnimatePresence mode="wait">
        {/* Step 1: Send Transfer Instructions */}
        {currentStep === 1 && paymentStatus === "waiting" && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Transfer Details */}
            <div className="bg-muted/50 p-4 rounded-lg space-y-3 border border-border/50">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Send to
                </label>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-mono font-medium text-primary">
                    {etransferSettings.etransferRecipientEmail}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(etransferSettings.etransferRecipientEmail, "email")}
                    className="h-8 w-8 p-0"
                  >
                    {copiedField === "email" ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Amount
                </label>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-mono font-bold text-xl text-primary">
                    {formatCurrency(invoice.amountCents)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard((invoice.amountCents / 100).toFixed(2), "amount")}
                    className="h-8 w-8 p-0"
                  >
                    {copiedField === "amount" ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Memo / Message
                </label>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-mono font-medium">
                    {getMemoText()}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(getMemoText(), "memo")}
                    className="h-8 w-8 p-0"
                  >
                    {copiedField === "memo" ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* AI Reference Info Box */}
            <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <p className="font-medium">AI-Powered Verification</p>
                  <p className="text-xs mt-1 text-blue-700 dark:text-blue-300">
                    Our system uses your bank's Reference Number to verify your payment instantly.
                    Please ensure the amount sent matches your invoice exactly ({formatCurrency(invoice.amountCents)}).
                  </p>
                </div>
              </div>
            </div>

            {/* Polling indicator */}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-2">
              <div className="flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
              <span>Listening for your payment...</span>
            </div>
          </motion.div>
        )}

        {/* Step 2: Processing */}
        {currentStep === 2 && paymentStatus === "processing" && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/50 mb-4">
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
              </div>
              <h3 className="font-semibold text-lg">Processing Your Payment</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Our system is listening for your bank's notification.
                <br />
                This usually takes 5-15 minutes.
              </p>
            </div>

            {/* Polling indicator */}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
              </div>
              <span>Checking status every 30 seconds...</span>
            </div>
          </motion.div>
        )}

        {/* Step 3: Confirmed */}
        {currentStep === 3 && paymentStatus === "confirmed" && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-4"
          >
            <div className="text-center py-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/50 mb-4"
              >
                <CheckCircle className="h-10 w-10 text-emerald-600" />
              </motion.div>
              <motion.h3
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="font-semibold text-xl text-emerald-700 dark:text-emerald-300"
              >
                Payment Successful!
              </motion.h3>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-sm text-muted-foreground mt-2"
              >
                Your payment of {formatCurrency(invoice.amountCents)} has been verified.
                <br />
                Your ledger has been updated.
              </motion.p>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex flex-col gap-2"
            >
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  // TODO: Implement receipt download
                  console.log("Download receipt");
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                Download Receipt
              </Button>
              <Button onClick={onClose} className="w-full">
                Done
              </Button>
            </motion.div>
          </motion.div>
        )}

        {/* Partial Payment Detected */}
        {paymentStatus === "partial" && (
          <motion.div
            key="partial"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-amber-800 dark:text-amber-200">
                    Partial Payment Detected
                  </h4>
                  <p className="text-sm mt-1 text-amber-700 dark:text-amber-300">
                    We detected a payment but the amount doesn't match your invoice.
                    An Admin has been notified to verify your account balance manually.
                  </p>
                  <p className="text-xs mt-2 text-amber-600 dark:text-amber-400">
                    You'll receive a notification once this has been reviewed.
                  </p>
                </div>
              </div>
            </div>

            <Button variant="outline" onClick={onClose} className="w-full">
              Close
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Close button for step 1 and 2 */}
      {currentStep < 3 && paymentStatus !== "partial" && (
        <div className="pt-2 border-t border-border/50">
          <Button variant="ghost" onClick={onClose} className="w-full text-muted-foreground">
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

export default function TenantInvoices() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);
  const [etransferDialogOpen, setEtransferDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [stripeCheckoutUrl, setStripeCheckoutUrl] = useState<string | null>(null);
  const [stripeDialogOpen, setStripeDialogOpen] = useState(false);
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentBreakdown | null>(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  const { data: invoicesData, isLoading, error } = useQuery({
    queryKey: ["tenant-invoices"],
    queryFn: () => api.get<Invoice[]>("/api/tenant/invoices"),
  });

  const { data: etransferSettings } = useQuery({
    queryKey: ["etransfer-settings-tenant"],
    queryFn: () => api.get<EtransferSettings>("/api/tenant/invoices/etransfer-settings"),
  });

  // Sort: OVERDUE first, then OPEN, then PAID/VOID
  const sortedInvoices = [...(invoicesData || [])].sort((a, b) => {
    const priority = { OVERDUE: 0, OPEN: 1, PENDING_VERIFICATION: 2, PAID: 3, VOID: 4 };
    const aPriority = a.etransferStatus === "pending" ? 2 : (priority[a.status as keyof typeof priority] ?? 3);
    const bPriority = b.etransferStatus === "pending" ? 2 : (priority[b.status as keyof typeof priority] ?? 3);
    return aPriority - bPriority;
  });

  const handlePayNow = async (invoiceId: string) => {
    setLoadingInvoiceId(invoiceId);
    setLoadingBreakdown(true);
    setPaymentBreakdown(null);
    setStripeCheckoutUrl(null);

    try {
      // First, fetch the payment breakdown to show the fee
      const breakdown = await api.get<PaymentBreakdown>(
        `/api/tenant/invoices/${invoiceId}/payment-breakdown`
      );
      setPaymentBreakdown(breakdown);
      setStripeDialogOpen(true);
    } catch (err) {
      console.error("[STRIPE] Failed to get payment breakdown:", err);
      toast({
        title: "Payment Error",
        description: "Failed to load payment details. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingInvoiceId(null);
      setLoadingBreakdown(false);
    }
  };

  const handleProceedToCheckout = async () => {
    if (!paymentBreakdown) return;

    setLoadingBreakdown(true);
    try {
      const result = await api.post<{ checkoutUrl: string; sessionId: string }>(
        `/api/tenant/invoices/${paymentBreakdown.invoiceId}/checkout`
      );
      console.log("[STRIPE] Checkout result:", result);
      if (result.checkoutUrl) {
        setStripeCheckoutUrl(result.checkoutUrl);
      } else {
        console.error("[STRIPE] No checkout URL in response:", result);
        toast({
          title: "Payment Error",
          description: "No checkout URL received. Please try again.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("[STRIPE] Checkout error:", err);
      toast({
        title: "Payment Error",
        description: "Failed to initialize payment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingBreakdown(false);
    }
  };

  const handleEtransferClick = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setEtransferDialogOpen(true);
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(cents / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatMonthYearLong = (periodMonth: string) => {
    const [year, month] = periodMonth.split("-");
    const date = new Date(Number(year), Number(month) - 1);
    return date.toLocaleDateString("en-CA", { month: "long", year: "numeric" });
  };

  const getStatusDisplay = (invoice: Invoice) => {
    // Check for e-Transfer pending status
    if (invoice.etransferStatus === "pending") {
      return {
        color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
        label: "Processing",
        icon: Clock,
      };
    }
    if (invoice.etransferStatus === "rejected") {
      return {
        color: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
        label: "e-Transfer Not Found",
        icon: XCircle,
      };
    }

    switch (invoice.status) {
      case "PAID":
        return { color: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300", label: "PAID", icon: CheckCircle };
      case "OVERDUE":
        return { color: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300", label: "OVERDUE", icon: AlertCircle };
      case "VOID":
        return { color: "bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300", label: "VOID", icon: null };
      default:
        return { color: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300", label: "OPEN", icon: null };
    }
  };

  const canPay = (invoice: Invoice) => {
    // Can't pay if already paid or voided
    if (invoice.status === "PAID" || invoice.status === "VOID") return false;
    // Can't pay if e-Transfer is pending
    if (invoice.etransferStatus === "pending") return false;
    return true;
  };

  const toggleExpand = (invoiceId: string) => {
    setExpandedInvoiceId(expandedInvoiceId === invoiceId ? null : invoiceId);
  };

  // Visa and Mastercard inline SVG icons
  const CardIcons = () => (
    <span className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
      <span className="font-medium">Visa</span>
      <span className="text-muted-foreground/60">|</span>
      <span className="font-medium">MC</span>
    </span>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-48" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <p className="text-muted-foreground">Failed to load invoices</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif font-medium tracking-tight">Invoices</h1>
        <p className="text-muted-foreground text-sm mt-1">View and pay your rent invoices</p>
      </div>

      {/* Invoice List */}
      {!sortedInvoices || sortedInvoices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No invoices found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sortedInvoices.map((invoice) => {
            const statusDisplay = getStatusDisplay(invoice);
            const isPending = invoice.etransferStatus === "pending";
            const wasRejected = invoice.etransferStatus === "rejected";
            const isExpanded = expandedInvoiceId === invoice.id;
            const showPaymentOptions = canPay(invoice);

            return (
              <Card
                key={invoice.id}
                className={cn(
                  "transition-all duration-200",
                  isExpanded && "ring-1 ring-primary/20",
                  invoice.status === "OVERDUE" && "border-red-200 dark:border-red-800/50"
                )}
              >
                <CardContent className="p-0">
                  {/* Compact Row */}
                  <button
                    onClick={() => showPaymentOptions && toggleExpand(invoice.id)}
                    disabled={!showPaymentOptions}
                    className={cn(
                      "w-full p-4 flex items-center justify-between gap-3 text-left transition-colors",
                      showPaymentOptions && "hover:bg-muted/50 cursor-pointer",
                      !showPaymentOptions && "cursor-default"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Period */}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {formatMonthYearLong(invoice.periodMonth)}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {invoice.status === "PAID" && invoice.payments?.[0]
                            ? `Paid ${formatDate(invoice.payments[0].paidAt)}`
                            : `Due ${formatDate(invoice.dueDate)}`}
                        </p>
                      </div>
                    </div>

                    {/* Amount and Status */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="font-bold text-base">
                        {formatCurrency(invoice.amountCents)}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap",
                          statusDisplay.color
                        )}
                      >
                        {statusDisplay.icon && (
                          <statusDisplay.icon className="h-3 w-3" />
                        )}
                        {statusDisplay.label}
                      </span>
                      {showPaymentOptions && (
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform duration-200",
                            isExpanded && "rotate-180"
                          )}
                        />
                      )}
                    </div>
                  </button>

                  {/* Expanded Payment Options */}
                  <AnimatePresence>
                    {isExpanded && showPaymentOptions && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-2 border-t border-border/50 space-y-3">
                          {/* Rejected e-Transfer message */}
                          {wasRejected && (
                            <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 p-3 rounded-md">
                              <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="font-medium">e-Transfer not found</p>
                                <p className="text-xs mt-0.5">
                                  {invoice.etransferRejectReason ||
                                    "Please verify the payment was sent correctly and try again."}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Payment Buttons */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Pay with e-Transfer Button (Primary Option) */}
                            {etransferSettings?.etransferEnabled ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEtransferClick(invoice);
                                      }}
                                      className="h-12 sm:h-14 bg-primary hover:bg-primary/90 text-primary-foreground flex flex-col items-center justify-center gap-0.5"
                                    >
                                      <span className="flex items-center gap-2 text-xs sm:text-sm font-medium">
                                        <Banknote className="h-4 w-4" />
                                        e-Transfer
                                      </span>
                                      <span className="flex items-center gap-1 text-xs text-primary-foreground/80">
                                        <CheckCircle className="h-3 w-3" />
                                        No fees
                                      </span>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs">
                                    <p className="text-sm">
                                      Send e-Transfer to: <span className="font-mono font-medium">{etransferSettings.etransferRecipientEmail}</span>
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <Button
                                disabled
                                className="h-12 sm:h-14 flex flex-col items-center justify-center gap-0.5 opacity-50"
                              >
                                <span className="flex items-center gap-2 text-xs sm:text-sm font-medium">
                                  <Banknote className="h-4 w-4" />
                                  e-Transfer
                                </span>
                                <span className="text-xs">Not available</span>
                              </Button>
                            )}

                            {/* Pay with Card Button */}
                            <Button
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePayNow(invoice.id);
                              }}
                              disabled={loadingInvoiceId === invoice.id}
                              className="h-12 sm:h-14 flex flex-col items-center justify-center gap-0.5 border-2"
                            >
                              {loadingInvoiceId === invoice.id ? (
                                <span className="text-sm">Loading...</span>
                              ) : (
                                <>
                                  <span className="flex items-center gap-2 text-xs sm:text-sm font-medium">
                                    <CreditCard className="h-4 w-4" />
                                    Pay with Card
                                  </span>
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <CardIcons />
                                  </span>
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Non-expanded status messages for pending/paid */}
                  {isPending && !isExpanded && (
                    <div className="px-4 pb-3">
                      <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 p-2 rounded-md">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                        </span>
                        <span>Your payment is being processed automatically...</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* e-Transfer Live Tracker Dialog */}
      <Dialog open={etransferDialogOpen} onOpenChange={setEtransferDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" />
              Live Payment Tracker
            </DialogTitle>
            <DialogDescription>
              Send your e-Transfer and watch it get verified in real-time
            </DialogDescription>
          </DialogHeader>

          {selectedInvoice && etransferSettings && (
            <LivePaymentTracker
              invoice={selectedInvoice}
              etransferSettings={etransferSettings}
              onClose={() => {
                setEtransferDialogOpen(false);
                setSelectedInvoice(null);
              }}
              onPaymentConfirmed={() => {
                queryClient.invalidateQueries({ queryKey: ["tenant-invoices"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Stripe Checkout Dialog */}
      <Dialog open={stripeDialogOpen} onOpenChange={(open) => {
        setStripeDialogOpen(open);
        if (!open) {
          setPaymentBreakdown(null);
          setStripeCheckoutUrl(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {stripeCheckoutUrl ? "Complete Payment" : "Payment Summary"}
            </DialogTitle>
            <DialogDescription>
              {stripeCheckoutUrl
                ? "Click the button below to open the secure Stripe payment page."
                : "Review the payment details below before proceeding."}
            </DialogDescription>
          </DialogHeader>

          {paymentBreakdown && (
            <div className="space-y-4">
              {/* Payment breakdown */}
              <div className="bg-muted p-4 rounded-lg space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Rent ({paymentBreakdown.periodMonth})</span>
                  <span className="font-medium">{formatCurrency(paymentBreakdown.rentAmountCents)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">
                    Card Processing Fee
                    <span className="block text-xs">(2.9% + $0.30)</span>
                  </span>
                  <span className="font-medium">{formatCurrency(paymentBreakdown.processingFeeCents)}</span>
                </div>
                <div className="border-t pt-3 flex justify-between items-center">
                  <span className="font-medium">Total</span>
                  <span className="text-lg font-bold">{formatCurrency(paymentBreakdown.totalAmountCents)}</span>
                </div>
              </div>

              {/* Info about the fee */}
              <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 p-3 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  A card processing fee is added to cover payment processing costs.
                  To avoid this fee, you can pay by e-Transfer instead.
                </p>
              </div>

              {!stripeCheckoutUrl ? (
                <Button
                  onClick={handleProceedToCheckout}
                  disabled={loadingBreakdown}
                  className="w-full bg-accent hover:bg-accent/90"
                >
                  {loadingBreakdown ? (
                    "Loading..."
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-5 w-5" />
                      Proceed to Payment
                    </>
                  )}
                </Button>
              ) : (
                <a
                  href={stripeCheckoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-accent hover:bg-accent/90 text-accent-foreground font-medium py-3 px-4 rounded-md transition-colors"
                  onClick={() => setStripeDialogOpen(false)}
                >
                  <CreditCard className="h-5 w-5" />
                  Open Stripe Checkout
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setStripeDialogOpen(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
