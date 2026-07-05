"use client";

import Crud from "../../../components/admin/Crud";
import { API_BASE } from "../../../lib/api";

export default function AdminSeo() {
  return (
    <div>
      <div className="card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <p className="muted small" style={{ margin: 0 }}>
          Per-page SEO overrides. Game pages also have their own SEO fields (Games → edit).
          Live endpoints: <a className="gold" href="/sitemap.xml" target="_blank">/sitemap.xml</a> ·
          {" "}<a className="gold" href="/robots.txt" target="_blank">/robots.txt</a>.
          Structured data (Breadcrumb / FAQ / VideoGame / Organization) is generated automatically.
        </p>
      </div>
      <Crud
        title="SEO Pages" addLabel="Add Page SEO" endpoint="/seo/"
        columns={[
          { key: "page", label: "Page", render: (r) => <b>{r.page}</b> },
          { key: "title", label: "Meta Title" },
          { key: "robots", label: "Robots" },
        ]}
        fields={[
          { name: "page", label: "Page key", help: "home, games, winners, business…", required: true },
          { name: "title", label: "Meta Title", full: true },
          { name: "description", label: "Meta Description", type: "textarea", full: true },
          { name: "keywords", label: "Keywords", full: true },
          { name: "canonical", label: "Canonical URL", type: "url", full: true },
          { name: "robots", label: "Robots" },
          { name: "og_image", label: "OG / Social image", type: "file" },
        ]}
        defaults={{ robots: "index, follow" }}
      />
    </div>
  );
}
