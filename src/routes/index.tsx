import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Landmark, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Vault Ledger — Bank back-office" },
      { name: "description", content: "Double-entry bank ledger with cash and bank vaults." },
    ],
  }),
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-2 font-semibold">
            <Landmark className="h-5 w-5" />
            Vault Ledger
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </header>
      <main className="container mx-auto px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-5xl font-semibold tracking-tight">A simple, auditable bank ledger.</h1>
          <p className="mt-4 text-muted-foreground">
            Double-entry posting, dedicated cash and bank vaults per currency, role-based access,
            and a customer view-only portal.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/login">
                Sign in <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
