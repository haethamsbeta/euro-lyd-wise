import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DahabMark, DahabCoin } from "@/components/brand/dahab-mark";
import { Mail, User, Code2, Info, Activity, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DATA_BACKEND,
  API_BASE_URL,
  REALTIME_MODE,
} from "@/lib/runtimeConfig";
import { apiFetch } from "@/lib/api/_shared";

const APP_VERSION = "1.0.0";
const BUILD_DATE = "April 2026";
const DEVELOPER_NAME = "Haetham Sbeta";
const DEVELOPER_EMAIL = "haetham@elnomangroup.com";

export const Route = createFileRoute("/app/about")({
  component: AboutPage,
  head: () => ({ meta: [{ title: "About — Dahab" }] }),
});

function AboutPage() {
  return (
    <div>
      <PageHeader title="About" description="App version and developer information." />
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <DahabCoin />
              <div>
                <DahabMark size="sm" showArabic={false} />
                <p className="mt-1 text-xs text-muted-foreground">Private banking, weighed in gold</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row icon={<Info className="h-4 w-4" />} label="Version" value={APP_VERSION} mono />
            <Row icon={<Code2 className="h-4 w-4" />} label="Build" value={BUILD_DATE} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Developer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row icon={<User className="h-4 w-4" />} label="Developed by" value={DEVELOPER_NAME} />
            <Row
              icon={<Mail className="h-4 w-4" />}
              label="Contact"
              value={
                <a href={`mailto:${DEVELOPER_EMAIL}`} className="text-gold hover:underline">
                  {DEVELOPER_EMAIL}
                </a>
              }
            />
          </CardContent>
        </Card>

        <BackendDiagnostics />

        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Dahab. All rights reserved.
        </p>
      </div>
    </div>
  );
}

function BackendDiagnostics() {
  type State =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok"; message: string; currencies?: string[] }
    | { kind: "err"; message: string };
  const [state, setState] = useState<State>({ kind: "idle" });

  async function test() {
    setState({ kind: "loading" });
    try {
      const data = await apiFetch<any>("/api/health");
      setState({
        kind: "ok",
        message: data?.message ?? "OK",
        currencies: data?.accepted_currencies ?? data?.currencies ?? undefined,
      });
    } catch (e: any) {
      setState({ kind: "err", message: e?.message ?? "Request failed" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-gold" /> Backend diagnostics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Row icon={<Info className="h-4 w-4" />} label="Backend mode" value={DATA_BACKEND} mono />
        <Row
          icon={<Code2 className="h-4 w-4" />}
          label="API base URL"
          value={<span className="font-mono text-xs break-all">{API_BASE_URL}</span>}
        />
        <Row icon={<Activity className="h-4 w-4" />} label="Realtime" value={REALTIME_MODE} mono />
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-4 py-3">
          <div className="text-sm text-muted-foreground">Test backend connection</div>
          <Button size="sm" onClick={test} disabled={state.kind === "loading"}>
            {state.kind === "loading" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Test"
            )}
          </Button>
        </div>
        {state.kind === "ok" && (
          <div className="rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-4 w-4" /> {state.message}
            </div>
            {state.currencies && state.currencies.length > 0 && (
              <div className="mt-1 text-xs text-muted-foreground">
                Accepted currencies: {state.currencies.join(", ")}
              </div>
            )}
          </div>
        )}
        {state.kind === "err" && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <XCircle className="h-4 w-4 mt-0.5" />
            <span>{state.message}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  icon, label, value, mono,
}: { icon: React.ReactNode; label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}