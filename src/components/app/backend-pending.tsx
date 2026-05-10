import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/dahabApi";

export function isPendingError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 501);
}

export function BackendPending({
  endpoint,
  note,
  className = "",
}: {
  endpoint: string;
  note?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Backend endpoint pending
        </div>
        <div className="mt-2 font-mono text-sm text-foreground">{endpoint}</div>
        {note ? (
          <p className="mt-2 text-xs text-muted-foreground">{note}</p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            This section will populate once the backend exposes this endpoint.
          </p>
        )}
      </CardContent>
    </Card>
  );
}