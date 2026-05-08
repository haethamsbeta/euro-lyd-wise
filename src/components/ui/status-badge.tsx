import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "destructive" | "muted";

const TONES: Record<Tone, { wrap: string; dot: string }> = {
  success: {
    wrap: "bg-[oklch(from_var(--success)_l_c_h/0.10)] text-[var(--success)] border-[oklch(from_var(--success)_l_c_h/0.30)]",
    dot: "bg-[var(--success)]",
  },
  warning: {
    wrap: "bg-[oklch(from_var(--gold)_l_c_h/0.10)] text-gold border-[oklch(from_var(--gold)_l_c_h/0.35)]",
    dot: "bg-gold",
  },
  destructive: {
    wrap: "bg-[oklch(from_var(--destructive)_l_c_h/0.10)] text-[var(--destructive)] border-[oklch(from_var(--destructive)_l_c_h/0.30)]",
    dot: "bg-[var(--destructive)]",
  },
  muted: {
    wrap: "bg-surface-2 text-text-secondary border-border",
    dot: "bg-[var(--muted-foreground)]",
  },
};

function toneFor(status: string): Tone {
  const s = status.toLowerCase();
  if (/(post|approv|complet|active|success)/.test(s)) return "success";
  if (/(pend|review|hold)/.test(s)) return "warning";
  if (/(reject|fail|suspend|denied|error)/.test(s)) return "destructive";
  return "muted";
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const t = TONES[toneFor(status)];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border",
        t.wrap,
        className,
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", t.dot)} />
      {status}
    </span>
  );
}