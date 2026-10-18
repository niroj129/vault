"use client";

import { PageHeader } from "@/components/common/page-header";
import { ResourceManager } from "@/components/admin/resource-manager";
import type { SiteFAQ } from "@/lib/types";

type Row = SiteFAQ & { sort_order: number };

export default function AdminFAQ() {
  return (
    <div className="grid gap-6">
      <PageHeader title="FAQ" description="Questions shown on the FAQ page and the home page." />
      <ResourceManager<Row> title="FAQs" itemName="FAQ" endpoint="/faqs/" searchKeys={["question", "category"]}
        describeDelete={(r) => `“${r.question}” will disappear from the FAQ page.`}
        columns={[{ key: "question", label: "Question", render: (r) => <b>{r.question}</b> }, { key: "category", label: "Category" }, { key: "sort_order", label: "Order", className: "tabular-nums" }]}
        fields={[
          { name: "question", label: "Question", required: true, full: true },
          { name: "answer", label: "Answer", type: "textarea", required: true, rows: 4 },
          { name: "category", label: "Category" },
          { name: "sort_order", label: "Sort order", type: "number", min: 0, help: "Lower numbers show first." },
        ]}
        defaults={{ category: "General", sort_order: 0 }} />
    </div>
  );
}
