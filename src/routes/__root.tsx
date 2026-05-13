import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";
import { LanguageProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import appCss from "../styles.css?url";
import { useEffect } from "react";
import { clearFrontendBusinessCacheForLambdaMode } from "@/lib/clearFrontendBusinessCache";
import { installLambdaAuthTokenProvider } from "@/lib/dahabAuthToken";

// Install the Lambda Bearer-token provider as early as possible so every
// apiFetch made during initial render attaches Authorization.
if (typeof window !== "undefined") installLambdaAuthTokenProvider();

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="font-serif text-sm uppercase tracking-[0.4em] text-gold">Dahab · ذهب</p>
        <h1 className="mt-4 font-serif text-7xl font-semibold gold-text">404</h1>
        <h2 className="mt-4 text-xl font-medium text-foreground">This vault is empty</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-gradient-gold px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-gold transition-transform hover:scale-[1.02]"
          >
            Return home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Dahab — Private Banking" },
      { name: "description", content: "Dahab (ذهب) — a private banking ledger built on double-entry precision and gold-standard auditability." },
      { name: "author", content: "Dahab" },
      { name: "theme-color", content: "#16120c" },
      { property: "og:title", content: "Dahab — Private Banking" },
      { property: "og:description", content: "Dahab (ذهب) — a private banking ledger built on double-entry precision and gold-standard auditability." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Dahab" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Dahab — Private Banking" },
      { name: "twitter:description", content: "Dahab (ذهب) — a private banking ledger built on double-entry precision and gold-standard auditability." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/l092Pkcvqdhqgd0wx0no6lP8E1k1/social-images/social-1777519259491-ChatGPT_Image_Apr_30,_2026,_04_48_05_AM.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/l092Pkcvqdhqgd0wx0no6lP8E1k1/social-images/social-1777519259491-ChatGPT_Image_Apr_30,_2026,_04_48_05_AM.webp" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Dahab" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "application-name", content: "Dahab" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      ({
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;700&display=swap",
        media: "print",
        onLoad: "this.media='all'",
      } as any),
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "shortcut icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      // Preload the brand mark so it paints with the first frame.
      { rel: "preload", as: "image", href: "/brand/dahab-icon.webp", type: "image/webp" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark theme-night">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  useEffect(() => {
    installLambdaAuthTokenProvider();
    clearFrontendBusinessCacheForLambdaMode();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
              <Outlet />
              <Toaster richColors position="top-right" />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Treat data as fresh for 30s — switching tabs no longer refetches
      // every dashboard/transactions/vault query.
      staleTime: 30_000,
      // Keep cached data around for 5 minutes so navigating back is instant.
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: "always",
      retry: 1,
    },
  },
});
