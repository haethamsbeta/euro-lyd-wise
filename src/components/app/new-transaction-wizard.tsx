import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ArrowDownRight, ArrowUpRight, Landmark, Search, AlertTriangle, Loader2, X,
  Phone, ShieldCheck, Wallet, Sparkles, Check, ChevronLeft, ChevronRight, Pencil,
  Clock, ShieldAlert, Receipt, ArrowLeft,
} from "lucide-react";
import { formatMinor, parseAmountToMinor } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth, hasAnyRole } from "@/lib/auth";

type Direction = "deposit" | "withdraw";
type Channel = "cash" | "bank";
type Currency = "USD" | "EUR" | "LYD";

type HolderCardHit = {
  holder_account_id: number;
  account_number: string;
  currency: Currency;
  balance_minor: number;
  account_holder_id: number;
  dahab_account_number: string;
  holder_name: string;
  phone: string | null;
  status: string;
  account_nature: string | null;
  alias: string | null;
  withdraw_limit_minor: number;
  withdraw_limit_enabled: boolean;
};

const COMMENT_MIN = 3;
const COMMENT_MAX = 280;
const APPROVAL_THRESHOLD_MINOR = 25_000_00;

const submitSchema = z.object({
  customer_account_id: z.string().uuid(),
  channel: z.enum(["cash", "bank"]),
  currency: z.enum(["USD", "EUR", "LYD"]),
  amount_minor: z.number().int().positive(),
  comment: z.string().trim().min(COMMENT_MIN).max(COMMENT_MAX),
});

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
  const { roles } = useAuth();
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
    const t = setTimeout(() => setDebounced(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);

  const { data: results, isFetching, isError } = useQuery({
    enabled: stepIdx === 1,
    queryKey: ["holder_cards.search", debounced],
    queryFn: async () => {
      const term = debounced;
      const holderIds = new Set<number>();
      if (term) {
        const [{ data: byHolder }, { data: byCard }] = await Promise.all([
          supabase.from("account_holders").select("id")
            .or(`dahab_account_number.ilike.%${term}%,canonical_name.ilike.%${term}%,normalized_name.ilike.%${term}%,phone.ilike.%${term}%`)
            .limit(20),
          supabase.from("holder_accounts").select("account_holder_id")
            .or(`account_number.ilike.%${term}%,dahab_account_number.ilike.%${term}%,account_alias_name.ilike.%${term}%,currency_code.ilike.%${term}%`)
            .limit(20),
        ]);
        (byHolder ?? []).forEach((r: any) => holderIds.add(r.id));
        (byCard ?? []).forEach((r: any) => holderIds.add(r.account_holder_id));
        if (holderIds.size === 0) return [] as HolderCardHit[];
      }
      let q = supabase.from("holder_accounts")
        .select("id, account_number, currency_code, current_balance, status, account_nature, account_alias_name, withdraw_limit_amount, withdraw_limit_enabled, account_holder_id, account_holders!inner(id, dahab_account_number, canonical_name, phone)")
        .in("currency_code", ["USD", "EUR", "LYD"]).order("account_holder_id").limit(60);
      if (term) q = q.in("account_holder_id", Array.from(holderIds));
      else q = q.limit(30);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        holder_account_id: r.id,
        account_number: r.account_number,
        currency: r.currency_code as Currency,
        balance_minor: Math.round(Number(r.current_balance ?? 0) * 100),
        account_holder_id: r.account_holder_id,
        dahab_account_number: r.account_holders?.dahab_account_number ?? "",
        holder_name: r.account_holders?.canonical_name ?? r.account_number,
        phone: r.account_holders?.phone ?? null,
        status: r.status ?? "ACTIVE",
        account_nature: r.account_nature ?? null,
        alias: r.account_alias_name ?? null,
        withdraw_limit_minor: Math.round(Number(r.withdraw_limit_amount ?? 0) * 100),
        withdraw_limit_enabled: !!r.withdraw_limit_enabled,
      })) as HolderCardHit[];
    },
  });

  const currency: Currency = picked?.currency ?? "USD";
  const amountMinor = useMemo(() => parseAmountToMinor(amount), [amount]);
  const trimmedComment = comment.trim();
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
      case "vault": return !!channel;
      case "details": return amountMinor !== null && amountMinor > 0 && commentValid;
      case "review": return true;
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
      const { data: bridgedId, error: bridgeErr } = await supabase.rpc(
        "ensure_customer_account_for_holder_account",
        { p_holder_account_id: picked!.holder_account_id },
      );
      if (bridgeErr) throw bridgeErr;
      const parsed = submitSchema.parse({
        customer_account_id: bridgedId as string,
        channel: channel!,
        currency,
        amount_minor: amountMinor!,
        comment: trimmedComment,
      });
      const { data, error } = await supabase.rpc("post_transaction", {
        p_customer_account_id: parsed.customer_account_id,
        p_currency: parsed.currency,
        p_direction: type!,
        p_channel: parsed.channel,
        p_amount_minor: parsed.amount_minor,
        p_comment: parsed.comment,
      });
      if (error) throw error;
      return data as any;
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
            <p className="mt-1.5 text-sm text-muted-foreground">
              Step {stepIdx + 1} of {STEPS.length} · {step.label}
            </p>
          </div>
          {type ? (
            <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-gold/5 text-gold sm:flex">
              <TypeIcon className="h-7 w-7" />
            </div>
          ) : null}
        </div>

        <Stepper stepIdx={stepIdx} onJump={goToStep} />
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
            <VaultStep value={channel} onPick={changeChannel} />
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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <SelectableCard active={value === "deposit"} onClick={() => onPick("deposit")}
        icon={<ArrowDownRight className="h-6 w-6" />} title="Deposit"
        desc="Receive cash or wire into a customer account." />
      <SelectableCard active={value === "withdraw"} onClick={() => onPick("withdraw")}
        icon={<ArrowUpRight className="h-6 w-6" />} title="Withdraw"
        desc="Disburse cash or wire from a customer account." />
    </div>
  );
}

function VaultStep({ value, onPick }: { value: Channel | null; onPick: (v: Channel) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <SelectableCard active={value === "cash"} onClick={() => onPick("cash")}
        icon={<Wallet className="h-6 w-6" />} title="Cash Vault"
        desc="Physical cash handled at branch."
        hint="Walk-in deposits, teller-counted withdrawals" />
      <SelectableCard active={value === "bank"} onClick={() => onPick("bank")}
        icon={<Landmark className="h-6 w-6" />} title="Bank Vault"
        desc="Wire / digital transfer through bank."
        hint="SWIFT wires, ACH, internal bank movements" />
    </div>
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
  searchRef: React.RefObject<HTMLInputElement>;
  results: HolderCardHit[] | null; isFetching: boolean; isError: boolean; debounced: string;
  picked: HolderCardHit | null; onPick: (h: HolderCardHit) => void; onClear: () => void;
  canViewBalances: boolean; isDeposit: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          placeholder="Search by customer name, DAHAB number, account number, phone, or currency…"
          className="h-14 rounded-2xl border-gold/20 bg-card/60 pl-12 pr-12 text-base placeholder:text-muted-foreground/70 focus-visible:ring-gold/40"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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

      {picked ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">Selected account</span>
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>Change</Button>
          </div>
          <SelectedAccountCard hit={picked} canViewBalances={canViewBalances} />
          <p className="text-xs text-muted-foreground">
            This {isDeposit ? "deposit" : "withdrawal"} will be applied to{" "}
            <span className="font-medium text-foreground">{picked.holder_name}</span> ({picked.currency}).
          </p>
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          Unable to search accounts. Please try again.
        </div>
      ) : isFetching ? (
        <div className="flex items-center gap-2 rounded-2xl border border-gold/15 bg-card/40 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching accounts…
        </div>
      ) : results && results.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {results.map((r) => (
            <ResultCard key={r.holder_account_id} hit={r} canViewBalances={canViewBalances} onPick={() => onPick(r)} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gold/20 bg-card/30 p-8 text-center text-sm text-muted-foreground">
          {debounced
            ? "No account found. Try searching by customer name, DAHAB number, account number, phone, or currency."
            : "Start typing to search accounts."}
        </div>
      )}
    </div>
  );
}

function ResultCard({ hit, canViewBalances, onPick }: {
  hit: HolderCardHit; canViewBalances: boolean; onPick: () => void;
}) {
  return (
    <button type="button" onClick={onPick}
      className="group relative flex w-full flex-col gap-3 rounded-2xl border border-gold/15 bg-card/70 p-4 text-left transition-all hover:border-gold/45 hover:bg-card hover:shadow-[0_8px_28px_-18px_var(--gold)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{hit.holder_name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            <span className="font-mono text-gold">{hit.dahab_account_number || "—"}</span>
            <span aria-hidden>·</span>
            <span className="font-mono">#{hit.account_number}</span>
          </div>
        </div>
        <CurrencyBadge currency={hit.currency} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={(hit.status || "").toUpperCase()} />
        {hit.account_nature && (
          <span className="inline-flex items-center rounded-md border border-gold/15 bg-gold/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {hit.account_nature}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-gold/10 pt-2.5 text-[11px]">
        {hit.phone ? (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Phone className="h-3.5 w-3.5 text-gold/70" />
            <span className="truncate font-mono">{hit.phone}</span>
          </div>
        ) : <span />}
        {hit.withdraw_limit_enabled && hit.withdraw_limit_minor > 0 ? (
          <div className="flex items-center justify-end gap-1.5 text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-gold/70" />
            <span>Limit <span className="font-mono text-foreground">{formatMinor(hit.withdraw_limit_minor, hit.currency)}</span></span>
          </div>
        ) : <span />}
      </div>
      {canViewBalances && (
        <div className="flex items-center justify-between rounded-lg bg-gold/5 px-2.5 py-1.5 text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Wallet className="h-3.5 w-3.5 text-gold/80" /> Balance
          </span>
          <span className="font-mono font-medium text-foreground">{formatMinor(hit.balance_minor, hit.currency)}</span>
        </div>
      )}
    </button>
  );
}

function SelectedAccountCard({ hit, canViewBalances }: { hit: HolderCardHit; canViewBalances: boolean }) {
  return (
    <div className="rounded-2xl border-2 border-gold/50 bg-card p-5 shadow-[0_0_0_4px_oklch(from_var(--gold)_l_c_h/0.08),0_18px_40px_-24px_var(--gold)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-foreground">{hit.holder_name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="font-mono text-gold">{hit.dahab_account_number || "—"}</span>
            <span aria-hidden>·</span>
            <span className="font-mono">#{hit.account_number}</span>
            {hit.phone && (<><span aria-hidden>·</span><span className="font-mono">{hit.phone}</span></>)}
          </div>
        </div>
        <CurrencyBadge currency={hit.currency} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={(hit.status || "").toUpperCase()} />
        {hit.account_nature && (
          <span className="inline-flex items-center rounded-md border border-gold/15 bg-gold/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {hit.account_nature}
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {hit.withdraw_limit_enabled && hit.withdraw_limit_minor > 0 && (
          <div className="rounded-lg border border-gold/15 bg-card/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Withdrawal limit</div>
            <div className="mt-0.5 font-mono text-sm">{formatMinor(hit.withdraw_limit_minor, hit.currency)}</div>
          </div>
        )}
        {canViewBalances && (
          <div className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-gold/90">Current balance</div>
            <div className="mt-0.5 font-mono text-sm">{formatMinor(hit.balance_minor, hit.currency)}</div>
          </div>
        )}
      </div>
    </div>
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
  type, picked, channel, currency, amountMinor, comment, willPend, canViewBalances, onEdit,
}: {
  type: Direction; picked: HolderCardHit; channel: Channel; currency: Currency;
  amountMinor: number; comment: string; willPend: boolean; canViewBalances: boolean;
  onEdit: (k: StepKey) => void;
}) {
  const isDeposit = type === "deposit";
  const sign = isDeposit ? "+" : "−";
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
  const status = result.kind === "success" ? "Posted" : result.kind === "pending" ? "Pending Review" : "Failed";

  const tone =
    result.kind === "success"
      ? { ring: "border-emerald-500/40 bg-emerald-500/10", icon: <Check className="h-9 w-9 text-emerald-400" />, title: "Transaction Complete", sub: `Your ${isDeposit ? "deposit" : "withdrawal"} has been posted.` }
      : result.kind === "pending"
      ? { ring: "border-amber-500/40 bg-amber-500/10", icon: <Clock className="h-9 w-9 text-amber-400" />, title: "Awaiting Approval", sub: "This transaction has been queued for admin review." }
      : { ring: "border-destructive/40 bg-destructive/10", icon: <ShieldAlert className="h-9 w-9 text-destructive" />, title: "Transaction Failed", sub: result.kind === "failed" ? result.error : "" };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 md:px-8">
      <div className="text-center animate-fade-in">
        <div className={cn("mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2", tone.ring)}>
          {tone.icon}
        </div>
        <h1 className="mt-5 font-playfair text-3xl font-semibold text-foreground md:text-4xl">{tone.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{tone.sub}</p>
      </div>

      {result.kind !== "failed" && (
        <div className="mt-8 overflow-hidden rounded-2xl border border-gold/20 bg-card/70 shadow-gold">
          <div className="flex items-center justify-between border-b border-gold/10 bg-surface-2/60 px-5 py-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-gold" />
              <span className="text-sm font-medium text-foreground">Receipt</span>
            </div>
            <span className={cn(
              "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              result.kind === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-amber-500/40 bg-amber-500/10 text-amber-400",
            )}>{status}</span>
          </div>
          <ReviewRow label="Transaction" value={String(txNumber)} mono />
          <ReviewRow label="Type" value={isDeposit ? "Deposit" : "Withdrawal"} />
          <ReviewRow label="Customer" value={`${picked.holder_name} · ${picked.dahab_account_number || "—"}`} />
          <ReviewRow label="Account" value={`#${picked.account_number} (${picked.currency})`} />
          <ReviewRow label="Vault" value={channel === "cash" ? "Cash Vault" : "Bank Vault"} />
          <ReviewRow label="Amount" value={`${formatMinor(amountMinor, currency)} ${currency}`} mono />
          <ReviewRow label="Comment" value={comment} />
          {canViewBalances && (
            <ReviewRow label="Balance after" value={formatMinor(isDeposit ? picked.balance_minor + amountMinor : picked.balance_minor - amountMinor, currency)} mono last />
          )}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
  );
}

export function useInitialTypeFromSearch(): Direction | undefined {
  const search = useSearch({ strict: false }) as { type?: string };
  return search?.type === "deposit" || search?.type === "withdraw" ? search.type : undefined;
}
