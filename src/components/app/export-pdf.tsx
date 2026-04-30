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

type Column = { header: string; width?: number };

export type PdfExportProps = {
  title: string;
  filenamePrefix: string;
  columns: Column[];
  /** Build rows for the chosen [from, to] inclusive date range. */
  buildRows: (from: Date, to: Date) => Promise<string[][]> | string[][];
  /** Optional total count for header summary. */
  buildSummary?: (rows: string[][]) => string;
};

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function ExportPdfButton({
  title,
  filenamePrefix,
  columns,
  buildRows,
  buildSummary,
}: PdfExportProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(todayISO(-7));
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

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(title, 40, 40);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(110);
      doc.text(
        `Date range: ${from} to ${to}   ·   Generated: ${new Date().toLocaleString()}`,
        40,
        58,
      );
      const summary = buildSummary?.(rows) ?? `${rows.length} record${rows.length === 1 ? "" : "s"}`;
      doc.text(summary, 40, 72);
      doc.setTextColor(0);

      autoTable(doc, {
        startY: 90,
        head: [columns.map((c) => c.header)],
        body: rows,
        styles: { fontSize: 9, cellPadding: 5, valign: "top", overflow: "linebreak" },
        headStyles: { fillColor: [30, 30, 35], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 248] },
        columnStyles: Object.fromEntries(
          columns.map((c, i) => [i, c.width ? { cellWidth: c.width } : {}]),
        ),
        margin: { left: 40, right: 40 },
        didDrawPage: () => {
          const pageCount = doc.getNumberOfPages();
          const current = (doc as any).internal.getCurrentPageInfo().pageNumber;
          doc.setFontSize(9);
          doc.setTextColor(120);
          doc.text(
            `Page ${current} of ${pageCount}`,
            pageWidth - 40,
            doc.internal.pageSize.getHeight() - 20,
            { align: "right" },
          );
          doc.setTextColor(0);
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