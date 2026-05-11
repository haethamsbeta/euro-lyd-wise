import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FlaskConical, Trash2, Play, Loader2, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionHeader } from "@/components/app/section-header";
import { BackendPending, isPendingError } from "@/components/app/backend-pending";
import { useShowMasterTools } from "@/lib/admin-mode";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/dahabApi";

export const Route = createFileRoute("/app/admin/test-sandbox")({
  component: TestSandboxPage,
  head: () => ({ meta: [{ title: "Test Sandbox — DAHAB" }] }),
});

const REAL_CURRENCIES = ["LYD", "USD", "EUR", "GBP"] as const;
type Currency = (typeof REAL_CURRENCIES)[number];

type Fixture = {
  test_run_id: string;
  holder: { id: string; name: string; dahab_account_number?: string };
  holder_accounts: Array<{ id: string; currency_code: string }>;
  vaults: Array<{ id: string; currency_code: string; name?: string }>;
};

type LogRow = {
  ts: string;
  action: string;
  status: "ok" | "pending" | "error";
  detail: string;
};

const STORAGE_KEY = "dahab.testFixture";

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function TestSandboxPage() {
  const showMaster = useShowMasterTools();
  const nav = useNavigate();

  const [fixture, setFixture] = useState<Fixture | null>(() => {
    if (typeof sessionStorage === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Fixture) : null;
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingErr, setPendingErr] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>("LYD");
  const [normalAmount, setNormalAmount] = useState("10000"); // minor units
  const [bigAmount, setBigAmount] = useState("999999999"); // designed to exceed limits
  const [log, setLog] = useState<LogRow[]>([]);

  const fixturesQuery = useQuery({
    queryKey: ["admin", "test-fixtures"],
    queryFn: () => api.admin.testFixtures.list(),
    enabled: showMaster,
    retry: false,
  });

  useEffect(() => {
    if (!showMaster) nav({ to: "/app", search: {} as any });
  }, [showMaster, nav]);

  if (!showMaster) return null;

  function persist(f: Fixture | null) {
    setFixture(f);
    try {
      if (f) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(f));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  function appendLog(row: Omit<LogRow, "ts">) {
    setLog((l) => [{ ts: new Date().toLocaleTimeString(), ...row }, ...l].slice(0, 50));
  }

  function handleError(action: string, e: unknown, endpoint: string) {
    if (isPendingError(e)) {
      setPendingErr(endpoint);
      appendLog({ action, status: "error", detail: `Endpoint pending: ${endpoint}` });
      return;
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    appendLog({ action, status: "error", detail: msg });
    toast.error(msg);
  }

  async function createFixture() {
    setBusy("create");
    setPendingErr(null);
    try {
      const data = await api.admin.testFixtures.create();
      persist(data);
      appendLog({ action: "Create fixture", status: "ok", detail: `test_run_id=${data.test_run_id}` });
      toast.success("Test fixture created");
      fixturesQuery.refetch();
    } catch (e) {
      handleError("Create fixture", e, "POST /admin/test-fixtures/e2e");
    } finally {
      setBusy(null);
    }
  }

  async function cleanup() {
    if (!fixture) return;
    setBusy("cleanup");
    try {
      await api.admin.testFixtures.cleanup(fixture.test_run_id);
      appendLog({ action: "Cleanup fixture", status: "ok", detail: fixture.test_run_id });
      persist(null);
      toast.success("Test fixture removed");
      fixturesQuery.refetch();
    } catch (e) {
      handleError("Cleanup fixture", e, `DELETE /admin/test-fixtures/${fixture.test_run_id}`);
    } finally {
      setBusy(null);
    }
  }

  async function deleteFixtureById(testRunId: string) {
    setBusy(`del-${testRunId}`);
    try {
      await api.admin.testFixtures.cleanup(testRunId);
      appendLog({ action: "Delete fixture", status: "ok", detail: testRunId });
      toast.success("Fixture deleted");
      if (fixture?.test_run_id === testRunId) persist(null);
      fixturesQuery.refetch();
    } catch (e) {
      handleError("Delete fixture", e, `DELETE /admin/test-fixtures/${testRunId}`);
    } finally {
      setBusy(null);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  function findPair(cur: Currency) {
    const ha = fixture?.holder_accounts.find((a) => a.currency_code === cur);
    const v = fixture?.vaults.find((x) => x.currency_code === cur);
    return { ha, v };
  }

  async function runTx(opts: {
    action: string;
    direction: "deposit" | "withdraw";
    amountMinor: number;
    expectStatus: "posted" | "pending";
  }) {
    if (!fixture) return;
    const { ha, v } = findPair(currency);
    if (!ha || !v) {
      toast.error(`No fixture pair for ${currency}`);
      return;
    }
    setBusy(opts.action);
    try {
      const tx = await api.transactions.postCash({
        holder_account_id: ha.id,
        direction: opts.direction,
        channel: "cash",
        transaction_category: "cash",
        amount: opts.amountMinor,
        currency_code: currency,
        vault_account_id: v.id,
        comment: `[TEST ${fixture.test_run_id}] ${opts.action}`,
        idempotency_key: uuid(),
      });
      const status = (tx as any)?.status ?? "unknown";
      const id = (tx as any)?.id ?? (tx as any)?.transaction_id ?? "?";
      const pass = status === opts.expectStatus;
      appendLog({
        action: opts.action,
        status: pass ? (status === "pending" ? "pending" : "ok") : "error",
        detail: `tx=${id} status=${status} (expected ${opts.expectStatus})`,
      });
      if (pass) toast.success(`${opts.action}: ${status}`);
      else toast.error(`${opts.action}: got ${status}, expected ${opts.expectStatus}`);
    } catch (e) {
      handleError(opts.action, e, "POST /transactions");
    } finally {
      setBusy(null);
    }
  }

  const currencyDisabled = !fixture || !findPair(currency).ha || !findPair(currency).v;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Master Admin"
        icon={FlaskConical}
        title="Test Sandbox"
        subtitle="Create controlled E2E fixtures (is_test=true · source_system=DAHAB_TEST) to exercise the full transaction pipeline against the live Lambda backend."
      />

      {pendingErr && <BackendPending endpoint={pendingErr} />}

      {/* Card 1 — Lifecycle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fixture lifecycle</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={createFixture} disabled={busy !== null}>
            {busy === "create" ? <Loader2 className="animate-spin" /> : <FlaskConical />}
            Create E2E Test Fixture
          </Button>
          <Button
            variant="destructive"
            onClick={cleanup}
            disabled={!fixture || busy !== null}
          >
            {busy === "cleanup" ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Cleanup Fixture
          </Button>
          {fixture && (
            <span className="ml-auto self-center font-mono text-xs text-muted-foreground">
              test_run_id: {fixture.test_run_id}
            </span>
          )}
        </CardContent>
      </Card>

      {/* Card 2 — Details */}
      {fixture && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fixture details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-muted-foreground">Holder:</span>
              <span className="font-medium">{fixture.holder.name}</span>
              {fixture.holder.dahab_account_number && (
                <span className="font-mono text-xs text-muted-foreground">
                  #{fixture.holder.dahab_account_number}
                </span>
              )}
              <Button asChild size="sm" variant="outline">
                <Link to="/app/holders/$id" params={{ id: fixture.holder.id }}>
                  Open Test Holder
                </Link>
              </Button>
            </div>

            <div>
              <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                Linked test accounts
              </div>
              <ul className="space-y-1">
                {fixture.holder_accounts.map((a) => (
                  <li key={a.id} className="flex items-center gap-3">
                    <span className="inline-flex h-6 min-w-12 items-center justify-center rounded bg-gold/10 px-2 text-xs font-semibold text-gold">
                      {a.currency_code}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{a.id}</span>
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/app/accounts/$id" params={{ id: a.id }}>Open</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                Test cash vaults
              </div>
              <ul className="space-y-1">
                {fixture.vaults.map((v) => (
                  <li key={v.id} className="flex items-center gap-3">
                    <span className="inline-flex h-6 min-w-12 items-center justify-center rounded bg-gold/10 px-2 text-xs font-semibold text-gold">
                      {v.currency_code}
                    </span>
                    <span className="text-xs">{v.name ?? "—"}</span>
                    <span className="font-mono text-xs text-muted-foreground">{v.id}</span>
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/app/vaults/$id" params={{ id: v.id }}>Open</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Card 3 — Transaction tests */}
      {fixture && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transaction tests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Currency</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REAL_CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Normal amount (minor)</Label>
                <Input
                  inputMode="numeric"
                  value={normalAmount}
                  onChange={(e) => setNormalAmount(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div>
                <Label>Pending-approval amount (minor)</Label>
                <Input
                  inputMode="numeric"
                  value={bigAmount}
                  onChange={(e) => setBigAmount(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>

            {currencyDisabled && (
              <p className="text-xs text-warning">
                Fixture has no holder account + vault for {currency}.
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                disabled={busy !== null || currencyDisabled || !normalAmount}
                onClick={() => runTx({
                  action: "Cash deposit",
                  direction: "deposit",
                  amountMinor: Number(normalAmount),
                  expectStatus: "posted",
                })}
              >
                <Play /> Run Test Cash Deposit
              </Button>
              <Button
                variant="outline"
                disabled={busy !== null || currencyDisabled || !normalAmount}
                onClick={() => runTx({
                  action: "Cash withdrawal",
                  direction: "withdraw",
                  amountMinor: Number(normalAmount),
                  expectStatus: "posted",
                })}
              >
                <Play /> Run Test Cash Withdrawal
              </Button>
              <Button
                variant="outline"
                disabled={busy !== null || currencyDisabled || !bigAmount}
                onClick={() => runTx({
                  action: "Pending approval",
                  direction: "withdraw",
                  amountMinor: Number(bigAmount),
                  expectStatus: "pending",
                })}
              >
                <Play /> Run Pending Approval Test
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log */}
      {log.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Test results</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 font-mono text-xs">
              {log.map((row, i) => (
                <li
                  key={i}
                  className={
                    row.status === "ok"
                      ? "text-success"
                      : row.status === "pending"
                        ? "text-warning"
                        : "text-destructive"
                  }
                >
                  [{row.ts}] {row.action} — {row.detail}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// satisfy unused import warning when ApiError isn't directly referenced
void ApiError;