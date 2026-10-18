"use client";

import { ChevronDown, Headset, LogOut, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserAvatar } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { useMessenger } from "@/lib/messenger";
import { accountLink } from "./nav-config";

const ROLE_NAME: Record<string, string> = { user: "Player", admin: "Admin", agent: "Agent" };

export function UserMenu() {
  const { user, logout } = useAuth();
  const { enabled } = useMessenger();
  const router = useRouter();
  if (!user) return null;
  const name = user.full_name || user.username;
  const acc = accountLink(user);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-11 gap-2 px-1.5 md:pr-3" aria-label={`Account menu for ${name}`}>
          <UserAvatar name={name} src={user.avatar} size={34} />
          <span className="hidden min-w-0 text-left leading-tight lg:grid">
            <span className="truncate text-sm font-semibold">{name}</span>
            <span className="text-xs font-normal text-muted-foreground">{ROLE_NAME[user.role] || user.role}</span>
          </span>
          <ChevronDown className="hidden size-4 text-muted-foreground lg:block" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="grid">
          <span className="font-semibold">{name}</span>
          <span className="text-xs font-normal text-muted-foreground">@{user.username} · {ROLE_NAME[user.role]}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {acc && <DropdownMenuItem asChild><Link href={acc.href}><acc.icon aria-hidden />{acc.label}</Link></DropdownMenuItem>}
          {enabled && <DropdownMenuItem asChild><Link href="/messages"><MessageCircle aria-hidden />Messages</Link></DropdownMenuItem>}
          {enabled && user.role === "user" && <DropdownMenuItem asChild><Link href="/messages?c=support"><Headset aria-hidden />Support</Link></DropdownMenuItem>}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between px-2 py-1 text-sm text-muted-foreground md:hidden">
          Theme <ThemeToggle withLabel />
        </div>
        <DropdownMenuSeparator className="md:hidden" />
        <DropdownMenuItem onSelect={async () => { await logout(); router.push("/"); }}>
          <LogOut aria-hidden />Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
