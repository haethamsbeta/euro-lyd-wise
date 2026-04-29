import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowDownCircle, ArrowLeft, ArrowUpCircle, Banknote, Building2, CheckCircle2, Search, AlertTriangle } from "lucide-react";
import { formatMinor, parseAmountToMinor } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Direction = "deposit" | "withdraw";
type Channel = "cash" | "bank";
type Currency = "USD" | "EUR" | "LYD";

type CustomerHit = {
  id: string;
  name: string;
  account_number: string | null;
  phone: string | null;
  national_id: string | null;
};

type Balance = { currency: Currency; balance_minor: number; debit_limit_minor: number };

const COMMENT_MIN = 3;
const COMMENT_MAX = 280;

const schema = z.object({
  customer_account_id: z.string().uuid("Pick a customer account"),
  channel: z.enum(["cash", "bank"]),
  currency: z.enum(["USD", "EUR", "LYD"]),
  amount_minor: z.number().int().positive("Enter an amount greater than zero"),
  comment: z.string().trim().min(COMMENT_MIN, `Comment must be at least ${COMMENT_MIN} characters`).max(COMMENT_MAX),
});

export function EntryForm({ direction }: { direction: Direction }) {
  const isDeposit = direction === "deposit";
  const nav = useNavigate();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picked, setPicked] = useState<CustomerHit | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // debounce
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);

  // shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "/" && !inField) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (!inField) {
        if (e.key === "c" || e.key === "C") setChannel("cash");
        if (e.key === "b" || e.key === "B") setChannel("bank");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data: results, isFetching } = useQuery({
    queryKey: ["accounts.search", debounced],
    enabled: debounced.length === 0 || debounced.length >= 1,
    queryFn: async () => {
      let q = supabase
        .from("accounts")
        .select("id, name, account_number, phone, national_id")
        .eq("kind", "customer")
        .eq("status", "active")
        .order("name")
        .limit(20);
      if (debounced) {
        q = q.or(
          `name.ilike.%${debounced}%,account_number.ilike.%${debounced}%,phone.ilike.%${debounced}%,national_id.ilike.%${debounced}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CustomerHit[];
    },
  });

  const { data: balances } = useQuery({
    queryKey: ["account.balances", picked?.id],
    enabled: !!picked,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_balances")
        .select("currency, balance_minor, debit_limit_minor")
        .eq("account_id", picked!.id);
      if (error) throw error;
      return (data ?? []) as Balance[];
    },
  });

  const amountMinor = useMemo(() => parseAmountToMinor(amount), [amount]);
  const trimmedComment = comment.trim();
  const commentValid = trimmedComment.length >= COMMENT_MIN && trimmedComment.length <= COMMENT_MAX;

  const currentBalance = balances?.find((b) => b.currency === currency)?.balance_minor ?? 0;
  const debitLimit = balances?.find((b) => b.currency === currency)?.debit_limit_minor ?? 0;
  const willOverdraft = !isDeposit && amountMinor !== null && currentBalance - amountMinor < 0;
  const overLimit = !isDeposit && amountMinor !== null && debitLimit > 0 && amountMinor > debitLimit;
  const willPend = willOverdraft || overLimit;

  const ready =
    !!picked && !!channel && !!currency && amountMinor !== null && amountMinor > 0 && commentValid;

  const post = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse({
        customer_account_id: picked!.id,
        channel: channel!,
        currency,
        amount_minor: amountMinor!,
        comment: trimmedComment,
      });
      const { data, error } = await supabase.rpc("post_transaction", {
        p_customer_account_id: parsed.customer_account_id,
        p_currency: parsed.currency,
        p_direction: direction,
        p_channel: parsed.channel,
        p_amount_minor: parsed.amount_minor,
        p_comment: parsed.comment,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (tx: any) => {
      qc.invalidateQueries();
      const isPosted = tx?.status === "posted";
      toast.success(isPosted ? `Posted ${tx.tx_number}` : `Sent for approval ${tx.tx_number}`);
      nav({ to: "/app/transactions" });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not post transaction"),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!ready) return;
    post.mutate();
  }

  const banner = isDeposit ? "DEPOSIT" : "WITHDRAWAL";
  const bannerCls = isDeposit
    ? "bg-success text-success-foreground"
    : "bg-destructive text-destructive-foreground";
  const Icon = isDeposit ? ArrowDownCircle : ArrowUpCircle;

  return (
    <div>
      <div className={cn("flex items-center gap-3 px-6 py-4", bannerCls)}>
        <Button asChild variant="ghost" size="sm" className="text-current hover:bg-black/10">
          <Link to="/app/transactions/new"><ArrowLeft className="h-4 w-4" /> Back</Link>
        </Button>
        <Icon className="h-6 w-6" />
        <div className="text-lg font-semibold tracking-wide">{banner}</div>
      </div>

      <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-6 p-6">
        <Card>
          <CardHeader><CardTitle className="text-base">1. Channel</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <ChannelButton active={channel === "cash"} onClick={() => setChannel("cash")} icon={<Banknote className="h-5 w-5" />} label="Cash" hint="Press C" />
              <ChannelButton active={channel === "bank"} onClick={() => setChannel("bank")} icon={<Building2 className="h-5 w-5" />} label="Bank" hint="Press B" />
            </div>
            {submitted && !channel ? <p className="mt-2 text-xs text-destructive">Select a channel.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">2. Customer account</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="Search by name, account #, phone, or national ID…"
                className="pl-9"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPicked(null); }}
              />
            </div>
            {picked ? (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{picked.name}</div>
                    <div className="text-xs text-muted-foreground">#{picked.account_number}</div>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(null)}>Change</Button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  {(["USD", "EUR", "LYD"] as const).map((c) => {
                    const b = balances?.find((x) => x.currency === c)?.balance_minor ?? 0;
                    return (
                      <div key={c} className="rounded border bg-background p-2">
                        <div className="text-muted-foreground">{c}</div>
                        <div className="font-medium">{formatMinor(b, c)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="max-h-64 overflow-auto rounded-md border">
                {isFetching ? (
                  <div className="p-3 text-sm text-muted-foreground">Searching…</div>
                ) : results && results.length > 0 ? (
                  <ul>
                    {results.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                          onClick={() => setPicked(r)}
                        >
                          <span className="font-medium">{r.name}</span>
                          <span className="text-xs text-muted-foreground">#{r.account_number} · {r.phone ?? ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-3 text-sm text-muted-foreground">
                    No customer accounts. Ask an admin to create one.
                  </div>
                )}
              </div>
            )}
            {submitted && !picked ? <p className="text-xs text-destructive">Select a customer account.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">3. Currency &amp; amount</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="currency">Currency</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                  <SelectTrigger id="currency" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["USD", "EUR", "LYD"] as const).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount" inputMode="decimal" placeholder="0.00" className="mt-1.5"
                  value={amount} onChange={(e) => setAmount(e.target.value)}
                />
                {amount && amountMinor === null ? (
                  <p className="mt-1 text-xs text-destructive">Enter a valid amount (max 2 decimals).</p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cn("border-2", commentValid ? "border-border" : "border-warning/40 bg-warning/5")}>
          <CardHeader>
            <CardTitle className="text-base">
              4. Comment <span className="text-destructive">*</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Required — describe the reason for this entry. Minimum {COMMENT_MIN} characters.
            </p>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={3}
              placeholder="e.g. Salary deposit for April"
              value={comment}
              maxLength={COMMENT_MAX}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className={trimmedComment.length < COMMENT_MIN && submitted ? "text-destructive" : "text-muted-foreground"}>
                {trimmedComment.length < COMMENT_MIN
                  ? `Need ${COMMENT_MIN - trimmedComment.length} more character${trimmedComment.length === COMMENT_MIN - 1 ? "" : "s"}`
                  : "Looks good"}
              </span>
              <span className="text-muted-foreground">{comment.length} / {COMMENT_MAX}</span>
            </div>
            {submitted && !commentValid ? (
              <p className="mt-1 text-xs text-destructive">A comment is required to post this entry.</p>
            ) : null}
          </CardContent>
        </Card>

        {willPend ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Requires admin approval</AlertTitle>
            <AlertDescription>
              {willOverdraft
                ? "This withdrawal exceeds the available balance."
                : "This withdrawal exceeds the per-account debit limit."}{" "}
              Submitting will queue it for an admin to approve.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader><CardTitle className="text-base">Ledger preview</CardTitle></CardHeader>
          <CardContent>
            <LedgerPreview direction={direction} channel={channel} currency={currency} amountMinor={amountMinor} customerName={picked?.name} />
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button asChild type="button" variant="outline"><Link to="/app/transactions/new">Cancel</Link></Button>
          <Button type="submit" disabled={!ready || post.isPending} className={isDeposit ? "" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}>
            {post.isPending ? "Posting…" : willPend ? "Submit for approval" : isDeposit ? "Post deposit" : "Post withdrawal"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ChannelButton({ active, onClick, icon, label, hint }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-md border-2 px-4 py-4 text-sm transition-colors",
        active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
      )}
    >
      {icon}
      <span className="font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
      {active ? <CheckCircle2 className="h-4 w-4 text-primary" /> : null}
    </button>
  );
}

function LedgerPreview({
  direction, channel, currency, amountMinor, customerName,
}: {
  direction: Direction; channel: Channel | null; currency: Currency;
  amountMinor: number | null; customerName: string | undefined;
}) {
  const customerSide = direction === "deposit" ? "CREDIT" : "DEBIT";
  const vaultSide = direction === "deposit" ? "DEBIT" : "CREDIT";
  const vaultName = channel ? `${channel === "cash" ? "Cash" : "Bank"} Vault (${currency})` : "Vault (pick channel)";
  const amt = amountMinor !== null ? formatMinor(amountMinor, currency) : "—";
  return (
    <div className="overflow-hidden rounded-md border text-sm">
      <div className="grid grid-cols-12 gap-2 bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <div className="col-span-1">Leg</div>
        <div className="col-span-2">Side</div>
        <div className="col-span-6">Account</div>
        <div className="col-span-3 text-right">Amount</div>
      </div>
      <Row n="1" side={customerSide} account={customerName ?? "Customer (pick account)"} amount={amt} />
      <div className="border-t" />
      <Row n="2" side={vaultSide} account={vaultName} amount={amt} />
    </div>
  );
}

function Row({ n, side, account, amount }: { n: string; side: "DEBIT" | "CREDIT"; account: string; amount: string }) {
  return (
    <div className="grid grid-cols-12 items-center gap-2 px-3 py-2.5">
      <div className="col-span-1 text-muted-foreground">{n}</div>
      <div className="col-span-2">
        <Badge variant={side === "CREDIT" ? "secondary" : "outline"}>{side}</Badge>
      </div>
      <div className="col-span-6">{account}</div>
      <div className="col-span-3 text-right font-mono">{amount}</div>
    </div>
  );
}