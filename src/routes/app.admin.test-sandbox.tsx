import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FlaskConical, Trash2, Play, Loader2, Copy, ExternalLink, RefreshCw, ArrowDownToLine, ArrowUpFromLine, AlertTriangle } from "lucide-react";
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
import { CurrencyTotalsStrip } from "@/components/app/currency-totals-strip";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/dahabApi";

export const Route = createFileRoute("/app/admin/test-sandbox")({
  component: TestSandboxPage,
  head: () => ({ meta: [{ title: "Test Sandbox — DAHAB" }] }),
});

const REAL_CURRENCIES = ["LYD", "USD", "EUR", "GBP"] as const;
type Currency = (typeof REAL_CURRENCIES)[number];

type FixtureAccount = {
  id: string;
  currency_code: string;
  account_number?: string;
  is_test?: boolean;
  test_run_id?: string;
  source_system?: string;
};

type FixtureVault = {
  id: string;
  currency_code: string;
  name?: string;
  internal_role?: string;
  is_test?: boolean;
  test_run_id?: string;
  source_system?: string;
};

type Fixture = {
  test_run_id: string;
  holder?: {
    id: string;
    name: string;
    dahab_account_number?: string;
    is_test?: boolean;
    test_run_id?: string;
    source_system?: string;
  };
  holder_id?: string;
  holder_name?: string;
  holder_accounts?: FixtureAccount[];
  accounts?: FixtureAccount[];
  vaults?: FixtureVault[];
  next_steps?: string[];
  account_count?: number;
  vault_count?: number;
  created_at?: string;
  updated_at?: string;
};

type LogRow = {
  ts: string;
  action: string;
  status: "ok" | "pending" | "error";
  detail: string;
};

const STORAGE_KEY = "dahab.testFixture";

const asArray = <T,>(value: T[] | undefined | null): T[] =>
  Array.isArray(value) ? value : [];

const getFixtureList = (response: any): Fixture[] => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.data?.items)) return response.data.items;
  return [];
};

function getFixtureAccounts(f: Fixture | null | undefined): FixtureAccount[] {
  const holderAccounts = asArray(f?.holder_accounts);
  return holderAccounts.length > 0 ? holderAccounts : asArray(f?.accounts);
}

function getFixtureVaults(f: Fixture | null | undefined): FixtureVault[] {
  return asArray(f?.vaults);
}

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isReceivable(role?: string) {
  return String(role ?? "").toLowerCase().includes("receiv");
}
function isPayable(role?: string) {
  return String(role ?? "").toLowerCase().includes("pay");
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

  // TEMP: Sandbox transaction posting disabled while backend isolation is hardened.
  const TX_POSTING_DISABLED = true;
  const TX_DISABLED_MSG =
    "Sandbox transaction posting is temporarily disabled while backend isolation is being hardened.";

  const fixturesQuery = useQuery({
    queryKey: ["admin", "test-fixtures"],
    queryFn: () => api.admin.testFixtures.list(),
    enabled: showMaster,
    retry: false,
  });

  const activityQuery = useQuery({
    queryKey: ["admin", "test-fixtures", fixture?.test_run_id, "activity-basic"],
    queryFn: () => api.admin.testFixtures.activityBasic(fixture!.test_run_id),
    enabled: showMaster && !!fixture?.test_run_id,
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
      const raw: any = await api.admin.testFixtures.create();
      const created = raw?.data ?? raw;
      const accounts = getFixtureAccounts(created);
      const vaults = getFixtureVaults(created);
      const normalized: Fixture = {
        test_run_id: created?.test_run_id ?? "",
        holder: created?.holder ?? { id: created?.holder_id ?? "", name: created?.holder_name ?? "Test holder" },
        holder_id: created?.holder_id ?? created?.holder?.id,
        holder_name: created?.holder_name ?? created?.holder?.name,
        holder_accounts: accounts,
        vaults,
        next_steps: asArray(created?.next_steps),
      };
      persist(normalized);
      appendLog({ action: "Create fixture", status: "ok", detail: `test_run_id=${normalized.test_run_id}` });
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

  function findHolderAccount(cur: Currency) {
    const arr = getFixtureAccounts(fixture);
    return arr.find((a) => a.currency_code === cur);
  }
  function findReceivable(cur: Currency) {
    if (!fixture) return undefined;
    const arr = getFixtureVaults(fixture);
    return arr.find(
      (v) =>
        v.currency_code === cur &&
        isReceivable(v.internal_role) &&
        (v.test_run_id ?? fixture!.test_run_id) === fixture!.test_run_id,
    );
  }
  function findPayable(cur: Currency) {
    if (!fixture) return undefined;
    const arr = getFixtureVaults(fixture);
    return arr.find(
      (v) =>
        v.currency_code === cur &&
        isPayable(v.internal_role) &&
        (v.test_run_id ?? fixture!.test_run_id) === fixture!.test_run_id,
    );
  }

  /** Hard isolation: refuse to post unless every party is sandbox-tagged and shares the same test_run_id. */
  function assertSandboxPair(
    ha: { id: string; is_test?: boolean; test_run_id?: string },
    vault: { id: string; is_test?: boolean; test_run_id?: string },
    fx: Fixture,
  ) {
    const haTest = ha.is_test !== false; // tolerate missing flag from backend
    const vaTest = vault.is_test !== false;
    const haRun = ha.test_run_id ?? fx.test_run_id;
    const vaRun = vault.test_run_id ?? fx.test_run_id;
    if (!haTest || !vaTest) throw new Error("Refused: non-test entity in sandbox call.");
    if (haRun !== fx.test_run_id || vaRun !== fx.test_run_id) {
      throw new Error("Refused: test_run_id mismatch between holder, vault, and fixture.");
    }
  }

  async function runTx(opts: {
    action: string;
    direction: "deposit" | "withdraw";
    amountMinor: number;
    expectStatus: "posted" | "pending";
  }) {
    if (TX_POSTING_DISABLED) {
      toast.error(TX_DISABLED_MSG);
      return;
    }
    if (!fixture) return;
    const ha = findHolderAccount(currency);
    const v = opts.direction === "deposit" ? findReceivable(currency) : findPayable(currency);
    if (!ha || !v) {
      toast.error(`No fixture pair for ${currency}`);
      return;
    }
    try {
      assertSandboxPair(ha, v, fixture);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sandbox guard rejected the call";
      appendLog({ action: opts.action, status: "error", detail: msg });
      toast.error(msg);
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

  const depositVault = fixture ? findReceivable(currency) : undefined;
  const withdrawVault = fixture ? findPayable(currency) : undefined;
  const ha = fixture ? findHolderAccount(currency) : undefined;
  const fixtures = getFixtureList(fixturesQuery.data);
  const fixtureActivity = activityQuery.data;
  const activityAccounts = asArray(fixtureActivity?.accounts);
  const activityVaults = asArray(fixtureActivity?.vaults);
  const activityBalances = asArray(fixtureActivity?.balances_by_currency);
  const activityTransactions = asArray(fixtureActivity?.transactions);
  const activityPending = asArray(fixtureActivity?.pending_transactions);
  const activityTotals = fixtureActivity?.totals ?? {};
  // Hydrate the active fixture from the activity payload when available, so
  // findHolderAccount / findReceivable / findPayable read the freshest data.
  const activeFullFixture: Fixture | null = fixture
    ? {
        ...fixture,
        holder: fixtureActivity?.holder ?? fixture.holder,
        holder_accounts: activityAccounts.length > 0 ? activityAccounts : getFixtureAccounts(fixture),
        vaults: activityVaults.length > 0 ? activityVaults : getFixtureVaults(fixture),
      }
    : null;
  const accounts = getFixtureAccounts(activeFullFixture);
  const vaults = getFixtureVaults(activeFullFixture);
  const nextSteps = asArray(activeFullFixture?.next_steps);
  const receivableVaults = vaults.filter((v) => v.internal_role === "cash_receivable" || isReceivable(v.internal_role));
  const payableVaults = vaults.filter((v) => v.internal_role === "cash_payable" || isPayable(v.internal_role));
  const hasAccountAndVaultArrays = accounts.length > 0 && vaults.length > 0;
  const depositDisabled = !fixture || !hasAccountAndVaultArrays || !ha || !depositVault;
  const withdrawDisabled = !fixture || !hasAccountAndVaultArrays || !ha || !withdrawVault;
  const activeHolder = activeFullFixture?.holder;
  const activeHolderId = activeHolder?.id ?? activeFullFixture?.holder_id ?? "";
  const activeHolderName = activeHolder?.name ?? activeFullFixture?.holder_name ?? "Test holder";
  const activeSourceSystem = activeHolder?.source_system ?? "DAHAB_TEST";
  const activeAccountNumber = activeHolder?.dahab_account_number;

  // A complete fixture has 4 holder accounts + 8 vaults (4 receivable + 4 payable).
  const fixtureComplete = !!fixture && (() => {
    if (accounts.length < REAL_CURRENCIES.length) return false;
    for (const c of REAL_CURRENCIES) {
      if (!findReceivable(c) || !findPayable(c)) return false;
    }
    return true;
  })();

  async function runFromFixtureRow(
    f: Fixture,
    direction: "deposit" | "withdraw",
    amountMinor: number,
    expectStatus: "posted" | "pending",
    actionLabel: string,
  ) {
    // Hydrate the active fixture from the row by re-creating? No — use the
    // currently loaded fixture if it matches; otherwise the row only knows
    // the holder_id, so we ask the user to load it via Create/Use first.
    if (!fixture || fixture.test_run_id !== f.test_run_id) {
      toast.error("Open this fixture in the active panel first (re-create or already-loaded fixture only).");
      return;
    }
    await runTx({ action: actionLabel, direction, amountMinor, expectStatus });
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Master Admin"
        icon={FlaskConical}
        title="Test Sandbox"
        subtitle="Create controlled E2E fixtures (is_test=true · source_system=DAHAB_TEST) to exercise the full transaction pipeline against the live Lambda backend."
      />

      {pendingErr && <BackendPending endpoint={pendingErr} />}

      {TX_POSTING_DISABLED && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{TX_DISABLED_MSG}</span>
        </div>
      )}

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

      {/* Existing fixtures from backend */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Existing test fixtures</CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fixturesQuery.refetch()}
            disabled={fixturesQuery.isFetching}
          >
            {fixturesQuery.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {fixturesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : fixturesQuery.error ? (
            isPendingError(fixturesQuery.error) ? (
              <BackendPending endpoint="GET /admin/test-fixtures" />
            ) : (
              <p className="text-sm text-destructive">
                {(fixturesQuery.error as Error).message}
              </p>
            )
          ) : (() => {
              if (fixtures.length === 0) {
                return <p className="text-sm text-muted-foreground">No fixtures yet.</p>;
              }
              return (
                <ul className="divide-y divide-border">
                  {fixtures.map((f: Fixture) => {
                    const rowAccounts = getFixtureAccounts(f);
                    const rowVaults = getFixtureVaults(f);
                    const rowHasDetails = rowAccounts.length > 0 && rowVaults.length > 0;
                    const activeMatchesRow = fixture?.test_run_id === f.test_run_id;
                    const canRunRow = activeMatchesRow && hasAccountAndVaultArrays;
                    const holderId = f.holder_id ?? f.holder?.id ?? "";
                    return (
                    <li key={f.test_run_id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {f.test_run_id}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => copyText(f.test_run_id)}
                        aria-label="Copy test_run_id"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="mt-0.5 text-sm">
                      <span className="font-medium">{f.holder_name ?? f.holder?.name ?? "Test holder"}</span>
                      {typeof f.account_count === "number" && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {f.account_count} account{f.account_count === 1 ? "" : "s"}
                        </span>
                      )}
                      {typeof f.vault_count === "number" && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          · {f.vault_count} vault{f.vault_count === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      holder: {holderId || "—"}
                    </div>
                    {!rowHasDetails && !canRunRow ? (
                      <p className="mt-1 text-xs text-warning">Open or recreate fixture to load test accounts and vaults.</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {holderId ? (
                      <Button asChild size="sm" variant="outline">
                        <Link to="/app/holders/$id" params={{ id: holderId }}>
                          <ExternalLink /> Open holder
                        </Link>
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyText(f.test_run_id)}
                      title="Copy test_run_id"
                    >
                      <Copy /> Copy ID
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={TX_POSTING_DISABLED || busy !== null || !canRunRow}
                      title={
                        TX_POSTING_DISABLED
                          ? TX_DISABLED_MSG
                          :
                        canRunRow
                          ? "Run a test deposit using this fixture"
                          : "Open or recreate fixture to load test accounts and vaults"
                      }
                      onClick={() =>
                        runFromFixtureRow(f, "deposit", Number(normalAmount), "posted", "Cash deposit")
                      }
                    >
                      <ArrowDownToLine /> Deposit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={TX_POSTING_DISABLED || busy !== null || !canRunRow}
                      title={TX_POSTING_DISABLED ? TX_DISABLED_MSG : undefined}
                      onClick={() =>
                        runFromFixtureRow(f, "withdraw", Number(normalAmount), "posted", "Cash withdrawal")
                      }
                    >
                      <ArrowUpFromLine /> Withdraw
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={TX_POSTING_DISABLED || busy !== null || !canRunRow}
                      title={TX_POSTING_DISABLED ? TX_DISABLED_MSG : undefined}
                      onClick={() =>
                        runFromFixtureRow(f, "withdraw", Number(bigAmount), "pending", "Pending approval")
                      }
                    >
                      <Play /> Pending
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteFixtureById(f.test_run_id)}
                      disabled={busy === `del-${f.test_run_id}`}
                    >
                      {busy === `del-${f.test_run_id}` ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                      Delete
                    </Button>
                  </div>
                </li>
                    );
                  })}
                </ul>
              );
            })()}
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
              <span className="font-medium">{activeHolderName}</span>
              <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning">
                TEST
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {activeSourceSystem} · {fixture.test_run_id}
              </span>
              {activeAccountNumber && (
                <span className="font-mono text-xs text-muted-foreground">
                  #{activeAccountNumber}
                </span>
              )}
              {activeHolderId ? (
                <Button asChild size="sm" variant="outline">
                  <Link to="/app/holders/$id" params={{ id: activeHolderId }}>
                    Open Test Holder
                  </Link>
                </Button>
              ) : null}
            </div>

            <div>
              <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                Linked test accounts
              </div>
              <ul className="space-y-1">
                {accounts.map((a) => (
                  <li key={a.id} className="flex items-center gap-3">
                    <span className="inline-flex h-6 min-w-12 items-center justify-center rounded bg-gold/10 px-2 text-xs font-semibold text-gold">
                      {a.currency_code}
                    </span>
                    <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning">
                      TEST
                    </span>
                    {a.account_number && (
                      <span className="font-mono text-[11px]">{a.account_number}</span>
                    )}
                    <span className="font-mono text-[10px] text-muted-foreground">{a.id}</span>
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/app/accounts/$id" params={{ id: a.id }}>Open</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                Test cash vaults (by currency)
              </div>
              <div className="grid gap-2">
                {REAL_CURRENCIES.map((cur) => {
                  const rcv = findReceivable(cur);
                  const pay = findPayable(cur);
                  return (
                    <div
                      key={cur}
                      className="grid grid-cols-1 items-center gap-2 rounded border border-border/40 p-2 sm:grid-cols-[3rem_1fr_1fr]"
                    >
                      <span className="inline-flex h-6 w-12 items-center justify-center rounded bg-gold/10 text-xs font-semibold text-gold">
                        {cur}
                      </span>
                      <VaultCell label="Receivable" v={rcv} onCopy={copyText} />
                      <VaultCell label="Payable" v={pay} onCopy={copyText} />
                    </div>
                  );
                })}
              </div>
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

            {!fixtureComplete && (
              <p className="flex items-center gap-2 text-xs text-warning">
                <AlertTriangle className="h-3.5 w-3.5" />
                Test vaults required before running transactions. Re-create the fixture so the backend returns 4 receivable + 4 payable test vaults.
              </p>
            )}
            {fixtureComplete && (depositDisabled || withdrawDisabled) && (
              <p className="text-xs text-warning">
                Missing holder account or vault for {currency}.
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                disabled={TX_POSTING_DISABLED || busy !== null || depositDisabled || !normalAmount}
                title={TX_POSTING_DISABLED ? TX_DISABLED_MSG : undefined}
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
                disabled={TX_POSTING_DISABLED || busy !== null || withdrawDisabled || !normalAmount}
                title={TX_POSTING_DISABLED ? TX_DISABLED_MSG : undefined}
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
                disabled={TX_POSTING_DISABLED || busy !== null || withdrawDisabled || !bigAmount}
                title={TX_POSTING_DISABLED ? TX_DISABLED_MSG : undefined}
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

function VaultCell({
  label,
  v,
  onCopy,
}: {
  label: "Receivable" | "Payable";
  v?: { id: string; name?: string };
  onCopy: (s: string) => void;
}) {
  if (!v) {
    return (
      <div className="text-[11px] text-warning">
        {label}: missing
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="rounded bg-muted px-1.5 py-0.5 font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="truncate" title={v.name}>{v.name ?? "—"}</span>
      <span className="font-mono text-[10px] text-muted-foreground">{v.id}</span>
      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => onCopy(v.id)} aria-label="Copy vault id">
        <Copy className="h-3 w-3" />
      </Button>
      <Button asChild size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]">
        <Link to="/app/vaults/$id" params={{ id: v.id }}>Open</Link>
      </Button>
    </div>
  );
}