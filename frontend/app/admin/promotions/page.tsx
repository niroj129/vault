"use client";

import { OnOff } from "@/components/admin/on-off";
import { ResourceManager } from "@/components/admin/resource-manager";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { shortDate } from "@/lib/format";
import type { Promo } from "@/lib/types";

type Row = Promo & { sort_order: number };

export default function AdminPromotions() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Promotions" description="Offers on the Promotions page and in the home carousel." />
      <ResourceManager<Row> title="Promotions" itemName="Promotion" addLabel="New promotion" endpoint="/promos/" searchKeys={["title", "code"]}
        columns={[
          { key: "title", label: "Title", render: (r) => <b>{r.title}</b> },
          { key: "code", label: "Code", render: (r) => (r.code ? <Badge variant="outline" className="font-mono">{r.code}</Badge> : "—") },
          { key: "active", label: "Status", render: (r) => <OnOff on={r.active} /> },
          { key: "expires", label: "Expires", render: (r) => (r.expires ? shortDate(r.expires) : "—") },
        ]}
        fields={[
          { name: "title", label: "Title", required: true, full: true },
          { name: "code", label: "Bonus code" },
          { name: "expires", label: "Expires", type: "date" },
          { name: "description", label: "Description", type: "textarea" },
          { name: "image", label: "Image", type: "image" },
          { name: "sort_order", label: "Sort order", type: "number", min: 0 },
          { name: "active", label: "Show on the site", type: "checkbox" },
        ]}
        defaults={{ active: true, sort_order: 0 }} />
    </div>
  );
}
