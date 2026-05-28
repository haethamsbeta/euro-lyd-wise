import { formatMinor } from "@/lib/format";
// @ts-expect-error - no types shipped
import reshaper from "arabic-persian-reshaper";
// @ts-expect-error - no types shipped
import bidiFactory from "bidi-js";

const bidi = bidiFactory();
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const hasArabic = (s: string) => ARABIC_RE.test(s);

function shapeRtl(text: string): string {
  // 1) Convert logical Arabic codepoints to contextual presentation forms.
  const shaped: string = reshaper.ArabicShaper.convertArabic(text);
  // 2) Apply the Unicode Bidi algorithm in an RTL paragraph and emit the
  //    visually-reordered string so jsPDF (which only draws LTR) renders
  //    Arabic right-to-left while keeping embedded Latin/digits in order.
  const levels = bidi.getEmbeddingLevels(shaped, "rtl");
  return bidi.getReorderedString(shaped, levels);
}

const ARABIC_FONT = "NotoArabic";
let cachedArabicFont: { regular: string; bold: string } | null = null;
let arabicFontRegistered = false;

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font ${url} -> ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

async function ensureArabicFont(doc: any): Promise<boolean> {
  try {
    if (!cachedArabicFont) {
      const [regular, bold] = await Promise.all([
        fetchAsBase64("/fonts/NotoNaskhArabic-Regular.ttf"),
        fetchAsBase64("/fonts/NotoNaskhArabic-Bold.ttf"),
      ]);
      cachedArabicFont = { regular, bold };
    }
    if (!arabicFontRegistered) {
      doc.addFileToVFS("NotoNaskhArabic-Regular.ttf", cachedArabicFont.regular);
      doc.addFont("NotoNaskhArabic-Regular.ttf", ARABIC_FONT, "normal");
      doc.addFileToVFS("NotoNaskhArabic-Bold.ttf", cachedArabicFont.bold);
      doc.addFont("NotoNaskhArabic-Bold.ttf", ARABIC_FONT, "bold");
      arabicFontRegistered = true;
    }
    return true;
  } catch {
    return false;
  }
}

// Set the right font family for a string. If Arabic glyphs appear and the
// Noto font registered successfully, switch to it; otherwise stay on helvetica.
function applyFontFor(doc: any, text: string, style: "normal" | "bold" = "normal") {
  if (hasArabic(text) && arabicFontRegistered) {
    doc.setFont(ARABIC_FONT, style);
  } else {
    doc.setFont("helvetica", style);
  }
}

// Visual-order text for drawing. Pure-Latin returns unchanged.
function visual(text: string): string {
  return hasArabic(text) ? shapeRtl(text) : text;
}

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

// DAHAB brand palette — mirrors the night-mode tokens in src/styles.css.
// Deep onyx surfaces, metallic gold accents, ivory body text.
const BRAND = {
  onyx:        [20, 24, 31] as [number, number, number],   // #14181F  surface bg
  onyxSoft:    [28, 33, 43] as [number, number, number],   // elevated card on dark
  ivory:       [245, 241, 232] as [number, number, number],// page background (sand/cream)
  ivorySoft:   [250, 247, 239] as [number, number, number],// inner card
  gold:        [212, 168, 87] as [number, number, number], // #D4A857  metallic gold
  goldSoft:    [232, 197, 112] as [number, number, number],// champagne highlight
  goldDeep:    [168, 132, 47] as [number, number, number], // deep gold for shadow
  goldHair:    [212, 168, 87] as [number, number, number], // hairline rule
  ink:         [24, 24, 27] as [number, number, number],   // primary body text
  inkMuted:    [110, 100, 78] as [number, number, number], // secondary text
  borderSand:  [228, 217, 188] as [number, number, number],
};

let cachedLogo: { data: string; w: number; h: number } | null = null;
async function loadLogo(): Promise<{ data: string; w: number; h: number } | null> {
  if (cachedLogo) return cachedLogo;
  try {
    const res = await fetch("/brand/dahab-icon.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    cachedLogo = { data, w: 256, h: 256 };
    return cachedLogo;
  } catch {
    return null;
  }
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

function drawSoftCard(
  doc: any,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: [number, number, number] = BRAND.ivorySoft,
) {
  doc.setDrawColor(...BRAND.borderSand);
  doc.setLineWidth(0.75);
  doc.setFillColor(...fill);
  doc.roundedRect(x, y, w, h, 12, 12, "FD");
}

function smallLabel(doc: any, label: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.goldDeep);
  // Tracked-out small caps for the editorial DAHAB feel.
  doc.text(label.toUpperCase(), x, y, { charSpace: 1.2 });
}

function valueText(doc: any, value: string, x: number, y: number, maxWidth: number, size = 11) {
  const text = clean(value);
  doc.setFontSize(size);
  doc.setTextColor(...BRAND.ink);
  applyFontFor(doc, text, "normal");
  const lines: string[] = doc.splitTextToSize(text, maxWidth);
  if (hasArabic(text) && arabicFontRegistered) {
    const shaped = lines.map((ln) => shapeRtl(ln));
    doc.text(shaped, x + maxWidth, y, { align: "right" });
  } else {
    doc.text(lines, x, y);
  }
}

function detailRow(doc: any, label: string, value: string, x: number, y: number, w: number) {
  smallLabel(doc, label, x, y);
  valueText(doc, value, x, y + 15, w);
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
  const logo = await loadLogo();

  // Sand/ivory page background — mirrors the app's light-mode canvas.
  doc.setFillColor(...BRAND.ivory);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // ───────── HERO HEADER — deep onyx slab, like the app's dark hero cards.
  const HEADER_H = 200;
  doc.setFillColor(...BRAND.onyx);
  doc.rect(0, 0, pageWidth, HEADER_H, "F");

  // Gold hairline at very top and a second one above the amount card for
  // the signature DAHAB "double rule" feel.
  doc.setFillColor(...BRAND.gold);
  doc.rect(0, 0, pageWidth, 3, "F");

  // Brand lockup — real logo on the left, large gold wordmark, Arabic mark.
  const logoSize = 64;
  const logoX = 48;
  const logoY = 38;
  if (logo) {
    doc.addImage(logo.data, "PNG", logoX, logoY, logoSize, logoSize, undefined, "FAST");
  } else {
    // Fallback gold "D" disc if the asset failed to load.
    doc.setDrawColor(...BRAND.gold);
    doc.setLineWidth(1.4);
    doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 - 2);
    doc.setTextColor(...BRAND.gold);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.text("D", logoX + logoSize / 2 - 9, logoY + logoSize / 2 + 10);
  }

  const wordX = logoX + logoSize + 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(32);
  doc.setTextColor(...BRAND.gold);
  // Spaced-out wordmark — matches the .gold-text tracking in the app.
  doc.text("DAHAB", wordX, logoY + 32, { charSpace: 5 });

  // Thin gold rule beneath the wordmark
  doc.setDrawColor(...BRAND.goldSoft);
  doc.setLineWidth(0.5);
  doc.line(wordX, logoY + 42, wordX + 150, logoY + 42);

  // Arabic "ذهب" / English tagline beneath the rule
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.goldSoft);
  doc.text("FINANCIAL SERVICES  ·  TRANSACTION RECEIPT", wordX, logoY + 58, {
    charSpace: 1.4,
  });

  // Status pill — top right, gold ring on dark for the premium look.
  const pillW = 168;
  const pillH = 32;
  const pillX = pageWidth - pillW - 48;
  const pillY = 46;
  doc.setFillColor(statusR, statusG, statusB);
  doc.roundedRect(pillX, pillY, pillW, pillH, 16, 16, "F");
  doc.setDrawColor(...BRAND.gold);
  doc.setLineWidth(0.6);
  doc.roundedRect(pillX, pillY, pillW, pillH, 16, 16, "S");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  const pillText = fitText(doc, status, pillW - 24);
  const pillTextW = doc.getTextWidth(pillText);
  doc.text(pillText, pillX + (pillW - pillTextW) / 2, pillY + 20.5);

  // Generated-at line under the pill
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(180, 168, 138);
  const genText = `Generated ${new Date().toLocaleString()}`;
  doc.text(genText, pageWidth - 48 - doc.getTextWidth(genText), pillY + pillH + 16);

  // ───────── AMOUNT CARD — floats over the header onto the cream body,
  // matching the app's elevated "premium-card" style.
  const amountY = HEADER_H - 56;
  drawSoftCard(doc, 48, amountY, pageWidth - 96, 132, BRAND.ivorySoft);

  // Thin gold rule across the top of the amount card
  doc.setDrawColor(...BRAND.gold);
  doc.setLineWidth(1.2);
  doc.line(48 + 18, amountY, 48 + 60, amountY);

  smallLabel(doc, "Total Amount", 72, amountY + 30);
  doc.setTextColor(...BRAND.onyx);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.text(`${sideMark} ${amount}`, 72, amountY + 70);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.inkMuted);
  doc.text(`${clean(data.currency)}  ·  ${directionLabel}`, 72, amountY + 92);

  // Vertical gold-tinted divider
  doc.setDrawColor(...BRAND.borderSand);
  doc.setLineWidth(0.6);
  doc.line(pageWidth / 2 + 40, amountY + 22, pageWidth / 2 + 40, amountY + 110);

  detailRow(doc, "Transaction #", txNumber, pageWidth / 2 + 64, amountY + 30, 180);
  detailRow(doc, "Status", status, pageWidth / 2 + 64, amountY + 74, 180);

  // ───────── DETAILS CARD
  const detailsY = amountY + 156;
  drawSoftCard(doc, 48, detailsY, pageWidth - 96, 124);
  // Gold accent bar on the leading edge
  doc.setFillColor(...BRAND.gold);
  doc.rect(48, detailsY + 14, 3, 22, "F");
  doc.setTextColor(...BRAND.onyx);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Transaction Details", 68, detailsY + 30);
  detailRow(doc, "Created", formatDate(data.createdAt), 68, detailsY + 60, 205);
  detailRow(doc, "Posted / reviewed", formatDate(data.postedAt), pageWidth / 2 + 12, detailsY + 60, 205);
  detailRow(doc, "Type", directionLabel, 68, detailsY + 100, 205);
  detailRow(
    doc,
    "Vault / channel",
    [data.vaultName, data.channel].map((v) => clean(v, "")).filter(Boolean).join("  ·  ") || "-",
    pageWidth / 2 + 12,
    detailsY + 100,
    205,
  );

  // ───────── CUSTOMER CARD
  const custY = detailsY + 144;
  drawSoftCard(doc, 48, custY, pageWidth - 96, 142);
  doc.setFillColor(...BRAND.gold);
  doc.rect(48, custY + 14, 3, 22, "F");
  doc.setTextColor(...BRAND.onyx);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Customer & Account", 68, custY + 30);
  detailRow(doc, "Customer", clean(data.customerName), 68, custY + 60, 205);
  detailRow(doc, "DAHAB #", clean(data.dahabNumber), pageWidth / 2 + 12, custY + 60, 205);
  detailRow(
    doc,
    "Account",
    [data.accountNumber, data.accountName].map((v) => clean(v, "")).filter(Boolean).join("  ·  ") || "-",
    68,
    custY + 100,
    pageWidth - 140,
  );

  // ───────── NOTES CARD — faint gold tint to call attention.
  const notesY = custY + 162;
  drawSoftCard(doc, 48, notesY, pageWidth - 96, 96, [252, 246, 230]);
  doc.setFillColor(...BRAND.gold);
  doc.rect(48, notesY + 14, 3, 22, "F");
  doc.setTextColor(...BRAND.onyx);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(data.reason ? "Notes & Review Message" : "Receipt Notes", 68, notesY + 30);
  valueText(
    doc,
    clean(data.reason || data.comment || "No notes recorded."),
    68,
    notesY + 52,
    pageWidth - 136,
    10,
  );
  if (data.reason && data.comment) {
    doc.setTextColor(...BRAND.inkMuted);
    valueText(doc, `Transaction note: ${clean(data.comment)}`, 68, notesY + 74, pageWidth - 136, 9);
  }

  // ───────── FOOTER — onyx band with gold hairline, mirroring the header.
  const footH = 56;
  const footY = pageHeight - footH;
  doc.setFillColor(...BRAND.onyx);
  doc.rect(0, footY, pageWidth, footH, "F");
  doc.setFillColor(...BRAND.gold);
  doc.rect(0, footY, pageWidth, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.gold);
  doc.text("DAHAB", 48, footY + 22, { charSpace: 2.5 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(190, 178, 148);
  doc.text(
    "This receipt is generated by DAHAB back-office. Final settlement depends on the displayed status.",
    48,
    footY + 38,
    { maxWidth: pageWidth - 280 },
  );
  if (systemRef && systemRef !== txNumber) {
    doc.setFontSize(7.5);
    doc.setTextColor(160, 148, 118);
    const refText = `Ref: ${systemRef}`;
    doc.text(refText, pageWidth - 48 - doc.getTextWidth(refText), footY + 38);
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
