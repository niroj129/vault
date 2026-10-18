"use client";

import {
  BarChart3, Landmark, LifeBuoy, Mail, Phone, ChevronRight, Cog, ExternalLink, Flag, Gamepad2, Gift, Globe, HelpCircle, Layers, LayoutDashboard, LogOut, Megaphone, MessageCircle,
  Receipt, ScrollText, Search, ShieldCheck, Star, Store, Trophy, Users, Wallet, Zap, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/common/logo";
import { UserAvatar } from "@/components/common/user-avatar";
import { BrandName } from "@/components/site-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu,
  SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMessengerEvents } from "@/lib/messenger";

type Item = [href: string, icon: LucideIcon, label: string, badge?: string];
const NAV: [string | null, Item[], boolean?][] = [
  [null, [["/admin", LayoutDashboard, "Dashboard"]]],
  ["Money", [["/admin/deposits", Wallet, "Deposits", "deposits_needing_staff"], ["/admin/redeems", Receipt, "Cash outs", "redeems_waiting"], ["/admin/bytepayout", Landmark, "BytePayout"], ["/admin/mail", Mail, "Payment emails", "emails_unmatched"], ["/admin/transactions", BarChart3, "Transactions & shifts"]]],
  ["Players", [["/admin/players", Users, "Players & staff"], ["/admin/reports", Flag, "Reports", "open_reports"], ["/admin/logins", ShieldCheck, "Login activity"]]],
  ["Messages", [["/admin/messages", MessageCircle, "Inbox", "unanswered_chats"], ["/admin/phone", Phone, "Phone messaging"], ["/admin/support", LifeBuoy, "Platform support", "owner_chat_unread"]]],
  ["Games", [["/admin/games", Gamepad2, "Games & images"], ["/admin/points", Zap, "Points & Telegram"], ["/admin/winners", Trophy, "Daily winners"], ["/admin/reviews", Star, "Reviews"]]],
  ["Marketing", [["/admin/promotions", Gift, "Promotions"], ["/admin/announcements", Megaphone, "Announcements"], ["/admin/faq", HelpCircle, "FAQ"], ["/admin/seo", Search, "SEO"]]],
  ["Advanced (not used now)", [["/admin/game-apis", Layers, "Game APIs"], ["/admin/gameplatform", Cog, "Agent console"], ["/admin/payments", Wallet, "Pay links & cashout"],
    ["/admin/settlement", BarChart3, "Settlement"]], true],
  [null, [["/admin/settings", Cog, "Settings"]]],
];
const ALL = NAV.flatMap(([, items]) => items);
const isOn = (path: string, href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));

function NavItems({ items, counts, path }: { items: Item[]; counts: Record<string, number>; path: string }) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      {items.map(([href, Icon, label, key]) => {
        const n = key ? counts[key] || 0 : 0;
        const on = isOn(path, href);
        return (
          <SidebarMenuItem key={href}>
            <SidebarMenuButton asChild isActive={on} tooltip={label}>
              <Link href={href} aria-current={on ? "page" : undefined} onClick={() => setOpenMobile(false)}><Icon aria-hidden /><span>{label}</span></Link>
            </SidebarMenuButton>
            {n > 0 && <SidebarMenuBadge className="bg-warning text-background peer-hover/menu-button:text-background peer-data-active/menu-button:text-background" aria-label={`${n} waiting`}>{n > 99 ? "99+" : n}</SidebarMenuBadge>}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, ready, token, logout } = useAuth();
  const router = useRouter();
  const path = usePathname() || "/admin";
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!ready) return;
    if (user?.is_platform_owner) router.replace("/platform"); // the owner runs client sites from the console, not a casino admin
    else if (!user || user.role !== "admin") router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [ready, user, router, path]);
  const load = useCallback(() => { if (token) apiFetch<Record<string, number>>("/stats/admin/", { token }).then(setCounts).catch(() => {}); }, [token]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useEffect(() => { window.addEventListener("owner-chat-read", load); return () => window.removeEventListener("owner-chat-read", load); }, [load]);
  useMessengerEvents((ev) => { if (["report", "message", "toast", "owner_chat"].includes(ev.type)) load(); });
  // "(3) Deposits" in the browser tab while money is waiting on staff
  useEffect(() => {
    const n = (counts.deposits_needing_staff || 0) + (counts.redeems_waiting || 0);
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = n ? `(${n}) ${base}` : base;
  }, [counts, path]);

  if (!ready || !user || user.role !== "admin" || user.is_platform_owner) {
    return <div role="status" className="flex min-h-dvh items-center justify-center gap-3 text-muted-foreground"><Spinner className="size-5" aria-hidden />Loading…</div>;
  }
  const current = ALL.find(([h]) => isOn(path, h) && h !== "/admin") || ALL.find(([h]) => isOn(path, h));
  const name = user.full_name || user.username;

  return (
    <SidebarProvider>
      <a href="#admin-main" className="sr-only rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[var(--z-toast)]">Skip to content</a>
      <Sidebar collapsible="icon" aria-label="Admin">
        <SidebarHeader className="h-16 justify-center px-3">
          <Link href="/admin" className="flex items-center gap-3 px-1 group-data-[collapsible=icon]:px-0"><Logo size={36} />
            <BrandName className="truncate text-lg tracking-wide uppercase group-data-[collapsible=icon]:hidden" /></Link>
        </SidebarHeader>
        <SidebarContent>
          {NAV.map(([heading, items, collapsed], gi) => (collapsed ? (
            <Collapsible key={gi} defaultOpen={items.some(([h]) => isOn(path, h))} className="group/collapsible">
              <SidebarGroup>
                <SidebarGroupLabel asChild>
                  <CollapsibleTrigger className="flex min-h-10 w-full items-center gap-1 rounded-md hover:bg-sidebar-accent">
                    {heading}<ChevronRight className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" aria-hidden />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent><SidebarGroupContent><NavItems items={items} counts={counts} path={path} /></SidebarGroupContent></CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          ) : (
            <SidebarGroup key={gi}>
              {heading && <SidebarGroupLabel>{heading}</SidebarGroupLabel>}
              <SidebarGroupContent><NavItems items={items} counts={counts} path={path} /></SidebarGroupContent>
            </SidebarGroup>
          )))}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton asChild tooltip="View site"><Link href="/"><Globe aria-hidden /><span>View site</span></Link></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton asChild tooltip="Django admin"><a href="/django-admin/" target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden /><span>Django admin</span></a></SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0 bg-transparent">
        <header className="glass sticky top-0 z-[var(--z-nav)] flex h-16 items-center gap-2 border-b px-4 md:px-6">
          <SidebarTrigger className="-ml-1" aria-label="Toggle menu" />
          <p className="truncate font-semibold">{current?.[2] || "Admin"}</p>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Button asChild variant="ghost" size="icon">
              <Link href="/admin/messages" aria-label={`Inbox${counts.unanswered_chats ? `, ${counts.unanswered_chats} waiting` : ""}`}>
                <MessageCircle aria-hidden />{!!counts.unanswered_chats && <span aria-hidden className="absolute top-2 right-2 size-2.5 rounded-full bg-warning ring-2 ring-background" />}
              </Link>
            </Button>
            <span className="hidden items-center gap-2 pl-2 md:flex">
              <UserAvatar name={name} src={user.avatar} size={34} />
              <span className="grid leading-tight"><b className="text-sm">{name}</b><span className="text-xs text-muted-foreground">Admin</span></span>
            </span>
            <Button variant="ghost" size="icon" aria-label="Log out" onClick={async () => { await logout(); router.push("/login"); }}><LogOut aria-hidden /></Button>
          </div>
        </header>
        {/* pages/admin.md: max width 1200px; pill buttons and chips */}
        <main id="admin-main" tabIndex={-1} className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 outline-none md:px-6 md:py-8 [&_[data-slot=badge]]:rounded-full [&_[data-slot=button]]:rounded-full">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

