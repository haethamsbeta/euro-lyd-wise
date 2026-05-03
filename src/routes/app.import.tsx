import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, RoleGate } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { parseWorkbook, type ParsedRow } from "@/lib/account-import";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/app/import")({ component: ImportPage });

function ImportPage() {
  return (
    <RoleGate allow={["admin"]}>
      <PageHeader title="Account Import" description="Upload an Excel file (Code, Nature, NameA) and link accounts to DAHAB holders." />
      <Importer />
    </RoleGate>
  );
}

function Importer() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [batchId, setBatchId] = useState<number | null>(null);

  const { data: history } = useQuery({
    queryKey: ["import.batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_import_batches")
        .select("id,file_name,imported_at,total_rows,successful_rows,review_rows,status")
        .order("imported_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const onParse = async (f: File) => {
    setFile(f);
    const buf = await f.arrayBuffer();
    try {
      const rows = parseWorkbook(buf);
      setParsed(rows);
      setBatchId(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to parse file");
    }
  };

  const stage = useMutation({
    mutationFn: async () => {
      if (!parsed || !file) throw new Error("Parse a file first");
      const review = parsed.filter((r) => r.needs_review).length;
      const failed = parsed.filter((r) => r.error_message).length;
      const { data: batch, error: e1 } = await supabase
        .from("account_import_batches")
        .insert({
          file_name: file.name,
          imported_by: user?.id,
          total_rows: parsed.length,
          review_rows: review,
          failed_rows: failed,
          status: "PENDING",
        })
        .select("id")
        .single();
      if (e1) throw e1;

      const rows = parsed.map((r) => ({
        import_batch_id: batch.id,
        source_row_number: r.source_row_number,
        source_account_number: r.source_account_number,
        nature: r.nature,
        raw_name: r.raw_name,
        extracted_currency_code: r.extracted_currency_code,
        base_name_candidate: r.base_name_candidate,
        normalized_name_candidate: r.normalized_name_candidate,
        confidence_score: r.confidence_score,
        review_status: r.needs_review ? "REVIEW" : "PENDING",
        error_message: r.error_message,
      }));
      // Bulk insert in chunks of 200
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from("account_import_staging").insert(rows.slice(i, i + 200));
        if (error) throw error;
      }
      // Push review rows to queue
      const reviewRows = parsed
        .filter((r) => r.needs_review)
        .map((r) => ({
          import_batch_id: batch.id,
          source_account_number: r.source_account_number,
          raw_name: r.raw_name,
          extracted_currency_code: r.extracted_currency_code,
          base_name_candidate: r.base_name_candidate,
          normalized_name_candidate: r.normalized_name_candidate,
          confidence_score: r.confidence_score,
        }));
      for (let i = 0; i < reviewRows.length; i += 200) {
        const { error } = await supabase.from("account_link_review_queue").insert(reviewRows.slice(i, i + 200));
        if (error) throw error;
      }
      return batch.id as number;
    },
    onSuccess: (id) => {
      setBatchId(id);
      toast.success("Staged. Click Approve to create holders & accounts.");
      qc.invalidateQueries({ queryKey: ["import.batches"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Staging failed"),
  });

  const approve = useMutation({
    mutationFn: async () => {
      if (!batchId) throw new Error("No batch");
      const { data, error } = await supabase.rpc("approve_import_batch", { p_batch_id: batchId });
      if (error) throw error;
      return data;
    },
    onSuccess: (res: any) => {
      toast.success(`Import approved: ${res.linked_accounts} accounts, ${res.created_holders} new holders.`);
      setParsed(null);
      setFile(null);
      setBatchId(null);
      qc.invalidateQueries({ queryKey: ["import.batches"] });
      qc.invalidateQueries({ queryKey: ["holders"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Approval failed"),
  });

  const totals = parsed
    ? {
        total: parsed.length,
        valid: parsed.filter((r) => !r.needs_review && !r.error_message).length,
        review: parsed.filter((r) => r.needs_review).length,
        failed: parsed.filter((r) => r.error_message).length,
      }
    : null;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Card className="card-luxe">
        <CardContent className="p-6">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-[oklch(0.82_0.14_85/0.3)] p-10 hover:border-[oklch(0.82_0.14_85/0.6)]">
            <Upload className="h-8 w-8 text-gold" />
            <div className="text-center">
              <p className="font-medium">{file ? file.name : "Drop or select an .xlsx file"}</p>
              <p className="text-xs text-muted-foreground">Columns: Code, Nature, NameA</p>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onParse(e.target.files[0])}
            />
          </label>

          {totals && (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Total" value={totals.total} />
              <Stat label="Valid" value={totals.valid} tone="ok" />
              <Stat label="Needs review" value={totals.review} tone="warn" />
              <Stat label="Errors" value={totals.failed} tone="err" />
            </div>
          )}

          {parsed && !batchId && (
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setParsed(null); setFile(null); }}>Cancel</Button>
              <Button onClick={() => stage.mutate()} disabled={stage.isPending}>
                {stage.isPending ? "Staging…" : "Stage import"}
              </Button>
            </div>
          )}
          {batchId && (
            <div className="mt-6 flex items-center justify-between rounded-md border border-[oklch(0.82_0.14_85/0.2)] bg-[oklch(0.82_0.14_85/0.05)] p-4">
              <div className="text-sm">Batch <span className="font-mono">#{batchId}</span> staged. Approve to create holders & accounts.</div>
              <Button onClick={() => approve.mutate()} disabled={approve.isPending} className="bg-gradient-gold text-primary-foreground">
                {approve.isPending ? "Approving…" : "Approve import"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {parsed && (
        <Card className="card-luxe">
          <CardContent className="p-0">
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b border-[oklch(0.82_0.14_85/0.12)] text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Row</th>
                    <th className="p-2">Code</th>
                    <th className="p-2">Nature</th>
                    <th className="p-2">NameA</th>
                    <th className="p-2">Currency</th>
                    <th className="p-2">Base</th>
                    <th className="p-2">Conf</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 500).map((r) => (
                    <tr key={r.source_row_number} className="border-b border-[oklch(0.82_0.14_85/0.08)]">
                      <td className="p-2 text-xs text-muted-foreground">{r.source_row_number}</td>
                      <td className="p-2 font-mono text-xs">{r.source_account_number}</td>
                      <td className="p-2 text-xs">{r.nature}</td>
                      <td className="p-2" dir="rtl">{r.raw_name}</td>
                      <td className="p-2"><Badge variant={r.extracted_currency_code === "UNK" ? "destructive" : "secondary"}>{r.extracted_currency_code}</Badge></td>
                      <td className="p-2 text-xs" dir="rtl">{r.base_name_candidate}</td>
                      <td className="p-2 text-xs">{r.confidence_score}</td>
                      <td className="p-2">
                        {r.error_message ? <span className="text-destructive">{r.error_message}</span>
                         : r.needs_review ? <span className="text-warning">review</span>
                         : <CheckCircle2 className="h-4 w-4 text-success" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 500 && <div className="p-2 text-center text-xs text-muted-foreground">Showing first 500 of {parsed.length} rows.</div>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="card-luxe">
        <CardContent className="p-4">
          <h3 className="mb-3 font-serif text-lg">Import history</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="p-2">When</th>
                  <th className="p-2">File</th>
                  <th className="p-2">Total</th>
                  <th className="p-2">Linked</th>
                  <th className="p-2">Review</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(history ?? []).map((b) => (
                  <tr key={b.id} className="border-t border-[oklch(0.82_0.14_85/0.08)]">
                    <td className="p-2 text-xs">{new Date(b.imported_at).toLocaleString()}</td>
                    <td className="p-2">{b.file_name}</td>
                    <td className="p-2">{b.total_rows}</td>
                    <td className="p-2">{b.successful_rows}</td>
                    <td className="p-2">{b.review_rows}</td>
                    <td className="p-2"><Badge>{b.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "err" }) {
  const color = tone === "ok" ? "text-success" : tone === "warn" ? "text-warning" : tone === "err" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-md border border-[oklch(0.82_0.14_85/0.12)] p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 font-serif text-2xl ${color}`}>{value}</div>
    </div>
  );
}