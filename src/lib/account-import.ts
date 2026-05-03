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

// ---------------- Linked-accounts (pre-grouped) parser ----------------

export type LinkedRow = {
  source_row_number: number;
  dahab_account_number: string;
  source_account_number: string;
  currency_code: "LYD" | "USD" | "EUR" | "GBP" | "UNK";
  nature: string;
  raw_name: string; // account_display_name preserved verbatim
  account_alias_name: string | null;
  is_primary_account: boolean;
  canonical_name: string | null;
  base_name_candidate: string;
  normalized_name_candidate: string;
  needs_review: boolean;
  error_message: string | null;
};

const ALLOWED_CURR = new Set(["LYD", "USD", "EUR", "GBP", "UNK"]);

function pick(r: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const found = Object.keys(r).find((kk) => kk.toLowerCase().replace(/[\s_-]/g, "") === k.toLowerCase().replace(/[\s_-]/g, ""));
    if (found != null) {
      const v = r[found];
      if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
    }
  }
  return "";
}

export function parseLinkedAccountsWorkbook(arrayBuffer: ArrayBuffer): LinkedRow[] {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  // Prefer "Flat Import Table" sheet, else first sheet
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase().replace(/\s+/g, "").includes("flat")) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const out: LinkedRow[] = [];
  rows.forEach((r, i) => {
    const dahab = pick(r, ["dahab_account_number", "dahab", "dahab_number", "dahabaccountnumber"]);
    const acct = pick(r, ["account_number", "code", "bank_account_number", "accountnumber"]);
    const curr = pick(r, ["currency_code", "currency", "currencycode"]).toUpperCase();
    const nature = pick(r, ["account_nature", "nature"]) || "Debit";
    const display = pick(r, ["account_display_name", "account_display_name_original", "namea", "name_a", "name", "display_name", "accountdisplayname", "accountdisplaynameoriginal"]);
    const alias = pick(r, ["account_alias_name", "alias", "aliasname", "accountaliasname"]);
    const primary = pick(r, ["is_primary_account", "primary", "isprimaryaccount"]);
    const canonical = pick(r, ["canonical_name", "holder_name", "main_customer_name", "canonicalname"]);
    if (!dahab && !acct && !display) return; // empty row
    const errors: string[] = [];
    if (!dahab) errors.push("missing dahab_account_number");
    else if (!/^DAHAB-\d{4,}$/i.test(dahab)) errors.push("invalid DAHAB # format");
    if (!acct) errors.push("missing account_number");
    if (!display) errors.push("missing account_display_name");
    const currency = (ALLOWED_CURR.has(curr) ? curr : "UNK") as LinkedRow["currency_code"];
    const baseName = canonical || stripCurrencySuffix(display) || display;
    const normalized = normalizeArabic(baseName);
    const needsReview = errors.length > 0 || currency === "UNK";
    out.push({
      source_row_number: i + 2,
      dahab_account_number: dahab.toUpperCase(),
      source_account_number: acct,
      currency_code: currency,
      nature,
      raw_name: display,
      account_alias_name: alias || null,
      is_primary_account: /^(true|1|yes|y)$/i.test(primary),
      canonical_name: canonical || null,
      base_name_candidate: baseName,
      normalized_name_candidate: normalized,
      needs_review: needsReview,
      error_message: errors.length ? errors.join("; ") : null,
    });
  });
  return out;
}