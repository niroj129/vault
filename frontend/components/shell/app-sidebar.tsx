"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandName, useSite } from "@/components/site-context";
import { CreateAccountButton } from "@/components/common/create-account-button";
import { Logo } from "@/components/common/logo";
import { categoryIcon } from "@/components/common/icons";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import { useMessenger } from "@/lib/messenger";
import type { Category } from "@/lib/types";
import { helpNav, isActive, mainNav, REWARDS_NAV, type NavItem } from "./nav-config";

function NavGroup({ label, items, unread }: { label?: string; items: NavItem[]; unread: number }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = isActive(pathname, item);
            const count = item.badge === "unread" ? unread : 0;
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                  <Link href={item.href} aria-current={active ? "page" : undefined} onClick={() => setOpenMobile(false)}>
                    <item.icon aria-hidden />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
                {count > 0 && (
                  <SidebarMenuBadge className="bg-primary text-primary-foreground" aria-label={`${count} unread`}>
                    {count > 99 ? "99+" : count}
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar({ categories }: { categories: Category[] }) {
  const { user } = useAuth();
  const site = useSite();
  const { enabled, unread } = useMessenger();
  const { setOpenMobile } = useSidebar();
  const cats: NavItem[] = categories.map((c) => ({ href: `/games?category=${c.slug}`, label: c.name, icon: categoryIcon(c.icon) }));

  return (
    <Sidebar collapsible="icon" variant="sidebar" aria-label="Main">
      <SidebarHeader className="h-16 justify-center px-3">
        <Link href="/" onClick={() => setOpenMobile(false)} className="flex items-center gap-3 rounded-md px-1 group-data-[collapsible=icon]:px-0">
          <Logo size={36} />
          <BrandName className="truncate text-lg tracking-wide uppercase group-data-[collapsible=icon]:hidden" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <NavGroup items={mainNav(user, enabled)} unread={unread} />
        {cats.length > 0 && <NavGroup label="Categories" items={cats} unread={0} />}
        <NavGroup label="Rewards" items={REWARDS_NAV} unread={0} />
        <NavGroup label="Help" items={helpNav(user, enabled)} unread={0} />
      </SidebarContent>
      {!user && (
        <SidebarFooter className="group-data-[collapsible=icon]:hidden">
          <div className="glass grid gap-2 rounded-lg border p-4">
            <p className="font-semibold">Join {site.site_name || "us"}</p>
            <p className="text-sm text-muted-foreground">Get your game account and a personal agent in minutes.</p>
            <CreateAccountButton size="sm" className="w-full" />
          </div>
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  );
}
