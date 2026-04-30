import { useState } from "react";
import { Bell, Check, CheckCheck, Settings } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useNotifications, type NotifSeverity } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const sevColor: Record<NotifSeverity, string> = {
  info: "bg-primary/10 text-primary",
  warning: "bg-warning/15 text-warning-foreground",
  critical: "bg-destructive/15 text-destructive",
};

function useTimeAgo() {
  const t = useT();
  return (iso: string) => {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60) return t("notif.justNow");
    if (d < 3600) return `${Math.floor(d / 60)}${t("notif.minutesAgo")}`;
    if (d < 86400) return `${Math.floor(d / 3600)}${t("notif.hoursAgo")}`;
    return `${Math.floor(d / 86400)}${t("notif.daysAgo")}`;
  };
}

export function NotificationBell() {
  const t = useT();
  const timeAgo = useTimeAgo();
  const { items, unread, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("notif.title")}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -end-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-semibold">{t("notif.title")}</div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => markAllRead()} disabled={unread === 0}>
              <CheckCheck className="me-1 h-4 w-4" /> {t("notif.markAllRead")}
            </Button>
            <Button asChild variant="ghost" size="sm" onClick={() => setOpen(false)}>
              <Link to="/app/settings/notifications">
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
        <ScrollArea className="max-h-[60vh]">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">{t("notif.empty")}</div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn("flex gap-3 px-3 py-2.5 text-sm", !n.read_at && "bg-muted/40")}
                >
                  <Badge variant="secondary" className={cn("h-fit shrink-0 rounded-full px-2 py-0.5 text-[10px]", sevColor[n.severity])}>
                    {t(`notif.severity.${n.severity}`)}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="truncate font-medium">{n.title}</div>
                      <div className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</div>
                    </div>
                    {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                  </div>
                  {!n.read_at && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => markRead([n.id])}
                      aria-label={t("notif.markRead")}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}