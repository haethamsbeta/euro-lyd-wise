// Shared brand assets for all generated PDFs (receipts, table exports, ...).
// Centralizes the DAHAB palette, the Arabic font registration, and the logo
// loader so every export has the same look and the heavy assets are fetched
// at most once per session.

export const BRAND = {
  onyx:        [20, 24, 31] as [number, number, number],
  onyxSoft:    [28, 33, 43] as [number, number, number],
  ivory:       [245, 241, 232] as [number, number, number],
  ivorySoft:   [250, 247, 239] as [number, number, number],
  gold:        [212, 168, 87] as [number, number, number],
  goldSoft:    [232, 197, 112] as [number, number, number],
  goldDeep:    [168, 132, 47] as [number, number, number],
  ink:         [24, 24, 27] as [number, number, number],
  inkMuted:    [110, 100, 78] as [number, number, number],
  inkOnDark:   [245, 241, 232] as [number, number, number],
  mutedOnDark: [190, 178, 148] as [number, number, number],
  borderSand:  [228, 217, 188] as [number, number, number],
};

export const ARABIC_FONT = "NotoArabic";
export const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
export const hasArabic = (s: string) => ARABIC_RE.test(s);

let cachedArabicFont: { regular: string; bold: string } | null = null;
const docsWithArabic = new WeakSet<object>();

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font ${url} -> ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

/** Register IBM Plex Sans Arabic on the given jsPDF doc. Idempotent per doc. */
export async function ensureArabicFont(doc: any): Promise<boolean> {
  try {
    if (!cachedArabicFont) {
      const [regular, bold] = await Promise.all([
        fetchAsBase64("/fonts/IBMPlexSansArabic-Regular.ttf"),
        fetchAsBase64("/fonts/IBMPlexSansArabic-Bold.ttf"),
      ]);
      cachedArabicFont = { regular, bold };
    }
    if (!docsWithArabic.has(doc)) {
      doc.addFileToVFS("IBMPlexSansArabic-Regular.ttf", cachedArabicFont.regular);
      doc.addFont("IBMPlexSansArabic-Regular.ttf", ARABIC_FONT, "normal");
      doc.addFileToVFS("IBMPlexSansArabic-Bold.ttf", cachedArabicFont.bold);
      doc.addFont("IBMPlexSansArabic-Bold.ttf", ARABIC_FONT, "bold");
      docsWithArabic.add(doc);
    }
    return true;
  } catch {
    return false;
  }
}

export function isArabicFontReady(doc: any): boolean {
  return docsWithArabic.has(doc);
}

let cachedLogo: { data: string; w: number; h: number } | null = null;
export async function loadBrandLogo(): Promise<{ data: string; w: number; h: number } | null> {
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

/**
 * Draw the standard DAHAB onyx hero band: gold hairline, logo, wordmark,
 * tagline, and an optional gold-ringed status pill on the right. Returns the
 * Y coordinate where body content should start.
 */
export function drawBrandHeader(
  doc: any,
  opts: {
    title: string;
    subtitle?: string;
    pill?: { text: string; fill?: [number, number, number] };
    logo: { data: string } | null;
    pageWidth: number;
  },
): number {
  const { title, subtitle, pill, logo, pageWidth } = opts;
  const HEADER_H = 110;

  doc.setFillColor(...BRAND.onyx);
  doc.rect(0, 0, pageWidth, HEADER_H, "F");
  doc.setFillColor(...BRAND.gold);
  doc.rect(0, 0, pageWidth, 3, "F");

  const logoSize = 52;
  const logoX = 40;
  const logoY = 28;
  if (logo) {
    doc.addImage(logo.data, "PNG", logoX, logoY, logoSize, logoSize, undefined, "FAST");
  } else {
    doc.setDrawColor(...BRAND.gold);
    doc.setLineWidth(1.4);
    doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 - 2);
    doc.setTextColor(...BRAND.gold);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.text("D", logoX + logoSize / 2 - 7, logoY + logoSize / 2 + 8);
  }

  const wordX = logoX + logoSize + 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...BRAND.gold);
  doc.text("DAHAB", wordX, logoY + 28, { charSpace: 4.5 });

  doc.setDrawColor(...BRAND.goldSoft);
  doc.setLineWidth(0.5);
  doc.line(wordX, logoY + 36, wordX + 130, logoY + 36);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.goldSoft);
  const tagline = `FINANCIAL SERVICES  ·  ${title.toUpperCase()}`;
  doc.text(tagline, wordX, logoY + 50, { charSpace: 1.2 });

  if (pill) {
    const fill = pill.fill ?? BRAND.goldDeep;
    const padX = 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const w = doc.getTextWidth(pill.text) + padX * 2;
    const h = 26;
    const x = pageWidth - w - 40;
    const y = 36;
    doc.setFillColor(...fill);
    doc.roundedRect(x, y, w, h, 13, 13, "F");
    doc.setDrawColor(...BRAND.gold);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, y, w, h, 13, 13, "S");
    doc.setTextColor(255, 255, 255);
    doc.text(pill.text, x + padX, y + 17);

    if (subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...BRAND.mutedOnDark);
      const sw = doc.getTextWidth(subtitle);
      doc.text(subtitle, pageWidth - 40 - sw, y + h + 14);
    }
  } else if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.mutedOnDark);
    const sw = doc.getTextWidth(subtitle);
    doc.text(subtitle, pageWidth - 40 - sw, 56);
  }

  return HEADER_H;
}

export function drawBrandFooter(
  doc: any,
  opts: { pageWidth: number; pageHeight: number; pageLabel?: string; note?: string },
) {
  const { pageWidth, pageHeight, pageLabel, note } = opts;
  const h = 44;
  const y = pageHeight - h;
  doc.setFillColor(...BRAND.onyx);
  doc.rect(0, y, pageWidth, h, "F");
  doc.setFillColor(...BRAND.gold);
  doc.rect(0, y, pageWidth, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.gold);
  doc.text("DAHAB", 40, y + 22, { charSpace: 2.5 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.mutedOnDark);
  if (note) {
    doc.text(note, 100, y + 22, { maxWidth: pageWidth - 260 });
  }
  if (pageLabel) {
    const w = doc.getTextWidth(pageLabel);
    doc.text(pageLabel, pageWidth - 40 - w, y + 22);
  }
}

export function paintIvoryBackground(doc: any, pageWidth: number, pageHeight: number) {
  doc.setFillColor(...BRAND.ivory);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
}

/**
 * Draw text with automatic Arabic font/alignment switching. When the string
 * contains Arabic glyphs we switch to the registered IBM Plex Sans Arabic
 * font so glyphs shape correctly, and align to the right side of `maxWidth`
 * (passed via opts.align="right" or by giving a right-edge x).
 * Restores the previous font afterwards.
 */
export function drawTextSmart(
  doc: any,
  text: string,
  x: number,
  y: number,
  opts: { fontStyle?: "normal" | "bold"; size?: number; color?: [number, number, number]; maxWidth?: number; align?: "left" | "right" } = {},
): void {
  const { fontStyle = "normal", size = 10, color, maxWidth, align = "left" } = opts;
  const prevFont = doc.getFont();
  const prevSize = doc.getFontSize();
  if (color) doc.setTextColor(...color);
  doc.setFontSize(size);
  const arabic = hasArabic(text);
  if (arabic && isArabicFontReady(doc)) {
    doc.setFont(ARABIC_FONT, fontStyle);
  } else {
    doc.setFont("helvetica", fontStyle);
  }
  const textOpts: any = {};
  if (maxWidth) textOpts.maxWidth = maxWidth;
  if (align === "right") textOpts.align = "right";
  doc.text(text, x, y, textOpts);
  // Restore
  try {
    doc.setFont(prevFont.fontName, prevFont.fontStyle);
  } catch {
    doc.setFont("helvetica", "normal");
  }
  doc.setFontSize(prevSize);
}

export function formatDateRange(fromISO: string, toISO: string): string {
  const fmt = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };
  return `${fmt(fromISO)}  \u2192  ${fmt(toISO)}`;
}

/**
 * Draw an ivory rounded info card with two-column label/value pairs.
 * Items wrap across rows of 3 columns. Returns the card height in pt.
 */
export function drawInfoCard(
  doc: any,
  opts: { items: Array<{ label: string; value: string }>; x: number; y: number; width: number },
): number {
  const { items, x, y, width } = opts;
  if (!items.length) return 0;
  const cols = items.length <= 2 ? items.length : items.length <= 4 ? 2 : 3;
  const rows = Math.ceil(items.length / cols);
  const rowH = 32;
  const padX = 14;
  const padY = 12;
  const cardH = padY * 2 + rows * rowH;

  // Card background
  doc.setFillColor(...BRAND.ivorySoft);
  doc.setDrawColor(...BRAND.borderSand);
  doc.setLineWidth(0.6);
  doc.roundedRect(x, y, width, cardH, 6, 6, "FD");

  // Gold left rail
  doc.setFillColor(...BRAND.gold);
  doc.rect(x, y, 3, cardH, "F");

  const colW = (width - padX * 2) / cols;
  items.forEach((it, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const cx = x + padX + c * colW;
    const cy = y + padY + r * rowH;
    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.goldDeep);
    doc.text(String(it.label).toUpperCase(), cx, cy + 8, { charSpace: 1.1 });
    // Value (Arabic-aware)
    drawTextSmart(doc, String(it.value ?? "—"), cx, cy + 22, {
      fontStyle: "bold",
      size: 10.5,
      color: BRAND.ink,
      maxWidth: colW - 6,
    });
  });

  return cardH;
}