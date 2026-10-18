"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { Category } from "@/lib/types";
import { AnnouncementBar } from "./announcement-bar";
import { AppSidebar } from "./app-sidebar";
import { MobileNav } from "./mobile-nav";
import { SupportFab } from "./support-fab";
import { TopBar } from "./top-bar";

const BARE = ["/admin", "/platform", "/login", "/signup"]; // pages with their own chrome

export function SiteShell({ categories, footer, defaultOpen, children }:
  { categories: Category[]; footer: ReactNode; defaultOpen: boolean; children: ReactNode }) {
  const pathname = usePathname();
  if (BARE.some((p) => pathname?.startsWith(p))) return <>{children}</>;
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar categories={categories} />
      <SidebarInset className="min-w-0 bg-transparent">
        <AnnouncementBar />
        <TopBar />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none md:px-8 md:py-8">
          {children}
        </main>
        {footer}
      </SidebarInset>
      <MobileNav />
      <SupportFab />
    </SidebarProvider>
  );
}
