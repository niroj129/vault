import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { mediaUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

export function initials(name = "?"): string {
  return name.split(/[\s,@]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

/* Stable hue per name so everyone keeps the same colour. Lightness keeps white initials ≥4.5:1. */
function hue(name = "") {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

interface Props { name?: string; src?: string | null; icon?: LucideIcon; size?: number; online?: boolean | null; className?: string }

/** Round avatar: uploaded photo, else initials on a per-person colour, or an icon (groups, support, SMS).
 * Decorative (the name is always shown next to it), so it is hidden from screen readers. */
export function UserAvatar({ name = "", src, icon: IconCmp, size = 40, online, className }: Props) {
  const h = hue(name);
  return (
    <span aria-hidden className={cn("relative inline-grid shrink-0 place-items-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38),
        background: src ? undefined : IconCmp ? "var(--primary)" : `linear-gradient(140deg, hsl(${h} 55% 30%), hsl(${(h + 40) % 360} 55% 24%))` }}>
      {src ? <Image src={mediaUrl(src)} alt="" fill sizes={`${size}px`} className="rounded-full object-cover" />
        : IconCmp ? <IconCmp className="text-primary-foreground" style={{ width: size * 0.46, height: size * 0.46 }} />
        : initials(name)}
      {online && <span className="absolute right-0 bottom-0 size-[28%] min-w-2.5 min-h-2.5 rounded-full bg-success ring-2 ring-background" />}
    </span>
  );
}

/** "Online", "Active 5m ago", "Last seen Mar 3". */
export function lastSeenLabel(online: boolean | null | undefined, iso?: string | null): string {
  if (online) return "Online";
  if (!iso) return "";
  const mins = (Date.now() - new Date(iso).getTime()) / 60000;
  if (mins < 1) return "Active just now";
  if (mins < 60) return `Active ${Math.round(mins)}m ago`;
  if (mins < 60 * 24) return `Active ${Math.round(mins / 60)}h ago`;
  if (mins < 60 * 24 * 7) return `Active ${Math.round(mins / 1440)}d ago`;
  return `Last seen ${new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" })}`;
}
