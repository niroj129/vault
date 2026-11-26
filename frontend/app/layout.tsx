import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import "./tw.css";
import { JsonLd } from "@/components/common/json-ld";
import { SiteFooter } from "@/components/shell/site-footer";
import { SiteShell } from "@/components/shell/site-shell";
import { SiteProvider } from "@/components/site-context";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { brandCss } from "@/lib/brand";
import { MessengerProvider } from "@/lib/messenger";
import { getJSONSafe, siteUrl } from "@/lib/server-api";
import type { BusinessInfo, Category, PaymentMethodInfo, SiteSettings } from "@/lib/types";

// MASTER typography: Inter for headings and body (next/font: self-hosted, swap, no layout shift)
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const [settings, SITE_URL] = await Promise.all([getJSONSafe<SiteSettings>("/settings/", {}), siteUrl()]);
  const name = settings.site_name || "Casino";
  const tagline = settings.tagline || "Play premium sweepstakes games.";
  // Link-preview card: an uploaded image wins, else the generated 1200×630 card (app/og/route.tsx).
  // SVG is never used here — Facebook, X, WhatsApp and iMessage don't render it.
  const preview = settings.social_preview && !/\.svg($|\?)/i.test(settings.social_preview)
    ? { url: settings.social_preview, alt: name }
    : { url: "/og", width: 1200, height: 630, alt: `${name} — ${tagline}` };
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${name} — ${tagline}`, template: `%s | ${name}` },
    description: `${name} is your sweepstakes & social casino hub. Get game links, agent info and guides for Juwa, Game Vault, Orion Stars, Fire Kirin and more.`,
    keywords: ["sweepstakes casino", "social casino", "fish games", "slot games", "Juwa", "Game Vault", "Orion Stars", "Fire Kirin", "casino agents"],
    openGraph: {
      type: "website", siteName: name, url: SITE_URL, title: `${name} — Sweepstakes & Social Casino`, description: tagline,
      images: [preview],
    },
    twitter: { card: "summary_large_image", title: `${name} — Sweepstakes & Social Casino`, description: tagline, images: [preview] },
    robots: { index: true, follow: true },
    icons: { icon: settings.favicon || "/icon.svg" },
    verification: settings.gsc_verification ? { google: String(settings.gsc_verification) } : undefined,
  };
}

// viewport-meta rule: device width, zoom never disabled
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0F172A" },
    { media: "(prefers-color-scheme: light)", color: "#F5F3FF" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [business, settings, categories, methods, SITE_URL, jar] = await Promise.all([
    getJSONSafe<BusinessInfo>("/business/", {}),
    getJSONSafe<SiteSettings>("/settings/", {}),
    getJSONSafe<Category[]>("/categories/", []),
    getJSONSafe<PaymentMethodInfo[]>("/payment-methods/", []),
    siteUrl(),
    cookies(),
  ]);
  const siteName = settings.site_name || "Casino";
  const brand = brandCss(settings.color_accent);
  const sidebarOpen = jar.get("sidebar_state")?.value !== "false";
  const liveCategories = categories.filter((c) => c.game_count > 0);

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        {brand && <style dangerouslySetInnerHTML={{ __html: brand }} />}
        <JsonLd data={{
          "@context": "https://schema.org", "@type": "WebSite", name: siteName, url: SITE_URL,
          potentialAction: {
            "@type": "SearchAction",
            target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
            "query-input": "required name=search_term_string",
          },
        }} />
        {/* skip-links rule */}
        <a href="#main" className="sr-only rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[var(--z-toast)]">
          Skip to content
        </a>
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            {settings.maintenance_mode && (
              <div role="status" className="bg-warning px-4 py-2 text-center text-sm font-semibold text-background">
                Scheduled maintenance in progress — some features may be briefly unavailable.
              </div>
            )}
            <SiteProvider settings={settings}>
              <AuthProvider>
                <MessengerProvider>
                  <SiteShell categories={liveCategories} defaultOpen={sidebarOpen}
                    footer={<SiteFooter business={business} settings={settings} categories={categories}
                      methods={methods.filter((m) => m.active !== false)} />}>
                    {children}
                  </SiteShell>
                  <Toaster />
                </MessengerProvider>
              </AuthProvider>
            </SiteProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
