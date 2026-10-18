"use client";

import Image from "next/image";
import { useSite } from "@/components/site-context";
import { mediaUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

/** The operator's uploaded logo, or a monogram of the site's initials. */
export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  const { logo, site_name = "Casino" } = useSite();
  if (logo) {
    return (
      <Image src={mediaUrl(logo)} width={size} height={size} alt={site_name}
        className={cn("shrink-0 rounded-[22%] object-cover", className)} />
    );
  }
  const initials = site_name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "C";
  return (
    <span role="img" aria-label={site_name} style={{ width: size, height: size, fontSize: size * (initials.length > 1 ? 0.38 : 0.5) }}
      className={cn("inline-grid shrink-0 place-items-center rounded-[22%] bg-primary font-bold text-primary-foreground shadow-glow", className)}>
      {initials}
    </span>
  );
}
