"use client";

import { OnOff } from "@/components/admin/on-off";
import { ResourceManager } from "@/components/admin/resource-manager";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { shortDate } from "@/lib/format";
import type { Promo } from "@/lib/types";

type Row = Promo & { sort_order: number };

/** "+50% + $5" — empty when the code has no automatic bonus. */
function bonusText(r: Promo) {
  const parts = [Number(r.bonus_percent) > 0 && `+${Number(r.bonus_percent)}%`, Number(r.bonus_flat) > 0 && `+$${Number(r.bonus_flat)}`].filter(Boolean);
  return parts.join(" ");
}

export default function AdminPromotions() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Promotions" description="Offers on the Promotions page. Give a code a bonus and players can enter it while loading — one-time or recurring." />
      <ResourceManager<Row> title="Promotions" itemName="Promotion" addLabel="New promotion" endpoint="/promos/" searchKeys={["title", "code"]}
        columns={[
          { key: "title", label: "Title", render: (r) => <b>{r.title}</b> },
          { key: "code", label: "Code", render: (r) => (r.code ? <Badge variant="outline" className="font-mono">{r.code}</Badge> : "—") },
          { key: "active", label: "Status", render: (r) => <OnOff on={r.active} /> },
          { key: "bonus", label: "Bonus", render: (r) => bonusText(r) || "Display only" },
          { key: "usage", label: "Type", mobileHidden: true, render: (r) => (bonusText(r) ? (r.usage === "once" ? "One-time" : "Recurring") : "—") },
          { key: "used", label: "Used", mobileHidden: true, render: (r) => (bonusText(r) ? `${r.used}${r.max_uses ? ` / ${r.max_uses}` : ""}` : "—") },
          { key: "expires", label: "Expires", render: (r) => (r.expires ? shortDate(r.expires) : "—") },
        ]}
        fields={[
          { name: "title", label: "Title", required: true, full: true },
          { name: "code", label: "Promo code", help: "What players type, e.g. WELCOME50. Not case-sensitive." },
          { name: "bonus_percent", label: "Bonus %", type: "number", min: 0, help: "Extra credits as a % of the deposit. 50 = +50%." },
          { name: "bonus_flat", label: "Bonus $ (fixed)", type: "number", min: 0, help: "Added on top of the %. Use one or both." },
          { name: "max_bonus", label: "Most bonus per load ($)", type: "number", min: 0, help: "0 = no limit." },
          { name: "min_deposit", label: "Minimum deposit ($)", type: "number", min: 0, help: "0 = any amount." },
          { name: "usage", label: "How it can be used", type: "select", options: [{ value: "once", label: "One-time — once per player" }, { value: "recurring", label: "Recurring — every load" }] },
          { name: "max_uses", label: "Total uses allowed", type: "number", min: 0, help: "Across all players. 0 = unlimited." },
          { name: "starts", label: "Starts", type: "date" },
          { name: "expires", label: "Ends", type: "date" },
          { name: "description", label: "Description", type: "textarea" },
          { name: "image", label: "Image", type: "image" },
          { name: "sort_order", label: "Sort order", type: "number", min: 0 },
          { name: "active", label: "Show on the site", type: "checkbox" },
        ]}
        defaults={{ active: true, sort_order: 0, usage: "once", bonus_percent: 0, bonus_flat: 0, max_bonus: 0, min_deposit: 0, max_uses: 0 }} />
    </div>
  );
}
