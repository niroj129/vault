import { Crown } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { User } from "@/lib/types";

/** Tier badge + bar toward the next tier (from /auth/me/ vip_next). */
export function VipProgress({ user }: { user: User }) {
  const next = user.vip_next;
  const pct = Math.round((next ? next.progress : 1) * 100);
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 font-semibold text-warning">
          <Crown className="size-4" aria-hidden />{user.vip_tier || "Bronze"}
        </span>
        <span className="text-muted-foreground">
          {next ? <><b className="text-foreground tabular-nums">{(next.points - (user.loyalty_points || 0)).toLocaleString()}</b> pts to {next.name}</> : "Top tier reached"}
        </span>
      </div>
      <Progress value={pct} aria-label={next ? `Progress to ${next.name}` : "Top tier"} />
    </div>
  );
}
