"use client";

import { useEffect, useState } from "react";
import Crud from "../../../components/admin/Crud";
import { getJSONSafe, mediaUrl } from "../../../lib/api";

export default function AdminGames() {
  const [cats, setCats] = useState([]);
  useEffect(() => { getJSONSafe("/categories/", []).then(setCats); }, []);

  const catOptions = [{ value: "", label: "— none —" },
    ...cats.map((c) => ({ value: c.id, label: c.name }))];

  return (
    <Crud
      title="Games"
      addLabel="Add Game"
      endpoint="/games/"
      lookupKey="slug"
      columns={[
        { key: "thumbnail", label: "", render: (r) => r.thumbnail
          ? <img className="thumb-sm" src={mediaUrl(r.thumbnail)} alt="" /> : "🎰" },
        { key: "name", label: "Name", render: (r) => <b>{r.name}</b> },
        { key: "category_name", label: "Category", render: (r) => r.category_name || "—" },
        { key: "status", label: "Status", render: (r) => <span className={`badge ${r.status === "active" ? "ok" : "off"}`}>{r.status}</span> },
        { key: "featured", label: "Flags", render: (r) => <>{r.featured ? "⭐" : ""}{r.is_new ? " 🆕" : ""}</> },
        { key: "links", label: "Links", render: (r) => <>{r.user_link ? "👤" : "—"} {r.agent_link ? "🕵️" : ""}</> },
        { key: "combined_points", label: "Points", render: (r) => {
          const c = Number(r.sub_points || 0) + Number(r.vendor_points || 0);
          return <span className={`badge ${c < 100 ? "warn" : ""}`}>{c}</span>;
        } },
        { key: "clicks", label: "Plays" },
      ]}
      fields={[
        { name: "name", label: "Game Name", required: true },
        { name: "category", label: "Category", type: "select", options: catOptions },
        { name: "short_description", label: "Short description", full: true },
        { name: "description", label: "Description", type: "textarea", full: true },
        { name: "features", label: "Features (one per line)", type: "textarea", full: true },
        { name: "user_link", label: "User Game Link", type: "url" },
        { name: "agent_link", label: "Agent Game Link", type: "url" },
        { name: "play_url", label: "Generic URL", type: "url" },
        { name: "download_info", label: "Download / Access info" },
        { name: "sub_points", label: "Sub-Dist Points", type: "number" },
        { name: "vendor_points", label: "Vendor Points", type: "number" },
        { name: "thumbnail", label: "Card Image", type: "file" },
        { name: "logo", label: "Logo", type: "file" },
        { name: "banner", label: "Banner", type: "file" },
        { name: "meta_title", label: "SEO Title", full: true },
        { name: "meta_description", label: "SEO Description", type: "textarea", full: true },
        { name: "meta_keywords", label: "SEO Keywords", full: true },
        { name: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
        { name: "featured", label: "Featured", type: "checkbox" },
        { name: "is_new", label: "New", type: "checkbox" },
      ]}
      defaults={{ status: "active", category: "", sub_points: 0, vendor_points: 0 }}
    />
  );
}
