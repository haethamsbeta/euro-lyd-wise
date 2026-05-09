import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, IdCard, Wallet, ListOrdered, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMinor } from "@/lib/format";

type Result =
  | { kind: "holder"; id: string; title: string; subtitle?: string; score: number }
  | { kind: "account"; id: string; title: string; subtitle?: string; score: number }
  | { kind: "vault"; id: string; title: string; subtitle?: string; score: number }
  | { kind: "transaction"; id: string; title: string; subtitle?: string; score: number };

function scoreMatch(term: string, ...fields: (string | null | undefined)[]): number {
  const t = term.toLowerCase();
  let best = 0;
  for (const f of fields) {
    if (!f) continue;
    const v = f.toLowerCase();
    if (v === t) best = Math.max(best, 100);
    else if (v.startsWith(t)) best = Math.max(best, 80);
    else {
      // word-boundary start
      const idx = v.indexOf(t);
      if (idx === 0) best = Math.max(best, 80);
      else if (idx > 0 && /[\s\-_/.@#]/.test(v[idx - 1])) best = Math.max(best, 60);
      else if (idx > 0) best = Math.max(best, 40 - Math.min(idx, 30));
    }
  }
  return best;
}

function Highlight({ text, term }: { text?: string | null; term: string }) {
  if (!text) return null;
  if (!term) return <>{text}</>;
  const parts: Array<{ s: string; hit: boolean }> = [];
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(t, i);
    if (idx === -1) {
      parts.push({ s: text.slice(i), hit: false });
      break;
    }
    if (idx > i) parts.push({ s: text.slice(i, idx), hit: false });
    parts.push({ s: text.slice(idx, idx + t.length), hit: true });
    i = idx + t.length;
  }
  return (
    <>
      {parts.map((p, k) =>
        p.hit ? (
          <mark key={k} className="rounded bg-gold/30 px-0.5 text-foreground">
            {p.s}
          </mark>
        ) : (
          <span key={k}>{p.s}</span>
        ),
      )}
    </>
  );
}

function useDebounced<T>(value: T, delay = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim(), 220);
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  // Cmd/Ctrl + K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", debounced],
    enabled: debounced.length >= 2,
    queryFn: async (): Promise<Result[]> => {
      const term = debounced;
      const like = `%${term}%`;

      const [holders, accounts, vaults, txByNumber, txByComment] = await Promise.all([
        supabase
          .from("account_holders")
          .select("id, canonical_name, dahab_account_number, phone, email")
          .or(
            `canonical_name.ilike.${like},dahab_account_number.ilike.${like},phone.ilike.${like},email.ilike.${like}`,
          )
          .limit(6),
        supabase
          .from("accounts")
          .select("id, name, account_number, kind, vault_channel")
          .neq("kind", "vault")
          .or(`name.ilike.${like},account_number.ilike.${like}`)
          .limit(6),
        supabase
          .from("accounts")
          .select("id, name, vault_channel")
          .eq("kind", "vault")
          .ilike("name", like)
          .limit(4),
        supabase
          .from("transactions")
          .select("id, tx_number, amount_minor, currency, status, comment")
          .ilike("tx_number", like)
          .limit(5),
        supabase
          .from("transactions")
          .select("id, tx_number, amount_minor, currency, status, comment")
          .ilike("comment", like)
          .limit(5),
      ]);

      const out: Result[] = [];

      for (const h of holders.data ?? []) {
        const score =
          scoreMatch(term, h.canonical_name, h.dahab_account_number, h.email, h.phone) + 5;
        out.push({
          kind: "holder",
          id: String(h.id),
          title: h.canonical_name,
          subtitle: h.dahab_account_number ?? h.email ?? h.phone ?? undefined,
          score,
        });
      }
      for (const a of accounts.data ?? []) {
        const score = scoreMatch(term, a.name, a.account_number);
        out.push({
          kind: "account",
          id: a.id,
          title: a.name,
          subtitle: a.account_number ?? undefined,
          score,
        });
      }
      for (const v of vaults.data ?? []) {
        const score = scoreMatch(term, v.name, v.vault_channel);
        out.push({
          kind: "vault",
          id: v.id,
          title: v.name,
          subtitle: `${v.vault_channel} vault`,
          score,
        });
      }
      const seen = new Set<string>();
      for (const t of [...(txByNumber.data ?? []), ...(txByComment.data ?? [])]) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        const score = scoreMatch(term, t.tx_number, t.comment);
        out.push({
          kind: "transaction",
          id: t.id,
          title: t.tx_number,
          subtitle: `${formatMinor(t.amount_minor, t.currency)} · ${t.status}${t.comment ? ` · ${t.comment}` : ""}`,
          score,
        });
      }
      out.sort((a, b) => b.score - a.score);
      return out;
    },
  });

  const grouped = useMemo(() => {
    const map: Record<Result["kind"], Result[]> = {
      holder: [],
      account: [],
      vault: [],
      transaction: [],
    };
    for (const r of data ?? []) map[r.kind].push(r);
    (Object.keys(map) as Result["kind"][]).forEach((k) =>
      map[k].sort((a, b) => b.score - a.score),
    );
    return map;
  }, [data]);

  const handleSelect = (r: Result) => {
    setOpen(false);
    setQ("");
    if (r.kind === "holder") nav({ to: "/app/holders/$id", params: { id: r.id } });
    else if (r.kind === "account")
      nav({ to: "/app/accounts/$id", params: { id: r.id } });
    else if (r.kind === "vault")
      nav({ to: "/app/vaults/$id", params: { id: r.id }, search: {} });
    else if (r.kind === "transaction")
      nav({ to: "/app/transactions", search: { q: r.title, focus: r.id } });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Search"
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className={cn(
            "group inline-flex items-center gap-2 rounded-xl border border-gold/25 bg-gold/5 text-sm text-muted-foreground transition-all",
            "hover:border-gold/45 hover:bg-gold/10 hover:text-foreground",
            // Icon-only square on phone/tablet, expands to a full search bar from md up
            "h-10 w-10 justify-center px-0 md:w-auto md:justify-start md:px-3",
            "md:min-w-[340px] lg:min-w-[420px]",
          )}
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="hidden flex-1 text-left md:inline">
            Search holders, accounts, transactions…
          </span>
          <span className="ms-auto hidden items-center gap-1 rounded border border-gold/25 bg-background/50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground md:inline-flex">
            ⌘K
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        sideOffset={8}
        className="w-[min(92vw,560px)] overflow-hidden p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search anything — holders, accounts, vaults, transactions"
            className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {debounced.length < 2 ? (
            <EmptyHint text="Type at least 2 characters to search across the platform." />
          ) : (data?.length ?? 0) === 0 && !isFetching ? (
            <EmptyHint text={`No results for "${debounced}".`} />
          ) : (
            <>
              <Group title="Holders" icon={IdCard} items={grouped.holder} term={debounced} onSelect={handleSelect} />
              <Group title="Accounts" icon={IdCard} items={grouped.account} term={debounced} onSelect={handleSelect} />
              <Group title="Vaults" icon={Wallet} items={grouped.vault} term={debounced} onSelect={handleSelect} />
              <Group title="Transactions" icon={ListOrdered} items={grouped.transaction} term={debounced} onSelect={handleSelect} />
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="px-4 py-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function Group({
  title,
  icon: Icon,
  items,
  term,
  onSelect,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Result[];
  term: string;
  onSelect: (r: Result) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="px-3 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      <ul className="py-1">
        {items.map((r) => (
          <li key={`${r.kind}-${r.id}`}>
            <button
              type="button"
              onClick={() => onSelect(r)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-gold/10"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold/25 bg-gold/10">
                <Icon className="h-4 w-4 text-gold" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">
                  <Highlight text={r.title} term={term} />
                </span>
                {r.subtitle ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    <Highlight text={r.subtitle} term={term} />
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}