/**
 * Shared adapter helpers. Every adapter in src/lib/api/* must import apiFetch
 * from here so we have one place to swap auth, base URL, or error handling.
 *
 * The adapters target the AWS Lambda / API Gateway backend in front of
 * SQL Server DAHABDB. They are NOT wired into every page yet — see
 * docs/SQLSERVER_READINESS_AUDIT_V2.md for the migration matrix.
 */
export { apiFetch, apiFetchEnvelope, ApiError } from "@/lib/dahabApi";
export type { ApiEnvelope, Currency } from "@/lib/dahabApi";

/** Build a query string from an object, skipping null/undefined/empty values. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

/**
 * Returns true when a row originates from the Test Sandbox fixture pipeline
 * (is_test=true, source_system=DAHAB_TEST, or has a test_run_id). Used to
 * defensively hide sandbox rows from production lists, totals, and the
 * production transaction wizard. The Test Sandbox page itself bypasses this.
 */
export function isTestRow(r: any): boolean {
  if (!r || typeof r !== "object") return false;
  return (
    r.is_test === true ||
    r.source_system === "DAHAB_TEST" ||
    !!r.test_run_id
  );
}
