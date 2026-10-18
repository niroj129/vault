import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** One KPI: label + icon, big number, optional note. Warn tone = amber border and fill, never colour alone (the label says why). */
export function StatCard({ icon: Icon, label, value, note, href, tone }: { icon: LucideIcon; label: string; value: string; note?: string; href?: string; tone?: "warn" }) {
  const body = (
    <Card className={cn("h-full gap-2 py-4 transition-colors duration-200", tone === "warn" ? "border-warning/60 bg-warning/10" : "glass", href && "hover:bg-accent")}>
      <CardContent className="grid gap-2">
        <p className="flex items-center justify-between gap-2 text-sm text-muted-foreground">{label}<Icon className={cn("size-5 shrink-0", tone === "warn" ? "text-warning" : "text-brand-text")} aria-hidden /></p>
        <p className="truncate text-2xl font-bold tabular-nums sm:text-3xl">{value}</p>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="rounded-xl">{body}</Link> : body;
}

export const StatGrid = ({ children }: { children: React.ReactNode }) => <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{children}</div>;
