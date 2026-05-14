import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ArrowDownRight, ArrowUpRight, Landmark, Search, AlertTriangle, Loader2, X,
  Phone, ShieldCheck, Wallet, Sparkles, Check, ChevronLeft, ChevronRight, Pencil,
  Clock, ShieldAlert, Receipt, ArrowLeft, Building2, User, ArrowRight, Hash,
} from "lucide-react";
import { formatMinor, parseAmountToMinor } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { useEffectiveRoles } from "@/lib/role-view";
import { api } from "@/lib/api";
import { DATA_BACKEND } from "@/lib/runtimeConfig";

type Direction = "deposit" | "withdraw";
type Channel = "cash" | "bank";
type Currency = "USD" | "EUR" | "LYD" | "GBP";

type HolderCardHit = {
  holder_account_id: string | number;
  account_number: string;
  currency: Currency;
  balance_minor: number;
  account_holder_id: string | number;
  dahab_account_number: string;
  holder_name: string;
  phone: string | null;
  status: string;
  account_nature: string | null;
  alias: string | null;
  withdraw_limit_minor: number;
  withdraw_limit_enabled: boolean;
  holder_type: string;
};

const COMMENT_MIN = 3;
const COMMENT_MAX = 280;
const APPROVAL_THRESHOLD_MINOR = 25_000_00;

type StepKey = "type" | "customer" | "vault" | "details" | "review";
const STEPS: { key: StepKey; label: string }[] = [
  { key: "type", label: "Type" },
  { key: "customer", label: "Customer" },
  { key: "vault", label: "Vault" },
  { key: "details", label: "Details" },
  { key: "review", label: "Review" },
];

type ResultState =
  | { kind: "success"; tx: any }
  | { kind: "pending"; tx: any }
  | { kind: "failed"; error: string };

export function NewTransactionWizard({ initialType }: { initialType?: Direction }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const roles = useEffectiveRoles();
  const canViewBalances = hasAnyRole(roles, ["admin"]);

  const [stepIdx, setStepIdx] = useState<number>(initialType ? 1 : 0);
  const [type, setType] = useState<Direction | null>(initialType ?? null);
  const [picked, setPicked] = useState<HolderCardHit | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<ResultState | null>(null);

  const step = STEPS[stepIdx];
  const isDeposit = type === "deposit";
  const TypeIcon = isDeposit ? ArrowDownRight : ArrowUpRight;

  function changeType(nextV: Direction) {
    if (nextV === type) return;
    setType(nextV);
    setPicked(null);
    setChannel(null);
    setAmount("");
    setComment("");
    setResult(null);
  }
  function changePicked(nextV: HolderCardHit | null) {
    setPicked(nextV);
    setChannel(null);
    setAmount("");
    setResult(null);
  }
  function changeChannel(nextV: Channel) {
    setChannel(nextV);
    setResult(null);
  }

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 120);
    return () => clearTimeout(t);
  }, [search]);

  const { data: results, isFetching, isError } = useQuery({
    // Run a search from the very first character so users don't have to
    // type two letters before anything happens.
    enabled: stepIdx === 1 && debounced.length >= 1,
    queryKey: ["holder_cards.search", debounced],
    staleTime: 30_000,
    queryFn: async () => {
      const term = debounced;
      if (DATA_BACKEND === "lambda") {
        // Lambda mode — search across both accounts and holders so a query
        // by holder name, account number, OR DAHAB number all return hits.
        // For every holder that matched (by name / DAHAB number) we also
        // pull their full linked account list, so the user can see every
        // eligible account regardless of which field the search matched.
        const [accountsRes, holdersRes] = await Promise.all([
          api.accounts.list({ q: term, limit: 50 }).catch(() => ({ items: [] as any[] })),
          api.holders.list({ q: term, limit: 25 }).catch(() => [] as any[]),
        ]);
        const accountItems: any[] = (accountsRes as any)?.items ?? [];
        const holderRows: any[] = Array.isArray(holdersRes) ? holdersRes : [];
        const holderById = new Map<string | number, any>();
        for (const h of holderRows) holderById.set(h.id, h);

        // Holders that matched by name/DAHAB number but whose accounts did
        // not surface in the accounts query — fetch their accounts directly.
        const accountHolderIds = new Set(accountItems.map((r) => String(r.account_holder_id)));
        const missingHolders = holderRows.filter(
          (h) => !accountHolderIds.has(String(h.id)),
        );
        const extraAccountLists = await Promise.all(
          missingHolders.slice(0, 15).map((h) =>
            api.holders.accounts(h.id).catch(() => [] as any[]),
          ),
        );
        for (const list of extraAccountLists) {
          for (const a of list as any[]) accountItems.push(a);
        }

        // De-duplicate (a holder hit + an account hit can return the same row).
        const seen = new Set<string>();
        const merged = accountItems.filter((r) => {
          const k = String(r.id ?? r.holder_account_id ?? "");
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        });

        const allowed = new Set(["USD", "EUR", "LYD", "GBP"]);
        return merged
          .filter((r) => allowed.has(String(r.currency_code)))
          .filter((r) =>
            !(r?.is_test === true || r?.source_system === "DAHAB_TEST" || !!r?.test_run_id),
          )
          .map((r) => {
            const holder = holderById.get(r.account_holder_id) ?? {};
            return {
              holder_account_id: r.id,
              account_number: r.account_number,
              currency: r.currency_code as Currency,
              balance_minor: Math.round(Number(r.current_balance ?? 0) * 100),
              account_holder_id: r.account_holder_id,
              dahab_account_number:
                holder.dahab_account_number ?? r.account_number ?? "",
              holder_name:
                holder.holder_name ??
                r.account_display_name ??
                r.account_number,
              phone: holder.phone ?? null,
              status: r.status ?? "ACTIVE",
              account_nature: r.account_nature ?? null,
              alias: r.alias_name ?? null,
              withdraw_limit_minor: Math.round(
                Number((r as any).withdraw_limit_amount ?? 0) * 100,
              ),
              withdraw_limit_enabled: !!(r as any).withdraw_limit_enabled,
              holder_type: (holder.holder_type ?? "INDIVIDUAL") as string,
            } as HolderCardHit;
          });
      }
      return [] as HolderCardHit[];
    },
  });

  const currency: Currency = picked?.currency ?? "USD";
  const amountMinor = useMemo(() => parseAmountToMinor(amount), [amount]);
  const trimmedComment = comment.trim();

  // Vault auto-routing — fetch official cash vaults from the backend and
  // pick the receivable/payable account that matches the selected currency.
  const { data: vaultList } = useQuery({
    queryKey: ["vaults.list.cash-routing"],
    queryFn: () => api.vaults.list(),
    enabled: DATA_BACKEND === "lambda",
    staleTime: 5 * 60_000,
  });
  const cashVaultMatch = useMemo<any | null>(() => {
    if (!type || !picked) return null;
    const list = (vaultList ?? []) as Array<any>;
    return list.find((v) => {
      if (v?.is_test === true || v?.source_system === "DAHAB_TEST" || !!v?.test_run_id) return false;
      if (v.currency_code !== currency) return false;
      const role = String(v.internal_role ?? "").toLowerCase();
      return type === "deposit"
        ? role.includes("receiv")
        : role.includes("pay");
    }) ?? null;
  }, [vaultList, type, picked, currency]);
  const cashVaultId = cashVaultMatch ? String(cashVaultMatch.id) : null;
  const cashVaultName: string | null = cashVaultMatch
    ? String(
        cashVaultMatch.account_name ??
          cashVaultMatch.name ??
          cashVaultMatch.display_name ??
          cashVaultMatch.account_number ??
          (type === "deposit"
            ? `Cash Receivable ${currency}`
            : `Cash Payable ${currency}`),
      )
    : null;
  const cashVaultMissing = DATA_BACKEND === "lambda" && !!type && !!picked && !cashVaultId;

  // Auto-select Cash channel — bank vaults are not enabled in this phase.
  useEffect(() => {
    if (picked && channel !== "cash") setChannel("cash");
  }, [picked, channel]);

  const commentValid = trimmedComment.length >= COMMENT_MIN && trimmedComment.length <= COMMENT_MAX;
  const currentBalance = picked?.balance_minor ?? 0;
  const withdrawLimitMinor = picked?.withdraw_limit_enabled ? picked.withdraw_limit_minor : 0;
  const willOverdraft = canViewBalances && !isDeposit && amountMinor !== null && currentBalance - amountMinor < 0;
  const overLimit = !isDeposit && amountMinor !== null && withdrawLimitMinor > 0 && amountMinor > withdrawLimitMinor;
  const overThreshold = !isDeposit && amountMinor !== null && amountMinor > APPROVAL_THRESHOLD_MINOR;
  const willPend = !!(willOverdraft || overLimit || overThreshold);

  function canContinue(): boolean {
    switch (step.key) {
      case "type": return !!type;
      case "customer": return !!picked;
      case "vault": return channel === "cash" && !cashVaultMissing;
      case "details": return amountMinor !== null && amountMinor > 0 && commentValid;
      case "review": return !cashVaultMissing;
    }
  }

  function next() {
    if (!canContinue()) return;
    if (stepIdx < STEPS.length - 1) setStepIdx(stepIdx + 1);
  }
  function back() {
    if (stepIdx === 0) {
      nav({ to: "/app/transactions" });
      return;
    }
    setStepIdx(stepIdx - 1);
  }
  function goToStep(k: StepKey) {
    const idx = STEPS.findIndex((s) => s.key === k);
    if (idx >= 0 && idx <= stepIdx) setStepIdx(idx);
  }

  const post = useMutation({
    mutationFn: async () => {
      // Cash-only routing: pick the matching cash receivable / payable vault
      // for the selected currency. Bank vaults are not provisioned yet.
      if (!cashVaultId) {
        throw new Error("Cash vault for this currency is not configured.");
      }
      if (channel !== "cash") {
        throw new Error("Only cash transactions are enabled in this phase.");
      }
      const tx = await api.transactions.postCash({
          holder_account_id: picked!.holder_account_id,
          direction: type!,
          channel: "cash",
          transaction_category: "cash",
          amount: amountMinor!,
          currency_code: currency,
          vault_account_id: cashVaultId,
          comment: trimmedComment,
          idempotency_key:
            (typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
      });
      return tx as any;
    },
    onSuccess: (tx) => {
      qc.invalidateQueries();
      const isPosted = (tx as any)?.status === "posted";
      setResult(isPosted ? { kind: "success", tx } : { kind: "pending", tx });
    },
    onError: (e: any) => {
      const msg = e?.message ?? "Could not post transaction";
      setResult({ kind: "failed", error: msg });
      toast.error(msg);
    },
  });

  function reset() {
    setStepIdx(0);
    setType(null);
    setPicked(null);
    setChannel(null);
    setAmount("");
    setComment("");
    setResult(null);
    setSearch("");
  }

  if (result) {
    return (
      <ResultScreen
        result={result}
        type={type!}
        picked={picked!}
        channel={channel!}
        currency={currency}
        amountMinor={amountMinor!}
        comment={trimmedComment}
        canViewBalances={canViewBalances}
        onNew={reset}
        onTryAgain={() => setResult(null)}
      />
    );
  }

  const submitting = post.isPending;
  const continueLabel = step.key === "review"
    ? (willPend ? "Submit for approval" : "Confirm & Submit")
    : "Continue";

  return (
    <div>
      <div className="mx-auto max-w-4xl px-4 pt-6 md:px-8 md:pt-8">
        <div className="mb-5 flex items-center gap-2 text-sm">
          <Link to="/app" className="text-muted-foreground hover:text-foreground">Dashboard</Link>
          <span className="text-muted-foreground">/</span>
          <Link to="/app/transactions" className="text-muted-foreground hover:text-foreground">Transactions</Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-foreground">New</span>
        </div>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-gold" />
              <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-gold">New Transaction</span>
            </div>
          <h1 className="font-playfair text-3xl font-semibold text-foreground md:text-4xl">
              {type ? (isDeposit ? "New Deposit" : "New Withdrawal") : "Create transaction"}
            </h1>
          </div>
          {type ? (
            <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-gold/5 text-gold sm:flex">
              <TypeIcon className="h-7 w-7" />
            </div>
          ) : null}
        </div>
      </div>

      {/* Sticky stepper + context strip */}
      <div className="sticky top-0 z-10 mb-2 border-b border-gold/15 bg-background/85 px-4 py-4 shadow-[0_8px_30px_-20px_rgba(0,0,0,0.6)] backdrop-blur-md md:px-8">
        <div className="mx-auto max-w-4xl">
          <Stepper stepIdx={stepIdx} onJump={goToStep} />
          <ContextPills
            stepIdx={stepIdx}
            type={type}
            picked={picked}
            channel={channel}
            amountMinor={amountMinor}
            currency={currency}
            onJump={goToStep}
          />
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 pb-32 pt-6 md:px-8">
        <div key={step.key} className="animate-fade-in">
          {step.key === "type" && (
            <TypeStep value={type} onPick={(v) => { changeType(v); setStepIdx(1); }} />
          )}
          {step.key === "customer" && (
            <CustomerStep
              search={search} setSearch={(v) => { setSearch(v); if (picked) changePicked(null); }}
              searchRef={searchRef}
              results={results ?? null} isFetching={isFetching} isError={!!isError} debounced={debounced}
              picked={picked} onPick={(h) => changePicked(h)} onClear={() => changePicked(null)}
              canViewBalances={canViewBalances} isDeposit={isDeposit}
            />
          )}
          {step.key === "vault" && (
            <VaultStep
              value={channel}
              cashVaultMissing={cashVaultMissing}
              currency={currency}
              onPick={(v) => {
                changeChannel(v);
                // Auto-advance to Details — vault step has only two options,
                // tellers shouldn't need to click Continue after picking.
                setStepIdx((idx) => Math.min(idx + 1, STEPS.length - 1));
              }}
            />
          )}
          {step.key === "details" && picked && (
            <DetailsStep
              picked={picked} isDeposit={isDeposit}
              amount={amount} setAmount={setAmount}
              amountMinor={amountMinor}
              comment={comment} setComment={setComment}
              canViewBalances={canViewBalances}
              willPend={willPend} willOverdraft={willOverdraft} overLimit={overLimit} overThreshold={overThreshold}
            />
          )}
          {step.key === "review" && picked && channel && amountMinor !== null && (
            <ReviewStep
              type={type!} picked={picked} channel={channel} currency={currency}
              amountMinor={amountMinor} comment={trimmedComment}
              willPend={willPend} canViewBalances={canViewBalances}
              cashVaultName={cashVaultName}
              onEdit={goToStep}
            />
          )}
        </div>
      </div>

      <ActionBar
        leftLabel={stepIdx === 0 ? "Cancel" : "Back"}
        leftOnClick={back}
        rightLabel={continueLabel}
        rightDisabled={!canContinue() || submitting}
        rightOnClick={() => {
          if (step.key === "review") post.mutate();
          else next();
        }}
        submitting={submitting}
      />
    </div>
  );
}

function Stepper({ stepIdx, onJump }: { stepIdx: number; onJump: (k: StepKey) => void }) {
  return (
    <div className="rounded-2xl border border-gold/15 bg-card/40 p-3 md:p-4">
      <ol className="flex items-center justify-between gap-1 md:gap-2">
        {STEPS.map((s, i) => {
          const done = i < stepIdx;
          const active = i === stepIdx;
          const future = i > stepIdx;
          return (
            <li key={s.key} className="flex flex-1 items-center gap-1 md:gap-2">
              <button
                type="button"
                disabled={future}
                onClick={() => !future && onJump(s.key)}
                className={cn(
                  "group flex min-w-0 flex-shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors md:px-2",
                  !future && "hover:bg-gold/5",
                  future && "cursor-not-allowed opacity-60",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-all md:h-8 md:w-8 md:text-xs",
                    done && "border-gold bg-gradient-gold text-[var(--surface)]",
                    active && "border-gold bg-gold/10 text-gold ring-2 ring-gold/30",
                    future && "border-border bg-surface-2 text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "hidden text-xs font-medium tracking-wide md:inline",
                    done && "text-foreground",
                    active && "text-gold",
                    future && "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span
                  className={cn(
                    "h-px flex-1 transition-colors",
                    done ? "bg-gradient-to-r from-gold/70 to-gold/20" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-2 text-center text-[11px] font-medium text-gold md:hidden">
        {STEPS[stepIdx].label}
      </div>
    </div>
  );
}

function ContextPills({
  stepIdx, type, picked, channel, amountMinor, currency, onJump,
}: {
  stepIdx: number;
  type: Direction | null;
  picked: HolderCardHit | null;
  channel: Channel | null;
  amountMinor: number | null;
  currency: Currency;
  onJump: (k: StepKey) => void;
}) {
  const pillBase =
    "group inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-all";
  const filled =
    "border-gold/40 bg-card/80 text-foreground hover:bg-gold/5";
  const empty =
    "border-dashed border-border bg-card/40 text-muted-foreground";
  const showCustomerSlot = stepIdx >= 1;
  const showVaultSlot = stepIdx >= 2;
  const showAmountSlot = stepIdx >= 3;
  if (!type && !showCustomerSlot) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {type ? (
        <button type="button" onClick={() => onJump("type")} className={cn(pillBase, filled)}>
          <span className="font-medium capitalize">{type}</span>
          <Pencil className="h-3 w-3 text-gold opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      ) : (
        <span className={cn(pillBase, empty)}>—</span>
      )}
      {showCustomerSlot ? (
        picked ? (
          <button type="button" onClick={() => onJump("customer")} className={cn(pillBase, filled, "min-w-0")}>
            <User className="h-3 w-3 text-gold shrink-0" />
            <span className="truncate font-medium">{picked.holder_name}</span>
            <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
              {picked.dahab_account_number}
            </span>
            <Pencil className="h-3 w-3 shrink-0 text-gold opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ) : (
          <span className={cn(pillBase, empty)}>Select customer</span>
        )
      ) : null}
      {showCustomerSlot && picked ? (
        <button type="button" onClick={() => onJump("customer")} className={cn(pillBase, filled)}>
          <CurrencyBadge currency={picked.currency} className="!px-1.5 !py-0.5 !text-[10px]" />
          <span className="font-mono text-[10px]">•••• {picked.account_number.slice(-4)}</span>
          <Pencil className="h-3 w-3 text-gold opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      ) : null}
      {showVaultSlot ? (
        channel ? (
          <button type="button" onClick={() => onJump("vault")} className={cn(pillBase, filled)}>
            {channel === "cash" ? (
              <Wallet className="h-3 w-3 text-gold" />
            ) : (
              <Landmark className="h-3 w-3 text-gold" />
            )}
            <span className="font-medium capitalize">{channel}</span>
            <Pencil className="h-3 w-3 text-gold opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ) : (
          <span className={cn(pillBase, empty)}>Select vault</span>
        )
      ) : null}
      {showAmountSlot ? (
        amountMinor && amountMinor > 0 ? (
          <button type="button" onClick={() => onJump("details")} className={cn(pillBase, filled)}>
            <span className="font-semibold tabular-nums">
              {formatMinor(amountMinor, currency)}
            </span>
            <Pencil className="h-3 w-3 text-gold opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ) : (
          <span className={cn(pillBase, empty)}>Enter amount</span>
        )
      ) : null}
    </div>
  );
}

function ActionBar({
  leftLabel, leftOnClick, rightLabel, rightDisabled, rightOnClick, submitting,
}: {
  leftLabel: string; leftOnClick: () => void;
  rightLabel: string; rightDisabled: boolean; rightOnClick: () => void; submitting: boolean;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gold/15 bg-card/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4 md:px-8">
        <Button type="button" variant="outline" className="border-gold/20" onClick={leftOnClick} disabled={submitting}>
          <ChevronLeft className="h-4 w-4" /> {leftLabel}
        </Button>
        <Button type="button" variant="gold" className="min-w-[180px]" disabled={rightDisabled} onClick={rightOnClick}>
          {submitting ? (
            <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Processing…</span>
          ) : (
            <span className="flex items-center gap-2">{rightLabel} <ChevronRight className="h-4 w-4" /></span>
          )}
        </Button>
      </div>
    </div>
  );
}

function TypeStep({ value, onPick }: { value: Direction | null; onPick: (v: Direction) => void }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <DirectionCard
        kind="deposit"
        active={value === "deposit"}
        onClick={() => onPick("deposit")}
      />
      <DirectionCard
        kind="withdraw"
        active={value === "withdraw"}
        onClick={() => onPick("withdraw")}
      />
    </div>
  );
}

function DirectionCard({
  kind,
  active,
  onClick,
}: {
  kind: Direction;
  active: boolean;
  onClick: () => void;
}) {
  const isDeposit = kind === "deposit";
  const Icon = isDeposit ? ArrowDownRight : ArrowUpRight;
  const title = isDeposit ? "Deposit" : "Withdraw";
  const desc = isDeposit
    ? "Receive cash or wire into a customer account."
    : "Disburse cash or wire from a customer account.";
  // Color tokens — semantic success/destructive from the design system.
  const tone = isDeposit
    ? {
        ring: "ring-[oklch(0.72_0.18_150/0.45)]",
        border: active
          ? "border-[oklch(0.72_0.18_150)]"
          : "border-[oklch(0.72_0.18_150/0.30)] hover:border-[oklch(0.72_0.18_150/0.65)]",
        bg: active
          ? "bg-[oklch(0.72_0.18_150/0.12)]"
          : "bg-[oklch(0.72_0.18_150/0.04)] hover:bg-[oklch(0.72_0.18_150/0.08)]",
        glow: active
          ? "shadow-[0_20px_60px_-20px_oklch(0.72_0.18_150/0.55)]"
          : "",
        iconWrap: active
          ? "bg-[oklch(0.72_0.18_150)] text-[oklch(0.16_0.02_60)]"
          : "bg-[oklch(0.72_0.18_150/0.15)] text-[oklch(0.78_0.18_150)]",
        title: active ? "text-[oklch(0.78_0.18_150)]" : "text-foreground",
        check: "bg-[oklch(0.72_0.18_150)]",
      }
    : {
        ring: "ring-[oklch(0.65_0.22_25/0.45)]",
        border: active
          ? "border-[oklch(0.65_0.22_25)]"
          : "border-[oklch(0.65_0.22_25/0.30)] hover:border-[oklch(0.65_0.22_25/0.65)]",
        bg: active
          ? "bg-[oklch(0.65_0.22_25/0.12)]"
          : "bg-[oklch(0.65_0.22_25/0.04)] hover:bg-[oklch(0.65_0.22_25/0.08)]",
        glow: active
          ? "shadow-[0_20px_60px_-20px_oklch(0.65_0.22_25/0.55)]"
          : "",
        iconWrap: active
          ? "bg-[oklch(0.65_0.22_25)] text-white"
          : "bg-[oklch(0.65_0.22_25/0.15)] text-[oklch(0.72_0.22_25)]",
        title: active ? "text-[oklch(0.72_0.22_25)]" : "text-foreground",
        check: "bg-[oklch(0.65_0.22_25)]",
      };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-3xl border-2 p-8 text-left transition-all md:p-10",
        "min-h-[220px] md:min-h-[260px]",
        tone.border,
        tone.bg,
        tone.glow,
      )}
    >
      {active && (
        <div
          className={cn(
            "absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full",
            tone.check,
          )}
        >
          <Check className="h-4 w-4 text-white" />
        </div>
      )}
      <div
        className={cn(
          "mb-5 flex h-16 w-16 items-center justify-center rounded-2xl transition-colors md:h-20 md:w-20",
          tone.iconWrap,
        )}
      >
        <Icon className="h-8 w-8 md:h-10 md:w-10" strokeWidth={2} />
      </div>
      <h3
        className={cn(
          "mb-2 font-playfair text-2xl font-semibold md:text-3xl",
          tone.title,
        )}
      >
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-muted-foreground md:text-base">{desc}</p>
    </button>
  );
}

function VaultStep({
  value, onPick, cashVaultMissing, currency,
}: {
  value: Channel | null; onPick: (v: Channel) => void;
  cashVaultMissing: boolean; currency: Currency;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <VaultCard
          active={value === "cash"}
          onClick={() => onPick("cash")}
          icon={<Wallet className="h-8 w-8 md:h-10 md:w-10" strokeWidth={2} />}
          title="Cash Vault"
          desc="Physical cash handled at branch."
          hint="Walk-in deposits, teller-counted withdrawals"
        />
        <VaultCard
          active={false}
          onClick={() => {}}
          disabled
          icon={<Landmark className="h-8 w-8 md:h-10 md:w-10" strokeWidth={2} />}
          title="Bank Vault"
          desc="Bank vault accounts are not configured yet."
          hint="Coming soon — only cash transactions are enabled in this phase."
        />
      </div>
      {cashVaultMissing && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Cash vault for {currency} is not configured. Submit is disabled.</p>
        </div>
      )}
    </div>
  );
}

function VaultCard({
  active, onClick, icon, title, desc, hint, disabled,
}: {
  active: boolean; onClick: () => void;
  icon: React.ReactNode; title: string; desc: string; hint?: string; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={cn(
        "group relative overflow-hidden rounded-3xl border-2 p-8 text-left transition-all md:p-10",
        "min-h-[220px] md:min-h-[260px]",
        active
          ? "border-gold bg-gold/10 shadow-[0_20px_60px_-20px_oklch(0.74_0.135_82/0.55)]"
          : "border-gold/25 bg-card/60 hover:border-gold/55 hover:bg-card",
        disabled && "cursor-not-allowed opacity-50 hover:border-gold/25 hover:bg-card/60",
      )}
    >
      {active && (
        <div className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-gold">
          <Check className="h-4 w-4 text-[var(--surface)]" />
        </div>
      )}
      <div
        className={cn(
          "mb-5 flex h-16 w-16 items-center justify-center rounded-2xl transition-colors md:h-20 md:w-20",
          active
            ? "bg-gradient-gold text-[var(--surface)]"
            : "bg-gold/10 text-gold",
        )}
      >
        {icon}
      </div>
      <h3
        className={cn(
          "mb-2 font-playfair text-2xl font-semibold md:text-3xl",
          active ? "text-gold" : "text-foreground",
        )}
      >
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-muted-foreground md:text-base">{desc}</p>
      {hint && (
        <p className="mt-4 border-t border-gold/15 pt-3 text-[12px] italic text-muted-foreground/80">
          {hint}
        </p>
      )}
    </button>
  );
}

function SelectableCard({ active, onClick, icon, title, desc, hint }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string; hint?: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-2xl border-2 p-6 text-left transition-all",
        active ? "border-gold bg-gold/10 shadow-gold" : "border-border bg-card/60 hover:border-gold/40 hover:bg-card",
      )}>
      {active && (
        <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-gold">
          <Check className="h-3.5 w-3.5 text-[var(--surface)]" />
        </div>
      )}
      <div className={cn(
        "mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-colors",
        active ? "bg-gradient-gold text-[var(--surface)]" : "bg-surface-2 text-muted-foreground group-hover:text-gold",
      )}>{icon}</div>
      <h3 className={cn("mb-1 font-playfair text-lg font-semibold", active ? "text-gold" : "text-foreground")}>{title}</h3>
      <p className="text-sm text-muted-foreground">{desc}</p>
      {hint && <p className="mt-3 border-t border-gold/10 pt-3 text-[11px] italic text-muted-foreground/80">{hint}</p>}
    </button>
  );
}

function CustomerStep({
  search, setSearch, searchRef, results, isFetching, isError, debounced,
  picked, onPick, onClear, canViewBalances, isDeposit,
}: {
  search: string; setSearch: (v: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  results: HolderCardHit[] | null; isFetching: boolean; isError: boolean; debounced: string;
  picked: HolderCardHit | null; onPick: (h: HolderCardHit) => void; onClear: () => void;
  canViewBalances: boolean; isDeposit: boolean;
}) {
  // Auto-focus when entering the step
  useEffect(() => {
    if (!picked) searchRef.current?.focus();
  }, [picked, searchRef]);

  // Keep an internal "selected customer" derived from `picked` so the
  // SelectedCustomerCard + AccountTile grid persist after picking an account.
  const [browseHolderId, setBrowseHolderId] = useState<string | number | null>(null);
  const selectedHolderId = picked?.account_holder_id ?? browseHolderId;

  // When picking, mirror the holder id locally so the customer card stays.
  useEffect(() => {
    if (picked) setBrowseHolderId(picked.account_holder_id);
  }, [picked]);

  // Group results by customer
  const customers = useMemo(() => {
    if (!results) return [];
    const map = new Map<string | number, { holder: HolderCardHit; accountCount: number }>();
    for (const r of results) {
      const ex = map.get(r.account_holder_id);
      if (ex) ex.accountCount += 1;
      else map.set(r.account_holder_id, { holder: r, accountCount: 1 });
    }
    return Array.from(map.values());
  }, [results]);

  const selectedHolder = useMemo(() => {
    if (!selectedHolderId || !results) return null;
    return results.find((r) => r.account_holder_id === selectedHolderId) ?? picked ?? null;
  }, [selectedHolderId, results, picked]);

  const accountsForSelected = useMemo(() => {
    if (!selectedHolderId || !results) return [];
    return results.filter((r) => r.account_holder_id === selectedHolderId);
  }, [selectedHolderId, results]);

  function handleChangeCustomer() {
    setBrowseHolderId(null);
    onClear();
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  const showSearchMode = !selectedHolder;
  const showHint = showSearchMode && debounced.length < 2;
  const showNoResults = showSearchMode && !showHint && !isFetching && customers.length === 0;

  return (
    <div className="space-y-5">
      {showSearchMode && (
        <div className="relative animate-fade-in">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Search by customer name or DAHAB number…"
            className="h-14 rounded-2xl border-gold/20 bg-card/60 pl-12 pr-12 text-base placeholder:text-muted-foreground/70 focus-visible:ring-gold/40 focus-visible:border-gold/60 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {search ? (
            <button type="button" onClick={() => { setSearch(""); searchRef.current?.focus(); }}
              className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-gold/10 hover:text-foreground"
              aria-label="Clear">
              <X className="h-4 w-4" />
            </button>
          ) : isFetching ? (
            <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </div>
      )}

      {selectedHolder ? (
        <div className="space-y-5 animate-fade-in">
          <SelectedCustomerCard
            holder={selectedHolder}
            accountCount={accountsForSelected.length || 1}
            onChange={handleChangeCustomer}
          />

          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold">
                Select account · {isDeposit ? "deposit into" : "withdraw from"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {accountsForSelected.length} account{accountsForSelected.length === 1 ? "" : "s"}
              </span>
            </div>
            {accountsForSelected.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gold/20 bg-card/30 p-8 text-center text-sm text-muted-foreground">
                This customer has no accounts available.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {accountsForSelected.map((acc, i) => (
                  <AccountTile
                    key={acc.holder_account_id}
                    hit={acc}
                    selected={picked?.holder_account_id === acc.holder_account_id}
                    canViewBalances={canViewBalances}
                    onPick={() => onPick(acc)}
                    index={i}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          Unable to search customers. Please try again.
        </div>
      ) : showHint ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gold/20 bg-card/30 px-6 py-12 text-center animate-fade-in">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gold/20 bg-gold/5 text-gold">
            <Search className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">Find a customer</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Start typing a customer name or DAHAB number to search.
            </p>
          </div>
        </div>
      ) : isFetching ? (
        <div className="flex items-center gap-2 rounded-2xl border border-gold/15 bg-card/40 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching customers…
        </div>
      ) : showNoResults ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gold/20 bg-card/30 px-6 py-10 text-center animate-fade-in">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-gold/15 bg-surface-2 text-muted-foreground">
            <X className="h-5 w-5" />
          </div>
          <div className="text-sm font-medium text-foreground">No customers found</div>
          <p className="text-xs text-muted-foreground">Try searching by customer name or DAHAB number.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {customers.map(({ holder, accountCount }, i) => (
            <CustomerResultRow
              key={holder.account_holder_id}
              holder={holder}
              accountCount={accountCount}
              canViewBalances={canViewBalances}
              onPick={() => setBrowseHolderId(holder.account_holder_id)}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function holderTypeMeta(type: string) {
  const t = (type || "").toUpperCase();
  if (t === "CORPORATE" || t === "CORPORATION" || t === "COMPANY") {
    return { label: "Corporate", Icon: Building2, classes: "bg-gold/10 text-gold border-gold/30" };
  }
  if (t === "TRUST") {
    return { label: "Trust", Icon: User, classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" };
  }
  return { label: "Individual", Icon: User, classes: "bg-surface-2 text-muted-foreground border-border" };
}

function CustomerResultRow({
  holder, accountCount, canViewBalances, onPick, index,
}: {
  holder: HolderCardHit; accountCount: number; canViewBalances: boolean;
  onPick: () => void; index: number;
}) {
  const meta = holderTypeMeta(holder.holder_type);
  return (
    <button
      type="button"
      onClick={onPick}
      style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}
      className="group relative flex w-full items-center gap-4 rounded-2xl border border-gold/15 bg-card/70 p-4 text-left transition-all hover:border-gold/50 hover:bg-card hover:shadow-[0_10px_30px_-18px_var(--gold)] animate-fade-in"
    >
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border", meta.classes)}>
        <meta.Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">{holder.holder_name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-mono text-gold">
            <Hash className="h-3 w-3" />
            {holder.dahab_account_number || "—"}
          </span>
          <span aria-hidden>·</span>
          <span>{meta.label}</span>
          <span aria-hidden>·</span>
          <span>{accountCount} account{accountCount === 1 ? "" : "s"}</span>
          {canViewBalances && holder.phone && (<><span aria-hidden>·</span><span className="font-mono">{holder.phone}</span></>)}
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-gold" />
    </button>
  );
}

function SelectedCustomerCard({
  holder, accountCount, onChange,
}: {
  holder: HolderCardHit; accountCount: number; onChange: () => void;
}) {
  const meta = holderTypeMeta(holder.holder_type);
  return (
    <div className="rounded-2xl border border-gold/30 bg-gradient-to-br from-card via-card to-gold/5 p-5 shadow-[0_0_0_3px_oklch(from_var(--gold)_l_c_h/0.06),0_18px_40px_-24px_var(--gold)] animate-scale-in">
      <div className="flex items-start gap-4">
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border", meta.classes)}>
          <meta.Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold">Selected customer</div>
          <div className="mt-1 truncate text-lg font-semibold text-foreground">{holder.holder_name}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-mono text-gold">
              <Hash className="h-3 w-3" />
              {holder.dahab_account_number || "—"}
            </span>
            <span aria-hidden>·</span>
            <span>{meta.label}</span>
            <span aria-hidden>·</span>
            <span>{accountCount} account{accountCount === 1 ? "" : "s"}</span>
            {holder.status && (<><span aria-hidden>·</span><StatusBadge status={(holder.status || "").toUpperCase()} className="!py-0.5 !px-2" /></>)}
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onChange} className="shrink-0 text-muted-foreground hover:text-gold">
          <Pencil className="h-3.5 w-3.5" /> Change
        </Button>
      </div>
    </div>
  );
}

function AccountTile({
  hit, selected, canViewBalances, onPick, index,
}: {
  hit: HolderCardHit; selected: boolean; canViewBalances: boolean; onPick: () => void; index: number;
}) {
  const status = (hit.status || "").toUpperCase();
  const disabled = /SUSPEND|FROZEN|CLOSED|INACTIVE/.test(status);
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onPick}
      disabled={disabled}
      style={{ animationDelay: `${Math.min(index * 50, 240)}ms` }}
      className={cn(
        "group relative flex w-full flex-col gap-3 rounded-2xl border p-4 text-left transition-all animate-fade-in",
        selected
          ? "border-gold/70 bg-card shadow-[0_0_0_3px_oklch(from_var(--gold)_l_c_h/0.10),0_14px_36px_-20px_var(--gold)]"
          : "border-gold/15 bg-card/70 hover:border-gold/45 hover:bg-card hover:shadow-[0_8px_24px_-18px_var(--gold)]",
        disabled && "cursor-not-allowed opacity-60 hover:border-gold/15 hover:shadow-none",
      )}
    >
      {selected && (
        <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-gold shadow-gold animate-scale-in">
          <Check className="h-3.5 w-3.5 text-[var(--surface)]" />
        </span>
      )}
      <div className="flex items-start justify-between gap-2 pr-7">
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-sm font-semibold transition-colors", selected ? "text-gold" : "text-foreground")}>
            {hit.alias || `${hit.currency} account`}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">#{hit.account_number}</div>
        </div>
        <CurrencyBadge currency={hit.currency} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={status} />
        {hit.account_nature && (
          <span className="inline-flex items-center rounded-md border border-gold/15 bg-gold/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {hit.account_nature}
          </span>
        )}
      </div>
      <div className="border-t border-gold/10 pt-2.5 text-[11px] space-y-1.5">
        {hit.withdraw_limit_enabled && hit.withdraw_limit_minor > 0 && (
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-gold/70" /> Withdrawal limit</span>
            <span className="font-mono text-foreground">{formatMinor(hit.withdraw_limit_minor, hit.currency)}</span>
          </div>
        )}
        {canViewBalances && (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground"><Wallet className="h-3.5 w-3.5 text-gold/80" /> Balance</span>
            <span className="font-mono font-medium text-foreground">{formatMinor(hit.balance_minor, hit.currency)}</span>
          </div>
        )}
        {disabled && (
          <div className="text-[10px] uppercase tracking-wider text-destructive/80">Not available for transactions</div>
        )}
      </div>
    </button>
  );
}

function DetailsStep({
  picked, isDeposit, amount, setAmount, amountMinor, comment, setComment,
  canViewBalances, willPend, willOverdraft, overLimit, overThreshold,
}: {
  picked: HolderCardHit; isDeposit: boolean;
  amount: string; setAmount: (v: string) => void; amountMinor: number | null;
  comment: string; setComment: (v: string) => void;
  canViewBalances: boolean; willPend: boolean;
  willOverdraft: boolean; overLimit: boolean; overThreshold: boolean;
}) {
  const trimmed = comment.trim();
  const after = amountMinor !== null
    ? (isDeposit ? picked.balance_minor + amountMinor : picked.balance_minor - amountMinor)
    : null;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gold/15 bg-card/70 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold">Amount</div>
          <CurrencyBadge currency={picked.currency} />
        </div>
        <div className="flex items-baseline gap-3 border-b border-gold/20 pb-2">
          <input inputMode="decimal" placeholder="0.00"
            value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-transparent font-playfair text-4xl font-semibold text-foreground placeholder:text-muted-foreground/30 focus:outline-none md:text-5xl" />
          <span className="font-mono text-sm text-muted-foreground">{picked.currency}</span>
        </div>
        {amount && amountMinor === null && (
          <p className="mt-2 text-xs text-destructive">Enter a valid amount (max 2 decimals).</p>
        )}

        {canViewBalances && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gold/15 bg-surface-2 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Current balance</div>
              <div className="mt-0.5 font-mono text-sm">{formatMinor(picked.balance_minor, picked.currency)}</div>
            </div>
            <div className={cn("rounded-xl border px-3 py-2.5",
              after !== null && after < 0 ? "border-destructive/30 bg-destructive/5" : "border-gold/30 bg-gold/5")}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">After {isDeposit ? "deposit" : "withdrawal"}</div>
              <div className="mt-0.5 font-mono text-sm">{after !== null ? formatMinor(after, picked.currency) : "—"}</div>
            </div>
          </div>
        )}
        {!canViewBalances && picked.withdraw_limit_enabled && picked.withdraw_limit_minor > 0 && (
          <div className="mt-4 rounded-xl border border-gold/15 bg-surface-2 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Withdrawal limit</div>
            <div className="mt-0.5 font-mono text-sm">{formatMinor(picked.withdraw_limit_minor, picked.currency)}</div>
          </div>
        )}
      </div>

      {willPend && (
        <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <div className="font-medium text-foreground">Requires admin approval</div>
            <p className="mt-0.5 text-muted-foreground">
              {willOverdraft
                ? "This withdrawal exceeds the available balance."
                : overLimit
                  ? (canViewBalances ? "This withdrawal exceeds the per-account withdrawal limit." : "This withdrawal requires admin review before settlement.")
                  : overThreshold
                    ? "Withdrawals over 25,000 require admin review."
                    : "This transaction requires admin review."}{" "}
              Submitting will queue it for an admin to approve.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gold/15 bg-card/70 p-5">
        <Label className="text-sm font-medium">Comment / reference *</Label>
        <p className="mb-2 text-xs text-muted-foreground">Required — describe the reason for this entry. Minimum {COMMENT_MIN} characters.</p>
        <Textarea rows={3} placeholder="e.g. Salary deposit for April"
          value={comment} maxLength={COMMENT_MAX}
          onChange={(e) => setComment(e.target.value)}
          className="border-gold/20 bg-surface-2 focus-visible:ring-gold/40" />
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {trimmed.length < COMMENT_MIN
              ? `Need ${COMMENT_MIN - trimmed.length} more character${trimmed.length === COMMENT_MIN - 1 ? "" : "s"}`
              : "Looks good"}
          </span>
          <span>{comment.length} / {COMMENT_MAX}</span>
        </div>
      </div>
    </div>
  );
}

function ReviewStep({
  type, picked, channel, currency, amountMinor, comment, willPend, canViewBalances, cashVaultName, onEdit,
}: {
  type: Direction; picked: HolderCardHit; channel: Channel; currency: Currency;
  amountMinor: number; comment: string; willPend: boolean; canViewBalances: boolean;
  cashVaultName: string | null;
  onEdit: (k: StepKey) => void;
}) {
  const isDeposit = type === "deposit";
  const sign = isDeposit ? "+" : "−";
  const vaultLabel = cashVaultName ?? (isDeposit ? `Cash Receivable ${currency}` : `Cash Payable ${currency}`);
  const amountStr = `${formatMinor(amountMinor, currency)} ${currency}`;
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-br from-card via-card to-gold/5 p-7 text-center shadow-gold">
        <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-gold">
          {isDeposit ? "Deposit total" : "Withdrawal total"}
        </div>
        <div className={cn("mt-2 font-playfair text-5xl font-semibold tabular-nums md:text-6xl",
          isDeposit ? "text-emerald-400" : "text-red-400")}>
          {sign}{formatMinor(amountMinor, currency)}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">Value date · today</div>
      </div>

      {willPend && (
        <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <div className="font-medium text-foreground">Approval required</div>
            <p className="mt-0.5 text-muted-foreground">
              This transaction triggers the approval policy. Once submitted, it will appear in the Admin pending queue until reviewed.
            </p>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gold/15 bg-card/70">
        <ReviewRow label="Type" value={isDeposit ? "Deposit" : "Withdrawal"} onEdit={() => onEdit("type")} />
        <ReviewRow label="Customer" value={`${picked.holder_name} · ${picked.dahab_account_number || "—"}`} onEdit={() => onEdit("customer")} />
        <ReviewRow label="Account" value={`#${picked.account_number} (${picked.currency})`} onEdit={() => onEdit("customer")} />
        <ReviewRow label="Vault" value={channel === "cash" ? "Cash Vault" : "Bank Vault"} onEdit={() => onEdit("vault")} />
        <ReviewRow label="Amount" value={`${formatMinor(amountMinor, currency)} ${currency}`} onEdit={() => onEdit("details")} mono />
        <ReviewRow label="Comment" value={comment} onEdit={() => onEdit("details")} />
        {canViewBalances && (
          <ReviewRow label="Balance after" value={formatMinor(isDeposit ? picked.balance_minor + amountMinor : picked.balance_minor - amountMinor, currency)} mono last />
        )}
      </div>

      <div className="rounded-2xl border border-gold/20 bg-surface-2/40 p-4 text-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gold">
          Ledger impact preview
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          This cash transaction will create two ledger effects:
        </p>
        <ol className="mt-2 list-decimal space-y-1 ps-5 text-xs text-muted-foreground">
          <li>
            <span className="text-foreground">Holder account ledger:</span> the
            selected holder account will be updated by the transaction amount.
          </li>
          <li>
            <span className="text-foreground">Cash vault ledger:</span> the
            matching official cash vault account for this currency will be
            updated.
          </li>
        </ol>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          For cash deposits, the holder account increases and the Cash
          Receivable vault increases. For cash withdrawals, the holder account
          decreases and the Cash Payable vault decreases.
        </p>

        <div className="mt-4 grid gap-2 rounded-xl border border-gold/15 bg-card/60 p-3 font-mono text-[12px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Holder account</span>
            <span className={cn("tabular-nums", isDeposit ? "text-emerald-400" : "text-red-400")}>
              {sign}{amountStr}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Cash vault</span>
            <span className={cn("tabular-nums", isDeposit ? "text-emerald-400" : "text-red-400")}>
              {sign}{amountStr}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Vault</span>
            <span className="truncate text-foreground">{vaultLabel}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-3 rounded-2xl border border-gold/10 bg-surface-2/50 p-4 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold/80" />
        <p>By confirming, you certify that this entry follows DAHAB compliance policy. The transaction will be posted to the immutable audit log.</p>
      </div>
    </div>
  );
}

function ReviewRow({ label, value, onEdit, mono, last }: {
  label: string; value: string; onEdit?: () => void; mono?: boolean; last?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3 px-5 py-3.5", !last && "border-b border-gold/10")}>
      <div className="w-32 shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("min-w-0 flex-1 truncate text-sm text-foreground", mono && "font-mono")}>{value || "—"}</div>
      {onEdit && (
        <button type="button" onClick={onEdit} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-gold/10 hover:text-gold">
          <Pencil className="h-3 w-3" /> Edit
        </button>
      )}
    </div>
  );
}

function ResultScreen({
  result, type, picked, channel, currency, amountMinor, comment, canViewBalances, onNew, onTryAgain,
}: {
  result: ResultState; type: Direction; picked: HolderCardHit; channel: Channel;
  currency: Currency; amountMinor: number; comment: string; canViewBalances: boolean;
  onNew: () => void; onTryAgain: () => void;
}) {
  const isDeposit = type === "deposit";
  const tx: any = (result as any).tx ?? null;
  const txNumber = tx?.tx_number ?? tx?.id ?? "—";

  const sign = isDeposit ? "+" : "−";
  const tone =
    result.kind === "success"
      ? {
          title: "Transaction Complete",
          sub: "The transaction has been posted successfully.",
          accent: "emerald",
          orbGlow: "from-emerald-500/40 via-emerald-500/10",
          orbBorder: "border-emerald-500/50",
          orbInner: "bg-emerald-500/10 text-emerald-400",
          icon: <Check className="h-10 w-10" />,
          chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
          amountColor: "text-emerald-400",
          steps: ["Created", "Validated", "Posted"],
        }
      : result.kind === "pending"
      ? {
          title: "Awaiting Approval",
          sub: "This transaction has been queued for admin review.",
          accent: "amber",
          orbGlow: "from-amber-500/40 via-amber-500/10",
          orbBorder: "border-amber-500/50",
          orbInner: "bg-amber-500/10 text-amber-400",
          icon: <Clock className="h-10 w-10" />,
          chip: "border-amber-500/40 bg-amber-500/10 text-amber-400",
          amountColor: "text-gold",
          steps: ["Created", "Policy Check", "Awaiting Admin Approval"],
        }
      : {
          title: "Transaction Failed",
          sub: result.kind === "failed" ? result.error : "",
          accent: "red",
          orbGlow: "from-red-500/40 via-red-500/10",
          orbBorder: "border-red-500/50",
          orbInner: "bg-red-500/10 text-red-400",
          icon: <ShieldAlert className="h-10 w-10" />,
          chip: "border-red-500/40 bg-red-500/10 text-red-400",
          amountColor: "text-red-400",
          steps: ["Created", "Validation Failed"],
        };

  return (
    <div className="relative min-h-[calc(100vh-7rem)] overflow-hidden">
      {/* Cinematic background glow */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 -top-32 mx-auto h-[420px] max-w-2xl rounded-full opacity-60 blur-3xl",
          "bg-gradient-radial",
        )}
        style={{
          background:
            "radial-gradient(closest-side, oklch(from var(--gold) l c h / 0.18), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-3xl px-4 py-10 md:px-8 md:py-14">
        {/* Status hero */}
        <div className="text-center animate-fade-in">
          <div className="relative mx-auto h-28 w-28">
            <div className={cn("absolute inset-0 rounded-full bg-gradient-to-b blur-2xl", tone.orbGlow, "to-transparent")} />
            <div className={cn("relative mx-auto flex h-28 w-28 items-center justify-center rounded-full border-2 backdrop-blur-md animate-scale-in", tone.orbBorder, tone.orbInner)}>
              {tone.icon}
            </div>
          </div>
          <div className={cn("mt-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em]", tone.chip)}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {result.kind === "success" ? "Posted" : result.kind === "pending" ? "Pending Review" : "Failed"}
          </div>
          <h1 className="mt-3 font-playfair text-3xl font-semibold text-foreground md:text-4xl">{tone.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{tone.sub}</p>
        </div>

        {/* Amount display */}
        {result.kind !== "failed" && (
          <div className="mt-8 text-center animate-fade-in">
            <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-gold">
              {isDeposit ? "Deposit total" : "Withdrawal total"}
            </div>
            <div className={cn("mt-2 font-playfair text-5xl font-semibold tabular-nums md:text-6xl", tone.amountColor)}>
              {sign}{formatMinor(amountMinor, currency)}
            </div>
            <div className="mt-2 inline-flex items-center gap-2">
              <CurrencyBadge currency={currency} />
              <span className="text-[11px] text-muted-foreground">Value date · today</span>
            </div>
          </div>
        )}

        {/* Timeline */}
        <Timeline steps={tone.steps} accent={tone.accent} />

        {/* Receipt card */}
        {result.kind !== "failed" && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-gold/25 bg-card/60 backdrop-blur-md shadow-[0_24px_60px_-30px_var(--gold)] animate-fade-in">
            <div className="flex items-center justify-between border-b border-gold/15 bg-surface-2/50 px-5 py-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-gold" />
                <span className="text-sm font-medium text-foreground">Receipt</span>
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">{String(txNumber)}</span>
            </div>
            <ReceiptRow label="Transaction ID" value={String(txNumber)} mono />
            <ReceiptRow label="Date / time" value={new Date().toLocaleString()} />
            <ReceiptRow label="Type" value={isDeposit ? "Deposit" : "Withdrawal"} />
            <ReceiptRow label="Customer" value={`${picked.holder_name} · ${picked.dahab_account_number || "—"}`} />
            <ReceiptRow label="Account" value={`#${picked.account_number} (${picked.currency})`} />
            <ReceiptRow label="Vault" value={channel === "cash" ? "Cash Vault" : "Bank Vault"} />
            <ReceiptRow label="Amount" value={`${formatMinor(amountMinor, currency)} ${currency}`} mono />
            <ReceiptRow label="Comment" value={comment} />
            {canViewBalances && (
              <ReceiptRow
                label="Balance after"
                value={formatMinor(isDeposit ? picked.balance_minor + amountMinor : picked.balance_minor - amountMinor, currency)}
                mono
                last
              />
            )}
          </div>
        )}

        {!canViewBalances && result.kind === "pending" && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            This transaction requires admin review before settlement.
          </p>
        )}

        {/* Actions */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {result.kind === "failed" ? (
            <>
              <Button variant="outline" className="border-gold/20" onClick={onTryAgain}>
                <ArrowLeft className="h-4 w-4" /> Try again
              </Button>
              <Button variant="gold" asChild>
                <Link to="/app/transactions">Back to Transactions</Link>
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="border-gold/20" asChild>
                <Link to="/app">Back to Dashboard</Link>
              </Button>
              <Button variant="outline" className="border-gold/20" asChild>
                <Link to="/app/transactions">View Transactions</Link>
              </Button>
              <Button variant="gold" onClick={onNew}>New Transaction</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Timeline({ steps, accent }: { steps: string[]; accent: string }) {
  const activeIdx = steps.length - 1;
  const accentClasses =
    accent === "emerald"
      ? { line: "from-emerald-500/70 to-emerald-500/20", dot: "bg-emerald-500/20 border-emerald-500 text-emerald-400", active: "bg-emerald-500 text-[var(--surface)]" }
      : accent === "amber"
      ? { line: "from-amber-500/70 to-amber-500/20", dot: "bg-amber-500/15 border-amber-500 text-amber-400", active: "bg-amber-500 text-[var(--surface)]" }
      : { line: "from-red-500/70 to-red-500/20", dot: "bg-red-500/15 border-red-500 text-red-400", active: "bg-red-500 text-white" };

  return (
    <div className="mt-8 rounded-2xl border border-gold/15 bg-card/40 px-4 py-5 backdrop-blur-sm animate-fade-in">
      <ol className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:gap-0">
        {steps.map((label, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <li key={label} className="flex items-center gap-3 md:flex-1 md:flex-col md:items-center md:gap-2">
              <div className="flex items-center gap-3 md:flex-col md:gap-2">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-semibold transition-all",
                    done && cn(accentClasses.active, "border-transparent"),
                    active && cn(accentClasses.dot, "ring-4 ring-offset-0", accent === "emerald" ? "ring-emerald-500/15" : accent === "amber" ? "ring-amber-500/15" : "ring-red-500/15"),
                    !done && !active && "border-border bg-surface-2 text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={cn("text-[11px] font-medium tracking-wide", active ? "text-foreground" : "text-muted-foreground")}>
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <span className={cn("hidden h-px flex-1 bg-gradient-to-r md:block", accentClasses.line)} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ReceiptRow({ label, value, mono, last }: { label: string; value: string; mono?: boolean; last?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 px-5 py-3", !last && "border-b border-gold/10")}>
      <div className="w-32 shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("min-w-0 flex-1 truncate text-sm text-foreground", mono && "font-mono tabular-nums")}>{value || "—"}</div>
    </div>
  );
}

export function useInitialTypeFromSearch(): Direction | undefined {
  const search = useSearch({ strict: false }) as { type?: string };
  return search?.type === "deposit" || search?.type === "withdraw" ? search.type : undefined;
}
