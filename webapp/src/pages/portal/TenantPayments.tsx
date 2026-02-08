import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  CreditCard,
  Download,
  Wallet,
  CheckCircle,
} from "lucide-react";

interface Payment {
  id: string;
  amountCents: number;
  paidAt: string;
  receiptUrl: string | null;
  paymentMethod: "STRIPE" | "ETRANSFER" | null;
  invoice: { periodMonth: string };
  unit: { unitLabel: string; buildingName?: string };
}

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

export default function TenantPayments() {
  const {
    data: payments,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["tenant-payments"],
    queryFn: () => api.get<Payment[]>("/api/tenant/payments"),
  });

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

  const formatPeriod = (periodMonth: string) => {
    // periodMonth is in format "YYYY-MM" or "January 2024"
    if (periodMonth.includes("-")) {
      const [year, month] = periodMonth.split("-");
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return date.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "long",
      });
    }
    return periodMonth;
  };

  const getPaymentMethodBadge = (method: Payment["paymentMethod"]) => {
    if (method === "STRIPE") {
      return (
        <Badge variant="default" className="gap-1">
          <CreditCard className="h-3 w-3" />
          Stripe
        </Badge>
      );
    }
    if (method === "ETRANSFER") {
      return (
        <Badge variant="secondary" className="gap-1">
          <Wallet className="h-3 w-3" />
          E-Transfer
        </Badge>
      );
    }
    return <span className="text-muted-foreground">-</span>;
  };

  const handleDownloadReceipt = (paymentId: string) => {
    // Open receipt in new tab
    window.open(`${API_BASE_URL}/api/tenant/payments/${paymentId}/receipt`, "_blank");
  };

  // Get last payment for gratitude card
  const lastPayment = payments && payments.length > 0 ? payments[0] : null;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-24 w-full max-w-sm" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <p className="text-muted-foreground">Failed to load payments</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium">Payment History</h1>
        <p className="text-muted-foreground">View your past rent payments</p>
      </div>

      {/* Last Payment Gratitude Card */}
      {lastPayment && (
        <Card className="bg-gradient-to-br from-blue-50 to-slate-50 border-blue-200 dark:from-blue-950/30 dark:to-slate-950/30 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/50">
                <CheckCircle className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  Last Payment Received
                </p>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                  {formatCurrency(lastPayment.amountCents)}
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                  on {formatDate(lastPayment.paidAt)}
                </p>
                <p className="text-sm text-muted-foreground mt-2 italic">
                  Thank you for your payment. Your account is appreciated.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!payments || payments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CreditCard className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No payments found</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Payments</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">
                        {formatDate(payment.paidAt)}
                      </TableCell>
                      <TableCell>
                        {formatPeriod(payment.invoice.periodMonth)}
                      </TableCell>
                      <TableCell className="font-semibold text-green-600">
                        {formatCurrency(payment.amountCents)}
                      </TableCell>
                      <TableCell>
                        {getPaymentMethodBadge(payment.paymentMethod)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadReceipt(payment.id)}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-4">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="border rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-green-600">
                      {formatCurrency(payment.amountCents)}
                    </span>
                    {getPaymentMethodBadge(payment.paymentMethod)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>Period: {formatPeriod(payment.invoice.periodMonth)}</p>
                    <p>Paid: {formatDate(payment.paidAt)}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => handleDownloadReceipt(payment.id)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Receipt
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
