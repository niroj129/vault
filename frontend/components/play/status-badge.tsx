import { CheckCircle2, Circle, Clock, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { Deposit, Redeem } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Tone = "ok" | "wait" | "bad" | "neutral";
const TONE: Record<Tone, [string, ReactNode]> = {
  ok: ["bg-success/15 text-success", <CheckCircle2 key="i" className="size-3.5" aria-hidden />],
  wait: ["bg-warning/15 text-warning", <Clock key="i" className="size-3.5" aria-hidden />],
  bad: ["bg-destructive/15 text-destructive-text", <XCircle key="i" className="size-3.5" aria-hidden />],
  neutral: ["bg-muted text-muted-foreground", <Circle key="i" className="size-3.5" aria-hidden />],
};

/** Status pill: icon + text, never colour alone (color-not-only rule). */
export function StatusBadge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  const [cls, icon] = TONE[tone];
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", cls, className)}>{icon}{children}</span>;
}

export function depositTone(d: Pick<Deposit, "status" | "load_status" | "status_label" | "load_label">): [Tone, string] {
  if (d.load_status === "loaded") return ["ok", "Loaded"];
  if (d.status === "approved") return ["wait", d.load_label];
  if (d.status === "pending") return ["wait", d.status_label];
  return ["bad", d.status_label];
}
export function redeemTone(r: Pick<Redeem, "status" | "status_label">): [Tone, string] {
  return [r.status === "paid" ? "ok" : r.status === "rejected" || r.status === "failed" ? "bad" : "wait", r.status_label];
}
