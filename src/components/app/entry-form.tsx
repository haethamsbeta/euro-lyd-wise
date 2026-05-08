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
import { ArrowDownRight, ArrowUpRight, Banknote, Landmark, CheckCircle2, Search, AlertTriangle, Upload, FileText, Image as ImageIcon, Trash2, Eye, Loader2, X, Phone, ShieldCheck, Wallet, Sparkles, Check, Clock } from "lucide-react";
import { formatMinor, parseAmountToMinor } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth, hasAnyRole } from "@/lib/auth";

type Direction = "deposit" | "withdraw";
type Channel = "cash" | "bank";
type Currency = "USD" | "EUR" | "LYD";

// A holder card hit = one row in holder_accounts with its parent holder's DAHAB # & name.
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
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];

type PendingAttachment = {
  id: string; // local uuid
  storage_path: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  preview_url: string | null; // object URL for images
  uploading: boolean;
};

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
  const { roles } = useAuth();
  const canViewBalances = hasAnyRole(roles, ["admin"]);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picked, setPicked] = useState<HolderCardHit | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>("");
  const [previewIsPdf, setPreviewIsPdf] = useState(false);

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

  const { data: results, isFetching, isError } = useQuery({
    queryKey: ["holder_cards.search", debounced],
    queryFn: async () => {
      // Strategy: find matching holder ids by DAHAB # / name OR card account_number,
      // then load all currency cards for those holders.
      const term = debounced;
      const holderIds = new Set<number>();

      if (term) {
        const [{ data: byHolder }, { data: byCard }] = await Promise.all([
          supabase
            .from("account_holders")
            .select("id")
            .or(`dahab_account_number.ilike.%${term}%,canonical_name.ilike.%${term}%,normalized_name.ilike.%${term}%,phone.ilike.%${term}%`)
            .limit(20),
          supabase
            .from("holder_accounts")
            .select("account_holder_id")
            .or(`account_number.ilike.%${term}%,dahab_account_number.ilike.%${term}%,account_alias_name.ilike.%${term}%,currency_code.ilike.%${term}%`)
            .limit(20),
        ]);
        (byHolder ?? []).forEach((r: any) => holderIds.add(r.id));
        (byCard ?? []).forEach((r: any) => holderIds.add(r.account_holder_id));
        if (holderIds.size === 0) return [] as HolderCardHit[];
      }

      let cardsQ = supabase
        .from("holder_accounts")
        .select("id, account_number, currency_code, current_balance, status, account_nature, account_alias_name, withdraw_limit_amount, withdraw_limit_enabled, account_holder_id, account_holders!inner(id, dahab_account_number, canonical_name, phone)")
        .in("currency_code", ["USD", "EUR", "LYD"])
        .order("account_holder_id")
        .limit(60);
      if (term) {
        cardsQ = cardsQ.in("account_holder_id", Array.from(holderIds));
      } else {
        cardsQ = cardsQ.limit(30);
      }
      const { data, error } = await cardsQ;
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
  const withdrawLimitMinor = picked?.withdraw_limit_enabled ? (picked?.withdraw_limit_minor ?? 0) : 0;
  // Balance-based overdraft detection only when caller can see balances.
  const willOverdraft = canViewBalances && !isDeposit && amountMinor !== null && currentBalance - amountMinor < 0;
  const overLimit = !isDeposit && amountMinor !== null && withdrawLimitMinor > 0 && amountMinor > withdrawLimitMinor;
  const willPend = willOverdraft || overLimit;

  const ready =
    !!picked && !!channel && !!currency && amountMinor !== null && amountMinor > 0 && commentValid;

  const post = useMutation({
    mutationFn: async () => {
      // Bridge: ensure a legacy `accounts` row exists for this holder card.
      const { data: bridgedId, error: bridgeErr } = await supabase.rpc(
        "ensure_customer_account_for_holder_account",
        { p_holder_account_id: picked!.holder_account_id },
      );
      if (bridgeErr) throw bridgeErr;
      const parsed = schema.parse({
        customer_account_id: bridgedId as string,
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
      const tx = data as any;
      // Link any uploaded attachments to the new transaction.
      if (attachments.length > 0 && tx?.id) {
        const { data: { user } } = await supabase.auth.getUser();
        const rows = attachments
          .filter((a) => !a.uploading)
          .map((a) => ({
            transaction_id: tx.id,
            uploaded_by: user!.id,
            storage_path: a.storage_path,
            file_name: a.file_name,
            content_type: a.content_type,
            size_bytes: a.size_bytes,
          }));
        if (rows.length > 0) {
          const { error: attErr } = await supabase.from("transaction_attachments").insert(rows);
          if (attErr) {
            // Don't fail the whole submission, just warn.
            toast.error(`Transaction posted, but attaching files failed: ${attErr.message}`);
          }
        }
      }
      return tx;
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
    if (attachments.some((a) => a.uploading)) {
      toast.error("Please wait for uploads to finish.");
      return;
    }
    post.mutate();
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    if (attachments.length + incoming.length > MAX_FILES) {
      toast.error(`You can attach up to ${MAX_FILES} files.`);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("You must be signed in to upload files.");
      return;
    }
    for (const file of incoming) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: unsupported file type.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name}: exceeds 10 MB limit.`);
        continue;
      }
      const localId = crypto.randomUUID();
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const storage_path = `pending/${user.id}/${localId}.${ext}`;
      const preview_url = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      const pending: PendingAttachment = {
        id: localId,
        storage_path,
        file_name: file.name,
        content_type: file.type,
        size_bytes: file.size,
        preview_url,
        uploading: true,
      };
      setAttachments((prev) => [...prev, pending]);
      const { error } = await supabase.storage.from("tx-attachments").upload(storage_path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) {
        toast.error(`${file.name}: ${error.message}`);
        setAttachments((prev) => prev.filter((a) => a.id !== localId));
        if (preview_url) URL.revokeObjectURL(preview_url);
      } else {
        setAttachments((prev) => prev.map((a) => (a.id === localId ? { ...a, uploading: false } : a)));
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function removeAttachment(att: PendingAttachment) {
    const { error } = await supabase.storage.from("tx-attachments").remove([att.storage_path]);
    if (error) {
      toast.error(`Could not delete: ${error.message}`);
      return;
    }
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    if (att.preview_url) URL.revokeObjectURL(att.preview_url);
  }

  async function openPreview(att: PendingAttachment) {
    setPreviewName(att.file_name);
    setPreviewIsPdf(att.content_type === "application/pdf");
    if (att.preview_url) {
      setPreviewUrl(att.preview_url);
      return;
    }
    const { data, error } = await supabase.storage
      .from("tx-attachments")
      .createSignedUrl(att.storage_path, 60);
    if (error || !data) {
      toast.error("Could not load preview.");
      return;
    }
    setPreviewUrl(data.signedUrl);
  }

  const TypeIcon = isDeposit ? ArrowDownRight : ArrowUpRight;

  return (
    <div>
      {/* Premium dark header with breadcrumb + eyebrow + Playfair title */}
      <div className="mx-auto max-w-3xl px-4 pt-8 md:px-6">
        <div className="mb-5 flex items-center gap-2 text-sm">
          <Link to="/app" className="text-muted-foreground transition-colors hover:text-foreground">Dashboard</Link>
          <span className="text-muted-foreground">/</span>
          <Link to="/app/transactions" className="text-muted-foreground transition-colors hover:text-foreground">Transactions</Link>
          <span className="text-muted-foreground">/</span>
          <Link to="/app/transactions/new" className="text-muted-foreground transition-colors hover:text-foreground">New</Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-foreground">{isDeposit ? "Deposit" : "Withdraw"}</span>
        </div>
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-gold" />
              <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-gold">
                {isDeposit ? "New Deposit" : "New Withdrawal"}
              </span>
            </div>
            <h1 className="font-playfair text-3xl font-semibold text-foreground md:text-4xl">
              {isDeposit ? "Process a Deposit" : "Process a Withdrawal"}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Select the channel, customer account, then confirm the entry.
            </p>
          </div>
          <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-gold/5 text-gold sm:flex">
            <TypeIcon className="h-7 w-7" />
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-6 px-4 pb-32 md:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-playfair text-base">1. Vault side</CardTitle>
            <p className="text-xs text-muted-foreground">Where the funds physically move from or to.</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <VaultCard
                active={channel === "cash"}
                onClick={() => setChannel("cash")}
                icon={<Wallet className="h-6 w-6" />}
                title="Cash Vault"
                desc="Physical cash handled at branch"
                hint="Walk-in deposits, teller-counted withdrawals"
                shortcut="C"
              />
              <VaultCard
                active={channel === "bank"}
                onClick={() => setChannel("bank")}
                icon={<Landmark className="h-6 w-6" />}
                title="Bank Vault"
                desc="Wire / digital transfer through bank"
                hint="SWIFT wires, ACH, internal bank movements"
                shortcut="B"
              />
            </div>
            {submitted && !channel ? <p className="mt-2 text-xs text-destructive">Select a channel.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-playfair text-base">2. Customer account</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="Search by account name, DAHAB #, account #, phone, or currency…"
                className="h-12 rounded-xl border-gold/20 bg-card/60 pl-11 pr-11 text-base placeholder:text-muted-foreground/70 focus-visible:ring-gold/40"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPicked(null); }}
                aria-label="Search accounts"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => { setSearch(""); searchRef.current?.focus(); }}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-gold/10 hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : isFetching ? (
                <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              ) : null}
            </div>

            {picked ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">Selected account</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(null)}>Change</Button>
                </div>
                <SelectedAccountCard hit={picked} canViewBalances={canViewBalances} />
                <p className="text-xs text-muted-foreground">
                  This {isDeposit ? "deposit" : "withdrawal"} will be applied to <span className="font-medium text-foreground">{picked.holder_name}</span> ({picked.currency}).
                </p>
              </div>
            ) : (
              <div>
                {isError ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                    Unable to search accounts. Please try again.
                  </div>
                ) : isFetching ? (
                  <div className="flex items-center gap-2 rounded-xl border border-gold/15 bg-card/40 p-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Searching accounts…
                  </div>
                ) : results && results.length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                      {results.map((r) => (
                        <ResultCard
                          key={r.holder_account_id}
                          hit={r}
                          canViewBalances={canViewBalances}
                          onPick={() => setPicked(r)}
                        />
                      ))}
                    </div>
                    {results.length >= 30 ? (
                      <p className="mt-2 text-center text-xs text-muted-foreground">
                        Showing best matches. Refine your search for more accurate results.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-gold/20 bg-card/30 p-6 text-center text-sm text-muted-foreground">
                    {debounced
                      ? "No account found. Try searching by account name, account number, phone, or currency."
                      : "Start typing to search accounts."}
                  </div>
                )}
              </div>
            )}
            {submitted && !picked ? <p className="text-xs text-destructive">Select a customer account.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-playfair text-base">3. Amount</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Currency</Label>
                <div className="mt-1.5 flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm font-medium">
                  {picked ? picked.currency : "—"}
                </div>
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
            <CardTitle className="font-playfair text-base">
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
          <div className="flex gap-3 rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
            <div>
              <div className="font-medium text-foreground">Requires admin approval</div>
              <p className="mt-0.5 text-muted-foreground">
                {willOverdraft
                  ? "This withdrawal exceeds the available balance."
                  : canViewBalances
                    ? "This withdrawal exceeds the per-account withdrawal limit."
                    : "This transaction requires admin review."}{" "}
                Submitting will queue it for an admin to approve.
              </p>
            </div>
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="font-playfair text-base">
              Attachments <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Photos or PDFs — receipts, IDs, slips. Up to {MAX_FILES} files, 10 MB each.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_TYPES.join(",")}
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachments.length >= MAX_FILES}
              >
                <Upload className="mr-2 h-4 w-4" /> Add files
              </Button>
              <span className="text-xs text-muted-foreground">
                {attachments.length} / {MAX_FILES}
              </span>
            </div>
            {attachments.length > 0 ? (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 rounded-md border bg-muted/30 p-2">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border bg-background">
                      {a.preview_url ? (
                        <img src={a.preview_url} alt={a.file_name} className="h-full w-full object-cover" />
                      ) : a.content_type === "application/pdf" ? (
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{a.file_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {(a.size_bytes / 1024).toFixed(0)} KB
                        {a.uploading ? " · uploading…" : ""}
                      </div>
                    </div>
                    {a.uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <Button type="button" size="icon" variant="ghost" onClick={() => openPreview(a)} title="Preview">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" onClick={() => removeAttachment(a)} title="Remove">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-playfair text-base">Ledger preview</CardTitle></CardHeader>
          <CardContent>
            <LedgerPreview direction={direction} channel={channel} currency={currency} amountMinor={amountMinor} customerName={picked ? `${picked.dahab_account_number} · ${picked.holder_name}` : undefined} />
          </CardContent>
        </Card>

        <Dialog open={!!previewUrl} onOpenChange={(o) => { if (!o) setPreviewUrl(null); }}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle className="truncate">{previewName}</DialogTitle></DialogHeader>
            {previewUrl ? (
              previewIsPdf ? (
                <iframe src={previewUrl} className="h-[70vh] w-full rounded border" title={previewName} />
              ) : (
                <img src={previewUrl} alt={previewName} className="max-h-[70vh] w-full object-contain" />
              )
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Sticky bottom action bar — mockup style */}
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gold/15 bg-card/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 md:px-6">
            <Button asChild type="button" variant="outline" className="border-gold/20">
              <Link to="/app/transactions/new">Cancel</Link>
            </Button>
            <Button
              type="submit"
              disabled={!ready || post.isPending}
              variant="gold"
              className="min-w-[180px]"
            >
              {post.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Processing…
                </span>
              ) : willPend ? (
                "Submit for approval"
              ) : isDeposit ? (
                "Submit Deposit"
              ) : (
                "Submit Withdrawal"
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function statusTone(status: string): "ACTIVE" | "FROZEN" | "RESTRICTED" | "CLOSED" | string {
  return (status || "").toUpperCase();
}

function ResultCard({ hit, canViewBalances, onPick }: { hit: HolderCardHit; canViewBalances: boolean; onPick: () => void }) {
  const status = statusTone(hit.status);
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "group relative flex w-full flex-col gap-3 rounded-xl border border-gold/15 bg-card/70 p-3.5 text-left transition-all",
        "hover:border-gold/45 hover:bg-card hover:shadow-[0_8px_28px_-18px_var(--gold)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{hit.holder_name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="font-mono text-gold">{hit.dahab_account_number || "—"}</span>
            <span aria-hidden>·</span>
            <span className="font-mono">#{hit.account_number}</span>
          </div>
        </div>
        <CurrencyBadge currency={hit.currency} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={status} />
        {hit.account_nature ? (
          <span className="inline-flex items-center rounded-md border border-gold/15 bg-gold/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {hit.account_nature}
          </span>
        ) : null}
        {hit.alias ? (
          <span className="inline-flex max-w-[12rem] items-center truncate rounded-md border border-gold/15 bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
            {hit.alias}
          </span>
        ) : null}
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

      {canViewBalances ? (
        <div className="flex items-center justify-between rounded-lg bg-gold/5 px-2.5 py-1.5 text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Wallet className="h-3.5 w-3.5 text-gold/80" /> Balance
          </span>
          <span className="font-mono font-medium text-foreground">{formatMinor(hit.balance_minor, hit.currency)}</span>
        </div>
      ) : null}
    </button>
  );
}

function SelectedAccountCard({ hit, canViewBalances }: { hit: HolderCardHit; canViewBalances: boolean }) {
  return (
    <div className="rounded-xl border-2 border-gold/50 bg-card p-4 shadow-[0_0_0_4px_oklch(from_var(--gold)_l_c_h/0.08),0_18px_40px_-24px_var(--gold)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-foreground">{hit.holder_name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-mono text-gold">{hit.dahab_account_number || "—"}</span>
            <span aria-hidden>·</span>
            <span className="font-mono">#{hit.account_number}</span>
            {hit.phone ? (<><span aria-hidden>·</span><span className="font-mono">{hit.phone}</span></>) : null}
          </div>
        </div>
        <CurrencyBadge currency={hit.currency} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={statusTone(hit.status)} />
        {hit.account_nature ? (
          <span className="inline-flex items-center rounded-md border border-gold/15 bg-gold/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {hit.account_nature}
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {hit.withdraw_limit_enabled && hit.withdraw_limit_minor > 0 ? (
          <div className="rounded-lg border border-gold/15 bg-card/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Withdrawal limit</div>
            <div className="mt-0.5 font-mono text-sm">{formatMinor(hit.withdraw_limit_minor, hit.currency)}</div>
          </div>
        ) : null}
        {canViewBalances ? (
          <div className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-gold/90">Current balance</div>
            <div className="mt-0.5 font-mono text-sm">{formatMinor(hit.balance_minor, hit.currency)}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function VaultCard({
  active,
  onClick,
  icon,
  title,
  desc,
  hint,
  shortcut,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
  hint: string;
  shortcut: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border-2 p-5 text-left transition-all",
        active
          ? "border-gold bg-gold/10 shadow-gold"
          : "border-border bg-card/60 hover:border-gold/40 hover:bg-card",
      )}
    >
      {active ? (
        <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-gold">
          <Check className="h-3 w-3 text-[var(--surface)]" />
        </div>
      ) : (
        <kbd className="absolute right-3 top-3 rounded border border-gold/20 bg-card/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {shortcut}
        </kbd>
      )}
      <div
        className={cn(
          "mb-3 flex h-12 w-12 items-center justify-center rounded-xl transition-colors",
          active
            ? "bg-gradient-gold text-[var(--surface)]"
            : "bg-surface-2 text-muted-foreground group-hover:text-gold",
        )}
      >
        {icon}
      </div>
      <h3
        className={cn(
          "mb-1 font-playfair text-base font-semibold",
          active ? "text-gold" : "text-foreground",
        )}
      >
        {title}
      </h3>
      <p className="text-xs text-muted-foreground">{desc}</p>
      <p className="mt-2.5 border-t border-gold/10 pt-2.5 text-[11px] italic text-muted-foreground/80">
        {hint}
      </p>
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