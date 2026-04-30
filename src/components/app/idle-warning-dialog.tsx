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
import { useSessionTimeout } from "@/lib/session-timeout";
import { useT } from "@/lib/i18n";
import { ShieldAlert } from "lucide-react";

export function IdleWarningDialog() {
  const { warning, secondsLeft, stayActive } = useSessionTimeout();
  const { signOut } = useAuth();
  const t = useT();

  return (
    <AlertDialog open={warning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 font-serif">
            <ShieldAlert className="h-5 w-5 text-warning" />
            {t("session.idleTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("session.idleBody")}{" "}
            <span className="font-mono text-foreground">{secondsLeft}s</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => signOut()}>
            {t("common.signOut")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={stayActive}
            className="bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95"
          >
            {t("session.staySignedIn")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
