import { Headset, Wallet, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/common/logo";
import { mediaUrl } from "@/lib/api";
import { getJSONSafe } from "@/lib/server-api";
import type { Game, SiteSettings } from "@/lib/types";

/** Sign-in / sign-up frame: a still collage of this site's games beside the form (no decorative motion). */
export async function AuthLayout({ children }: { children: ReactNode }) {
  const [games, site] = await Promise.all([getJSONSafe<Game[]>("/games/", []), getJSONSafe<SiteSettings>("/settings/", {})]);
  const art = games.map((g) => g.thumbnail).filter((x): x is string => !!x).slice(0, 9);
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(28rem,1fr)]">
      <aside aria-hidden className="dark relative hidden overflow-hidden bg-background text-foreground lg:block">
        <div className="absolute inset-0 grid -rotate-6 scale-125 grid-cols-3 gap-4 p-4 opacity-45">
          {art.map((src, i) => (
            <span key={i} className="relative aspect-[3/4] overflow-hidden rounded-xl ring-1 ring-border">
              <Image src={mediaUrl(src)} alt="" fill sizes="20vw" className="object-cover" />
            </span>
          ))}
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_50%,color-mix(in_oklab,var(--background)_75%,transparent),var(--background))]" />
        <div className="relative grid h-full place-content-center justify-items-center gap-4 p-12 text-center">
          <Logo size={64} />
          <p className="text-4xl font-bold">{site.site_name || "Casino"}</p>
          <p className="max-w-sm text-lg text-muted-foreground">{site.tagline || "All your sweepstakes games in one place."}</p>
          <ul className="mt-4 grid gap-2 text-left">
            {([[Zap, "Pay and play in minutes"], [Wallet, "Chime, Cash App, Apple Pay & more"], [Headset, "Support online 24/7"]] as const).map(([Icon, t]) => (
              <li key={t} className="glass flex items-center gap-3 rounded-lg border px-4 py-3"><Icon className="size-5 text-brand-text" />{t}</li>
            ))}
          </ul>
        </div>
      </aside>
      <main id="main" className="grid place-items-center px-4 py-10 sm:px-8">
        <div className="grid w-full max-w-md gap-6">
          <Link href="/" className="flex items-center gap-3 justify-self-center lg:hidden" aria-label={`${site.site_name || "Casino"} home`}>
            <Logo size={48} />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
