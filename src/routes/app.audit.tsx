import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, RoleGate } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/app/audit")({
  component: () => <RoleGate allow={["admin", "auditor"]}><Audit /></RoleGate>,
});

function Audit() {
  const { data } = useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, action, target, details, created_at, actor_user_id")
        .order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div>
      <PageHeader title="Audit log" description="Every state change in the system." />
      <div className="p-6">
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">When</th>
                  <th className="px-4 py-2 text-left">Action</th>
                  <th className="px-4 py-2 text-left">Target</th>
                  <th className="px-4 py-2 text-left">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 text-muted-foreground">{formatDateTime(r.created_at)}</td>
                    <td className="px-4 py-2 font-mono">{r.action}</td>
                    <td className="px-4 py-2 font-mono">{r.target}</td>
                    <td className="px-4 py-2 text-xs"><code>{JSON.stringify(r.details)}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}