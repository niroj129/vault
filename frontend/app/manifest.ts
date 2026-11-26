import type { MetadataRoute } from "next";
import { getJSONSafe } from "@/lib/server-api";
import type { SiteSettings } from "@/lib/types";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getJSONSafe<SiteSettings>("/settings/", {});
  const name = s.site_name || "Casino";
  const icons: MetadataRoute.Manifest["icons"] = [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }];
  if (s.logo) icons.unshift({ src: s.logo, sizes: "512x512", purpose: "any" });
  return {
    name, short_name: name.split(/\s+/)[0], description: s.tagline || "Sweepstakes games.",
    start_url: "/", scope: "/", display: "standalone", background_color: "#0F172A", theme_color: "#0F172A", icons,
    shortcuts: [{ name: "Load a game", url: "/load" }, { name: "Messages", url: "/messages" }, { name: "Support", url: "/messages?c=support" }],
  };
}
