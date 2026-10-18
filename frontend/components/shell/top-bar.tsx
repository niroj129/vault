"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { CreateAccountButton } from "@/components/common/create-account-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import { useMessenger } from "@/lib/messenger";
import { NotificationBell } from "./notification-bell";
import { SearchCommand } from "./search-command";
import { UserMenu } from "./user-menu";

export function TopBar() {
  const { user, ready } = useAuth();
  const { enabled, unread } = useMessenger();
  return (
    <header className="glass sticky top-0 z-[var(--z-nav)] flex h-16 items-center gap-2 border-b px-4 md:px-6">
      <SidebarTrigger className="-ml-1" aria-label="Toggle menu" />
      <div className="flex min-w-0 flex-1 items-center">
        <SearchCommand />
      </div>
      <div className="flex items-center gap-1">
        <span className="hidden md:inline-flex"><ThemeToggle /></span>
        {ready && (user ? (
          <>
            {enabled && (
              <Button asChild variant="ghost" size="icon">
                <Link href="/messages" aria-label={`Messages${unread ? `, ${unread} unread` : ""}`}>
                  <MessageCircle aria-hidden />
                  {unread > 0 && (
                    <span aria-hidden className="absolute top-1 right-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-xs font-bold leading-5 text-primary-foreground">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </Link>
              </Button>
            )}
            <NotificationBell />
            <UserMenu />
          </>
        ) : (
          <>
            <Button asChild variant="ghost" className="px-3 sm:px-4"><Link href="/login">Sign in</Link></Button>
            <CreateAccountButton className="hidden sm:inline-flex" />
          </>
        ))}
      </div>
    </header>
  );
}
