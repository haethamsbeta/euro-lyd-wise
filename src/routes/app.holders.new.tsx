import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader, RoleGate } from "@/components/app/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowRight,
  User,
  Building,
  Shield,
  Sparkles,
  Mail,
  Phone,
  Wallet,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/dahabApi";
import { useShowMasterTools } from "@/lib/admin-mode";

export const Route = createFileRoute("/app/holders/new")({
  component: () => (
    <RoleGate allow={["admin"]}>
      <NewHolderPage />
    </RoleGate>
  ),
});

const TYPES = [
  {
    value: "INDIVIDUAL",
    label: "Individual",
    icon: User,
    desc: "Personal account holder",
  },
  {
    value: "BUSINESS",
    label: "Business",
    icon: Building,
    desc: "Corporate or legal entity",
  },
  {
    value: "TRUST",
    label: "Trust",
    icon: Shield,
    desc: "Family or fiduciary trust",
  },
] as const;

const CURRENCIES = [
  { code: "LYD", name: "Libyan Dinar", flag: "🇱🇾" },
  { code: "USD", name: "US Dollar", flag: "🇺🇸" },
  { code: "EUR", name: "Euro", flag: "🇪🇺" },
  { code: "GBP", name: "British Pound", flag: "🇬🇧" },
] as const;

type Step = 1 | 2;

function NewHolderPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const showMaster = useShowMasterTools();

  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [name, setName] = useState("");
  const [holderType, setHolderType] =
    useState<(typeof TYPES)[number]["value"]>("INDIVIDUAL");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Step 2
  const [currency, setCurrency] = useState<string>("USD");
  const [nature, setNature] = useState("Debit");
  const [displayName, setDisplayName] = useState("");

  // Auto-suggest display name when entering step 2 / changing currency
  useEffect(() => {
    if (step === 2 && name) {
      setDisplayName(`${name.trim()} — ${currency}`);
    }
  }, [step, currency, name]);

  const step1Valid = name.trim().length >= 2;
  const step2Valid = displayName.trim().length >= 2;

  const m = useMutation({
    mutationFn: async () => {
      // 1. Create holder
      const holder: any = await api.holders.create({
        canonical_name: name.trim(),
        holder_type: holderType,
        phone_number: phone.trim() || undefined,
        email: email.trim() || undefined,
        status: "ACTIVE",
      } as any);
      const holderId = holder?.id ?? holder?.holder_id;
      if (!holderId) throw new ApiError("Holder created but no id returned", 0);
      // 2. Create first account
      try {
        await api.holders.addAccount(holderId, {
          account_display_name: displayName.trim(),
          currency_code: currency,
          account_nature: nature,
          is_primary_account: true,
          status: "ACTIVE",
        } as any);
      } catch (e) {
        // Holder is created; surface account error but still navigate.
        if (e instanceof ApiError && (e.status === 404 || e.status === 501)) {
          toast.error(
            showMaster
              ? `Backend endpoint pending: POST /holders/${holderId}/accounts`
              : "First account: Coming soon",
          );
        } else {
          toast.error((e as any)?.message ?? "Failed to add first account");
        }
      }
      return { ...holder, holder_id: holderId };
    },
    onSuccess: (data) => {
      toast.success(
        `Holder ${data?.dahab_account_number ?? ""} created.`,
      );
      qc.invalidateQueries({ queryKey: ["holders.list"] });
      qc.invalidateQueries({ queryKey: ["holders.summary"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      if (data?.holder_id) {
        nav({
          to: "/app/holders/$id",
          params: { id: String(data.holder_id) },
        });
      } else {
        nav({ to: "/app/holders" });
      }
    },
    onError: (e: any) => {
      if (e instanceof ApiError && (e.status === 404 || e.status === 501)) {
        toast.error(
          showMaster
            ? `Backend endpoint pending: POST /holders`
            : "Coming soon",
        );
        return;
      }
      toast.error(e?.message ?? "Failed to create holder");
    },
  });

  const selectedType = useMemo(
    () => TYPES.find((t) => t.value === holderType)!,
    [holderType],
  );

  return (
    <div>
      <PageHeader
        title="New holder"
        description="Create a DAHAB profile and link its first currency account."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/app/holders">
              <ArrowLeft className="me-1 h-4 w-4" /> Back
            </Link>
          </Button>
        }
      />

      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_80px_-20px_rgba(0,0,0,0.4)]">
          <div className="h-px bg-gradient-to-r from-transparent via-gold to-transparent" />

          {/* Header */}
          <div className="flex items-start gap-3 border-b border-border bg-gradient-to-br from-gold/5 to-transparent px-6 py-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-gold/10">
              <Sparkles className="h-5 w-5 text-gold" />
            </div>
            <div>
              <h2 className="font-serif text-xl text-foreground">New holder</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Create a DAHAB profile and link its first currency account
              </p>
            </div>
          </div>

          {/* Stepper */}
          <div className="border-b border-border bg-muted/30 px-6 pb-4 pt-5">
            <div className="flex items-center gap-3">
              <StepDot index={1} step={step} label="Holder details" />
              <div className="relative h-px flex-1 bg-border">
                <motion.div
                  className="absolute inset-0 origin-left bg-gradient-to-r from-gold/60 to-gold"
                  initial={false}
                  animate={{ scaleX: step === 2 ? 1 : 0 }}
                  transition={{ duration: 0.4 }}
                />
              </div>
              <StepDot index={2} step={step} label="First account" />
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 p-2 text-[11px] text-amber-500">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Every DAHAB number must be linked to at least one currency
                account. You can add more accounts later.
              </span>
            </div>
          </div>

          {/* Body */}
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6 px-6 py-6"
              >
                {/* DAHAB preview */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-gold/25 bg-muted/30 p-4">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                      Auto-generated DAHAB number
                    </div>
                    <div className="mt-1 font-mono text-lg tabular-nums text-gold">
                      DAHAB-••••••
                    </div>
                  </div>
                  <div className="max-w-[180px] text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                    One unique DAHAB number per holder
                  </div>
                </div>

                {/* Type */}
                <div>
                  <Label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    Holder type
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {TYPES.map((t) => {
                      const Icon = t.icon;
                      const active = holderType === t.value;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setHolderType(t.value)}
                          className={cn(
                            "rounded-xl border p-3 text-left transition-all",
                            active
                              ? "border-gold bg-gold/10 shadow-[0_0_20px_oklch(0.74_0.135_82/0.15)]"
                              : "border-border bg-muted/30 hover:border-gold/40",
                          )}
                        >
                          <Icon
                            className={cn(
                              "mb-2 h-4 w-4",
                              active ? "text-gold" : "text-muted-foreground",
                            )}
                          />
                          <div
                            className={cn(
                              "text-sm font-medium",
                              active ? "text-gold" : "text-foreground",
                            )}
                          >
                            {t.label}
                          </div>
                          <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                            {t.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Name */}
                <div>
                  <Label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    Canonical name *
                  </Label>
                  <Input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      holderType === "INDIVIDUAL"
                        ? "e.g. Khalid Al-Mansour"
                        : holderType === "BUSINESS"
                          ? "e.g. Al-Madina Trading Co."
                          : "e.g. Fatima El-Zahra Trust"
                    }
                  />
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    One name maps to one DAHAB account.
                  </p>
                </div>

                {/* Optional contact */}
                <div className="space-y-3 border-t border-border pt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    Contact (optional)
                  </p>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="contact@example.com"
                      className="pl-9"
                    />
                  </div>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+218 91 000 0000"
                      className="pl-9"
                    />
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6 px-6 py-6"
              >
                {/* Holder summary */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-4">
                  <div className="min-w-0">
                    <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                      Linking first account to
                    </div>
                    <div className="truncate font-medium text-foreground">
                      {name || "—"}
                    </div>
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <selectedType.icon className="h-3 w-3" /> {selectedType.label}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-gold" />
                    <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      New currency account
                    </span>
                  </div>
                </div>

                {/* Currency */}
                <div>
                  <Label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    Currency
                  </Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {CURRENCIES.map((c) => {
                      const active = currency === c.code;
                      return (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => setCurrency(c.code)}
                          className={cn(
                            "rounded-xl border p-3 text-left transition-all",
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
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Auto-generated number preview */}
                <div className="rounded-xl border border-gold/25 bg-muted/30 p-4">
                  <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                    Auto-generated account number
                  </div>
                  <div className="mt-1 font-mono text-base tabular-nums text-gold">
                    DAHAB-••••••-{currency}-•••
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    Assigned automatically on creation.
                  </p>
                </div>

                {/* Nature */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      Account nature
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["Debit", "Credit"] as const).map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setNature(n)}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-sm transition-all",
                            nature === n
                              ? "border-gold bg-gold/10 text-gold"
                              : "border-border bg-muted/30 text-foreground hover:border-gold/40",
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Display name */}
                <div>
                  <Label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    Display name *
                  </Label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Khalid Personal — LYD"
                  />
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    Friendly label shown across the portal. Editable later.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-6 py-4">
            <p className="text-[10px] text-muted-foreground">
              {step === 1
                ? "Step 1 of 2 · Holder details"
                : "Step 2 of 2 · Required first account"}
            </p>
            <div className="flex gap-2">
              {step === 2 && (
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
              )}
              {step === 1 ? (
                <>
                  <Button asChild variant="outline">
                    <Link to="/app/holders">Cancel</Link>
                  </Button>
                  <Button
                    disabled={!step1Valid}
                    onClick={() => setStep(2)}
                    className="gap-2 bg-gradient-gold text-primary-foreground"
                  >
                    Continue <ArrowRight className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button
                  disabled={!step2Valid || m.isPending}
                  onClick={() => m.mutate()}
                  className="gap-2 bg-gradient-gold text-primary-foreground"
                >
                  {m.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Creating…
                    </>
                  ) : (
                    <>
                      Create holder & account <Check className="h-4 w-4" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepDot({
  index,
  step,
  label,
}: {
  index: 1 | 2;
  step: Step;
  label: string;
}) {
  const isActive = step === index;
  const isDone = step > index;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums transition-all",
          isDone
            ? "border-gold bg-gold text-primary-foreground"
            : isActive
              ? "border-gold bg-gold/15 text-gold shadow-[0_0_15px_oklch(0.74_0.135_82/0.25)]"
              : "border-border bg-muted/30 text-muted-foreground",
        )}
      >
        {isDone ? <Check className="h-3.5 w-3.5" /> : index}
      </div>
      <span
        className={cn(
          "truncate text-[11px] font-medium uppercase tracking-[0.12em]",
          isActive
            ? "text-gold"
            : isDone
              ? "text-foreground"
              : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
}
