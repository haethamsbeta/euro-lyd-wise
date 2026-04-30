import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DahabMark, DahabCoin } from "@/components/brand/dahab-mark";
import { Mail, User, Code2, Info } from "lucide-react";

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

        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Dahab. All rights reserved.
        </p>
      </div>
    </div>
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