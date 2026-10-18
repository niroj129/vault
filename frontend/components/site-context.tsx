"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SiteSettings } from "@/lib/types";

const SiteContext = createContext<SiteSettings>({ site_name: "Casino", features: {} });

/** Branding + plan features of the casino being viewed (from /api/settings/). */
export function SiteProvider({ settings, children }: { settings: SiteSettings | null; children: ReactNode }) {
  return <SiteContext.Provider value={settings || {}}>{children}</SiteContext.Provider>;
}

export function useSite(): SiteSettings {
  return useContext(SiteContext);
}

/** "Lucky Star Casino" → ["Lucky Star", "Casino"] for the two-tone wordmark. */
export function splitName(name = "Casino"): [string, string] {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return ["", words[0] || ""];
  return [words.slice(0, -1).join(" "), words[words.length - 1]];
}

export function BrandName({ className }: { className?: string }) {
  const { site_name } = useSite();
  const [first, last] = splitName(site_name || "Casino");
  return (
    <span className={className}>
      {first && <span className="font-semibold">{first} </span>}
      <span className="font-bold text-brand-text">{last}</span>
    </span>
  );
}
