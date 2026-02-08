import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  FileText,
  FileSpreadsheet,
  Building2,
  Calendar,
  Loader2,
  Home,
  Users,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

interface RentRollUnit {
  unitId: string;
  unitLabel: string;
  sqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  description: string;
  status: string;
  rentAmountCents: number | null;
  tenants: Array<{
    id: string;
    name: string;
    email: string;
    roleInUnit: string;
    moveInDate: string;
  }>;
  primaryTenantName: string;
  moveInDate: string | null;
}

interface RentRollData {
  buildingName: string;
  periodMonth: string;
  generatedAt: string;
  summary: {
    totalUnits: number;
    occupiedUnits: number;
    vacantUnits: number;
    totalMonthlyRentCents: number;
    occupancyRate: number;
  };
  units: RentRollUnit[];
}

interface RentRollModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingNames: string[];
}

function formatCurrency(cents: number | null) {
  if (cents === null || cents === 0) return "-";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

function formatDate(dateString: string | null) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatMonth(periodMonth: string) {
  const [year, month] = periodMonth.split("-");
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
  });
}

// Generate month options (past 12 months + next 3 months)
function getMonthOptions() {
  const options: { value: string; label: string }[] = [];
  const now = new Date();

  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("en-CA", { year: "numeric", month: "long" });
    options.push({ value, label });
  }

  for (let i = 1; i <= 3; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("en-CA", { year: "numeric", month: "long" });
    options.push({ value, label });
  }

  return options;
}

export function RentRollModal({ open, onOpenChange, buildingNames }: RentRollModalProps) {
  const [selectedBuilding, setSelectedBuilding] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [isExporting, setIsExporting] = useState(false);

  const monthOptions = useMemo(() => getMonthOptions(), []);

  // Fetch rent roll data
  const { data: rentRollData, isLoading } = useQuery({
    queryKey: ["admin", "rent-roll", selectedBuilding, selectedMonth],
    queryFn: () =>
      api.get<RentRollData>(
        `/api/admin/units/rent-roll?buildingName=${encodeURIComponent(selectedBuilding)}&periodMonth=${selectedMonth}`
      ),
    enabled: !!selectedBuilding && open,
  });

  const handleExportPDF = async () => {
    if (!rentRollData) return;

    setIsExporting(true);
    try {
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "letter",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginLeft = 15;
      const marginRight = 15;
      const contentWidth = pageWidth - marginLeft - marginRight;

      // Color palette - Professional navy and gray theme
      const navyBlue: [number, number, number] = [15, 32, 65]; // #0F2041
      const darkGray: [number, number, number] = [55, 65, 81]; // #374151
      const mediumGray: [number, number, number] = [107, 114, 128]; // #6B7280
      const lightGray: [number, number, number] = [249, 250, 251]; // #F9FAFB
      const zebraGray: [number, number, number] = [243, 244, 246]; // #F3F4F6
      const white: [number, number, number] = [255, 255, 255];

      // ============================================
      // HEADER SECTION - Centered branding
      // ============================================

      // Company Name - Bold, centered
      doc.setFontSize(28);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...navyBlue);
      doc.text("GA DEVELOPMENTS", pageWidth / 2, 18, { align: "center" });

      // Horizontal divider line under company name
      doc.setDrawColor(...navyBlue);
      doc.setLineWidth(0.8);
      doc.line(marginLeft + 60, 23, pageWidth - marginLeft - 60, 23);

      // Report title
      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...darkGray);
      doc.text("RENT ROLL REPORT", pageWidth / 2, 31, { align: "center" });

      // ============================================
      // METADATA SECTION - Two-column sub-header
      // ============================================

      const metadataY = 42;
      const col1X = marginLeft;
      const col2X = pageWidth - marginRight;

      // Left column - Building info
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...darkGray);
      doc.text("Building:", col1X, metadataY);
      doc.setFont("helvetica", "normal");
      doc.text(rentRollData.buildingName, col1X + 22, metadataY);

      doc.setFont("helvetica", "bold");
      doc.text("Period:", col1X, metadataY + 6);
      doc.setFont("helvetica", "normal");
      doc.text(formatMonth(rentRollData.periodMonth), col1X + 22, metadataY + 6);

      // Right column - Generation date and occupancy
      doc.setFont("helvetica", "bold");
      doc.text("Generated:", col2X - 75, metadataY, { align: "left" });
      doc.setFont("helvetica", "normal");
      doc.text(
        new Date(rentRollData.generatedAt).toLocaleDateString("en-CA", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        col2X,
        metadataY,
        { align: "right" }
      );

      doc.setFont("helvetica", "bold");
      doc.text("Occupancy:", col2X - 75, metadataY + 6, { align: "left" });
      doc.setFont("helvetica", "normal");
      doc.text(
        `${rentRollData.summary.occupiedUnits} of ${rentRollData.summary.totalUnits} units (${rentRollData.summary.occupancyRate}%)`,
        col2X,
        metadataY + 6,
        { align: "right" }
      );

      // Thin separator line before table
      doc.setDrawColor(...mediumGray);
      doc.setLineWidth(0.3);
      doc.line(marginLeft, metadataY + 12, pageWidth - marginRight, metadataY + 12);

      // ============================================
      // TABLE DATA - Professional financial layout
      // ============================================

      // Format currency for PDF - right-aligned, consistent $0,000.00 format
      const formatPDFCurrency = (cents: number | null): string => {
        if (cents === null || cents === 0) return "-";
        const amount = cents / 100;
        return "$" + amount.toLocaleString("en-CA", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      };

      const tableData = rentRollData.units.map((unit) => [
        unit.unitLabel,
        unit.sqft ? `${unit.sqft.toLocaleString()} sq ft` : "-",
        unit.description || "-",
        unit.primaryTenantName || "Vacant",
        formatDate(unit.moveInDate),
        formatPDFCurrency(unit.rentAmountCents),
      ]);

      // Add table with professional styling
      autoTable(doc, {
        startY: metadataY + 16,
        head: [["Unit #", "Area", "Description", "Tenant", "Move-In Date", "Monthly Rent"]],
        body: tableData,
        foot: [[
          { content: "", styles: { fillColor: white } },
          { content: "", styles: { fillColor: white } },
          { content: "", styles: { fillColor: white } },
          { content: "", styles: { fillColor: white } },
          {
            content: "TOTAL MONTHLY RENT:",
            styles: {
              halign: "right",
              fontStyle: "bold",
              fillColor: white,
              textColor: darkGray,
            }
          },
          {
            content: formatPDFCurrency(rentRollData.summary.totalMonthlyRentCents),
            styles: {
              halign: "right",
              fontStyle: "bold",
              fillColor: white,
              textColor: navyBlue,
              fontSize: 11,
            }
          },
        ]],
        theme: "plain",
        styles: {
          font: "helvetica",
          fontSize: 9,
          cellPadding: { top: 3, right: 4, bottom: 3, left: 4 },
          textColor: darkGray,
          lineColor: [229, 231, 235], // #E5E7EB
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: navyBlue,
          textColor: white,
          fontStyle: "bold",
          fontSize: 9,
          cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
        },
        footStyles: {
          fillColor: white,
          textColor: darkGray,
          fontStyle: "bold",
          fontSize: 10,
          cellPadding: { top: 6, right: 4, bottom: 4, left: 4 },
        },
        alternateRowStyles: {
          fillColor: zebraGray,
        },
        columnStyles: {
          0: { cellWidth: 28, fontStyle: "bold" }, // Unit # - bold
          1: { cellWidth: 32 }, // Area
          2: { cellWidth: 45 }, // Description
          3: { cellWidth: 55 }, // Tenant
          4: { cellWidth: 32 }, // Move-In Date
          5: { cellWidth: 38, halign: "right" }, // Monthly Rent - right aligned
        },
        margin: { left: marginLeft, right: marginRight },
        showFoot: "lastPage",
        didDrawPage: (data) => {
          // Draw thick line above footer (Total row)
          if (data.pageNumber === doc.getNumberOfPages()) {
            const footY = (data.cursor?.y || 0) - 1;
            doc.setDrawColor(...navyBlue);
            doc.setLineWidth(0.5);
            doc.line(marginLeft, footY, pageWidth - marginRight, footY);
          }
        },
        // Repeat header on each page
        showHead: "everyPage",
      });

      // ============================================
      // PAGE FOOTER - Page numbers
      // ============================================

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);

        // Footer line
        doc.setDrawColor(...mediumGray);
        doc.setLineWidth(0.2);
        doc.line(marginLeft, pageHeight - 12, pageWidth - marginRight, pageHeight - 12);

        // Page number
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...mediumGray);
        doc.text(
          `Page ${i} of ${pageCount}`,
          pageWidth / 2,
          pageHeight - 7,
          { align: "center" }
        );

        // Footer branding
        doc.setFontSize(7);
        doc.text(
          "GA Developments Property Management",
          marginLeft,
          pageHeight - 7
        );

        // Report date in footer
        doc.text(
          `Generated: ${new Date().toLocaleDateString("en-CA")}`,
          pageWidth - marginRight,
          pageHeight - 7,
          { align: "right" }
        );
      }

      // Save PDF
      const filename = `RentRoll_${rentRollData.buildingName.replace(/\s+/g, "_")}_${rentRollData.periodMonth}.pdf`;
      doc.save(filename);
      toast.success("PDF exported successfully");
    } catch (error) {
      console.error("PDF export error:", error);
      toast.error("Failed to export PDF");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (!rentRollData) return;

    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "GA Developments";
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet("Rent Roll", {
        pageSetup: { orientation: "landscape", paperSize: 1 as ExcelJS.PaperSize },
      });

      // Title row
      worksheet.mergeCells("A1:F1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = "GA Developments - Rent Roll Report";
      titleCell.font = { name: "Times New Roman", size: 18, bold: true };
      titleCell.alignment = { horizontal: "center" };

      // Building info row
      worksheet.mergeCells("A2:C2");
      worksheet.getCell("A2").value = `Building: ${rentRollData.buildingName}`;
      worksheet.getCell("A2").font = { name: "Times New Roman", size: 12 };

      worksheet.mergeCells("D2:F2");
      worksheet.getCell("D2").value = `Period: ${formatMonth(rentRollData.periodMonth)}`;
      worksheet.getCell("D2").font = { name: "Times New Roman", size: 12 };
      worksheet.getCell("D2").alignment = { horizontal: "right" };

      // Summary row
      worksheet.mergeCells("A3:F3");
      worksheet.getCell("A3").value = `Occupancy: ${rentRollData.summary.occupiedUnits}/${rentRollData.summary.totalUnits} units (${rentRollData.summary.occupancyRate}%)`;
      worksheet.getCell("A3").font = { name: "Times New Roman", size: 10, italic: true };

      // Empty row
      worksheet.addRow([]);

      // Header row
      const headerRow = worksheet.addRow([
        "Unit #",
        "Area (sq ft)",
        "Description",
        "Tenant",
        "Move-In Date",
        "Monthly Rent",
      ]);
      headerRow.font = { name: "Times New Roman", size: 11, bold: true };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF333333" },
      };
      headerRow.eachCell((cell) => {
        cell.font = { name: "Times New Roman", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // Data rows
      rentRollData.units.forEach((unit, index) => {
        const row = worksheet.addRow([
          unit.unitLabel,
          unit.sqft || "",
          unit.description,
          unit.primaryTenantName,
          unit.moveInDate ? new Date(unit.moveInDate) : "",
          unit.rentAmountCents ? unit.rentAmountCents / 100 : "",
        ]);

        // Alternate row colors
        if (index % 2 === 0) {
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFAFAFA" },
          };
        }

        row.eachCell((cell, colNumber) => {
          cell.font = { name: "Times New Roman", size: 10 };
          cell.border = {
            top: { style: "thin", color: { argb: "FFE0E0E0" } },
            left: { style: "thin", color: { argb: "FFE0E0E0" } },
            bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
            right: { style: "thin", color: { argb: "FFE0E0E0" } },
          };

          // Format date column
          if (colNumber === 5 && cell.value instanceof Date) {
            cell.numFmt = "mmm d, yyyy";
          }
          // Format currency column
          if (colNumber === 6 && typeof cell.value === "number") {
            cell.numFmt = '"$"#,##0.00';
          }
        });
      });

      // Total row
      const lastDataRow = worksheet.lastRow?.number || 5;
      const totalRow = worksheet.addRow([
        "",
        "",
        "",
        "",
        "Total:",
        { formula: `SUM(F6:F${lastDataRow})` },
      ]);
      totalRow.font = { name: "Times New Roman", size: 11, bold: true };
      totalRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF5F5F5" },
      };
      totalRow.getCell(6).numFmt = '"$"#,##0.00';
      totalRow.eachCell((cell) => {
        cell.border = {
          top: { style: "medium" },
          left: { style: "thin" },
          bottom: { style: "medium" },
          right: { style: "thin" },
        };
      });

      // Set column widths
      worksheet.columns = [
        { width: 12 },
        { width: 14 },
        { width: 20 },
        { width: 30 },
        { width: 18 },
        { width: 16 },
      ];

      // Generate and save
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const filename = `RentRoll_${rentRollData.buildingName.replace(/\s+/g, "_")}_${rentRollData.periodMonth}.xlsx`;
      saveAs(blob, filename);
      toast.success("Excel file exported successfully");
    } catch (error) {
      console.error("Excel export error:", error);
      toast.error("Failed to export Excel file");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Generate Rent Roll</DialogTitle>
          <DialogDescription>
            Select a building and period to generate a rent roll report
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Configuration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="building" className="flex items-center gap-2 mb-2">
                <Building2 className="h-4 w-4" />
                Building
              </Label>
              <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
                <SelectTrigger id="building">
                  <SelectValue placeholder="Select a building..." />
                </SelectTrigger>
                <SelectContent>
                  {buildingNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="period" className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4" />
                Report Period
              </Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger id="period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Summary Cards */}
          {rentRollData && (
            <div className="grid grid-cols-4 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Total Units</span>
                  </div>
                  <p className="text-2xl font-semibold mt-1">{rentRollData.summary.totalUnits}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Occupied</span>
                  </div>
                  <p className="text-2xl font-semibold mt-1">{rentRollData.summary.occupiedUnits}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Occupancy</span>
                  </div>
                  <p className="text-2xl font-semibold mt-1">{rentRollData.summary.occupancyRate}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Monthly Rent</span>
                  </div>
                  <p className="text-2xl font-semibold mt-1">
                    {formatCurrency(rentRollData.summary.totalMonthlyRentCents)}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Preview / Content */}
          <div className="flex-1 overflow-hidden border rounded-lg">
            {!selectedBuilding ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                <Building2 className="h-12 w-12 mb-4 opacity-30" />
                <p>Select a building to preview the rent roll</p>
              </div>
            ) : isLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : rentRollData ? (
              <div className="overflow-auto max-h-[320px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead className="font-serif">Unit #</TableHead>
                      <TableHead className="font-serif">Area</TableHead>
                      <TableHead className="font-serif">Description</TableHead>
                      <TableHead className="font-serif">Tenant</TableHead>
                      <TableHead className="font-serif">Move-In Date</TableHead>
                      <TableHead className="font-serif text-right">Monthly Rent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rentRollData.units.map((unit) => (
                      <TableRow key={unit.unitId}>
                        <TableCell className="font-medium">{unit.unitLabel}</TableCell>
                        <TableCell>{unit.sqft ? `${unit.sqft.toLocaleString()} sq ft` : "-"}</TableCell>
                        <TableCell>{unit.description}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {unit.primaryTenantName}
                            {unit.status === "VACANT" && (
                              <Badge variant="outline" className="text-xs">
                                Vacant
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(unit.moveInDate)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(unit.rentAmountCents)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter className="sticky bottom-0 bg-muted/50">
                    <TableRow>
                      <TableCell colSpan={5} className="font-serif font-semibold text-right">
                        Total:
                      </TableCell>
                      <TableCell className="font-serif font-semibold text-right">
                        {formatCurrency(rentRollData.summary.totalMonthlyRentCents)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            ) : null}
          </div>

          {/* Export Buttons */}
          {rentRollData && (
            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button
                variant="outline"
                onClick={handleExportPDF}
                disabled={isExporting}
                className="gap-2"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                Export to PDF
              </Button>
              <Button
                variant="outline"
                onClick={handleExportExcel}
                disabled={isExporting}
                className="gap-2"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                Export to Excel
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
