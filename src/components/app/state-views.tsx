import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react";

/**
 * Shared loading / empty / error state primitives.
 * Use these everywhere a list, table, or card-grid can render zero rows
 * or fail to load. They preserve DAHAB design language (Card surface,
 * muted-foreground copy, gold accent on the retry button) and keep the
 * page from looking broken during client testing.
 */

export function LoadingState({
  label = "Loading…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-gold" />
        <span>{label}</span>
      </CardContent>
    </Card>
  );
}

export function TableLoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function GridLoadingSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: cards }).map((_, i) => (
        <Card key={i} className="p-5">
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className = "",
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted/40">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          {description ? (
            <p className="text-xs text-muted-foreground max-w-sm">{description}</p>
          ) : null}
        </div>
        {action ? <div className="pt-1">{action}</div> : null}
      </CardContent>
    </Card>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  retrying = false,
  className = "",
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <Card className={`border-destructive/30 ${className}`}>
      <CardContent className="flex flex-col items-start gap-3 p-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        {description ? (
          <p className="text-xs text-muted-foreground break-words">{description}</p>
        ) : null}
        {onRetry ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={retrying}
            className="border-gold/40 text-gold hover:bg-gold/10"
          >
            <RefreshCw className={`me-1 h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
            Retry
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Best-effort error message extractor — never shows raw stack/JSON. */
export function errorMessage(err: unknown, fallback = "Unexpected error."): string {
  if (!err) return fallback;
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err;
  try {
    const m = (err as any)?.message;
    if (typeof m === "string" && m.length > 0) return m;
  } catch {}
  return fallback;
}