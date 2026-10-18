"use client";

import { ResourceManager } from "@/components/admin/resource-manager";
import { PageHeader } from "@/components/common/page-header";

interface Row { id: number; page: string; title: string; robots: string; [k: string]: unknown }

export default function AdminSEO() {
  return (
    <div className="grid gap-6">
      <PageHeader title="SEO" description={<>Per-page search overrides. Game pages have their own SEO fields (Games → edit). Live: <a className="font-semibold text-brand-text underline underline-offset-2" href="/sitemap.xml" target="_blank" rel="noopener noreferrer">sitemap.xml</a> · <a className="font-semibold text-brand-text underline underline-offset-2" href="/robots.txt" target="_blank" rel="noopener noreferrer">robots.txt</a>. Structured data is generated automatically.</>} />
      <ResourceManager<Row> title="SEO pages" itemName="Page SEO" addLabel="Add page SEO" endpoint="/seo/" searchKeys={["page", "title"]}
        columns={[{ key: "page", label: "Page", render: (r) => <b>{r.page}</b> }, { key: "title", label: "Meta title" }, { key: "robots", label: "Robots" }]}
        fields={[
          { name: "page", label: "Page key", required: true, help: "home, games, winners, business…" },
          { name: "robots", label: "Robots" },
          { name: "title", label: "Meta title", full: true },
          { name: "description", label: "Meta description", type: "textarea" },
          { name: "keywords", label: "Keywords", full: true },
          { name: "canonical", label: "Canonical URL", type: "url", full: true },
          { name: "og_image", label: "Social share image", type: "image" },
        ]}
        defaults={{ robots: "index, follow" }} />
    </div>
  );
}
