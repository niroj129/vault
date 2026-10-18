import { Headset, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/common/logo";
import { BrandName } from "@/components/site-context";
import { Separator } from "@/components/ui/separator";
import type { BusinessInfo, Category, PaymentMethodInfo, SiteSettings } from "@/lib/types";

const linkCls = "inline-flex min-h-10 items-center text-muted-foreground transition-colors duration-150 hover:text-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11";

export function SiteFooter({ business, settings, categories, methods }:
  { business: BusinessInfo; settings: SiteSettings; categories: Category[]; methods: PaymentMethodInfo[] }) {
  const socials = ([["Facebook", business.facebook], ["Instagram", business.instagram], ["Telegram", business.telegram]] as const)
    .filter(([, url]) => url);
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t px-4 pt-12 pb-28 md:px-8 md:pb-10">
      <div className="mx-auto grid max-w-7xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="grid content-start gap-3">
          <Link href="/" className="flex min-h-11 items-center gap-3 self-start"><Logo size={36} /><BrandName className="text-lg uppercase tracking-wide" /></Link>
          <p className="max-w-xs text-muted-foreground">{settings.tagline || "Sweepstakes and social casino games with real agents, 24/7."}</p>
          {socials.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {socials.map(([label, url]) => (
                <li key={label}><a href={url!} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-md border px-3 text-sm transition-colors duration-150 hover:bg-accent pointer-coarse:h-11">{label}</a></li>
              ))}
            </ul>
          )}
        </div>
        <nav aria-label="Games"><h2 className="mb-2 text-sm font-semibold uppercase tracking-wider">Games</h2>
          <ul><li><Link className={linkCls} href="/games">All games</Link></li>
            {categories.slice(0, 5).map((c) => <li key={c.id}><Link className={linkCls} href={`/games?category=${c.slug}`}>{c.name}</Link></li>)}</ul>
        </nav>
        <nav aria-label="Rewards"><h2 className="mb-2 text-sm font-semibold uppercase tracking-wider">Rewards</h2>
          <ul><li><Link className={linkCls} href="/promotions">Promotions</Link></li><li><Link className={linkCls} href="/winners">Winners</Link></li>
            <li><Link className={linkCls} href="/profile">Profile</Link></li></ul>
        </nav>
        <nav aria-label="Help"><h2 className="mb-2 text-sm font-semibold uppercase tracking-wider">Help</h2>
          <ul><li><Link className={linkCls} href="/faq">FAQ</Link></li><li><Link className={linkCls} href="/messages?c=support">Live support</Link></li>
            <li><Link className={linkCls} href="/business">Contact</Link></li><li><Link className={linkCls} href="/business#terms">Terms</Link></li>
            <li><Link className={linkCls} href="/business#privacy">Privacy</Link></li></ul>
        </nav>
        <div><h2 className="mb-2 text-sm font-semibold uppercase tracking-wider">Contact</h2>
          <ul className="grid gap-1 text-muted-foreground">
            {business.email && <li className="flex min-h-10 items-center gap-2"><Mail className="size-4" aria-hidden /><a href={`mailto:${business.email}`} className="inline-flex min-h-10 items-center hover:text-foreground pointer-coarse:min-h-11">{business.email}</a></li>}
            {business.phone && <li className="flex min-h-10 items-center gap-2"><Phone className="size-4" aria-hidden /><a href={`tel:${business.phone}`} className="inline-flex min-h-10 items-center hover:text-foreground pointer-coarse:min-h-11">{business.phone}</a></li>}
            <li className="flex min-h-10 items-center gap-2"><Headset className="size-4" aria-hidden />Agents online 24/7</li>
          </ul>
        </div>
      </div>
      {methods.length > 0 && (
        <ul aria-label="Payment methods we accept" className="mx-auto mt-10 flex max-w-7xl flex-wrap gap-2">
          {methods.map((m) => <li key={m.id} className="rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground">{m.name}</li>)}
        </ul>
      )}
      <Separator className="mx-auto mt-8 max-w-7xl" />
      <div className="mx-auto mt-6 flex max-w-7xl flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center">
        <span className="inline-grid size-9 shrink-0 place-items-center rounded-full border-2 border-destructive text-xs font-bold text-foreground" aria-label="18 plus only">18+</span>
        <p className="max-w-3xl">Play responsibly. Sweepstakes games are for entertainment; no purchase necessary where required by law. If gaming stops being fun, take a break.</p>
        <p className="md:ml-auto">© {year} {business.business_name || settings.site_name || "Casino"}</p>
      </div>
    </footer>
  );
}
