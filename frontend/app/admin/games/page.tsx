"use client";

import { Flame, Gamepad2, Sparkles } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { OnOff } from "@/components/admin/on-off";
import { ResourceManager } from "@/components/admin/resource-manager";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/play/status-badge";
import { Badge } from "@/components/ui/badge";
import { apiFetch, getJSONSafe, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Category, Game } from "@/lib/types";

export default function AdminGames() {
  const { token } = useAuth();
  const [cats, setCats] = useState<Category[]>([]);
  const [providers, setProviders] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => { void getJSONSafe<Category[]>("/categories/", []).then(setCats); }, []);
  useEffect(() => { if (token) apiFetch<{ id: number; name: string }[]>("/game-providers/", { token }).then(setProviders).catch(() => {}); }, [token]);

  return (
    <div className="grid gap-6">
      <PageHeader title="Games & images" description="Every game on the site: its art, links, category and the points you hold with each vendor." />
      <ResourceManager<Game> title="Games" itemName="Game" endpoint="/games/" lookupKey="slug" searchKeys={["name", "category_name"]}
        describeDelete={(g) => `${g.name} and its page will be removed. Player logins for it are kept.`}
        columns={[
          { key: "thumbnail", label: "Art", mobileHidden: true, render: (r) => (
            <span className="relative grid h-12 w-9 place-items-center overflow-hidden rounded-md bg-muted">
              {r.thumbnail ? <Image src={mediaUrl(r.thumbnail)} alt="" fill sizes="36px" className="object-cover" /> : <Gamepad2 className="size-4" aria-hidden />}</span>) },
          { key: "name", label: "Name", render: (r) => <b>{r.name}</b> },
          { key: "category_name", label: "Category", render: (r) => r.category_name || "—" },
          { key: "status", label: "Status", render: (r) => <OnOff on={r.status === "active"} no="Inactive" /> },
          { key: "featured", label: "Flags", render: (r) => <div className="flex flex-wrap gap-1">{r.featured && <Badge variant="outline"><Flame aria-hidden />Hot</Badge>}{r.is_new && <Badge variant="outline"><Sparkles aria-hidden />New</Badge>}{!r.featured && !r.is_new && "—"}</div> },
          { key: "provider_name", label: "Loading", render: (r) => <Badge variant="secondary">{r.provider_name || "By hand"}</Badge> },
          { key: "points", label: "Points", render: (r) => { const c = Number(r.sub_points || 0) + Number(r.vendor_points || 0);
            return c < 100 ? <StatusBadge tone="bad">Low · {c}</StatusBadge> : <span className="tabular-nums">{c}</span>; } },
          { key: "clicks", label: "Plays", className: "tabular-nums" },
        ]}
        fields={[
          { name: "name", label: "Game name", required: true },
          { name: "category", label: "Category", type: "select", options: [{ value: "", label: "None" }, ...cats.map((c) => ({ value: String(c.id), label: c.name }))] },
          { name: "short_description", label: "Short description", full: true },
          { name: "description", label: "Description", type: "textarea", rows: 4 },
          { name: "features", label: "Features (one per line)", type: "textarea" },
          { name: "user_link", label: "Player game link", type: "url", help: "Where players play." },
          { name: "agent_link", label: "Agent game link", type: "url" },
          { name: "play_url", label: "Other link", type: "url" },
          { name: "download_info", label: "Download / access info" },
          { name: "sub_points", label: "Sub-distributor points", type: "number", min: 0, help: "Filled in automatically when this game is connected to its platform API." },
          { name: "vendor_points", label: "Vendor points", type: "number", min: 0, help: "Live from the API when connected — typed values are replaced on the next update." },
          { name: "thumbnail", label: "Card image (portrait, 600×800)", type: "image" },
          { name: "logo", label: "Logo / icon (square)", type: "image" },
          { name: "banner", label: "Banner (wide, 1600×640)", type: "image" },
          { name: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
          { name: "provider", label: "Game API (advanced)", type: "select", options: [{ value: "", label: "None — staff load by hand" }, ...providers.map((p) => ({ value: String(p.id), label: p.name }))] },
          { name: "provider_game_code", label: "Game code on the platform" },
          { name: "self_serve", label: "Players can get an account by themselves (API games)", type: "checkbox" },
          { name: "featured", label: "Featured (Hot)", type: "checkbox" },
          { name: "is_new", label: "New", type: "checkbox" },
          { name: "meta_title", label: "SEO title", full: true },
          { name: "meta_description", label: "SEO description", type: "textarea" },
          { name: "meta_keywords", label: "SEO keywords", full: true },
        ]}
        defaults={{ status: "active", category: "", provider: "", self_serve: true, sub_points: "0", vendor_points: "0" }} />
    </div>
  );
}
