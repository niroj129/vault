"use client";

import { Headset } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useMessenger } from "@/lib/messenger";

const HIDDEN = ["/admin", "/login", "/signup", "/messages", "/platform", "/agent"];

/** Floating support button (desktop only; phones have it in the tab bar). */
export function SupportFab() {
  const { user, ready } = useAuth();
  const { unread } = useMessenger();
  const pathname = usePathname();
  if (!ready || !user || user.role !== "user" || HIDDEN.some((p) => pathname?.startsWith(p))) return null;
  return (
    <Link href="/messages?c=support" aria-label={`Support chat${unread ? `, ${unread} unread` : ""}`}
      className="fixed right-6 bottom-6 z-[var(--z-sticky)] hidden size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow transition-[filter,box-shadow] duration-200 hover:brightness-110 md:grid">
      <Headset className="size-6" aria-hidden />
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 grid min-w-6 place-items-center rounded-full bg-destructive px-1.5 text-xs font-bold text-destructive-foreground ring-2 ring-background">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
