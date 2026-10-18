"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useMessenger } from "@/lib/messenger";
import { cn } from "@/lib/utils";
import { isActive, mobileNav } from "./nav-config";

/** Phone tab bar (≤5 items), above the home indicator (safe-area rule). */
export function MobileNav() {
  const { user, ready } = useAuth();
  const { enabled, unread } = useMessenger();
  const pathname = usePathname();
  if (!ready) return null;
  const items = mobileNav(user, enabled);
  return (
    <nav aria-label="Main" className="glass fixed inset-x-0 bottom-0 z-[var(--z-nav)] border-t pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const on = isActive(pathname, item);
          const load = item.href === "/load";
          const count = item.badge === "unread" ? unread : 0;
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={on ? "page" : undefined}
                className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors duration-150",
                  on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                <span className={cn("relative grid h-8 w-12 place-items-center rounded-full transition-colors duration-200",
                  load ? "bg-primary text-primary-foreground shadow-glow" : on && "bg-primary/20")}>
                  <item.icon className="size-6" aria-hidden />
                  {count > 0 && (
                    <span className="absolute -top-1 right-0.5 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-xs leading-5 font-bold text-destructive-foreground ring-2 ring-background">
                      {count > 9 ? "9+" : count}
                    </span>
                  )}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
