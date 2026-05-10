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
} from "@/lib/notifications";
import { Bell, BellOff, Send, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ENDPOINT_KEY,
  ensureSubscription,
  iOSNeedsInstall,
  isInIframe,
  isPreviewHost,
  pingCurrent,
  prettyDeviceLabel,
  pushSupported,
  removeDevice,
  revokeDevice,
  unsubscribeBrowser,
} from "@/lib/push-client";
import { sendTestPushToSelf } from "@/server/push.functions";
import { formatDistanceToNow } from "date-fns";

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
  const [testing, setTesting] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);

  useEffect(() => {
    setPerm(browserNotifPermission());
    try { setCurrentEndpoint(localStorage.getItem(ENDPOINT_KEY)); } catch {}
    pingCurrent();
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

  // Per-user device list with realtime sync.
  const { data: devices, refetch: refetchDevices } = useQuery({
    enabled: !!user,
    queryKey: ["push.devices", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("id, label, user_agent, granted, endpoint, created_at, last_seen_at, last_success_at, last_error")
        .eq("user_id", user!.id)
        .order("last_seen_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!user) return;
    if (REALTIME_MODE === "off") return;
    if (REALTIME_MODE === "polling") {
      const id = window.setInterval(() => refetchDevices(), POLL_INTERVAL_MS);
      return () => window.clearInterval(id);
    }
    const ch = supabase
      .channel(`push-devices:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "push_subscriptions", filter: `user_id=eq.${user.id}` },
        () => refetchDevices(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, refetchDevices]);

  async function sendSelfTest() {
    setTesting(true);
    try {
      const r = await sendTestPushToSelf();
      if (r.sent > 0) toast.success(`Test sent — delivered to ${r.sent} of ${r.total} device(s).`);
      else if (r.total === 0) toast.message("In-app test sent. Enable a device below to receive system push.");
      else toast.error(`Push delivery failed (${r.failed} of ${r.total}). See device row for details.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function onEnableHere() {
    setEnabling(true);
    try {
      const r = await ensureSubscription();
      if (!r) throw new Error("Could not subscribe this browser to push.");
      try { setCurrentEndpoint(localStorage.getItem(ENDPOINT_KEY)); } catch {}
      setPerm("granted");
      setDraft((d) => (d ? { ...d, browser_push_enabled: true } : d));
      toast.success("This device is now subscribed to push notifications.");
      await refetchDevices();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnabling(false);
    }
  }

  async function onRevokeCurrent() {
    try {
      await unsubscribeBrowser();
      setCurrentEndpoint(null);
      setDraft((d) => (d ? { ...d, browser_push_enabled: false } : d));
      await refetchDevices();
      toast.success("This device's push subscription was revoked.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onRevokeRow(id: string) {
    try {
      await revokeDevice({ data: { id } });
      await refetchDevices();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function onRemoveRow(id: string) {
    try {
      await removeDevice({ data: { id } });
      await refetchDevices();
    } catch (e) { toast.error((e as Error).message); }
  }

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

  const previewBlocked = isPreviewHost() || isInIframe();
  const iosBlocked = iOSNeedsInstall();
  const fmt = (iso: string | null | undefined) =>
    iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "—";

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Choose what to be notified about and customize reminders."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={sendSelfTest} disabled={testing}>
              <Send className="me-2 h-4 w-4" />
              {testing ? "Sending…" : "Send test to me"}
            </Button>
            <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        }
      />
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Browser notifications</CardTitle>
            <CardDescription>
              Real Web Push — system notifications fire even when the tab is closed, on every device you enable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div className="flex items-center gap-2 text-sm">
                {perm === "granted" ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
                <span>
                  Permission: <strong className="font-medium">{perm}</strong>
                </span>
                <Badge variant={currentEndpoint ? "default" : "secondary"} className="ms-2">
                  {currentEndpoint ? "This device subscribed" : "This device not subscribed"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {currentEndpoint ? (
                  <Button size="sm" variant="outline" onClick={onRevokeCurrent}>
                    <X className="me-1 h-3.5 w-3.5" /> Revoke this device
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={onEnableHere}
                    disabled={enabling || !pushSupported() || previewBlocked || iosBlocked || perm === "denied"}
                  >
                    {enabling ? "Enabling…" : "Enable on this device"}
                  </Button>
                )}
              </div>
            </div>

            {previewBlocked && (
              <p className="text-xs text-muted-foreground">
                Push subscriptions are disabled inside the editor preview iframe. Open the published or custom-domain URL to enable on a real device.
              </p>
            )}
            {iosBlocked && (
              <p className="text-xs text-muted-foreground">
                On iOS, push notifications only work after you install the app to your Home Screen (Share → Add to Home Screen), then open it from there.
              </p>
            )}
            {!browserNotifSupported() && !previewBlocked && (
              <p className="text-xs text-muted-foreground">This browser does not support push notifications.</p>
            )}
            {perm === "denied" && (
              <p className="text-xs text-muted-foreground">
                You blocked notifications. Re-enable them in your browser's site settings, then refresh.
              </p>
            )}

            <div className="flex items-center justify-between">
              <Label htmlFor="bp">Receive push on enabled devices</Label>
              <Switch
                id="bp"
                checked={draft.browser_push_enabled}
                onCheckedChange={(v) => setDraft({ ...draft, browser_push_enabled: v })}
              />
            </div>

            <Separator />

            <div>
              <h4 className="mb-2 text-sm font-medium">Your devices</h4>
              {(devices ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No devices yet. Enable on this device to add the first one.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-start">Device</th>
                        <th className="px-3 py-2 text-start">Status</th>
                        <th className="px-3 py-2 text-start">Last seen</th>
                        <th className="px-3 py-2 text-start">Last delivery</th>
                        <th className="px-3 py-2 text-start">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(devices ?? []).map((d) => {
                        const isCurrent = !!currentEndpoint && d.endpoint === currentEndpoint;
                        const label = d.label ?? prettyDeviceLabel(d.user_agent);
                        return (
                          <tr key={d.id}>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{label}</span>
                                {isCurrent && <Badge variant="outline" className="text-[10px]">This browser</Badge>}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {prettyDeviceLabel(d.user_agent)}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant={d.granted && d.endpoint ? "default" : "secondary"}>
                                {d.granted && d.endpoint ? "Granted" : "Revoked"}
                              </Badge>
                              {d.last_error && (
                                <div className="mt-1 max-w-[180px] truncate text-xs text-destructive" title={d.last_error}>
                                  {d.last_error}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{fmt(d.last_seen_at)}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{fmt(d.last_success_at)}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                {d.granted && d.endpoint && (
                                  <Button size="sm" variant="ghost" onClick={() => onRevokeRow(d.id)}>
                                    <X className="me-1 h-3.5 w-3.5" /> Revoke
                                  </Button>
                                )}
                                {!d.granted && (
                                  <Button size="sm" variant="ghost" onClick={() => onRemoveRow(d.id)}>
                                    <Trash2 className="me-1 h-3.5 w-3.5" /> Remove
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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