import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Wallet,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/dahabApi";
import { useShowMasterTools } from "@/lib/admin-mode";

const CURRENCIES = [
  { code: "LYD", name: "Libyan Dinar", flag: "🇱🇾" },
  { code: "USD", name: "US Dollar", flag: "🇺🇸" },
  { code: "EUR", name: "Euro", flag: "🇪🇺" },
  { code: "GBP", name: "British Pound", flag: "🇬🇧" },
] as const;

export function AddLinkedAccountDialog({
  holderId,
}: {
  holderId: string | number;
}) {
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [nature, setNature] = useState("Debit");
  const [displayName, setDisplayName] = useState("");
  const [alias, setAlias] = useState("");
  const qc = useQueryClient();
  const showMaster = useShowMasterTools();

  const { data: holderInfo } = useQuery({
    queryKey: ["holder.lite", holderId],
    enabled: open && holderId !== undefined && holderId !== null && String(holderId) !== "" && String(holderId) !== "NaN",
    queryFn: async () => {
      const r: any = await api.holders.get(holderId as any);
      return {
        canonical_name: r?.canonical_name ?? r?.holder_name ?? r?.full_name ?? "",
        dahab_account_number: r?.dahab_account_number ?? "",
        accounts: r?.accounts ?? r?.holder_accounts ?? [],
      };
    },
  });

  const existingCurrencies = useMemo(
    () => (holderInfo?.accounts ?? []).map((a: any) => a.currency_code),
    [holderInfo],
  );
  const currencyExists = existingCurrencies.includes(currency);

  // Auto-suggest display name
  useEffect(() => {
    if (open && holderInfo?.canonical_name) {
      setDisplayName(`${holderInfo.canonical_name} — ${currency}`);
    }
  }, [open, currency, holderInfo?.canonical_name]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setCurrency("USD");
      setNature("Debit");
      setDisplayName("");
      setAlias("");
    }
  }, [open]);

  const m = useMutation({
    mutationFn: async () => {
      return await api.holders.addAccount(holderId as any, {
        account_display_name: displayName.trim(),
        account_alias_name: alias.trim() || undefined,
        currency_code: currency,
        account_nature: nature,
        is_primary_account: false,
      } as any);
    },
    onSuccess: () => {
      toast.success("Holder account created.");
      qc.invalidateQueries({ queryKey: ["holder", holderId] });
      qc.invalidateQueries({ queryKey: ["holder", Number(holderId)] });
      qc.invalidateQueries({ queryKey: ["holder.lite", holderId] });
      qc.invalidateQueries({ queryKey: ["holders.list"] });
      qc.invalidateQueries({ queryKey: ["holders.summary"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false);
    },
    onError: (e: any) => {
      if (e instanceof ApiError && (e.status === 404 || e.status === 501)) {
        toast.error(
          showMaster
            ? `Backend endpoint pending: POST /holders/${holderId}/accounts`
            : "Coming soon",
        );
        return;
      }
      toast.error(e?.message ?? "Failed to add account");
    },
  });

  const canSubmit = displayName.trim().length >= 2 && !m.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="gap-1.5 bg-gradient-gold font-semibold text-primary-foreground shadow-[0_4px_18px_-4px_oklch(0.74_0.135_82/0.55)] hover:opacity-95"
        >
          <Plus className="h-4 w-4" /> Add account
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl overflow-hidden p-0">
        <div className="h-px bg-gradient-to-r from-transparent via-gold to-transparent" />

        <DialogHeader className="space-y-1 border-b border-border bg-gradient-to-br from-gold/5 to-transparent px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-gold/10">
              <Wallet className="h-5 w-5 text-gold" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-serif text-xl text-foreground">
                Link new account
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
                Add a currency account to{" "}
                <span className="font-medium text-gold-soft">
                  {holderInfo?.canonical_name ?? "this holder"}
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-4">
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                Linking to
              </div>
              <div className="truncate font-medium text-foreground">
                {holderInfo?.canonical_name ?? "—"}
              </div>
              <div className="font-mono text-xs text-gold">
                {holderInfo?.dahab_account_number ?? "—"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                Existing accounts
              </div>
              <div className="mt-1 flex flex-wrap justify-end gap-1">
                {existingCurrencies.length === 0 ? (
                  <span className="text-xs text-muted-foreground">None yet</span>
                ) : (
                  existingCurrencies.map((c: string) => (
                    <span
                      key={c}
                      className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] font-bold text-gold-soft"
                    >
                      {c}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          <div>
            <Label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Currency
            </Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CURRENCIES.map((c) => {
                const active = currency === c.code;
                const exists = existingCurrencies.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setCurrency(c.code)}
                    className={cn(
                      "relative rounded-xl border p-3 text-left transition-all",
                      active
                        ? "border-gold bg-gold/10 shadow-[0_0_20px_oklch(0.74_0.135_82/0.15)]"
                        : "border-border bg-muted/30 hover:border-gold/40",
                    )}
                  >
                    <div className="mb-1 text-2xl">{c.flag}</div>
                    <div
                      className={cn(
                        "text-sm font-bold",
                        active ? "text-gold" : "text-foreground",
                      )}
                    >
                      {c.code}
                    </div>
                    <div className="text-[10px] leading-tight text-muted-foreground">
                      {c.name}
                    </div>
                    {exists && (
                      <CheckCircle2 className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-gold-soft" />
                    )}
                  </button>
                );
              })}
            </div>
            {currencyExists && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 p-2 text-[11px] text-amber-500">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  This holder already has a {currency} account. Multiple accounts
                  per currency are allowed.
                </span>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gold/25 bg-muted/30 p-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
              Auto-generated account number
            </div>
            <div className="mt-1 font-mono text-base tabular-nums text-gold">
              DAHAB-••••••-{currency}-•••
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Assigned automatically when the account is created.
            </p>
          </div>

          <div>
            <Label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Account nature
            </Label>
            <Select value={nature} onValueChange={setNature}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Debit">Debit</SelectItem>
                <SelectItem value="Credit">Credit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Display name *
            </Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Khalid Personal — LYD"
              required
            />
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Friendly label shown across the portal. Editable later.
            </p>
          </div>

          <div>
            <Label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Alias (optional)
            </Label>
            <Input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Internal nickname"
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-6 py-4 sm:justify-between">
          <p className="text-[10px] text-muted-foreground">
            Default limits will be applied. Adjust on the account detail page.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!canSubmit}
              onClick={() => m.mutate()}
              className="gap-2 bg-gradient-gold text-primary-foreground"
            >
              {m.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Linking…
                </>
              ) : (
                <>
                  Link account <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
