"use client";

import { LogOut, MessageCircle, Receipt, Users, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Logo } from "@/components/common/logo";
import { UserAvatar } from "@/components/common/user-avatar";
import { BrandName } from "@/components/site-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { AgentSummaryProvider, useAgentSummary } from "./agent-context";

const TABS: { href: string; label: string; icon: LucideIcon; badge?: "to_load" | "cashouts_waiting" }[] = [
  { href: "/agent", label: "Players", icon: Users },
  { href: "/agent/loads", label: "Loads", icon: Wallet, badge: "to_load" },
  { href: "/agent/cashouts", label: "Cash outs", icon: Receipt, badge: "cashouts_waiting" },
];
const isOn = (path: string, href: string) => (href === "/agent" ? path === "/agent" : path === href || path.startsWith(`${href}/`));

function Tabs({ path }: { path: string }) {
  const { summary } = useAgentSummary();
  return (
    <nav aria-label="Agent console" className="scrollbar-none -mb-px flex gap-1 overflow-x-auto">
      {TABS.map(({ href, label, icon: Icon, badge }) => {
        const on = isOn(path, href);
        const n = badge && summary ? summary[badge] : 0;
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined}
            className={cn("relative flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-ring",
              on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Icon className="size-4" aria-hidden />{label}
            {n > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-warning px-1.5 text-xs font-bold text-background tabular-nums" aria-label={`${n} waiting`}>{n > 99 ? "99+" : n}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** The agent's desk: their own chrome (no storefront), three tabs, and the counters in the tab badges. */
export function AgentShell({ children }: { children: ReactNode }) {
  const { user, ready, logout } = useAuth();
  const router = useRouter();
  const path = usePathname() || "/agent";

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(path)}`);
    else if (user.role === "admin") router.replace(user.is_platform_owner ? "/platform" : "/admin");
    else if (user.role !== "agent") router.replace("/");
  }, [ready, user, router, path]);

  if (!ready || user?.role !== "agent") {
    return <div role="status" className="flex min-h-dvh items-center justify-center gap-3 text-muted-foreground"><Spinner className="size-5" aria-hidden />Loading…</div>;
  }
  const name = user.full_name || user.username;
  return (
    <AgentSummaryProvider>
      <a href="#agent-main" className="sr-only rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[var(--z-toast)]">Skip to content</a>
      <div className="flex min-h-dvh flex-col">
        <header className="glass sticky top-0 z-[var(--z-nav)] border-b">
          <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 md:px-8">
            <Link href="/agent" className="flex items-center gap-3"><Logo size={34} /><BrandName className="hidden truncate text-lg tracking-wide uppercase sm:block" /></Link>
            <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold tracking-wide text-brand-text uppercase">Agent</span>
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              <Button asChild variant="ghost" size="icon"><Link href="/messages" aria-label="Messages"><MessageCircle aria-hidden /></Link></Button>
              <span className="hidden items-center gap-2 pl-2 md:flex"><UserAvatar name={name} src={user.avatar} size={34} /><b className="text-sm">{name}</b></span>
              <Button variant="ghost" size="icon" aria-label="Log out" onClick={async () => { await logout(); router.push("/login"); }}><LogOut aria-hidden /></Button>
            </div>
          </div>
          <div className="mx-auto w-full max-w-7xl px-2 md:px-6"><Tabs path={path} /></div>
        </header>
        <main id="agent-main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none md:px-8 md:py-8">{children}</main>
      </div>
    </AgentSummaryProvider>
  );
}
