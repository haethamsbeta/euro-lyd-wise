import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { REALTIME_MODE, POLL_INTERVAL_MS } from "@/lib/runtimeConfig";
import { toast } from "sonner";

export type NotifEvent =
  | "tx_posted"
  | "pending_created"
  | "approval_decision"
  | "large_tx"
  | "low_vault"
  | "overdraft"
  | "daily_summary"
  | "account_change"
  | "reminder_pending"
  | "reminder_shift"
  | "test";

export type NotifSeverity = "info" | "warning" | "critical";

export type Notification = {
  id: string;
  user_id: string;
  event_type: NotifEvent;
  severity: NotifSeverity;
  title: string;
  body: string;
  data: Record<string, unknown>;
  transaction_id: string | null;
  read_at: string | null;
  created_at: string;
};

type NotifState = {
  items: Notification[];
  unread: number;
  markRead: (ids?: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<NotifState | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session, user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);

  async function refresh() {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    const next = (data ?? []) as Notification[];
    setItems((prev) => {
      // In polling mode, surface toasts/notifications for newly arrived rows.
      if (REALTIME_MODE === "polling" && prev.length > 0) {
        const seen = new Set(prev.map((p) => p.id));
        for (const n of next) {
          if (!seen.has(n.id)) {
            const variant =
              n.severity === "critical" ? toast.error : n.severity === "warning" ? toast.warning : toast;
            variant(n.title, { description: n.body });
            maybeBrowserNotify(n);
          }
        }
      }
      return next;
    });
  }

  useEffect(() => {
    if (!session) {
      setItems([]);
      return;
    }
    refresh();
    if (REALTIME_MODE === "off") return;
    if (REALTIME_MODE === "polling") {
      const id = window.setInterval(refresh, POLL_INTERVAL_MS);
      const onVis = () => {
        if (document.visibilityState === "visible") refresh();
      };
      document.addEventListener("visibilitychange", onVis);
      return () => {
        window.clearInterval(id);
        document.removeEventListener("visibilitychange", onVis);
      };
    }
    const channel = supabase
      .channel(`notif:${user?.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user?.id}` },
        (payload) => {
          const n = payload.new as Notification;
          setItems((prev) => [n, ...prev].slice(0, 50));
          // toast
          const variant = n.severity === "critical" ? toast.error : n.severity === "warning" ? toast.warning : toast;
          variant(n.title, { description: n.body });
          // browser notification (foreground)
          maybeBrowserNotify(n);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user?.id}` },
        (payload) => {
          const n = payload.new as Notification;
          setItems((prev) => prev.map((it) => (it.id === n.id ? n : it)));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const value = useMemo<NotifState>(
    () => ({
      items,
      unread: items.filter((i) => !i.read_at).length,
      markRead: async (ids) => {
        await supabase.rpc("notifications_mark_read", { p_ids: (ids ?? null) as unknown as string[] });
        setItems((prev) =>
          prev.map((it) => (!it.read_at && (!ids || ids.includes(it.id)) ? { ...it, read_at: new Date().toISOString() } : it)),
        );
      },
      markAllRead: async () => {
        await supabase.rpc("notifications_mark_all_read");
        setItems((prev) => prev.map((it) => ({ ...it, read_at: it.read_at ?? new Date().toISOString() })));
      },
      refresh,
    }),
    [items],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useNotifications must be used inside NotificationsProvider");
  return c;
}

// ---- Browser Notifications API (foreground only, no service worker) ----

export function browserNotifSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function browserNotifPermission(): NotificationPermission | "unsupported" {
  if (!browserNotifSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestBrowserNotifPermission(): Promise<NotificationPermission> {
  if (!browserNotifSupported()) return "denied";
  return Notification.requestPermission();
}

function maybeBrowserNotify(n: Notification) {
  if (!browserNotifSupported()) return;
  if (Notification.permission !== "granted") return;
  // Only fire when tab is hidden — otherwise the in-app toast covers it.
  // Exception: test events always fire so the sender can confirm delivery.
  const isTest = n.event_type === "test";
  if (!isTest && typeof document !== "undefined" && document.visibilityState === "visible") return;
  try {
    new Notification(n.title, { body: n.body, tag: n.id });
  } catch {
    // ignore
  }
}