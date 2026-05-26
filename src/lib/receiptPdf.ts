import { formatMinor } from "@/lib/format";

export type ReceiptPdfStatus = "posted" | "pending" | "rejected" | "failed" | string;

export type ReceiptPdfData = {
  txNumber: string;
  status: ReceiptPdfStatus;
  direction: "deposit" | "withdraw" | string;
  amountMinor: number;
  currency: string;
  customerName?: string | null;
  dahabNumber?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
  channel?: string | null;
  vaultName?: string | null;
  comment?: string | null;
  createdAt?: string | Date | null;
  postedAt?: string | Date | null;
  reason?: string | null;
  systemRef?: string | null;
};

function clean(value: unknown, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

function statusLabel(status: string) {
  const value = clean(status).toLowerCase();
  if (["posted", "approved", "sale"].includes(value)) return "Posted / Approved";
  if (value === "pending") return "Awaiting admin approval";
  if (["rejected", "cancelled", "canceled"].includes(value)) return "Rejected";
  if (value === "failed") return "Failed";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusTheme(status: string): [number, number, number] {
  const value = clean(status).toLowerCase();
  if (["posted", "approved", "sale"].includes(value)) return [21, 128, 61];
  if (value === "pending") return [202, 138, 4];
  if (["rejected", "cancelled", "canceled", "failed"].includes(value)) return [185, 28, 28];
  return [82, 82, 91];
}

function buildFilename(data: ReceiptPdfData) {
  const tx = clean(data.txNumber, "transaction").replace(/[^a-z0-9_-]+/gi, "-");
  return `DAHAB-receipt-${tx}.pdf`;
}

function fitText(doc: any, value: string, maxWidth: number) {
  const text = clean(value);
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let next = text;
  while (next.length > 8 && doc.getTextWidth(`${next}...`) > maxWidth) {
    next = next.slice(0, -1);
  }
  return `${next}...`;
}

function drawSoftCard(doc: any, x: number, y: number, w: number, h: number, fill: [number, number, number] = [255, 255, 255]) {
  doc.setDrawColor(232, 224, 201);
  doc.setLineWidth(0.6);
  doc.setFillColor(...fill);
  doc.roundedRect(x, y, w, h, 10, 10, "FD");
}

function smallLabel(doc: any, label: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(121, 106, 71);
  doc.text(label.toUpperCase(), x, y);
}

function valueText(doc: any, value: string, x: number, y: number, maxWidth: number, size = 11) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  doc.setTextColor(24, 24, 27);
  doc.text(doc.splitTextToSize(clean(value), maxWidth), x, y);
}

function detailRow(doc: any, label: string, value: string, x: number, y: number, w: number) {
  smallLabel(doc, label, x, y);
  valueText(doc, value, x, y + 16, w);
}

export async function createReceiptPdfBlob(data: ReceiptPdfData) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const status = statusLabel(String(data.status || ""));
  const [statusR, statusG, statusB] = statusTheme(String(data.status || ""));
  const isDeposit = String(data.direction || "").toLowerCase() === "deposit";
  const amount = formatMinor(Number(data.amountMinor || 0), data.currency || "USD");
  const directionLabel = isDeposit ? "Cash Deposit" : "Cash Withdrawal";
  const txNumber = clean(data.txNumber);
  const systemRef = clean(data.systemRef, "");
  const sideMark = isDeposit ? "+" : "-";

  doc.setFillColor(247, 243, 232);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFillColor(18, 18, 20);
  doc.rect(0, 0, pageWidth, 164, "F");
  doc.setFillColor(212, 175, 55);
  doc.rect(0, 0, pageWidth, 5, "F");

  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1.2);
  doc.circle(67, 58, 23);
  doc.setTextColor(212, 175, 55);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("D", 60, 65);
  doc.setFontSize(25);
  doc.text("DAHAB", 102, 54);
  doc.setFontSize(10);
  doc.setTextColor(224, 224, 224);
  doc.text("Transaction Receipt", 103, 75);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(165, 165, 165);
  doc.text(`Generated ${new Date().toLocaleString()}`, 103, 93);

  doc.setFillColor(statusR, statusG, statusB);
  doc.roundedRect(pageWidth - 225, 42, 177, 42, 21, 21, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(fitText(doc, status, 132), pageWidth - 202, 67);

  drawSoftCard(doc, 48, 126, pageWidth - 96, 118, [255, 255, 255]);
  doc.setTextColor(82, 82, 91);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TOTAL AMOUNT", 72, 157);
  doc.setTextColor(18, 18, 20);
  doc.setFontSize(28);
  doc.text(`${sideMark} ${amount}`, 72, 193);
  doc.setFontSize(10);
  doc.setTextColor(113, 113, 122);
  doc.text(`${clean(data.currency)} - ${directionLabel}`, 72, 215);

  doc.setDrawColor(232, 224, 201);
  doc.line(334, 146, 334, 224);
  detailRow(doc, "TX #", txNumber, 358, 157, 160);
  detailRow(doc, "Status", status, 358, 202, 160);

  drawSoftCard(doc, 48, 266, pageWidth - 96, 124);
  doc.setTextColor(18, 18, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Transaction Details", 72, 296);
  detailRow(doc, "Created", formatDate(data.createdAt), 72, 326, 205);
  detailRow(doc, "Posted / reviewed", formatDate(data.postedAt), 310, 326, 205);
  detailRow(doc, "Type", directionLabel, 72, 366, 205);
  detailRow(doc, "Vault / channel", [data.vaultName, data.channel].map((v) => clean(v, "")).filter(Boolean).join(" - ") || "-", 310, 366, 205);

  drawSoftCard(doc, 48, 412, pageWidth - 96, 142);
  doc.setTextColor(18, 18, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Customer And Account", 72, 442);
  detailRow(doc, "Customer", clean(data.customerName), 72, 472, 205);
  detailRow(doc, "DAHAB #", clean(data.dahabNumber), 310, 472, 205);
  detailRow(doc, "Account", [data.accountNumber, data.accountName].map((v) => clean(v, "")).filter(Boolean).join(" - ") || "-", 72, 512, 445);

  drawSoftCard(doc, 48, 576, pageWidth - 96, 98, [255, 253, 247]);
  doc.setTextColor(18, 18, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(data.reason ? "Notes And Review Message" : "Receipt Notes", 72, 606);
  valueText(doc, clean(data.reason || data.comment || "No notes recorded."), 72, 631, pageWidth - 144, 10);

  if (data.reason && data.comment) {
    valueText(doc, `Transaction note: ${clean(data.comment)}`, 72, 654, pageWidth - 144, 9);
  }

  doc.setDrawColor(230, 224, 205);
  doc.line(48, pageHeight - 82, pageWidth - 48, pageHeight - 82);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 125);
  doc.text("This receipt is generated by DAHAB back-office. Final settlement depends on the displayed status.", 48, pageHeight - 58, {
    maxWidth: pageWidth - 96,
  });
  if (systemRef && systemRef !== txNumber) {
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 155);
    doc.text(`System reference: ${systemRef}`, 48, pageHeight - 36, { maxWidth: pageWidth - 96 });
  }

  return doc.output("blob") as Blob;
}

export async function shareReceiptPdf(data: ReceiptPdfData) {
  const blob = await createReceiptPdfBlob(data);
  const filename = buildFilename(data);
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData & { files?: File[] }) => boolean;
    share?: (data: ShareData & { files?: File[] }) => Promise<void>;
  };

  if (nav.canShare?.({ files: [file] }) && nav.share) {
    await nav.share({
      title: "DAHAB Transaction Receipt",
      text: `DAHAB receipt ${data.txNumber}`,
      files: [file],
    });
    return { shared: true, downloaded: false };
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2500);
  return { shared: false, downloaded: true };
}
