import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader, RoleGate } from "@/components/app/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  browserNotifPermission,
  browserNotifSupported,
  requestBrowserNotifPermission,
} from "@/lib/notifications";
import { Bell, BellOff } from "lucide-react";

export const Route = createFileRoute("/app/settings/notifications")({
  component: () => (
    <RoleGate allow={["admin", "teller", "auditor"]}>
      <NotifSettingsPage />
    </RoleGate>
  ),
  head: () => ({ meta: [{ title: "Notification settings" }] }),
});

const EVENTS: { key: string; label: string; help: string; roles?: string[] }[] = [
  { key: "tx_posted", label: "Transaction posted", help: "Any deposit or withdrawal posted to the ledger." },
  { key: "pending_created", label: "Pending approval created", help: "A withdrawal needs admin approval." },
  { key: "approval_decision", label: "Approval decision", help: "Your submitted transaction was approved or rejected." },
  { key: "large_tx", label: "Large transaction", help: "Transactions at or above your per-currency threshold." },
  { key: "low_vault", label: "Low vault balance", help: "Vault drops below your per-currency floor." },
  { key: "overdraft", label: "Overdraft", help: "A customer balance went below zero." },
  { key: "account_change", label: "Account changes", help: "New customer accounts created." },
  { key: "reminder_pending", label: "Reminder: pending approvals", help: "Periodic reminder while approvals wait." },
  { key: "reminder_shift", label: "Reminder: end of shift", help: "Daily summary reminder at the time you choose." },
  { key: "daily_summary", label: "Daily summary", help: "Daily activity recap." },
];

const CURRENCIES = ["USD", "EUR", "LYD"] as const;

type Prefs = {
  user_id: string;
  enabled: Record<string, boolean>;
  large_tx_threshold: Record<string, number>;
  low_vault_threshold: Record<string, number>;
  pending_reminder_minutes: number;
  daily_summary_time: string;
  daily_summary_enabled: boolean;
  browser_push_enabled: boolean;
};

function NotifSettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [perm, setPerm] = useState<string>("default");

  useEffect(() => {
    setPerm(browserNotifPermission());
  }, []);

  const { data: prefs, isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["notif.prefs", user?.id],
    queryFn: async () => {
      // ensure row exists
      await supabase.from("notification_preferences").upsert({ user_id: user!.id }, { onConflict: "user_id" });
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data as unknown as Prefs;
    },
  });

  const [draft, setDraft] = useState<Prefs | null>(null);
  useEffect(() => {
    if (prefs) setDraft(prefs);
  }, [prefs]);

  const save = useMutation({
    mutationFn: async (next: Prefs) => {
      const { error } = await supabase
        .from("notification_preferences")
        .update({
          enabled: next.enabled,
          large_tx_threshold: next.large_tx_threshold,
          low_vault_threshold: next.low_vault_threshold,
          pending_reminder_minutes: next.pending_reminder_minutes,
          daily_summary_time: next.daily_summary_time,
          daily_summary_enabled: next.daily_summary_enabled,
          browser_push_enabled: next.browser_push_enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notification preferences saved");
      qc.invalidateQueries({ queryKey: ["notif.prefs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !draft) {
    return (
      <>
        <PageHeader title="Notifications" description="Choose what to be notified about and when." />
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      </>
    );
  }

  const setEnabled = (key: string, v: boolean) =>
    setDraft({ ...draft, enabled: { ...draft.enabled, [key]: v } });

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Choose what to be notified about and customize reminders."
        actions={
          <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        }
      />
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Browser notifications</CardTitle>
            <CardDescription>
              Get a system notification on your desktop when the app tab is in the background.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="flex items-center gap-2 text-sm">
                {perm === "granted" ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
                <span>
                  Permission: <strong className="font-medium">{perm}</strong>
                </span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={!browserNotifSupported() || perm === "granted" || perm === "denied"}
                onClick={async () => {
                  const r = await requestBrowserNotifPermission();
                  setPerm(r);
                  if (r === "granted") {
                    setDraft({ ...draft, browser_push_enabled: true });
                  }
                }}
              >
                Enable browser notifications
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="bp">Use browser notifications</Label>
              <Switch
                id="bp"
                checked={draft.browser_push_enabled && perm === "granted"}
                disabled={perm !== "granted"}
                onCheckedChange={(v) => setDraft({ ...draft, browser_push_enabled: v })}
              />
            </div>
            {perm === "denied" && (
              <p className="text-xs text-muted-foreground">
                You blocked notifications in your browser. Re-enable them in your browser's site settings, then return here.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reminders</CardTitle>
            <CardDescription>Set your own reminder cadence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="pri">Pending approvals reminder (minutes)</Label>
              <Input
                id="pri"
                type="number"
                min={5}
                max={1440}
                value={draft.pending_reminder_minutes}
                onChange={(e) =>
                  setDraft({ ...draft, pending_reminder_minutes: Math.max(5, Math.min(1440, Number(e.target.value) || 30)) })
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Admins get a reminder at this interval while transactions sit waiting.
              </p>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label htmlFor="dse">End-of-shift reminder enabled</Label>
              <Switch
                id="dse"
                checked={draft.daily_summary_enabled}
                onCheckedChange={(v) => setDraft({ ...draft, daily_summary_enabled: v })}
              />
            </div>
            <div>
              <Label htmlFor="dst">Time of day</Label>
              <Input
                id="dst"
                type="time"
                value={draft.daily_summary_time?.slice(0, 5) ?? "17:00"}
                onChange={(e) => setDraft({ ...draft, daily_summary_time: e.target.value + ":00" })}
              />
              <p className="mt-1 text-xs text-muted-foreground">Server time (UTC).</p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Events</CardTitle>
            <CardDescription>Toggle the notifications you want to receive.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {EVENTS.map((ev) => (
              <div key={ev.key} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <Label htmlFor={`ev-${ev.key}`} className="text-sm font-medium">
                    {ev.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{ev.help}</p>
                </div>
                <Switch
                  id={`ev-${ev.key}`}
                  checked={draft.enabled[ev.key] !== false}
                  onCheckedChange={(v) => setEnabled(ev.key, v)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Thresholds</CardTitle>
            <CardDescription>Amounts in major units (e.g., dollars).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-sm font-medium">Large transaction alert (per currency)</h4>
              <div className="grid gap-2">
                {CURRENCIES.map((c) => (
                  <div key={c} className="flex items-center gap-2">
                    <span className="w-12 text-sm text-muted-foreground">{c}</span>
                    <Input
                      type="number"
                      min={0}
                      value={Math.round((draft.large_tx_threshold?.[c] ?? 0) / 100)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          large_tx_threshold: {
                            ...draft.large_tx_threshold,
                            [c]: Math.max(0, Number(e.target.value) || 0) * 100,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-medium">Low vault floor (per currency)</h4>
              <div className="grid gap-2">
                {CURRENCIES.map((c) => (
                  <div key={c} className="flex items-center gap-2">
                    <span className="w-12 text-sm text-muted-foreground">{c}</span>
                    <Input
                      type="number"
                      min={0}
                      value={Math.round((draft.low_vault_threshold?.[c] ?? 0) / 100)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          low_vault_threshold: {
                            ...draft.low_vault_threshold,
                            [c]: Math.max(0, Number(e.target.value) || 0) * 100,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}