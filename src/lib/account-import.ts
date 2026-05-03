// Pure helpers for DAHAB account Excel import.
// Parses xlsx, detects currency, builds canonical/normalized names.
import * as XLSX from "xlsx";

export type ParsedRow = {
  source_row_number: number;
  source_account_number: string;
  nature: string;
  raw_name: string;
  extracted_currency_code: "LYD" | "USD" | "EUR" | "GBP" | "UNK";
  base_name_candidate: string;
  normalized_name_candidate: string;
  confidence_score: number;
  needs_review: boolean;
  error_message: string | null;
};

const CURRENCY_TOKENS: Array<{ code: ParsedRow["extracted_currency_code"]; tokens: string[] }> = [
  { code: "USD", tokens: ["$", "usd", "دولار"] },
  { code: "EUR", tokens: ["€", "eur", "يورو"] },
  { code: "GBP", tokens: ["£", "gbp", "باوند", "جنيه"] },
  { code: "LYD", tokens: ["دينار", "lyd", "د.ل"] },
];

export function detectCurrency(name: string): ParsedRow["extracted_currency_code"] {
  const lower = name.toLowerCase();
  for (const { code, tokens } of CURRENCY_TOKENS) {
    for (const tok of tokens) if (lower.includes(tok.toLowerCase())) return code;
  }
  return "UNK";
}

export function stripCurrencySuffix(name: string): string {
  let out = name.trim();
  for (const { tokens } of CURRENCY_TOKENS) {
    for (const tok of tokens) {
      const re = new RegExp(`\\s*${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
      out = out.replace(re, "");
    }
  }
  return out.trim();
}

export function normalizeArabic(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\u064B-\u065F\u0670]/g, "") // tashkeel
    .replace(/[أإآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .toLowerCase();
}

export function parseWorkbook(arrayBuffer: ArrayBuffer): ParsedRow[] {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const out: ParsedRow[] = [];
  rows.forEach((r, i) => {
    const codeRaw = r["Code"] ?? r["code"] ?? r["CODE"];
    const natureRaw = r["Nature"] ?? r["nature"];
    const nameRaw = r["NameA"] ?? r["nameA"] ?? r["NAMEA"] ?? r["Name"];
    const code = String(codeRaw ?? "").trim();
    const nature = String(natureRaw ?? "").trim();
    const name = String(nameRaw ?? "").trim();
    if (!code && !name) return; // skip fully empty
    let error: string | null = null;
    if (!code) error = "Missing Code";
    else if (!name) error = "Missing NameA";
    const currency = detectCurrency(name);
    const baseName = stripCurrencySuffix(name) || name;
    const normalized = normalizeArabic(baseName);
    const needsReview = currency === "UNK" || !!error;
    const confidence = error ? 0 : currency === "UNK" ? 50 : 90;
    out.push({
      source_row_number: i + 2, // header row + 1
      source_account_number: code,
      nature,
      raw_name: name,
      extracted_currency_code: currency,
      base_name_candidate: baseName,
      normalized_name_candidate: normalized,
      confidence_score: confidence,
      needs_review: needsReview,
      error_message: error,
    });
  });
  return out;
}