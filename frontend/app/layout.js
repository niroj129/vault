import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../lib/auth";
import Header from "../components/Header";
import Footer from "../components/Footer";
import PublicChrome from "../components/PublicChrome";
import ChatWidget from "../components/ChatWidget";
import AnnouncementBar from "../components/AnnouncementBar";
import JsonLd from "../components/JsonLd";
import { getJSONSafe, SITE_URL } from "../lib/api";

// Inter — neutral geometric sans (Stake-style). Used for both body and display.
const inter = Inter({
  subsets: ["latin"], weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body", display: "swap",
});

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Tiffany Gaming — Play Juwa, Game Vault, Orion Stars & More",
    template: "%s | Tiffany Gaming",
  },
  description:
    "Tiffany Gaming is your premium sweepstakes & social casino hub. Get game " +
    "links, agent info and guides for Juwa, Game Vault, Orion Stars, Fire Kirin " +
    "and more. Keep playing, keep winning.",
  keywords: [
    "sweepstakes casino", "social casino", "fish games", "slot games",
    "Juwa", "Game Vault", "Orion Stars", "Fire Kirin", "Panda Master",
    "casino agents", "online sweepstakes",
  ],
  openGraph: {
    type: "website", siteName: "Tiffany Gaming", url: SITE_URL,
    title: "Tiffany Gaming — Premium Sweepstakes & Social Casino",
    description: "Game links, agent info and guides for the top sweepstakes games.",
    images: [{ url: "/icon.svg", width: 512, height: 512, alt: "Tiffany Gaming" }],
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  icons: { icon: "/icon.svg" },
};

export const viewport = {
  themeColor: "#8B5CF6",
};

export default async function RootLayout({ children }) {
  const [business, settings] = await Promise.all([
    getJSONSafe("/business/", {}),
    getJSONSafe("/settings/", {}),
  ]);
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <JsonLd data={{
          "@context": "https://schema.org", "@type": "WebSite",
          name: "Tiffany Gaming", url: SITE_URL,
          potentialAction: {
            "@type": "SearchAction",
            target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
            "query-input": "required name=search_term_string",
          },
        }} />
        {settings?.maintenance_mode && (
          <div className="annbar" style={{ background: "linear-gradient(90deg,#b91c1c,#f43f5e)" }}>
            🛠 We're performing scheduled maintenance — some features may be briefly unavailable.
          </div>
        )}
        <AuthProvider>
          <PublicChrome><AnnouncementBar /></PublicChrome>
          <PublicChrome><Header /></PublicChrome>
          {children}
          <PublicChrome><Footer business={business} /></PublicChrome>
          <ChatWidget />
        </AuthProvider>
      </body>
    </html>
  );
}
