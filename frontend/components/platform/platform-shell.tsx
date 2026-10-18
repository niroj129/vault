"use client";

import { Gamepad2, Landmark, LayoutDashboard, LogOut, MessageCircle, Receipt, Server, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/common/logo";
import { UserAvatar } from "@/components/common/user-avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu,
  SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMessengerEvents } from "@/lib/messenger";

type Item = [href: string, icon: LucideIcon, label: string, badge?: "chat"];
const NAV: Item[] = [["/platform", LayoutDashboard, "Overview"], ["/platform/sites", Server, "Client sites"], ["/platform/messages", MessageCircle, "Messages", "chat"], ["/platform/transactions", Receipt, "Transactions"], ["/platform/bytepayout", Landmark, "BytePayout"],
  ["/platform/games", Gamepad2, "Games"], ["/platform/players", Users, "Players (read only)"]];
const isOn = (path: string, href: string) => (href === "/platform" ? path === href : path.startsWith(href));

function Nav({ items, path, unread }: { items: Item[]; path: string; unread: number }) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      {items.map(([href, Icon, label, badge]) => (
        <SidebarMenuItem key={href}>
          <SidebarMenuButton asChild isActive={isOn(path, href)} tooltip={label}>
            <Link href={href} aria-current={isOn(path, href) ? "page" : undefined} onClick={() => setOpenMobile(false)}><Icon aria-hidden /><span>{label}</span></Link>
          </SidebarMenuButton>
          {badge === "chat" && unread > 0 && <SidebarMenuBadge className="bg-warning text-background" aria-label={`${unread} unread`}>{unread > 99 ? "99+" : unread}</SidebarMenuBadge>}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

/** The owner's console: every casino site at once. Site admins never see it. */
export function PlatformShell({ children }: { children: ReactNode }) {
  const { user, ready, token, logout } = useAuth();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const loadUnread = useCallback(() => { if (token) apiFetch<{ unread: number }>("/platform/chats/unread/", { token }).then((r) => setUnread(r.unread)).catch(() => {}); }, [token]);
  useEffect(() => { loadUnread(); const t = setInterval(loadUnread, 30000); return () => clearInterval(t); }, [loadUnread]);
  useMessengerEvents((ev) => { if (ev.type === "owner_chat") loadUnread(); });
  useEffect(() => { window.addEventListener("owner-chat-read", loadUnread); return () => window.removeEventListener("owner-chat-read", loadUnread); }, [loadUnread]);
  const path = usePathname() || "/platform";
  useEffect(() => {
    if (ready && !user?.is_platform_owner) router.replace(user ? "/" : `/login?next=${encodeURIComponent(path)}`);
  }, [ready, user, router, path]);
  if (!ready || !user?.is_platform_owner) {
    return <div role="status" className="flex min-h-dvh items-center justify-center gap-3 text-muted-foreground"><Spinner className="size-5" aria-hidden />Loading…</div>;
  }
  const name = user.full_name || user.username;
  const current = [...NAV].reverse().find(([h]) => isOn(path, h))?.[2] || "Owner console";
  return (
    <SidebarProvider>
      <a href="#owner-main" className="sr-only rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[var(--z-toast)]">Skip to content</a>
      <Sidebar collapsible="icon" aria-label="Owner console">
        <SidebarHeader className="h-16 justify-center px-3">
          <Link href="/platform" className="flex items-center gap-3 px-1 group-data-[collapsible=icon]:px-0"><Logo size={36} />
            <span className="grid leading-tight group-data-[collapsible=icon]:hidden"><b className="text-base">Owner console</b><span className="text-xs text-muted-foreground">All casino sites</span></span></Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup><SidebarGroupContent><Nav items={NAV} path={path} unread={unread} /></SidebarGroupContent></SidebarGroup>
        </SidebarContent>
        <SidebarFooter><p className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">Each client site&apos;s own admin runs its players, chats and payment checks. You see the results here.</p></SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0 bg-transparent">
        <header className="glass sticky top-0 z-[var(--z-nav)] flex h-16 items-center gap-2 border-b px-4 md:px-6">
          <SidebarTrigger className="-ml-1" aria-label="Toggle menu" />
          <p className="truncate font-semibold">{current}</p>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <span className="hidden items-center gap-2 pl-2 md:flex">
              <UserAvatar name={name} src={user.avatar} size={34} />
              <span className="grid leading-tight"><b className="text-sm">{name}</b><span className="text-xs text-muted-foreground">Owner</span></span>
            </span>
            <Button variant="ghost" size="icon" aria-label="Log out" onClick={async () => { await logout(); router.push("/login"); }}><LogOut aria-hidden /></Button>
          </div>
        </header>
        <main id="owner-main" tabIndex={-1} className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 outline-none md:px-6 md:py-8 [&_[data-slot=badge]]:rounded-full [&_[data-slot=button]]:rounded-full">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
