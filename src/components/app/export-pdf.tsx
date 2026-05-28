import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Download } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  BRAND,
  ARABIC_FONT,
  hasArabic,
  ensureArabicFont,
  isArabicFontReady,
  loadBrandLogo,
  drawBrandHeader,
  drawBrandFooter,
  paintIvoryBackground,
  drawTextSmart,
  drawInfoCard,
  formatDateRange,
} from "@/lib/pdfBrand";

type Column = { header: string; width?: number };

export type PdfExportProps = {
  title: string;
  filenamePrefix: string;
  columns: Column[];
  /** Build rows for the chosen [from, to] inclusive date range. */
  buildRows: (from: Date, to: Date) => Promise<string[][]> | string[][];
  /** Optional total count for header summary. */
  buildSummary?: (rows: string[][]) => string;
  /** Optional info-card items rendered between header and table. */
  infoItems?: Array<{ label: string; value: string }>;
};

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// Default lower bound for the export popover. We pick a deliberately wide
// window (~5 years) so the first click captures every historical row by
// default — users can narrow it via the date inputs. Defaulting to "last 7
// days" produced empty PDFs for ledgers whose activity is older than a week.
function defaultFromISO() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 5);
  return d.toISOString().slice(0, 10);
}

export function ExportPdfButton({
  title,
  filenamePrefix,
  columns,
  buildRows,
  buildSummary,
  infoItems,
}: PdfExportProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultFromISO());
  const [to, setTo] = useState(todayISO(0));
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    try {
      setBusy(true);
      // Lazy-load jsPDF + autotable on demand. They add ~250KB gzipped that
      // would otherwise be in every page that mounts the export button.
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const autoTable = autoTableModule.default;
      const fromD = new Date(`${from}T00:00:00`);
      const toD = new Date(`${to}T23:59:59.999`);
      const rows = await Promise.resolve(buildRows(fromD, toD));

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Brand assets (logo + Arabic font) are lazily fetched and cached
      // across calls so a second export is instant.
      const [logo] = await Promise.all([loadBrandLogo(), ensureArabicFont(doc)]);
      const arabicReady = isArabicFontReady(doc);

      paintIvoryBackground(doc, pageWidth, pageHeight);

      const pillText = formatDateRange(from, to);
      const headerH = drawBrandHeader(doc, {
        title,
        subtitle: `Generated ${new Date().toLocaleString()}`,
        pill: { text: pillText, fill: BRAND.goldDeep },
        logo,
        pageWidth,
      });

      // Optional account/holder info card under the header
      let infoH = 0;
      if (infoItems && infoItems.length) {
        infoH = drawInfoCard(doc, {
          items: infoItems,
          x: 40,
          y: headerH + 14,
          width: pageWidth - 80,
        });
      }

      // Summary line above the table card
      const summary =
        buildSummary?.(rows) ?? `${rows.length} record${rows.length === 1 ? "" : "s"}`;
      const summaryY = headerH + 14 + infoH + 18;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...BRAND.goldDeep);
      doc.text(title.toUpperCase(), 40, summaryY, { charSpace: 1.2 });
      drawTextSmart(doc, summary, 40, summaryY + 14, {
        size: 9,
        color: BRAND.inkMuted,
        maxWidth: pageWidth - 80,
      });

      const tableTop = summaryY + 26;

      autoTable(doc, {
        startY: tableTop,
        head: [columns.map((c) => c.header)],
        body: rows,
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 9,
          cellPadding: 6,
          valign: "top",
          overflow: "linebreak",
          textColor: BRAND.ink,
          lineColor: BRAND.borderSand,
          lineWidth: 0.4,
        },
        headStyles: {
          fillColor: BRAND.onyx,
          textColor: BRAND.gold,
          fontStyle: "bold",
          fontSize: 9,
          cellPadding: 7,
          lineColor: BRAND.gold,
          lineWidth: 0,
        },
        bodyStyles: { fillColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: BRAND.ivorySoft },
        columnStyles: Object.fromEntries(
          columns.map((c, i) => [i, c.width ? { cellWidth: c.width } : {}]),
        ),
        margin: { left: 40, right: 40, top: headerH + 14 + infoH + 44, bottom: 60 },
        // Switch font + alignment for Arabic cells so glyphs shape correctly.
        didParseCell: (data: any) => {
          if (!arabicReady) return;
          const raw = Array.isArray(data.cell.raw)
            ? data.cell.raw.join(" ")
            : String(data.cell.raw ?? "");
          if (hasArabic(raw)) {
            data.cell.styles.font = ARABIC_FONT;
            data.cell.styles.halign = "right";
          }
        },
        // Paint background + header BEFORE the table draws so we never cover
        // the rendered rows. Page 1 chrome is already painted above; only
        // repaint for subsequent pages.
        willDrawPage: (data: any) => {
          if (data.pageNumber > 1) {
            paintIvoryBackground(doc, pageWidth, pageHeight);
            drawBrandHeader(doc, {
              title,
              subtitle: `Generated ${new Date().toLocaleString()}`,
              pill: { text: pillText, fill: BRAND.goldDeep },
              logo,
              pageWidth,
            });
            if (infoItems && infoItems.length) {
              drawInfoCard(doc, {
                items: infoItems,
                x: 40,
                y: headerH + 14,
                width: pageWidth - 80,
              });
            }
          }
        },
        didDrawPage: (data: any) => {
          const pageCount = doc.getNumberOfPages();
          drawBrandFooter(doc, {
            pageWidth,
            pageHeight,
            pageLabel: `Page ${data.pageNumber} of ${pageCount}`,
            note: "Generated by DAHAB back-office",
          });
        },
      });

      doc.save(`${filenamePrefix}_${from}_to_${to}.pdf`);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="me-1.5 h-4 w-4" /> {t("export.button")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold">{t("export.heading")} — {title}</h4>
            <p className="text-xs text-muted-foreground">{t("export.help")}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="exp-from" className="text-xs">{t("export.from")}</Label>
              <Input
                id="exp-from"
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-to" className="text-xs">{t("export.to")}</Label>
              <Input
                id="exp-to"
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t("export.cancel")}
            </Button>
            <Button size="sm" onClick={handleExport} disabled={busy || !from || !to}>
              {busy ? t("export.generating") : t("export.download")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}