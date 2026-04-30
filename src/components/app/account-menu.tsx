import { useState } from "react";
import { LogOut, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function initialsFromEmail(email: string | undefined | null) {
  if (!email) return "··";
  const local = email.split("@")[0] ?? "";
  if (!local) return "··";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

/**
 * Compact "logged in as …" affordance with a clearly labelled Sign out
 * action behind a confirmation step. Use in headers and sidebar footers.
 */
export function AccountMenu({
  variant = "compact",
  className,
}: {
  /** "compact" = avatar pill in header. "full" = email + sign-out in sidebar. */
  variant?: "compact" | "full";
  className?: string;
}) {
  const { user, roles, signOut } = useAuth();
  const t = useT();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const initials = initialsFromEmail(user?.email);

  const trigger =
    variant === "compact" ? (
      <DropdownMenuTrigger
        aria-label={t("account.menuLabel")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-[oklch(0.82_0.14_85/0.25)] bg-[oklch(0.82_0.14_85/0.05)] py-0.5 ps-0.5 pe-2 text-xs font-medium text-foreground transition-colors hover:bg-[oklch(0.82_0.14_85/0.1)]",
          className,
        )}
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-gold text-[10px] font-semibold text-[oklch(0.18_0.03_60)] shadow-gold">
          {initials}
        </span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
    ) : (
      <DropdownMenuTrigger
        aria-label={t("account.menuLabel")}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-[oklch(0.82_0.14_85/0.18)] bg-[oklch(0.82_0.14_85/0.05)] px-2 py-2 text-start text-xs transition-colors hover:bg-[oklch(0.82_0.14_85/0.1)]",
          className,
        )}
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-gold text-[10px] font-semibold text-[oklch(0.18_0.03_60)] shadow-gold">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">{user?.email ?? "—"}</span>
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
            {roles.length ? roles.join(" · ") : t("account.noRole")}
          </span>
        </span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
    );

  return (
    <>
      <DropdownMenu>
        {trigger}
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("account.signedInAs")}
            </span>
            <span className="truncate text-sm font-medium text-foreground">
              {user?.email ?? "—"}
            </span>
            {roles.length ? (
              <span className="mt-1 flex flex-wrap gap-1">
                {roles.map((r) => (
                  <span
                    key={r}
                    className="rounded border border-[oklch(0.82_0.14_85/0.25)] bg-[oklch(0.82_0.14_85/0.06)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gold"
                  >
                    {r}
                  </span>
                ))}
              </span>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setConfirmOpen(true);
            }}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="me-2 h-4 w-4" />
            <span className="font-medium">{t("common.signOut")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">
              {t("account.confirmSignOutTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("account.confirmSignOutBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                void signOut();
              }}
              className="bg-destructive text-destructive-foreground hover:opacity-95"
            >
              <LogOut className="me-2 h-4 w-4" />
              {t("common.signOut")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
