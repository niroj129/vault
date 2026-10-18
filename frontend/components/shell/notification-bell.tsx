"use client";

import { Bell, CheckCircle2, Clock, MessageCircle, TriangleAlert, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMessengerEvents } from "@/lib/messenger";
import type { Notification } from "@/lib/types";
import { cn } from "@/lib/utils";

/* title → icon + tone. Tone is also spelled out by the icon, never colour alone. */
const KIND: [RegExp, LucideIcon, string][] = [
  [/loaded|received|approved|cash out sent/i, CheckCircle2, "text-success bg-success/15"],
  [/declined|not found|failed|wasn't/i, TriangleAlert, "text-destructive-text bg-destructive/15"],
  [/checking|requested/i, Clock, "text-warning bg-warning/15"],
  [/cash out/i, Wallet, "text-brand-text bg-primary/15"],
  [/message|chat/i, MessageCircle, "text-brand-text bg-primary/15"],
];

function ago(t: string) {
  const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function NotificationBell() {
  const { user, token } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    apiFetch<Notification[]>("/notifications/", { token }).then(setItems).catch(() => {});
  }, [token]);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  useMessengerEvents((e) => { if (e.type === "toast") load(); });

  if (!user) return null;
  const unread = items.filter((i) => !i.is_read).length;

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && unread) {
      try { await apiFetch("/notifications/read_all/", { method: "POST", token }); load(); } catch { /* keep badge */ }
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${unread ? `, ${unread} new` : ""}`}>
          <Bell aria-hidden />
          {unread > 0 && (
            <span aria-hidden className="absolute top-1 right-1 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-xs font-bold leading-5 text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold">Notifications</h2>
          {items.length > 0 && <span className="text-sm text-muted-foreground">{items.length > 12 ? "Latest 12" : items.length}</span>}
        </div>
        {items.length === 0 ? (
          <div className="grid justify-items-center gap-1 px-6 py-10 text-center">
            <Bell className="size-6 text-muted-foreground" aria-hidden />
            <p className="font-semibold">You're all caught up</p>
            <p className="text-sm text-muted-foreground">Payment and load updates show up here.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[min(28rem,70dvh)]">
            <ul className="grid gap-0.5 p-1.5">
              {items.slice(0, 12).map((n) => {
                const [title, ...rest] = n.text.split(" — ");
                const body = rest.join(" — ");
                const [, Icon, tone] = KIND.find(([re]) => re.test(title)) || [null, Bell, "text-muted-foreground bg-muted"];
                return (
                  <li key={n.id}>
                    <Link href={n.link || "#"} onClick={() => setOpen(false)}
                      className={cn("flex gap-3 rounded-md p-3 transition-colors duration-150 hover:bg-accent", !n.is_read && "bg-primary/10")}>
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-md", tone)}><Icon className="size-4" aria-hidden /></span>
                      <span className="grid min-w-0 gap-0.5 text-sm">
                        {body ? <><b className="font-semibold">{title}</b><span className="line-clamp-3 text-muted-foreground">{body}</span></> : <span>{title}</span>}
                        <time className="text-xs text-muted-foreground" dateTime={n.created_at}>{ago(n.created_at)}</time>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
