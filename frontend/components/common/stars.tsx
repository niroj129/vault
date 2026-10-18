import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Read-only rating. Announced as text ("4.5 out of 5"), not by colour. */
export function Stars({ value = 0, size = 14, className }: { value?: number | string; size?: number; className?: string }) {
  const n = Number(value) || 0;
  const full = Math.round(n);
  return (
    <span role="img" aria-label={`${n.toFixed(1)} out of 5`} className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden style={{ width: size, height: size }}
          className={i <= full ? "fill-warning text-warning" : "text-muted-foreground/60"} />
      ))}
    </span>
  );
}
