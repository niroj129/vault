import {
  CircleUserRound, Gift, Globe, Headset, HelpCircle, Home, LayoutDashboard, LayoutGrid, Mail, MessageCircle, Trophy, Users, Zap,
  type LucideIcon,
} from "lucide-react";
import type { User } from "@/lib/types";

export interface NavItem { href: string; label: string; icon: LucideIcon; badge?: "unread"; match?: "exact" | "prefix" }

/** The account destination for each role. */
export function accountLink(user: User | null): NavItem | null {
  if (!user) return null;
  if (user.is_platform_owner) return { href: "/platform", label: "Owner console", icon: Globe };
  if (user.role === "admin") return { href: "/admin", label: "Admin panel", icon: LayoutDashboard };
  if (user.role === "agent") return { href: "/agent", label: "My players", icon: Users };
  return { href: "/profile", label: "Profile", icon: CircleUserRound };
}

export function mainNav(user: User | null, messenger: boolean): NavItem[] {
  const items: NavItem[] = [
    { href: "/", label: "Home", icon: Home, match: "exact" },
    { href: "/games", label: "Games", icon: LayoutGrid, match: "exact" },
  ];
  if (user?.role === "user") items.push({ href: "/load", label: "Load & cash out", icon: Zap });
  if (user && messenger) items.push({ href: "/messages", label: "Messages", icon: MessageCircle, badge: "unread" });
  const acc = accountLink(user);
  if (acc) items.push(acc);
  return items;
}

export const REWARDS_NAV: NavItem[] = [
  { href: "/promotions", label: "Promotions", icon: Gift },
  { href: "/winners", label: "Winners", icon: Trophy },
];

export function helpNav(user: User | null, messenger: boolean): NavItem[] {
  const items: NavItem[] = [];
  if (user?.role === "user" && messenger) items.push({ href: "/messages?c=support", label: "Support", icon: Headset });
  items.push({ href: "/faq", label: "FAQ", icon: HelpCircle }, { href: "/business", label: "Contact", icon: Mail });
  return items;
}

/** Phone tab bar: at most 5 items (bottom-nav-limit rule). */
export function mobileNav(user: User | null, messenger: boolean): NavItem[] {
  if (!user) {
    return [
      { href: "/", label: "Home", icon: Home, match: "exact" },
      { href: "/games", label: "Games", icon: LayoutGrid, match: "exact" },
      { href: "/promotions", label: "Promos", icon: Gift },
      { href: "/login", label: "Sign in", icon: CircleUserRound },
    ];
  }
  const items: NavItem[] = [
    { href: "/", label: "Home", icon: Home, match: "exact" },
    { href: "/games", label: "Games", icon: LayoutGrid, match: "exact" },
  ];
  if (user.role === "user") items.push({ href: "/load", label: "Load", icon: Zap });
  items.push(messenger ? { href: "/messages", label: "Messages", icon: MessageCircle, badge: "unread" } : { href: "/promotions", label: "Promos", icon: Gift });
  const acc = accountLink(user);
  if (acc) items.push({ ...acc, label: acc.href === "/profile" ? "Profile" : acc.label.split(" ")[0] });
  return items.slice(0, 5);
}

export function isActive(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false;
  const path = item.href.split("?")[0];
  if (item.href.includes("?")) return false; // deep links (e.g. Support) never mark the tab
  return item.match === "exact" ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
}
