import { useNavigate } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Eye, ShieldCheck, UserCog, ScrollText, User as UserIcon, Check, Wrench } from "lucide-react";
import { useRoleView } from "@/lib/role-view";
import type { AppRole } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  useIsRealMasterAdmin,
  useMasterPreviewAsRegular,
  setMasterPreviewAsRegular,
} from "@/lib/admin-mode";

const OPTIONS: Array<{
  role: AppRole;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { role: "admin",    label: "Admin",    hint: "Full access",            icon: ShieldCheck },
  { role: "teller",   label: "Teller",   hint: "Transactions only",      icon: UserCog },
  { role: "auditor",  label: "Auditor",  hint: "Read-only & audit",      icon: ScrollText },
  { role: "consumer", label: "Consumer", hint: "Customer portal",        icon: UserIcon },
];

export function RoleViewSwitcher() {
  const { canSwitch, viewAs, setViewAs, isPreviewing } = useRoleView();
  const isMaster = useIsRealMasterAdmin();
  const previewAsRegular = useMasterPreviewAsRegular();
  const nav = useNavigate();
  // Only Master Admin sees the role-view tools.
  if (!canSwitch || !isMaster) return null;

  const current = viewAs ?? "admin";
  const currentLabel = OPTIONS.find((o) => o.role === current)?.label ?? "Admin";

  function pick(role: AppRole) {
    if (role === "admin") {
      setViewAs(null);
      return;
    }
    setViewAs(role);
    if (role === "consumer") {
      nav({ to: "/portal" });
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium transition-colors",
          isPreviewing
            ? "border-gold/60 bg-gold/15 text-gold hover:bg-gold/20"
            : "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground hover:border-gold/40",
        )}
        aria-label="Switch role view"
      >
        <Eye className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">
          {currentLabel} view
          {isPreviewing && <span className="ms-1 opacity-70">(preview)</span>}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          View app as
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const active = o.role === current;
          return (
            <DropdownMenuItem
              key={o.role}
              onSelect={() => pick(o.role)}
              className="flex items-start gap-3 py-2"
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", active ? "text-gold" : "text-muted-foreground")} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {o.label}
                  {active && <Check className="h-3.5 w-3.5 text-gold" />}
                </div>
                <div className="text-[11px] text-muted-foreground">{o.hint}</div>
              </div>
            </DropdownMenuItem>
          );
        })}
        {isPreviewing && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setViewAs(null)} className="text-xs text-gold">
              Exit preview — return to Admin
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Master tools
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setMasterPreviewAsRegular(!previewAsRegular);
          }}
          className="flex items-start gap-3 py-2"
        >
          <Wrench className={cn("mt-0.5 h-4 w-4 shrink-0", previewAsRegular ? "text-gold" : "text-muted-foreground")} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium">
              View as Regular Admin
              {previewAsRegular && <Check className="h-3.5 w-3.5 text-gold" />}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Hide debug, test, and pending-endpoint UI.
            </div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}